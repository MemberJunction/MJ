/**
 * B4a — Metadata-driven legality from the SEEDED registry (Track B fixture).
 *
 * Reads the REAL MJ_MCF_Fresh rows (MJ: ML Components/Ports/Slots/Port Adapters via
 * their generated views), maps them into the Core plain-data shapes, and runs the
 * BUILT `validateCompositeSpec` + `findCompatibleSlots` — proving legality is
 * driven by seeded metadata, not hardcoded fixtures. Also the CodeApprovalStatus
 * Pending→Approved CRUD smoke at the SQL level.
 *
 * Run:  DB_PASSWORD=... node seeded-legality.check.mjs   (from this dir)
 */
import sql from 'mssql';
import {
  validateCompositeSpec, findCompatibleSlots, findCompatibleFillers,
} from '../../../packages/AI/PredictiveStudio/Core/dist/composite-schema.js';

const cfg = {
  server: 'localhost', port: 1444, database: 'MJ_MCF_Fresh',
  user: 'sa', password: process.env.DB_PASSWORD,
  options: { trustServerCertificate: true, encrypt: true },
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

const pool = await sql.connect(cfg);
const q = async (s) => (await pool.request().query(s)).recordset;

// ---- load the seeded registry into Core shapes ----
const ports = await q(`SELECT Component, Name, Direction, PortType FROM __mj.vwMLComponentPorts`);
const slots = await q(`SELECT Component, Name, RequiredPortType, MinCount, MaxCount FROM __mj.vwMLComponentSlots`);
const comps = await q(`SELECT Name FROM __mj.MLComponent`);
const adapters = await q(`
  SELECT a.Name, f.Name AS FromPortType, t.Name AS ToPortType, a.Strategy, a.IsLossy
  FROM __mj.MLPortAdapter a
  JOIN __mj.MLPortType f ON a.FromPortTypeID = f.ID
  JOIN __mj.MLPortType t ON a.ToPortTypeID = t.ID`);

const registry = comps.map((c) => ({
  Name: c.Name,
  Ports: ports.filter((p) => p.Component === c.Name)
              .map((p) => ({ Name: p.Name, Direction: p.Direction, PortType: p.PortType })),
  Slots: slots.filter((s) => s.Component === c.Name)
              .map((s) => ({ Name: s.Name, RequiredPortType: s.RequiredPortType,
                             MinCount: s.MinCount, MaxCount: s.MaxCount })),
}));
const adapterDefs = adapters.map((a) => ({
  Name: a.Name, FromPortType: a.FromPortType, ToPortType: a.ToPortType,
  Strategy: a.Strategy, IsLossy: !!a.IsLossy,
}));
check('registry loaded from seeded rows',
  registry.length === 10 && adapterDefs.length === 3,
  `${registry.length} components, ${adapterDefs.length} adapters`);

// ---- legality over SEEDED metadata ----
const legal = validateCompositeSpec({
  Nodes: [
    { ID: 'm', Component: 'XGBoost Classifier' },
    { ID: 'c', Component: 'Isotonic Calibrator' },
  ],
  Edges: [{ From: 'm', FromPort: 'probability', To: 'c', ToPort: 'probability' }],
  ExposedOutputNode: 'c',
}, registry, adapterDefs);
check('legal graph (calibrated classifier) accepted from seeded rows', legal.ok, legal.ok ? '' : legal.error);

const viaAdapter = validateCompositeSpec({
  Nodes: [
    { ID: 'a', Component: 'Logistic Regression' },
    { ID: 'meta', Component: 'XGBoost Classifier' },
  ],
  Edges: [{ From: 'a', FromPort: 'probability', To: 'meta', ToPort: 'features:tabular', Adapter: 'Probability Column' }],
  ExposedOutputNode: 'meta',
}, registry, adapterDefs);
check('adapter edge legal via SEEDED Probability Column adapter', viaAdapter.ok, viaAdapter.ok ? '' : viaAdapter.error);

const illegal = validateCompositeSpec({
  Nodes: [
    { ID: 'r', Component: 'Ridge Regressor' },
    { ID: 'c', Component: 'Isotonic Calibrator' },
  ],
  Edges: [{ From: 'r', FromPort: 'score', To: 'c', ToPort: 'probability' }],
  ExposedOutputNode: 'c',
}, registry, adapterDefs);
check('illegal edge (score→probability, no seeded adapter) rejected',
  !illegal.ok, illegal.ok ? 'WRONGLY ACCEPTED' : illegal.error.slice(0, 90));

// the metadata-driven proof: seed a TEMPORARY score→probability adapter row, reload, re-validate
await q(`INSERT INTO __mj.MLPortAdapter (Name, FromPortTypeID, ToPortTypeID, Strategy, IsLossy, Status)
  SELECT 'TEMP Sigmoid Squash', f.ID, t.ID, 'sigmoid', 1, 'Active'
  FROM (SELECT ID FROM __mj.MLPortType WHERE Name='score') f,
       (SELECT ID FROM __mj.MLPortType WHERE Name='probability') t`);
const adapters2 = (await q(`
  SELECT a.Name, f.Name AS FromPortType, t.Name AS ToPortType, a.Strategy, a.IsLossy
  FROM __mj.MLPortAdapter a
  JOIN __mj.MLPortType f ON a.FromPortTypeID = f.ID
  JOIN __mj.MLPortType t ON a.ToPortTypeID = t.ID`)).map((a) => ({
    Name: a.Name, FromPortType: a.FromPortType, ToPortType: a.ToPortType,
    Strategy: a.Strategy, IsLossy: !!a.IsLossy }));
const nowLegal = validateCompositeSpec({
  Nodes: [
    { ID: 'r', Component: 'Ridge Regressor' },
    { ID: 'c', Component: 'Isotonic Calibrator' },
  ],
  Edges: [{ From: 'r', FromPort: 'score', To: 'c', ToPort: 'probability' }],
  ExposedOutputNode: 'c',
}, registry, adapters2);
check('same edge becomes legal after seeding a new adapter ROW (metadata-driven, no code change)',
  nowLegal.ok, nowLegal.ok ? '' : nowLegal.error);
await q(`DELETE FROM __mj.MLPortAdapter WHERE Name='TEMP Sigmoid Squash'`);

// ---- affordances over seeded rows ----
const templates = registry.filter((r) => r.Slots.length > 0);
const logit = registry.find((r) => r.Name === 'Logistic Regression');
const slotsFor = findCompatibleSlots(logit, templates, adapterDefs);
check('findCompatibleSlots(Logistic) over seeded templates',
  slotsFor.some((s) => s.TemplateName === 'Calibrator Template') &&
  slotsFor.some((s) => s.TemplateName === 'Cluster-then-Classify' && s.SlotName === 'classifier'),
  JSON.stringify(slotsFor.map((s) => `${s.TemplateName}.${s.SlotName}`)));

const clusterSlot = templates.find((t) => t.Name === 'Cluster-then-Classify')
  .Slots.find((s) => s.Name === 'cluster');
const fillers = findCompatibleFillers(clusterSlot, registry, adapterDefs);
check('findCompatibleFillers(cluster slot) finds no filler yet (no clusterer seeded — honest)',
  fillers.length === 0, `fillers=${fillers.map((f) => f.Name)}`);

// ---- CodeApprovalStatus gate smoke (SQL-level round trip incl. CHECK enforcement) ----
await q(`UPDATE __mj.MLComponent SET CodeApprovalStatus='Pending' WHERE Name='MLP Classifier'`);
const pending = await q(`SELECT CodeApprovalStatus FROM __mj.MLComponent WHERE Name='MLP Classifier'`);
let badRejected = false;
try { await q(`UPDATE __mj.MLComponent SET CodeApprovalStatus='YOLO' WHERE Name='MLP Classifier'`); }
catch { badRejected = true; }
await q(`UPDATE __mj.MLComponent SET CodeApprovalStatus='Approved' WHERE Name='MLP Classifier'`);
const approved = await q(`SELECT CodeApprovalStatus FROM __mj.MLComponent WHERE Name='MLP Classifier'`);
check('CodeApprovalStatus Pending→Approved round trip + CHECK rejects invalid value',
  pending[0].CodeApprovalStatus === 'Pending' && approved[0].CodeApprovalStatus === 'Approved' && badRejected);

await pool.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks green`);
process.exit(fails.length ? 1 : 0);
