/** Diagnose why a realtime recording didn't store. Usage: npx tsx scripts/diag-recording.ts */
import { RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import '@memberjunction/server-bootstrap-lite';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

async function bootstrap(): Promise<UserInfo> {
    const { cosmiconfig } = await import('cosmiconfig');
    const cfg = (await cosmiconfig('mj').search())!.config;
    const pool = new sql.ConnectionPool({
        server: cfg.dbHost || process.env.DB_HOST, port: parseInt(cfg.dbPort || process.env.DB_PORT || '1433', 10),
        database: cfg.dbDatabase || process.env.DB_DATABASE, user: cfg.dbUsername || process.env.DB_USERNAME,
        password: cfg.dbPassword || process.env.DB_PASSWORD,
        options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true }, pool: { max: 5, min: 1 }
    });
    await pool.connect();
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, cfg.coreSchema || '__mj', 180000));
    return UserCache.Instance.GetSystemUser()!;
}

async function main(): Promise<void> {
    const user = await bootstrap();
    const rv = new RunView();

    const sessions = await rv.RunView<{ ID: string; AgentID: string; Agent: string; Status: string; __mj_CreatedAt: Date }>({
        EntityName: 'MJ: AI Agent Sessions', OrderBy: '__mj_CreatedAt DESC', MaxRows: 4, ResultType: 'simple'
    }, user);
    console.log('\n=== Recent sessions: which agent? ===');
    for (const s of sessions.Results) {
        console.log(`• ${s.ID}  agent="${s.Agent}" (${s.AgentID})  ${s.Status}`);
    }

    const agentIDs = [...new Set(sessions.Results.map(s => s.AgentID))];
    const agents = await rv.RunView<{ ID: string; Name: string; RecordingDefault: string | null; RecordingStorageProviderID: string | null; AttachmentStorageProviderID: string | null }>({
        EntityName: 'MJ: AI Agents', ExtraFilter: `ID IN (${agentIDs.map(id => `'${id}'`).join(',')})`, ResultType: 'simple'
    }, user);
    console.log('\n=== Recording config of those agents ===');
    for (const a of agents.Results) {
        console.log(`• ${a.Name}: RecordingDefault=${a.RecordingDefault ?? 'null'}  RecordingProvider=${a.RecordingStorageProviderID ?? 'null'}  AttachmentProvider=${a.AttachmentStorageProviderID ?? 'null'}`);
    }

    const files = await rv.RunView<{ ID: string; Name: string; Status: string; ProviderKey: string; ContentType: string; __mj_CreatedAt: Date }>({
        EntityName: 'MJ: Files', OrderBy: '__mj_CreatedAt DESC', MaxRows: 12, ResultType: 'simple'
    }, user);
    console.log(`\n=== 12 most recent MJ: Files (any name) ===`);
    for (const f of files.Results) console.log(`• "${f.Name}"  type=${f.ContentType}  key="${f.ProviderKey}"  ${new Date(f.__mj_CreatedAt).toISOString()}`);
    const recFiles = files.Results.filter(f => f.Name.startsWith('realtime-session-'));
    console.log(`\n→ realtime-session-* recording files: ${recFiles.length}`);

    process.exit(0);
}
main().catch((e) => { console.error('FAILED:', e instanceof Error ? e.stack : e); process.exit(1); });
