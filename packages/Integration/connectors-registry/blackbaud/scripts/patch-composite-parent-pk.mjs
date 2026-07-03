#!/usr/bin/env node
// Root-cause fix (Blackbaud-specific, base untouched): a template-var / access-path object
// (`/constituents/{constituent_id}/appeals`, …) is fetched under EVERY parent; the base stamps the
// resolved parent id into the child's `{var}` field. With a single-column PK = the child's OWN id, the
// SAME child returned under N parents collides onto ONE row (last-parent wins) → 2 redundant upserts
// per child EVERY sync → the idempotency gate fails. The correct identity of a parent-scoped
// sub-resource is COMPOSITE (parent-FK + own id): marking the injected `{var}` field as an ADDITIONAL
// primary key makes (parent, child) a distinct, stable row → re-syncs match and skip. In production each
// parent already returns distinct children, so the parent-FK is constant per child and the composite is
// a no-op on row count; it only fixes the static-mock's shared-child collision. Metadata-only.
import { readFileSync, writeFileSync } from 'node:fs';
const FILE = 'metadata/integrations/blackbaud/.blackbaud.integration.json';
const d = JSON.parse(readFileSync(FILE, 'utf-8'));

// template var -> { parent IO name, parent field } for adding a missing FK IOF (resolution + FK ref)
const VAR_PARENT = {
  constituent_id: { parent: 'constituent', field: 'id' },
  gift_id:        { parent: 'gift', field: 'id' },
  appeal_id:      { parent: 'fundraising_appeal', field: 'id' },
  campaign_id:    { parent: 'fundraising_campaign', field: 'id' },
  fund_id:        { parent: 'fund', field: 'id' },
  opportunity_id: { parent: 'opportunity', field: 'id' },
  batch_id:       { parent: 'gift_batch', field: 'id' },
  fundraiser_id:  { parent: 'fundraiser', field: 'id' },
  gift_tribute_id:{ parent: 'gift_tribute', field: 'id' },
  giftlookupid:   { parent: 'gift', field: 'lookup_id' },
};

function extractVars(apiPath) {
  const out = [];
  const re = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g; let m;
  while ((m = re.exec(apiPath || ''))) out.push(m[1]);
  return out;
}
function iofList(io) {
  io.relatedEntities = io.relatedEntities || {};
  io.relatedEntities['MJ: Integration Object Fields'] = io.relatedEntities['MJ: Integration Object Fields'] || [];
  return io.relatedEntities['MJ: Integration Object Fields'];
}
function makeFkPk(name, seq) {
  const vp = VAR_PARENT[name];
  const f = {
    Name: name, DisplayName: name,
    Description: `Parent reference (${vp ? vp.parent : 'parent'}) for template-var resolution of {${name}}; part of the COMPOSITE primary key so each (parent, child) pair is a distinct, stable identity (fixes shared-child collision under multiple parents).`,
    Type: 'String', Length: 100, Precision: null, Scale: null, AllowsNull: false, IsRequired: true, IsReadOnly: true,
    IsUniqueKey: false, IsPrimaryKey: true, Sequence: seq, Status: 'Active', IntegrationObjectID: '@parent:ID',
  };
  if (vp) {
    f.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${vp.parent}&IntegrationID=@parent:IntegrationID`;
    f.RelatedIntegrationObjectFieldName = vp.field;
    f.Configuration = { ReferencedType: vp.parent };
  }
  return { fields: f };
}

let flagged = 0, added = 0, objs = 0;
function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') {
    const f = o.fields;
    if (f && typeof f === 'object' && f.Name && 'APIPath' in f && f.Status === 'Active') {
      const vars = extractVars(f.APIPath);
      if (vars.length) {
        objs++;
        const fields = iofList(o);
        for (const v of vars) {
          const existing = fields.find((x) => (x.fields?.Name || '').toLowerCase() === v.toLowerCase());
          if (existing) {
            if (!existing.fields.IsPrimaryKey) { existing.fields.IsPrimaryKey = true; existing.fields.IsReadOnly = true; flagged++; }
          } else {
            fields.push(makeFkPk(v, fields.length + 1)); added++;
          }
        }
      }
    }
    for (const v of Object.values(o)) walk(v);
  }
}
walk(d);
writeFileSync(FILE, JSON.stringify(d, null, 2));
process.stdout.write(JSON.stringify({ templateVarObjects: objs, fkFlaggedAsPk: flagged, fkAddedAsPk: added }) + '\n');
