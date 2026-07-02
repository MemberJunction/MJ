/**
 * Inspect the most recent realtime sessions: recording fields, the stored file (+ Box read-back),
 * and the per-turn transcript timing. Usage (repo root): npx tsx scripts/check-recording.ts
 */
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { FileStorageEngine } from '@memberjunction/storage';
import { MJFileEntity } from '@memberjunction/core-entities';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import '@memberjunction/server-bootstrap-lite';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

interface SessionRow {
    ID: string; Status: string; ConversationID: string | null; AgentID: string;
    RecordingMedia: string | null; RecordingStartedAt: Date | null; RecordingFileID: string | null;
    __mj_CreatedAt: Date;
}
interface DetailRow {
    Role: string; Status: string; Message: string; UserID: string | null;
    UtteranceStartMs: number | null; UtteranceEndMs: number | null; TurnEndedAt: Date | null; MediaType: string | null;
    __mj_CreatedAt: Date;
}

async function bootstrap(): Promise<UserInfo> {
    const { cosmiconfig } = await import('cosmiconfig');
    const cfg = (await cosmiconfig('mj').search())!.config;
    const pool = new sql.ConnectionPool({
        server: cfg.dbHost || process.env.DB_HOST || 'localhost',
        port: parseInt(cfg.dbPort || process.env.DB_PORT || '1433', 10),
        database: cfg.dbDatabase || process.env.DB_DATABASE,
        user: cfg.dbUsername || process.env.DB_USERNAME,
        password: cfg.dbPassword || process.env.DB_PASSWORD,
        options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
        pool: { max: 5, min: 1, idleTimeoutMillis: 30000 }
    });
    await pool.connect();
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, cfg.coreSchema || '__mj', 180000));
    return UserCache.Instance.GetSystemUser()!;
}

async function main(): Promise<void> {
    const user = await bootstrap();
    const md = new Metadata();
    const rv = new RunView();

    const sessions = await rv.RunView<SessionRow>({
        EntityName: 'MJ: AI Agent Sessions',
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: 5,
        ResultType: 'simple'
    }, user);

    console.log(`\n=== 5 most recent AI Agent Sessions ===`);
    for (const s of sessions.Results) {
        const rec = s.RecordingFileID ? `🎙️ ${s.RecordingMedia} file=${s.RecordingFileID} t0=${s.RecordingStartedAt ? new Date(s.RecordingStartedAt).toISOString() : 'null'}` : '— no recording';
        console.log(`• ${s.ID}  ${s.Status}  ${new Date(s.__mj_CreatedAt).toISOString()}  ${rec}`);
    }

    const withRec = sessions.Results.find(s => s.RecordingFileID) ?? sessions.Results[0];
    if (!withRec) { console.log('No sessions found.'); process.exit(0); }

    console.log(`\n=== Most relevant session: ${withRec.ID} ===`);
    if (withRec.RecordingFileID) {
        const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', user);
        if (await file.Load(withRec.RecordingFileID)) {
            console.log(`File: ${file.Name}  type=${file.ContentType}  status=${file.Status}  key=${file.ProviderKey}`);
            try {
                await FileStorageEngine.Instance.Config(false, user);
                const acct = FileStorageEngine.Instance.AccountsWithProviders.find(a => a.provider.ID === file.ProviderID);
                if (acct) {
                    const driver = await FileStorageEngine.Instance.GetDriver(acct.account.ID, user);
                    const bytes = await driver.GetObject({ fullPath: file.ProviderKey });
                    console.log(`✅ Read ${bytes?.length ?? 0} bytes back from storage — recording IS stored.`);
                }
            } catch (e) {
                console.log(`⚠ Could not read file from storage: ${e instanceof Error ? e.message : e}`);
            }
        }
    } else {
        console.log('⚠ This session has NO RecordingFileID — recording did not store (see turns below for whether the call happened).');
    }

    const turns = await rv.RunView<DetailRow>({
        EntityName: 'MJ: Conversation Details',
        ExtraFilter: `AgentSessionID='${withRec.ID}'`,
        OrderBy: '__mj_CreatedAt ASC',
        ResultType: 'simple'
    }, user);
    console.log(`\n=== ${turns.Results.length} transcript turn(s) for this session ===`);
    for (const t of turns.Results) {
        const timing = t.UtteranceStartMs != null ? `[${t.UtteranceStartMs}-${t.UtteranceEndMs}ms]` : '[no timing]';
        const msg = (t.Message || '').replace(/\s+/g, ' ').slice(0, 60);
        console.log(`  ${t.Role.padEnd(5)} ${t.Status.padEnd(11)} ${timing.padEnd(16)} media=${t.MediaType ?? '-'} user=${t.UserID ? 'yes' : 'no'}  "${msg}"`);
    }
    process.exit(0);
}

main().catch((e) => { console.error('FAILED:', e instanceof Error ? e.stack : e); process.exit(1); });
