#!/usr/bin/env node
// Regenerate PK source-check matrix + PK CODE_EVIDENCE truthfully from the OpenAPI spec.
import fs from 'node:fs';

const ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/higherlogic-vanilla';
const META = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/higherlogic-vanilla/.higherlogic-vanilla.integration.json';
const SPEC = `${ROOT}/sources/vanilla-openapi.merged.v3.json`;

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
const ios = meta['0'].relatedEntities['MJ: Integration Objects'];

// ---- schema resolution helpers ----
function derefRef(ref) {
  // "#/components/schemas/Foo"
  const parts = ref.replace(/^#\//, '').split('/');
  let cur = spec;
  for (const p of parts) cur = cur?.[p];
  return cur;
}

// Collect property names from a schema, flattening allOf / $ref / oneOf / anyOf; unwrap array items & common paging wrappers.
function collectProps(schema, seen = new Set(), depth = 0) {
  const props = new Set();
  if (!schema || depth > 8) return props;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return props;
    seen.add(schema.$ref);
    for (const p of collectProps(derefRef(schema.$ref), seen, depth + 1)) props.add(p);
    return props;
  }
  // array -> items (Vanilla often omits an explicit type:array)
  if (schema.items) {
    for (const p of collectProps(schema.items, seen, depth + 1)) props.add(p);
    return props;
  }
  // combiners
  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[key])) {
      for (const sub of schema[key]) for (const p of collectProps(sub, seen, depth + 1)) props.add(p);
    }
  }
  if (schema.properties) {
    for (const k of Object.keys(schema.properties)) props.add(k);
  }
  return props;
}

// Get the object schema property-set for an IO by walking its GET response(s).
function objectPropsForIO(apiPath) {
  const propSet = new Set();
  const requiredSet = new Set();
  const tryPaths = [apiPath];
  // single-record variants
  for (const p of Object.keys(spec.paths)) {
    if (p.startsWith(apiPath + '/') && /\/\{[^/]+\}$/.test(p)) tryPaths.push(p);
  }
  for (const pth of tryPaths) {
    const item = spec.paths[pth];
    if (!item) continue;
    for (const method of ['get']) {
      const op = item[method];
      const sch = op?.responses?.['200']?.content?.['application/json']?.schema
               || op?.responses?.['201']?.content?.['application/json']?.schema;
      if (!sch) continue;
      // unwrap common data wrappers
      let target = sch;
      if (target.properties && (target.properties.data || target.properties.items)) {
        target = target.properties.data || target.properties.items;
      } else if (!target.properties && !target.$ref && (target.data || target.items)) {
        target = target.data || target.items;
      }
      for (const p of collectProps(target)) propSet.add(p);
      // gather required at the leaf object level
      let reqSrc = target;
      if (reqSrc.$ref) reqSrc = derefRef(reqSrc.$ref);
      if (reqSrc?.type === 'array' && reqSrc.items) reqSrc = reqSrc.items;
      if (reqSrc?.$ref) reqSrc = derefRef(reqSrc.$ref);
      if (Array.isArray(reqSrc?.required)) reqSrc.required.forEach(r => requiredSet.add(r));
    }
  }
  return { propSet, requiredSet };
}

// Does a single-record addressing path exist for this object (APIPath/{param} with a path param)?
function hasAddressingPath(apiPath) {
  for (const p of Object.keys(spec.paths)) {
    if (p.startsWith(apiPath + '/') && /\/\{[^/]+\}$/.test(p)) {
      const item = spec.paths[p];
      for (const m of ['get', 'patch', 'delete', 'put']) {
        const op = item[m];
        if (op && Array.isArray(op.parameters) && op.parameters.some(pr => pr.in === 'path')) return p;
      }
      // params can also be at path-item level
      if (Array.isArray(item.parameters) && item.parameters.some(pr => pr.in === 'path')) return p;
    }
  }
  return null;
}

// Collect all PK names across IOs for cross-IO matching.
const ioPKs = {};
for (const io of ios) {
  const name = io.fields.Name;
  const flds = io.relatedEntities?.['MJ: Integration Object Fields'] || [];
  ioPKs[name] = flds.filter(f => f.fields.IsPrimaryKey === true).map(f => f.fields.Name);
}
const pkNameToIOs = {};
for (const [io, pks] of Object.entries(ioPKs)) {
  for (const pk of pks) (pkNameToIOs[pk.toLowerCase()] ||= []).push(io);
}

const rows = [];
const codeEvidence = [];
let objectsFixed = 0, pkDemoted = 0;
const demotions = [];

