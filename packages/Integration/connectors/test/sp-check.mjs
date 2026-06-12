// Bounded-types live proof (throwaway, NOT committed). SchemaPreview re-discovers 'opens' via the
// broker → buildTargetConfigs → the new TypeMapper → generates DDL. We grep the DDL for the column
// types: bounded NVARCHAR(n) vs NVARCHAR(MAX). The fix = string columns come out bounded, not MAX.
const KEY = process.env.MJ_API_KEY;
const CIID = '25564822-3426-4C03-B875-66C5BFA2E379';
async function gql(query, variables) {
  const r = await fetch('http://localhost:4007/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mj-api-key': KEY },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}
const q = `query($c:String!,$o:[SchemaPreviewObjectInput!]!){
  IntegrationSchemaPreview(companyIntegrationID:$c, objects:$o){
    Success Message Warnings Files { FilePath Content }
  }
}`;
const r = await gql(q, { c: CIID, o: [{ SourceObjectName: 'opens', SchemaName: 'propfuel', TableName: 'opens', EntityName: 'PropFuel Opens' }] });
if (r.errors) { console.log('GQL ERROR:', JSON.stringify(r.errors[0]?.message).slice(0, 300)); process.exit(1); }
const o = r?.data?.IntegrationSchemaPreview;
console.log(`Success=${o?.Success}  Message=${o?.Message}`);
if (o?.Warnings?.length) console.log('Warnings:', o.Warnings.slice(0, 4).join(' | '));
for (const f of o?.Files || []) {
  const c = f.Content || '';
  if (!/NVARCHAR|VARCHAR/i.test(c)) continue;
  console.log(`\n--- ${f.FilePath} ---`);
  const lines = c.split('\n').filter((l) => /NVARCHAR|VARCHAR/i.test(l));
  console.log(lines.slice(0, 50).join('\n'));
  const max = (c.match(/NVARCHAR\(MAX\)/gi) || []).length;
  const bounded = (c.match(/NVARCHAR\(\d+\)/gi) || []).length;
  console.log(`\n>>> in this file: NVARCHAR(MAX)=${max}   NVARCHAR(n) bounded=${bounded}`);
}
