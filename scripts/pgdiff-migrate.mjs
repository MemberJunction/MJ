import { Skyway } from '@memberjunction/skyway-core';
import { PostgresProvider } from '@memberjunction/skyway-postgres';
import * as path from 'node:path';
const [, , database, migrationsDir] = process.argv;
const DB = { Dialect: 'postgresql', Server: 'localhost', Port: 5433, Database: database, User: 'mj_admin', Password: 'Claude2Pg99' };
const skyway = new Skyway({
  Database: DB, Provider: new PostgresProvider(DB),
  Migrations: { Locations: [path.resolve(migrationsDir)], DefaultSchema: '__mj', BaselineOnMigrate: false, OutOfOrder: true },
  Placeholders: { 'flyway:defaultSchema': '__mj' }, TransactionMode: 'per-migration',
});
try {
  const r = await skyway.Migrate();
  console.log(`Success=${r?.Success}`);
  const fails = (r?.Migrations ?? []).filter(m => m && m.Success === false);
  if (fails.length) { console.log(`FAILURES: ${fails.length}`); for (const f of fails.slice(0,8)) console.log(`  ${f.Description ?? f.Version}: ${String(f.Error ?? f.ErrorMessage ?? '').slice(0,180)}`); }
  await skyway.Close();
  process.exit(r?.Success === false ? 2 : 0);
} catch (e) { console.error('MIGRATE ERROR:', String(e?.message ?? e).slice(0,400)); try{await skyway.Close();}catch{} process.exit(3); }
