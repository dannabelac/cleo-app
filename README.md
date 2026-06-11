# CLEO — Tu asistente de ventas

CLEO es una app para emprendedores que ayuda a organizar clientes, enviar cotizaciones, hacer seguimiento y entender qué está funcionando en su negocio.

## Stack

- React 18
- Vite
- localStorage (sin backend — datos 100% en el dispositivo)

## Desarrollo local

```bash
npm install
npm run dev
```

Abre http://localhost:5173

## Deploy en Vercel

1. Sube el repositorio a GitHub
2. Importa el repo en [vercel.com](https://vercel.com)
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output dir: `dist`
6. Deploy ✓

## Estructura

```
cleo-app/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx        # Entry point
│   └── CLEO.jsx        # App completa
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

## Datos

Los datos se guardan en `localStorage` del navegador. No hay servidor ni base de datos. Los datos son privados y se quedan en el dispositivo del usuario.

Para migrar datos entre dispositivos: usa la función de exportar/importar en Configuración (próximamente).
