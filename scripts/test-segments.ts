/** Verify Box 2-level folder + segment write + per-object delete works. Usage: npx tsx scripts/test-segments.ts */
import { RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { FileStorageEngine } from '@memberjunction/storage';
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
    await FileStorageEngine.Instance.Config(true, user);
    const acct = await new RunView().RunView<{ ID: string }>({ EntityName: 'MJ: File Storage Accounts', ExtraFilter: `Name='Praxis Box Demo'`, ResultType: 'simple' }, user);
    const accountID = acct.Results[0].ID;
    const driver = await FileStorageEngine.Instance.GetDriver(accountID, user);

    const folder = 'realtime-recordings/test-segments-folder';
    const buf = (tag: string) => Buffer.from(`fake-webm-bytes-${tag}-${'x'.repeat(200)}`);

    console.log(`→ Writing 2-level folder segments under ${folder}/ …`);
    console.log('  seg-000:', await driver.PutObject(`${folder}/seg-000.webm`, buf('s0'), 'audio/webm'));
    console.log('  seg-001:', await driver.PutObject(`${folder}/seg-001.webm`, buf('s1'), 'audio/webm'));
    console.log('  recording:', await driver.PutObject(`${folder}/recording.webm`, buf('final'), 'audio/webm'));

    const listed1 = await driver.ListObjects(folder);
    console.log(`\nAfter writes — objects in folder: ${(listed1.objects ?? []).map(o => o.name).join(', ')}`);

    console.log('\n→ Deleting the segment shards…');
    console.log('  del seg-000:', await driver.DeleteObject(`${folder}/seg-000.webm`));
    console.log('  del seg-001:', await driver.DeleteObject(`${folder}/seg-001.webm`));

    const listed2 = await driver.ListObjects(folder);
    console.log(`\nAfter delete — objects in folder: ${(listed2.objects ?? []).map(o => o.name).join(', ')} (expect only recording.webm)`);

    const back = await driver.GetObject({ fullPath: `${folder}/recording.webm` });
    console.log(`Read final recording.webm back: ${back?.length ?? 0} bytes`);

    console.log('\n→ Cleanup: removing the test folder…');
    console.log('  DeleteDirectory recursive:', await driver.DeleteDirectory(folder, true));
    console.log('\n✅ segment storage test complete.');
    process.exit(0);
}
main().catch((e) => { console.error('FAILED:', e instanceof Error ? e.stack : e); process.exit(1); });
