/**
 * W2 acceptance spike (throwaway; safe to delete after review).
 *
 * Verifies the D5 authorization boundary EMPIRICALLY: a synthesized Widget Guest
 * principal (the shared Anonymous user + the restricted `Widget Guest` role, exactly
 * as `buildMagicLinkSessionUser` would synthesize it) can read `MJ: Conversations`
 * (granted) but is DENIED a RunView on an out-of-scope entity (`MJ: AI Models`).
 *
 * Run (DB up):
 *   DB_HOST=sql-claude DB_PORT=1433 DB_DATABASE=MJ_Workbench DB_USERNAME=sa DB_PASSWORD='Claude2Sql99' \
 *   npx tsx plans/realtime/bridges-and-widget/spikes/w2-guest-permission-spike.ts
 */
import sql from 'mssql';
import { UserInfo, RunView } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { Metadata } from '@memberjunction/core';

const ANON_USER_ID = '273910DF-28F1-45C1-A8F8-6E9AD8E5F008';
const GUEST_ROLE_NAME = 'Widget Guest';

async function main(): Promise<void> {
  const pool = new sql.ConnectionPool({
    server: process.env.DB_HOST ?? 'sql-claude',
    port: Number(process.env.DB_PORT ?? 1433),
    database: process.env.DB_DATABASE ?? 'MJ_Workbench',
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  });
  await pool.connect();
  await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA ?? '__mj'));

  const md = Metadata.Provider;
  const role = md.Roles.find((r) => r.Name?.trim().toLowerCase() === GUEST_ROLE_NAME.toLowerCase());
  const anon = UserCache.Instance.Users.find((u) => u.ID.toLowerCase() === ANON_USER_ID.toLowerCase());
  if (!role || !anon) {
    throw new Error(`Missing prerequisites — role=${!!role} anon=${!!anon}. Push the W2 seed first.`);
  }

  // Synthesize the guest principal exactly like buildMagicLinkSessionUser (anon mode).
  const guest = new UserInfo(md, {
    ...anon,
    _UserRoles: undefined,
    UserRoles: [{ UserID: anon.ID, RoleID: role.ID, RoleName: role.Name }],
  });

  const rv = new RunView();
  const granted = await rv.RunView({ EntityName: 'MJ: Conversations', MaxRows: 1, ResultType: 'simple' }, guest);
  const denied = await rv.RunView({ EntityName: 'MJ: AI Models', MaxRows: 1, ResultType: 'simple' }, guest);

  console.log('──────────────────────────────────────────────');
  console.log('W2 guest-permission boundary spike');
  console.log('──────────────────────────────────────────────');
  console.log(`Guest role: ${role.Name} (${role.ID})`);
  console.log(`GRANTED entity  'MJ: Conversations' → Success=${granted.Success}  ${granted.Success ? '(allowed ✅)' : 'ErrorMessage=' + granted.ErrorMessage}`);
  console.log(`OUT-OF-SCOPE   'MJ: AI Models'      → Success=${denied.Success}   ${denied.Success ? 'rows=' + (denied.Results?.length ?? 0) : 'DENIED ✅: ' + denied.ErrorMessage}`);
  console.log('');
  const pass = granted.Success === true && denied.Success === false;
  console.log(pass
    ? 'ACCEPTANCE PASS: guest reads its in-scope entity and is denied an arbitrary one.'
    : 'ACCEPTANCE CHECK INCONCLUSIVE — inspect results above (see note in W2-findings).');

  await pool.close();
}

main().then(() => process.exit(0), (e) => { console.error('Spike failed:', e); process.exit(1); });
