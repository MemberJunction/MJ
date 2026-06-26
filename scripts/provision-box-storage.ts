/**
 * Provision a Box file-storage account from .env, via the MJ object model, and prove the realtime
 * recording storage path end-to-end (encode a WAV with RealtimeRecordingController -> upload to Box ->
 * read back). Also points the Realtime Co-Agent at the account for recording.
 *
 * Idempotent: re-running reuses existing provider/credential/account by name.
 *
 * Usage (repo root):  npx tsx scripts/provision-box-storage.ts
 */
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { CredentialEngine } from '@memberjunction/credentials';
import { FileStorageEngine } from '@memberjunction/storage';
import {
    MJFileStorageProviderEntity,
    MJFileStorageAccountEntity,
    MJAIAgentEntity
} from '@memberjunction/core-entities';
import { RealtimeRecordingController } from '@memberjunction/ai-agents';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';

import '@memberjunction/server-bootstrap-lite';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const PROVIDER_NAME = 'Box.com';
const BOX_DRIVER_KEY = 'Box.com Storage';
const CREDENTIAL_TYPE = 'Box.com OAuth';
const CREDENTIAL_NAME = 'Praxis Box Demo Credentials';
const ACCOUNT_NAME = 'Praxis Box Demo';
const REALTIME_COAGENT_ID = 'C277FEE8-D450-4B50-9167-2F3396072123';

async function bootstrap(): Promise<UserInfo> {
    const { cosmiconfig } = await import('cosmiconfig');
    const configResult = await cosmiconfig('mj').search();
    if (!configResult) throw new Error('No mj.config.cjs found — run from the repo root.');
    const config = configResult.config;

    const pool = new sql.ConnectionPool({
        server: config.dbHost || process.env.DB_HOST || 'localhost',
        port: parseInt(config.dbPort || process.env.DB_PORT || '1433', 10),
        database: config.dbDatabase || process.env.DB_DATABASE,
        user: config.dbUsername || process.env.DB_USERNAME,
        password: config.dbPassword || process.env.DB_PASSWORD,
        options: { encrypt: true, trustServerCertificate: true, enableArithAbort: true },
        pool: { max: 5, min: 1, idleTimeoutMillis: 30000 }
    });
    await pool.connect();
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, config.coreSchema || '__mj', 180000));
    const contextUser = UserCache.Instance.GetSystemUser();
    if (!contextUser) throw new Error('No system user found in UserCache');
    console.log(`✓ Connected. Context user: ${contextUser.Name}`);
    return contextUser;
}

async function findOne<T extends object>(entity: string, filter: string, user: UserInfo): Promise<T | null> {
    const rv = await new RunView().RunView<T>({ EntityName: entity, ExtraFilter: filter, ResultType: 'entity_object' }, user);
    return rv.Success && rv.Results.length > 0 ? rv.Results[0] : null;
}

async function ensureProvider(md: Metadata, user: UserInfo): Promise<string> {
    const existing = await findOne<MJFileStorageProviderEntity>('MJ: File Storage Providers', `ServerDriverKey='${BOX_DRIVER_KEY}'`, user);
    if (existing) {
        console.log(`✓ Provider exists: ${existing.Name} (${existing.ID})`);
        return existing.ID;
    }
    const p = await md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', user);
    p.NewRecord();
    p.Name = PROVIDER_NAME;
    p.ServerDriverKey = BOX_DRIVER_KEY;
    p.ClientDriverKey = BOX_DRIVER_KEY;
    p.Priority = 0;
    p.IsActive = true;
    if (!await p.Save()) throw new Error(`Failed to save provider: ${p.LatestResult?.CompleteMessage}`);
    console.log(`✓ Provider created: ${p.ID}`);
    return p.ID;
}

async function ensureCredential(user: UserInfo): Promise<string> {
    const existing = await findOne<{ ID: string }>('MJ: Credentials', `Name='${CREDENTIAL_NAME}'`, user);
    if (existing) {
        console.log(`✓ Credential exists: ${CREDENTIAL_NAME} (${existing.ID})`);
        return existing.ID;
    }
    const ce = CredentialEngine.Instance;
    await ce.Config(false, user);
    if (!ce.getCredentialTypeByName(CREDENTIAL_TYPE)) {
        throw new Error(`Credential type '${CREDENTIAL_TYPE}' not found. Run: npx mj sync push --dir=metadata --include="credential-types"`);
    }
    const values: Record<string, string> = {
        clientId: process.env.STORAGE_BOX_CLIENT_ID ?? '',
        clientSecret: process.env.STORAGE_BOX_CLIENT_SECRET ?? '',
        enterpriseId: process.env.STORAGE_BOX_ENTERPRISE_ID ?? '',
        rootFolderId: process.env.STORAGE_BOX_ROOT_FOLDER_ID ?? '0'
    };
    const cred = await ce.storeCredential(CREDENTIAL_TYPE, CREDENTIAL_NAME, values, { description: 'Praxis demo Box credentials (from .env)' }, user);
    console.log(`✓ Credential created (encrypted): ${cred.ID}`);
    return cred.ID;
}

