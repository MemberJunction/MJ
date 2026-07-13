// Live eSignature send test — drives the real SignatureEngine end-to-end against DocuSign demo.
// Run: node scripts/test-esignature-send.mjs
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

import sql from 'mssql';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
// Importing the driver package triggers @RegisterClass(BaseSignatureProvider, 'DocuSign').
import '@memberjunction/esignature-docusign';
import { SignatureEngine } from '@memberjunction/esignature/server';

const SIGNATURE_ACCOUNT_ID = 'a1b2c3d4-0002-4e5f-9a0b-1c2d3e4f5a60';
const RECIPIENT_EMAIL = 'ian.zygmunt@bluecypress.io';

/** A minimal but valid single-page PDF with the text "MJ eSignature Test". */
function makeTestPdf() {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 68>>stream
BT /F1 24 Tf 72 700 Td (MJ eSignature Test Document) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
0000000229 00000 n
0000000298 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
416
%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function main() {
  const pool = new sql.ConnectionPool({
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
    pool: { max: 5, min: 1, idleTimeoutMillis: 30000 },
  });
  await pool.connect();
  console.log('[1] DB connected');

  const config = new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj', 180000);
  await setupSQLServerClient(config);
  console.log('[2] MJ provider initialized');

  const user =
    UserCache.Instance.GetSystemUser() ??
    UserCache.Instance.Users.find((u) => u.Type?.trim().toLowerCase() === 'owner') ??
    UserCache.Instance.Users[0];
  console.log('[3] context user:', user?.Email ?? '(none)');

  await SignatureEngine.Instance.Config(false, user);
  console.log('[4] SignatureEngine configured; accounts:', SignatureEngine.Instance.Accounts.length);

  console.log('[5] sending envelope...');
  const result = await SignatureEngine.Instance.SendForSignature({
    signatureAccountId: SIGNATURE_ACCOUNT_ID,
    title: 'MJ eSignature Primitive — Live Test',
    message: 'This is an automated test of the MemberJunction eSignature primitive.',
    documents: [{ filename: 'mj-esignature-test.pdf', contentType: 'application/pdf', bytes: makeTestPdf() }],
    recipients: [{ email: RECIPIENT_EMAIL, name: 'Ian Zygmunt' }],
    sendImmediately: true,
    contextUser: user,
  });

  console.log('[6] RESULT:', JSON.stringify(result, null, 2));

  await pool.close();
  process.exit(result.Success ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
