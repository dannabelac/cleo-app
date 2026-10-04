/**
 * ejecutar-sql.cjs — ejecuta un archivo SQL en CLEO Pruebas.
 * Uso: node tests/ejecutar-sql.cjs supabase/15-fix-cot-seguimiento-estado.sql
 *
 * La contraseña se solicita de forma interactiva (eco desactivado).
 * CONEXIÓN: Session Pooler de CLEO Pruebas
 *   host: aws-0-us-east-2.pooler.supabase.com
 *   port: 5432
 *   user: postgres.pconfadsbtwjbjeblxgl
 */

'use strict';
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SQL_FILE = process.argv[2];
if (!SQL_FILE) {
  console.error('Uso: node tests/ejecutar-sql.cjs <archivo.sql>');
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), SQL_FILE);
if (!fs.existsSync(sqlPath)) {
  console.error('Archivo no encontrado:', sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

function pedirPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write('Contraseña de CLEO Pruebas: ');
    process.stdin.setRawMode(true);
    let pwd = '';
    process.stdin.on('data', (ch) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r' || c === '\u0004') {
        process.stdin.setRawMode(false);
        process.stdout.write('\n');
        rl.close();
        resolve(pwd);
      } else if (c === '\u0003') {
        process.exit(1);
      } else if (c === '\u007f') {
        pwd = pwd.slice(0, -1);
      } else {
        pwd += c;
      }
    });
  });
}

(async () => {
  const password = process.env.PGPASSWORD || await pedirPassword();

  const client = new Client({
    host: 'aws-0-us-east-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.pconfadsbtwjbjeblxgl',
    password,
    database: 'postgres',
    ssl: { ca: fs.readFileSync(path.resolve(__dirname, '../supabase/certs/supabase-ca.crt')) },
  });

  // Guardia: solo CLEO Pruebas
  if (!client.host || !client.user.includes('pconfadsbtwjbjeblxgl')) {
    console.error('GUARDIA: no es CLEO Pruebas — abortando.');
    process.exit(1);
  }

  await client.connect();
  console.log('Conectado a CLEO Pruebas.');
  console.log('Ejecutando:', SQL_FILE, '\n');

  try {
    const result = await client.query(sql);
    // result puede ser un array si hay múltiples statements
    const rows = Array.isArray(result) ? result : [result];
    rows.forEach((r, i) => {
      if (r.rows && r.rows.length > 0) {
        console.log(`\n── Resultado ${i + 1} ──`);
        console.table(r.rows);
      } else if (r.command) {
        console.log(`[${i + 1}] ${r.command} — ${r.rowCount ?? 0} filas`);
      }
    });
    console.log('\nScript ejecutado sin errores.');
  } catch (err) {
    console.error('\nERROR:', err.message);
    if (err.detail) console.error('Detalle:', err.detail);
    if (err.hint)   console.error('Hint:', err.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