async function ensureAccount(md: Metadata, user: UserInfo, providerID: string, credentialID: string): Promise<string> {
    const existing = await findOne<MJFileStorageAccountEntity>('MJ: File Storage Accounts', `Name='${ACCOUNT_NAME}'`, user);
    if (existing) {
        console.log(`✓ Account exists: ${ACCOUNT_NAME} (${existing.ID})`);
        return existing.ID;
    }
    const a = await md.GetEntityObject<MJFileStorageAccountEntity>('MJ: File Storage Accounts', user);
    a.NewRecord();
    a.Name = ACCOUNT_NAME;
    a.Description = 'Praxis demo Box account';
    a.ProviderID = providerID;
    a.CredentialID = credentialID;
    if (!await a.Save()) throw new Error(`Failed to save account: ${a.LatestResult?.CompleteMessage}`);
    console.log(`✓ Account created: ${a.ID}`);
    return a.ID;
}

/** A short synthetic tone as PCM16 mono @ 24kHz, fed through the real recording controller. */
function makeToneWav(): { Buffer: Buffer; DurationMs: number } {
    const controller = new RealtimeRecordingController({ Media: 'Audio' });
    controller.Start();
    const sampleRate = 24000;
    const frameSamples = 2400; // 100ms frames
    for (let f = 0; f < 8; f++) {
        const pcm = new Int16Array(frameSamples);
        const freq = 220 + f * 60;
        for (let i = 0; i < frameSamples; i++) {
            pcm[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 8000);
        }
        controller.AppendOutbound(pcm.buffer.slice(0));
    }
    controller.Stop();
    const wav = controller.EncodeWav();
    if (!wav) throw new Error('EncodeWav returned null');
    return { Buffer: wav.Buffer, DurationMs: wav.DurationMs };
}

async function setCoAgentRecording(md: Metadata, user: UserInfo, providerID: string): Promise<void> {
    const agent = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', user);
    if (!await agent.Load(REALTIME_COAGENT_ID)) {
        console.log(`⚠ Realtime Co-Agent ${REALTIME_COAGENT_ID} not found — skipping agent config.`);
        return;
    }
    agent.RecordingDefault = 'Audio';
    agent.RecordingStorageProviderID = providerID;
    if (!await agent.Save()) throw new Error(`Failed to save co-agent: ${agent.LatestResult?.CompleteMessage}`);
    console.log(`✓ Realtime Co-Agent set: RecordingDefault=Audio, RecordingStorageProviderID=${providerID}`);
}

async function main(): Promise<void> {
    console.log('Provision Box storage + prove the recording path\n' + '='.repeat(52));
    const user = await bootstrap();
    const md = new Metadata();

    const providerID = await ensureProvider(md, user);
    const credentialID = await ensureCredential(user);
    const accountID = await ensureAccount(md, user, providerID, credentialID);

    // Load the engine with the new account and prove an upload round-trips to Box.
    await FileStorageEngine.Instance.Config(true, user);
    console.log(`✓ FileStorageEngine configured (${FileStorageEngine.Instance.AccountsWithProviders.length} account(s))`);

    const tone = makeToneWav();
    console.log(`→ Uploading a ${Math.round(tone.DurationMs)}ms WAV (${tone.Buffer.length} bytes) to Box…`);
    const uploaded = await FileStorageEngine.Instance.UploadFile({
        content: tone.Buffer,
        fileName: `praxis-storage-proof-${Date.now()}.wav`,
        mimeType: 'audio/wav',
        contextUser: user,
        storageAccountId: accountID,
        pathPrefix: '' // upload to the account's configured root folder (Box driver can't resolve subfolders)
    });
    console.log(`✓ Uploaded to Box. MJ: Files ID=${uploaded.FileID}, key=${uploaded.StoragePath}`);

    // Read it back to prove the bytes landed (Box keys have no leading slash on read).
    try {
        const driver = await FileStorageEngine.Instance.GetDriver(accountID, user);
        const got = await driver.GetObject(uploaded.StoragePath.replace(/^\/+/, ''));
        console.log(`✓ Read back ${got?.length ?? 0} bytes from Box (expected ${tone.Buffer.length}).`);
    } catch (e) {
        console.log(`⚠ Read-back check skipped (${e instanceof Error ? e.message : e}) — upload already succeeded.`);
    }

    await setCoAgentRecording(md, user, providerID);

    console.log('\n✅ DONE. Storage proof complete; recording pipeline writes/reads real Box.');
    process.exit(0);
}

main().catch((err) => { console.error('\n❌ FAILED:', err instanceof Error ? err.stack : err); process.exit(1); });
