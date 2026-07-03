#!/usr/bin/env node
// Reconciliation: the extractor emitted 9 nested/derived Blackbaud objects WITHOUT the parent-FK IOF
// whose NAME matches their APIPath template-var, so the base connector's template-var resolver could
// never fill {constituent_id}/{gift_id}/{batch_id}/{giftlookupid} and never fetched them (0 rows). It
// also left ResponseDataKey null on the access-path objects whose records live under a nested key.
// This adds the matching FK IOF + sets ResponseDataKey (metadata only — base connector untouched).
// table_entry is deactivated: RE NXT exposes NO code-tables LIST endpoint, so {code_table_id} is not
// enumerable — the object is structurally not independently syncable.
import { readFileSync, writeFileSync } from 'node:fs';
const FILE = 'metadata/integrations/blackbaud/.blackbaud.integration.json';
const d = JSON.parse(readFileSync(FILE, 'utf-8'));

// object -> { var: template-var/FK-IOF name, parent, parentField, rdk?: ResponseDataKey }
const FIX = {
  constituent_appeal:     { var: 'constituent_id', parent: 'constituent', parentField: 'id', rdk: 'appeals' },
  constituent_campaign:   { var: 'constituent_id', parent: 'constituent', parentField: 'id', rdk: 'campaigns' },
  constituent_fund:       { var: 'constituent_id', parent: 'constituent', parentField: 'id', rdk: 'funds' },
  name_format:            { var: 'constituent_id', parent: 'constituent', parentField: 'id', rdk: 'additional_name_formats' },
  constituent_code_link:  { var: 'constituent_id', parent: 'constituent', parentField: 'id' },
  constituent_id_map:     { var: 'constituent_id', parent: 'constituent', parentField: 'id' },
  gift_split:             { var: 'gift_id', parent: 'gift', parentField: 'id', rdk: 'gift_splits' },
  batch_gift:             { var: 'batch_id', parent: 'gift_batch', parentField: 'id', rdk: 'gifts' },
  gift_id_map:            { var: 'giftlookupid', parent: 'gift', parentField: 'lookup_id' },
};
const DEACTIVATE = { table_entry: 'RE NXT SKY API exposes no code-tables LIST endpoint (only /codetables/{code_table_id}/tableentries, which requires a known code_table_id). {code_table_id} is not enumerable, so table_entry is not independently syncable.' };

function ioFields(io) { return (io.relatedEntities?.['MJ: Integration Object Fields']) || []; }
function fkIOF(name, parent, parentField, seq) {
  return { fields: {
    Name: name, DisplayName: name, Description: `Parent reference for template-var resolution of the ${parent} whose ${parentField} fills the {${name}} path segment.`,
    Type: 'String', Length: null, Precision: null, Scale: null, AllowsNull: true, IsRequired: false, IsReadOnly: false,
    IsUniqueKey: false, IsPrimaryKey: false, Sequence: seq, Status: 'Active',
    RelatedIntegrationObjectID: `@lookup:MJ: Integration Objects.Name=${parent}&IntegrationID=@parent:IntegrationID`,
    RelatedIntegrationObjectFieldName: parentField, Configuration: { ReferencedType: parent }, IntegrationObjectID: '@parent:ID',
  } };
}

let addedFk = 0, setRdk = 0, deact = 0;
function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') {
    const f = o.fields;
    if (f && typeof f === 'object' && f.Name) {
      const fix = FIX[f.Name];
      if (fix && 'APIPath' in f) {
        const fields = ioFields(o);
        if (!fields.some((x) => (x.fields?.Name || '').toLowerCase() === fix.var.toLowerCase())) {
          o.relatedEntities = o.relatedEntities || {};
          o.relatedEntities['MJ: Integration Object Fields'] = o.relatedEntities['MJ: Integration Object Fields'] || [];
          o.relatedEntities['MJ: Integration Object Fields'].push(fkIOF(fix.var, fix.parent, fix.parentField, fields.length + 1));
          addedFk++;
        }
        if (fix.rdk) { f.ResponseDataKey = fix.rdk; setRdk++; }
      }
      if (DEACTIVATE[f.Name] && 'APIPath' in f) {
        f.Status = 'Disabled';
        f.Configuration = { ...(typeof f.Configuration === 'object' ? f.Configuration : {}), DeactivationReason: DEACTIVATE[f.Name] };
        deact++;
      }
    }
    for (const v of Object.values(o)) walk(v);
  }
}
walk(d);
writeFileSync(FILE, JSON.stringify(d, null, 2));
process.stdout.write(JSON.stringify({ addedFk, setRdk, deactivated: deact }) + '\n');
