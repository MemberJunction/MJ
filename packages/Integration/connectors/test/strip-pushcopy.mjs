// Reusable push-copy sanitizer (UNTRACKED). Applies the learned deploy fixes to a connector's
// integration.json copy: strip non-column fields (F1), set MetadataSource='Declared' (F5),
// width-trim string columns (F7), fix FK @lookup @parent:ID -> @parent:IntegrationID (F9).
// Usage: node strip-pushcopy.mjs <abs-path-to-connector-dir>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
// INTG: includes Configuration (added as a real column by the F1 migration V202606171600).
const INTG = new Set('Name,Description,NavigationBaseURL,ClassName,ImportPath,BatchMaxRequestCount,BatchRequestWaitTime,CredentialTypeID,Icon,Configuration'.split(','));
// IO: includes the F1 per-operation + sync-strategy columns (SupportsCreate/Update/Delete,
// SyncStrategy, ContentHashApplicable, StableOrderingKey) now that they are real columns.
const IO = new Set('IntegrationID,Name,DisplayName,Description,Category,APIPath,ResponseDataKey,DefaultPageSize,SupportsPagination,PaginationType,SupportsIncrementalSync,SupportsWrite,SupportsCreate,SupportsUpdate,SupportsDelete,SyncStrategy,ContentHashApplicable,StableOrderingKey,DefaultQueryParams,Configuration,Sequence,Status,WriteAPIPath,WriteMethod,DeleteMethod,IsCustom,CreateAPIPath,CreateMethod,CreateBodyShape,CreateBodyKey,CreateIDLocation,UpdateAPIPath,UpdateMethod,UpdateBodyShape,UpdateBodyKey,UpdateIDLocation,DeleteAPIPath,DeleteIDLocation,IncrementalWatermarkField,MetadataSource'.split(','));
const IOF = new Set('IntegrationObjectID,Name,DisplayName,Description,Category,Type,Length,Precision,Scale,AllowsNull,DefaultValue,IsPrimaryKey,IsUniqueKey,IsReadOnly,IsRequired,RelatedIntegrationObjectID,RelatedIntegrationObjectFieldName,Sequence,Configuration,Status,IsCustom,MetadataSource'.split(','));
const W = { Description: 255, Name: 255, DisplayName: 255, APIPath: 500, Category: 100, PaginationType: 20, Status: 25, MetadataSource: 20, CreateBodyShape: 50, UpdateBodyShape: 50, CreateIDLocation: 20, UpdateIDLocation: 20, DeleteIDLocation: 20, CreateMethod: 20, UpdateMethod: 20, DeleteMethod: 10, WriteMethod: 10, IncrementalWatermarkField: 255, ResponseDataKey: 255, Type: 100, DefaultValue: 255, RelatedIntegrationObjectFieldName: 255, CreateBodyKey: 100, UpdateBodyKey: 100, SyncStrategy: 50, StableOrderingKey: 255 };

const clean = (set, o) => {
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(o)) {
    if (!set.has(k)) delete o[k];
    else if (W[k] && typeof o[k] === 'string' && o[k].length > W[k]) o[k] = o[k].slice(0, W[k]);
  }
};

const jf = readdirSync(dir).find(f => /^\..*\.integration\.json$/.test(f));
const fp = join(dir, jf);
const arr = JSON.parse(readFileSync(fp, 'utf8'));
const r = Array.isArray(arr) ? arr[0] : arr;
clean(INTG, r.fields);
const ios = (r.relatedEntities && r.relatedEntities['MJ: Integration Objects']) || [];
for (const io of ios) {
  if (io.fields && io.fields.MetadataSource == null) io.fields.MetadataSource = 'Declared';
  clean(IO, io.fields);
  const fl = (io.relatedEntities && io.relatedEntities['MJ: Integration Object Fields']) || [];
  for (const f of fl) { if (f.fields && f.fields.MetadataSource == null) f.fields.MetadataSource = 'Declared'; clean(IOF, f.fields); }
}
let txt = JSON.stringify(Array.isArray(arr) ? arr : [r], null, 2) + '\n';
txt = txt.replace(/&IntegrationID=@parent:ID\b/g, '&IntegrationID=@parent:IntegrationID');
writeFileSync(fp, txt);
console.log(`  stripped+fixed ${jf}: IOs=${ios.length}`);
