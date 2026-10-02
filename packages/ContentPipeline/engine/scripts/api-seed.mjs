/**
 * Seeds a Content Source and a Discover Record Process, then prints the Record Process ID so the
 * API-driven job can run it. Writes directly to the database — seeding is setup, not the thing
 * under test.
 */
import { SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import { Metadata, RunView } from '@memberjunction/core';
import sql from 'mssql';

const urls = JSON.parse(process.env.URLS ?? '[]');
if (urls.length === 0) {
    throw new Error('Set URLS to a JSON array of URLs to discover');
}

const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true }, requestTimeout: 120000,
}).connect();
await setupSQLServerClient(new SQLServerProviderConfigData(pool, '__mj'), { mode: 'task' });

const md = new Metadata();
const rv = new RunView();
const user = UserCache.Users[0];
const entityID = (n) => md.Entities.find((e) => e.Name === n).ID;

const save = async (entityName, fields) => {
    const obj = await md.GetEntityObject(entityName, user);
    obj.NewRecord();
    for (const [k, v] of Object.entries(fields)) obj.Set(k, v);
    if (!(await obj.Save())) throw new Error(`${entityName}: ${JSON.stringify(obj.LatestResult?.Errors)}`);
    return obj;
};
const byName = async (entityName, name, fields) => {
    const found = await rv.RunView({ EntityName: entityName, ExtraFilter: `Name='${name}'`, ResultType: 'entity_object' }, user);
    return found.Results?.length ? found.Results[0].Get('ID') : (await save(entityName, { Name: name, ...fields })).Get('ID');
};

const models = await rv.RunView({ EntityName: 'MJ: AI Models', MaxRows: 1 }, user);
const contentTypeID = await byName('MJ: Content Types', 'API Job Text', {
    Description: 'seeded by the API job test', AIModelID: models.Results[0].ID, MinTags: 1, MaxTags: 5,
});
const sourceTypeID = await byName('MJ: Content Source Types', 'API Job Source Type', {
    Description: 'seeded by the API job test',
    Configuration: JSON.stringify({
        RequiredFields: [
            { Key: 'DiscoverDriverKey', Label: 'Discover driver', Type: 'text', Required: true },
            { Key: 'URLs', Label: 'URLs', Type: 'text', Required: true },
        ],
    }),
});
const fileTypeID = await byName('MJ: Content File Types', 'html', { Description: 'seeded by the API job test' });

const source = await save('MJ: Content Sources', {
    Name: `API job source ${new Date().toISOString()}`,
    ContentTypeID: contentTypeID, ContentSourceTypeID: sourceTypeID, ContentFileTypeID: fileTypeID,
    URL: urls[0],
    Configuration: JSON.stringify({
        SourceSpecificConfiguration: { DiscoverDriverKey: 'E2EList', URLs: urls },
    }),
});

// A Content Item for the stage to run over.
const item = await save('MJ: Content Items', {
    ContentSourceID: source.Get('ID'),
    ContentTypeID: contentTypeID,
    ContentSourceTypeID: sourceTypeID,
    ContentFileTypeID: fileTypeID,
    Name: 'API job item',
    URL: urls[0],
    Text: 'Seeded for the API-driven job test.',
});

// NoOp needs no driver, so this tests exactly one thing: whether the SERVER loaded the work type
// and the stage registry. A deployment supplies real drivers; the framework ships none.
const rp = await save('MJ: Record Processes', {
    Name: `API job — NoOp ${Date.now()}`,
    EntityID: entityID('MJ: Content Items'),
    WorkType: 'Pipeline Stage',
    ScopeType: 'Filter',
    ScopeFilter: `ID='${item.Get('ID')}'`,
    Status: 'Active',
    BatchSize: 25,
    Configuration: JSON.stringify({ Stages: ['NoOp'] }),
});

console.log(JSON.stringify({
    ContentSourceID: source.Get('ID'),
    ContentItemID: item.Get('ID'),
    RecordProcessID: rp.Get('ID'),
}));
await pool.close();
