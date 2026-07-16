// One-shot: physically remove non-deployable stray keys (e.g. IsForeignKey — a transient discovery
// marker the framework never persists; mj-sync validation errors on any unrecognized fields key) left
// on IOF rows by prior runs. FK is durably expressed via RelatedIntegrationObjectID + Configuration.ReferencedType.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
const REG='packages/Integration/connectors-registry/constant-contact';
const IOF_COLS=new Set(['IntegrationObjectID','Name','DisplayName','Description','Category','Type','Length','Precision','Scale','AllowsNull','DefaultValue','IsPrimaryKey','IsUniqueKey','IsReadOnly','IsRequired','RelatedIntegrationObjectID','RelatedIntegrationObjectFieldName','Sequence','Configuration','Status','MetadataSource','IsCustom']);
const m=JSON.parse(readFileSync(`metadata/integrations/constant-contact/.constant-contact.integration.json`,'utf8'));
const io=(Array.isArray(m)?m[0]:m).relatedEntities['MJ: Integration Objects'];
const jobs=[];
for(const o of io) for(const f of o.relatedEntities['MJ: Integration Object Fields']) for(const k of Object.keys(f.fields)) if(!IOF_COLS.has(k)) jobs.push({ioName:o.fields.Name,iofName:f.fields.Name,fieldKey:k});
const MCP='/Users/bcladmin/Projects/MemberJunction/MJ/packages/MCP/mj-metadata/dist/server.js';
const transport=new StdioClientTransport({command:'node',args:[MCP],env:{...process.env}});
const client=new Client({name:'cc-clean',version:'1.0'},{capabilities:{}});
await client.connect(transport);
for(const j of jobs) await client.callTool({name:'delete_integration_object_field',arguments:{connector:'constant-contact',...j}});
await client.close();
console.log('removed',jobs.length,'stray keys:',JSON.stringify([...new Set(jobs.map(j=>j.fieldKey))]));
