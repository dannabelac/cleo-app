# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server at http://localhost:5173
npm run build        # Checks branch guard (scripts/check-preview.cjs), then Vite build
npm run preview      # Serve the built dist/
npm run test:sync    # Run all tests with Node's built-in test runner
```

Run a single test file directly:
```bash
node --test tests/cloudSync.test.cjs
node --test tests/local-setter.test.cjs
```

The tests use Node's `vm` module — no test framework needed. `CLEO_SYNC_SOURCE` env var can point `cloudSync.test.cjs` at a different file for isolated testing.

## Environment variables

Copy `.env.local` and set:
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — required; app throws on startup if missing
- `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` — optional; analytics silently disabled if absent
- `VITE_SENTRY_DSN` — optional; error monitoring silently disabled if absent

## Architecture

**Entry point:** `main.jsx` initializes Sentry and PostHog, then mounts `<AuthGate />`.

**Auth + boot flow:** `AuthGate.jsx` handles Supabase auth (email magic link). On login it calls `pullUserData()` from `cloudSync.js`, then mounts `<CLEO />` and starts the background sync loop via `startCloudSync()`.

**App logic:** `CLEO.jsx` is a single large component (~4000+ lines) containing all UI, business logic, and state. It imports from the files below but does not split its own logic across files. The versioned snapshots (`CLEO 113.jsx` through `CLEO 121.jsx`) are historical backups — the live app only uses `CLEO.jsx`.

**Data layer — two tiers:**
1. `localStorage` is the primary store and the source of truth for the current device. All writes are synchronous. `CLEO_KEYS` in `cloudSync.js` lists every key CLEO reads and writes.
2. Supabase stores a single JSON blob per user (`data` column) that is the cloud source of truth. `cloudSync.js` owns all pull/push logic; no other file touches Supabase data directly.

**Conflict handling:** `pullUserData()` compares the local cache against a saved hash (`cleo_sync_confirmado`). If the cloud blob was written by another device since the last confirmed sync, it surfaces a conflict rather than silently overwriting. `startCloudSync()` returns a live sync object with `flush()`, `resolverConflictoUsarRemoto()`, and `resolverConflictoConservarLocal()`.

**Stale-tab guard:** `localWriteGuard.js` exports `createLocalWriteGuard(storage)`. Every write in `CLEO.jsx` goes through a guard instance created at mount time. Before writing, it compares the current `localStorage` values of all business keys against the snapshot taken at mount — if another tab has changed any of them, the write is aborted with a user-facing message. The form stays open so the user can copy their work before reloading.

**Analytics:** `analytics.js` is the sole import point for PostHog. No other file imports `posthog-js` directly. It strips auth tokens and sensitive URL parameters before any event leaves the browser.

**Error monitoring:** `sentry.js` is the sole import point for `@sentry/react`. It applies an allowlist (only numeric metrics + storage key names) and redacts emails, tokens, and phone numbers from error messages before reporting.

**PDF generation:** `ComprobantePDF.jsx`, `CotizacionPDF.jsx`, and `ReporteComercialPDF.jsx` use `@react-pdf/renderer` and are lazy-loaded (code-split in the build output).

**Supabase client:** `src/supabaseClient.js` is the active client (validates env vars on import). `src/lib/supabase.js` is a legacy duplicate without validation — prefer the former.

## Branch build guard

`scripts/check-preview.cjs` runs as part of `npm run build`. On this branch (`fix/proteger-guardado-cleo`) the build only succeeds when deploying to a Vercel Preview environment using the CLEO Pruebas project credentials. Production deploys are blocked. Do not modify or remove this guard without explicit approval.