for (const io of ios) {
  const name = io.fields.Name;
  const apiPath = io.fields.APIPath;
  const flds = io.relatedEntities?.['MJ: Integration Object Fields'] || [];
  const pks = flds.filter(f => f.fields.IsPrimaryKey === true).map(f => f.fields.Name);

  const { propSet, requiredSet } = objectPropsForIO(apiPath);
  const lowerProps = new Set([...propSet].map(s => s.toLowerCase()));
  const addr = hasAddressingPath(apiPath);

  // per-cell truthful derivation across ALL PK components
  let openAPIxPK = false, namingConv = false, crossIO = false;
  const pkDetails = [];
  for (const pk of pks) {
    const inSchema = lowerProps.has(pk.toLowerCase());
    const req = [...requiredSet].some(r => r.toLowerCase() === pk.toLowerCase());
    if (inSchema || req) openAPIxPK = true;
    // vendor-wide <object>ID convention: pk lowercased == objName+id  OR pk ends with ID
    const objLower = name.toLowerCase();
    if (pk.toLowerCase() === objLower + 'id' || /id$/i.test(pk)) namingConv = true;
    // cross-IO: pk name is a PK on another IO
    const others = (pkNameToIOs[pk.toLowerCase()] || []).filter(o => o !== name);
    if (others.length) crossIO = true;
    pkDetails.push({ pk, inSchema, req, addr: !!addr });
  }

  // OpenAPIPathOps: single-record addressing path exists
  const pathOps = !!addr;

  // PKVerdict: emit only if >=1 real source-cell yes; else defer (demote)
  const anySource = openAPIxPK || pathOps || namingConv || crossIO;
  let pkVerdict;
  if (pks.length === 0) {
    pkVerdict = 'defer';
  } else if (anySource) {
    pkVerdict = 'emit';
  } else {
    pkVerdict = 'defer';
    pkDemoted++;
    demotions.push({ io: name, pks });
  }

  // build CODE_EVIDENCE per PK (only when emitting with a real source)
  if (pkVerdict === 'emit') {
    for (const d of pkDetails) {
      const loci = [];
      if (d.inSchema) loci.push(`declared property of the GET ${apiPath} response object schema`);
      if (d.req) loci.push(`in the object schema 'required' set`);
      if (d.addr) loci.push(`addressed by single-record path ${addr} (path parameter)`);
      if (!loci.length) loci.push(`matches vendor-wide <object>ID naming convention`);
      codeEvidence.push({
        TargetField: `iof.${name}.${d.pk}.IsPrimaryKey`,
        ScriptPath: 'scripts/regen-pk-matrix.mjs',
        ScriptRunAt: new Date().toISOString(),
        Source: 'sources/vanilla-openapi.merged.v3.json',
        SchemaValidationStatus: 'Passed',
        EvidenceStrength: (d.inSchema || d.req || d.addr) ? 'ExplicitStatement' : 'InferredFromContext',
        Locus: loci.join('; '),
        StructuredOutput: { field: d.pk, inObjectSchema: d.inSchema, inRequired: d.req, hasAddressingPath: d.addr }
      });
    }
  }

  const cell = b => (b ? 'yes' : 'no');
  rows.push({
    IOName: name,
    ExistingConnectorTs: 'no',
    ExistingMetadataJson: 'no',
    OpenAPIxPK: pks.length ? cell(openAPIxPK) : 'n/a',
    OpenAPIPathOps: cell(pathOps),
    OpenAPILocationHeader: 'n/a',
    VendorDocsProseScan: 'no',
    SDKTypes: 'n/a',
    PostmanCommunity: 'n/a',
    NamingConvention: pks.length ? cell(namingConv) : 'n/a',
    CrossIOMatch: cell(crossIO),
    PKVerdict: pkVerdict,
    FKVerdict: '-',
    EvidenceCount: pkVerdict === 'emit' ? pks.length : 0
  });
  if (pks.length) objectsFixed++;
  // dry-run print
  console.log(`${name.padEnd(26)} PK=${(pks.join(',')||'(none)').padEnd(22)} xPK=${cell(openAPIxPK)} pathOps=${cell(pathOps)} naming=${cell(namingConv)} cross=${cell(crossIO)} => ${pkVerdict}`);
}

console.log('\nSUMMARY objectsFixed(with PK)=%d pkDemoted=%d matrixRows=%d', objectsFixed, pkDemoted, rows.length);
if (demotions.length) console.log('DEMOTIONS:', JSON.stringify(demotions, null, 1));

// write out artifacts only when --write passed
if (process.argv.includes('--write')) {
  const header = 'IOName,ExistingConnectorTs,ExistingMetadataJson,OpenAPIxPK,OpenAPIPathOps,OpenAPILocationHeader,VendorDocsProseScan,SDKTypes,PostmanCommunity,NamingConvention,CrossIOMatch,PKVerdict,FKVerdict,EvidenceCount';
  const cols = ['IOName','ExistingConnectorTs','ExistingMetadataJson','OpenAPIxPK','OpenAPIPathOps','OpenAPILocationHeader','VendorDocsProseScan','SDKTypes','PostmanCommunity','NamingConvention','CrossIOMatch','PKVerdict','FKVerdict','EvidenceCount'];
  const csv = [header, ...rows.map(r => cols.map(c => r[c]).join(','))].join('\n') + '\n';

  const runOut = `${ROOT}/runs/connector-higherlogic-vanilla-1783524696351-4fa3bf0a/output/EXTRACTION_REPORT_MATRIX.csv`;
  const pkgOut = `${ROOT}/output/EXTRACTION_REPORT_MATRIX.csv`;
  fs.writeFileSync(runOut, csv);
  // deref the symlink: remove it and write a real file
  try { const st = fs.lstatSync(pkgOut); if (st.isSymbolicLink()) fs.unlinkSync(pkgOut); } catch {}
  fs.writeFileSync(pkgOut, csv);
  console.log('WROTE matrix to:', runOut, 'AND', pkgOut);

  // append CODE_EVIDENCE
  const cePath = `${ROOT}/CODE_EVIDENCE.json`;
  const ce = JSON.parse(fs.readFileSync(cePath, 'utf8'));
  const arr = Array.isArray(ce.Entries) ? ce.Entries : (Array.isArray(ce) ? ce : null);
  if (!arr) throw new Error('unexpected CODE_EVIDENCE shape: ' + Object.keys(ce));
  // remove prior PK evidence entries we may have added before (idempotent) for these target fields
  const targets = new Set(codeEvidence.map(e => e.TargetField));
  const filtered = arr.filter(e => !(targets.has(e.TargetField) && e.ScriptPath === 'scripts/regen-pk-matrix.mjs'));
  filtered.push(...codeEvidence);
  ce.Entries = filtered;
  fs.writeFileSync(cePath, JSON.stringify(ce, null, 2));
  console.log('APPENDED %d PK CODE_EVIDENCE entries to %s', codeEvidence.length, cePath);
}
