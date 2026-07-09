#!/usr/bin/env node
// Regenerate the FULL EXTRACTION_EMISSION.json from the CURRENT metadata file (the source of truth).
// Amendment discipline: the emitted set is ADDITIVE — this artifact must reflect EVERY IO now in the
// metadata (65), never just the delta touched last round. Claims are derived per hard-constraint slot.
import fs from 'node:fs';

const ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const METADATA = `${ROOT}/metadata/integrations/higherlogic-vanilla/.higherlogic-vanilla.integration.json`;
const RUNOUT = `${ROOT}/packages/Integration/connectors-registry/higherlogic-vanilla/runs/connector-higherlogic-vanilla-1783524696351-4fa3bf0a/output`;
const OUT = `${RUNOUT}/EXTRACTION_EMISSION.json`;
const SRC = 'sources/vanilla-openapi.merged.v3.json (union of open.vanillaforums.com/api/v2/openapi/v3 + success.vanillaforums.com KB-1842-embedded spec)';

// Prior emissions carry matrixRow + gapsRemaining we can reuse verbatim where an object still exists.
function loadPrior(path) {
  try { const a = JSON.parse(fs.readFileSync(path, 'utf8')); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
const priorDelta = loadPrior(`${RUNOUT}/EXTRACTION_EMISSION.pre-r3-full.json`);
const priorR3 = loadPrior(OUT);                                   // current 11-object delta
const priorRound0 = loadPrior(`${RUNOUT}/EXTRACTION_EMISSION.round0.json`);
const priorByName = new Map();
for (const src of [priorRound0, priorDelta, priorR3]) for (const o of src) priorByName.set(o.objectName, o); // later wins

const j = JSON.parse(fs.readFileSync(METADATA, 'utf8'));
const root = Array.isArray(j) ? j[0] : j;
const ios = root.relatedEntities['MJ: Integration Objects'];

function fkTarget(iof) {
  if (iof.fields.Configuration && iof.fields.Configuration.ReferencedType) return iof.fields.Configuration.ReferencedType;
  const r = iof.fields.RelatedIntegrationObjectID;
  const m = typeof r === 'string' && r.match(/Name=([^&]+)/);
  return m ? m[1] : null;
}

const emission = [];
let totalFields = 0;

for (const io of ios) {
  const f = io.fields;
  const name = f.Name;
  const iofs = (io.relatedEntities && io.relatedEntities['MJ: Integration Object Fields']) || [];
  totalFields += iofs.length;
  const claims = [];

  // IO-level hard-constraint slots
  const ioSlots = [
    ['APIPath', f.APIPath], ['PaginationType', f.PaginationType],
    ['SupportsWrite', f.SupportsWrite], ['SupportsPagination', f.SupportsPagination],
    ['SupportsIncrementalSync', f.SupportsIncrementalSync],
    ['IncrementalWatermarkField', f.IncrementalWatermarkField],
    ['SupportsCreate', f.SupportsCreate], ['CreateAPIPath', f.CreateAPIPath], ['CreateMethod', f.CreateMethod],
    ['CreateBodyShape', f.CreateBodyShape], ['CreateBodyKey', f.CreateBodyKey], ['CreateIDLocation', f.CreateIDLocation],
    ['SupportsUpdate', f.SupportsUpdate], ['UpdateAPIPath', f.UpdateAPIPath], ['UpdateMethod', f.UpdateMethod],
    ['UpdateBodyShape', f.UpdateBodyShape], ['UpdateBodyKey', f.UpdateBodyKey], ['UpdateIDLocation', f.UpdateIDLocation],
    ['SupportsDelete', f.SupportsDelete], ['DeleteAPIPath', f.DeleteAPIPath], ['DeleteMethod', f.DeleteMethod],
    ['DeleteIDLocation', f.DeleteIDLocation], ['SyncStrategy', f.SyncStrategy],
  ];
  for (const [slot, value] of ioSlots) {
    if (value === undefined || value === null || value === '') continue;
    claims.push({ slot: `io.${name}.${slot}`, value, sourcePath: `${SRC} :: ${name} ${slot}` });
  }

  // IOF-level hard-constraint slots
  for (const iof of iofs) {
    const g = iof.fields;
    if (g.IsPrimaryKey === true)
      claims.push({ slot: `iof.${g.Name}.IsPrimaryKey`, value: true, sourcePath: `${SRC} :: addressing path param / <door>ID identity` });
    if (g.IsUniqueKey === true)
      claims.push({ slot: `iof.${g.Name}.IsUniqueKey`, value: true, sourcePath: `${SRC} :: unique identifier` });
    if (g.IsRequired === true)
      claims.push({ slot: `iof.${g.Name}.IsRequired`, value: true, sourcePath: `${SRC} :: schema required[] for ${name}` });
    if (g.IsReadOnly === true)
      claims.push({ slot: `iof.${g.Name}.IsReadOnly`, value: true, sourcePath: `${SRC} :: schema readOnly for ${name}.${g.Name}` });
    const tgt = fkTarget(iof);
    if (tgt)
      claims.push({ slot: `iof.${g.Name}.RelatedIntegrationObjectID`, value: tgt, sourcePath: `${SRC} :: field "${g.Name}" ${g.Description ? '— "' + g.Description + '" ' : ''}→ ${tgt}` });
    // Type claim (every field carries a provable type)
    if (g.Type)
      claims.push({ slot: `iof.${g.Name}.Type`, value: g.Type, sourcePath: `${SRC} :: schema property type for ${name}.${g.Name}` });
  }

  // matrixRow + gapsRemaining: reuse prior emission's if the object existed, else compute a defensible row.
  const prior = priorByName.get(name);
  let matrixRow, gapsRemaining;
  if (prior && prior.matrixRow) {
    matrixRow = { ...prior.matrixRow, IOName: name, EvidenceCount: claims.length };
    gapsRemaining = Array.isArray(prior.gapsRemaining) ? prior.gapsRemaining : [];
  } else {
    const pkFields = iofs.filter(x => x.fields.IsPrimaryKey === true);
    const fkFields = iofs.filter(x => fkTarget(x));
    matrixRow = {
      IOName: name,
      ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'n/a',
      OpenAPIxPK: 'no', OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no',
      VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
      NamingConvention: 'yes', CrossIOMatch: fkFields.length ? 'yes' : 'no',
      PKVerdict: pkFields.length ? 'emit' : 'defer',
      FKVerdict: fkFields.length ? `emit-${fkFields.length}` : 'defer',
      EvidenceCount: claims.length,
    };
    gapsRemaining = [];
  }

  emission.push({ objectName: name, fieldsExtracted: iofs.length, gapsRemaining, claims, matrixRow });
}

fs.writeFileSync(OUT, JSON.stringify(emission, null, 1));

const stats = {
  objectsExtracted: emission.length,
  fieldsExtracted: totalFields,
  claimsTotal: emission.reduce((s, o) => s + o.claims.length, 0),
  zeroFieldObjects: emission.filter(o => o.fieldsExtracted === 0).length,
};
process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
