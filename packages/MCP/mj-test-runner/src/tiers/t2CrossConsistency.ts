/**
 * T2_CrossProgrammaticConsistency — does the connector make the SAME structural
 * claims when its discovery is run twice (two independent extraction passes over
 * the same source)?
 *
 * The connector's discovery (`DiscoverObjects` + `DiscoverFields`) is the
 * programmatic extraction of its object model. We run it twice in a fresh child,
 * capture the claimed object set, per-object field sets, and each field's
 * PK / FK / unique flags, then diff the two snapshots. Any divergence above a
 * tiny threshold is non-determinism in the extractor → Fail with the diff.
 *
 * **SHAPE-AGNOSTIC.** We only call the abstract discovery methods. A REST
 * connector discovers via its API/static catalog; a file-feed connector
 * discovers via its file header — both reduce to the same `{objects, fields}`
 * snapshot we diff. No transport assumptions.
 *
 * **CREDENTIAL-FREE.** Discovery is driven with an offline `Configuration`
 * (fixtures if present, else `{}` so static-catalog connectors still discover).
 * No credential file is ever read.
 *
 * Depth note: "two passes" here are two invocations of the connector's own
 * discovery. A connector whose discovery degrades to a static catalog (no fixture,
 * no live source) will trivially agree — that's correct (it IS deterministic) but
 * shallow; the diff has real teeth for connectors whose discovery infers fields
 * from sampled data, where a second pass could reorder/omit fields.
 */
import { CHILD_PREAMBLE, CHILD_TRANSPORT, spawnChildRunner, clipStderr, type ConnectorIdentity } from './childRunner.js';
import { loadFixtures, type FixtureManifest } from './fixtures.js';

/** Portion of a TierResult an individual tier handler returns. */
interface TierHandlerResult {
    Status: 'Pass' | 'Fail' | 'Skipped';
    Output: string;
    Errors: string[];
    Details?: Record<string, unknown>;
}

/** A single field's structural claim, normalised for diffing. */
interface FieldClaim {
    Name: string;
    IsPrimaryKey: boolean;
    IsForeignKey: boolean;
    IsUniqueKey: boolean;
    ForeignKeyTarget: string | null;
}

/** One discovery snapshot: object names → their field claims. */
interface DiscoverySnapshot {
    Objects: string[];
    Fields: Record<string, FieldClaim[]>;
}

/** Child payload: two independent snapshots plus any per-object discovery errors. */
interface T2Data {
    passA?: DiscoverySnapshot;
    passB?: DiscoverySnapshot;
    discoverError?: string;
}

/**
 * Run T2 for a connector. Builds an offline `Configuration` from fixtures (or `{}`),
 * spawns the child to discover twice, and diffs the snapshots.
 */
export function runT2CrossConsistency(connector: string, identity: ConnectorIdentity): TierHandlerResult {
    const { Manifest } = loadFixtures(connector);
    // When fixtures exist, the child boots the SAME transport (mock server / temp
    // file) the other offline tiers use, so discovery actually runs for
    // transport-backed connectors. With no fixtures we pass an empty manifest —
    // static-catalog connectors still discover; connectors that genuinely need a
    // source surface that as a discoverError, which we report honestly.
    const manifest: FixtureManifest = Manifest ?? { Transport: 'http', Configuration: {}, Routes: [] };

    const outcome = spawnChildRunner<T2Data>({
        identity,
        childSource: T2_CHILD_SOURCE,
        env: { MJ_TIER_FIXTURES: JSON.stringify(manifest) },
        timeoutMs: 60_000,
    });

    if (!outcome.parsed) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [
                `T2 child emitted no result for "${connector}" (exit=${String(outcome.status)}).`,
                ...(outcome.stderr.trim() ? [clipStderr(outcome.stderr)] : []),
            ],
            Details: { connector, class: identity.ClassName },
        };
    }
    if (!outcome.parsed.ok) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [outcome.parsed.reason ? `T2 setup failed: ${outcome.parsed.reason}` : 'T2 setup failed.'],
            Details: { connector, class: identity.ClassName },
        };
    }

    const data = outcome.parsed.data ?? {};
    if (data.discoverError || !data.passA || !data.passB) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [
                data.discoverError
                    ? `Connector discovery failed (cannot establish cross-pass consistency): ${data.discoverError}`
                    : 'Connector discovery produced no snapshot to compare.',
            ],
            Details: { connector, class: identity.ClassName },
        };
    }

    return evaluateDiff(connector, identity, data.passA, data.passB);
}

/** Compare two snapshots and produce the pass/fail verdict. */
function evaluateDiff(
    connector: string,
    identity: ConnectorIdentity,
    a: DiscoverySnapshot,
    b: DiscoverySnapshot,
): TierHandlerResult {
    const diffs = diffSnapshots(a, b);
    const objectCount = new Set([...a.Objects, ...b.Objects]).size;

    if (diffs.length === 0) {
        return {
            Status: 'Pass',
            Output: `Cross-pass discovery is consistent: ${objectCount} object(s), identical field/PK/FK claims across two passes.`,
            Errors: [],
            Details: { connector, class: identity.ClassName, objectCount, divergences: 0 },
        };
    }

    return {
        Status: 'Fail',
        Output: `Cross-pass discovery DIVERGED: ${diffs.length} difference(s) across ${objectCount} object(s).`,
        Errors: diffs,
        Details: { connector, class: identity.ClassName, objectCount, divergences: diffs.length },
    };
}

/** Produce a list of human-readable divergences between two snapshots. */
function diffSnapshots(a: DiscoverySnapshot, b: DiscoverySnapshot): string[] {
    const diffs: string[] = [];

    const objsA = new Set(a.Objects);
    const objsB = new Set(b.Objects);
    for (const name of objsA) if (!objsB.has(name)) diffs.push(`Object "${name}" present in pass A but not pass B.`);
    for (const name of objsB) if (!objsA.has(name)) diffs.push(`Object "${name}" present in pass B but not pass A.`);

    for (const name of objsA) {
        if (!objsB.has(name)) continue;
        diffs.push(...diffFieldClaims(name, a.Fields[name] ?? [], b.Fields[name] ?? []));
    }
    return diffs;
}

/** Diff the field claims of one object across two passes. */
function diffFieldClaims(objectName: string, fa: FieldClaim[], fb: FieldClaim[]): string[] {
    const diffs: string[] = [];
    const mapA = new Map(fa.map((f) => [f.Name, f]));
    const mapB = new Map(fb.map((f) => [f.Name, f]));

    for (const name of mapA.keys()) if (!mapB.has(name)) diffs.push(`${objectName}.${name}: field in pass A but not pass B.`);
    for (const name of mapB.keys()) if (!mapA.has(name)) diffs.push(`${objectName}.${name}: field in pass B but not pass A.`);

    for (const [name, claimA] of mapA) {
        const claimB = mapB.get(name);
        if (!claimB) continue;
        if (claimA.IsPrimaryKey !== claimB.IsPrimaryKey) diffs.push(`${objectName}.${name}: IsPrimaryKey ${claimA.IsPrimaryKey}→${claimB.IsPrimaryKey} between passes.`);
        if (claimA.IsForeignKey !== claimB.IsForeignKey) diffs.push(`${objectName}.${name}: IsForeignKey ${claimA.IsForeignKey}→${claimB.IsForeignKey} between passes.`);
        if (claimA.IsUniqueKey !== claimB.IsUniqueKey) diffs.push(`${objectName}.${name}: IsUniqueKey ${claimA.IsUniqueKey}→${claimB.IsUniqueKey} between passes.`);
        if ((claimA.ForeignKeyTarget ?? '') !== (claimB.ForeignKeyTarget ?? '')) {
            diffs.push(`${objectName}.${name}: ForeignKeyTarget "${claimA.ForeignKeyTarget}"→"${claimB.ForeignKeyTarget}" between passes.`);
        }
    }
    return diffs;
}

/**
 * Child runner for T2: discover twice and emit two snapshots. Runs the connector's
 * abstract discovery only — credential-free, shape-agnostic.
 */
const T2_CHILD_SOURCE = `${CHILD_PREAMBLE}
import _http from 'node:http';
import { writeFileSync as _writeFileSync, mkdtempSync as _mkdtempSync } from 'node:fs';
import { tmpdir as _tmpdir } from 'node:os';
import { resolve as _pathResolve } from 'node:path';
${CHILD_TRANSPORT}

function normalizeFields(fields) {
  return (fields || []).map((f) => ({
    Name: f && f.Name,
    IsPrimaryKey: !!(f && f.IsPrimaryKey),
    IsForeignKey: !!(f && f.IsForeignKey),
    IsUniqueKey: !!(f && f.IsUniqueKey),
    ForeignKeyTarget: (f && f.ForeignKeyTarget) || null,
  })).filter((f) => f.Name != null);
}

async function discoverOnce(connector, companyIntegration, contextUser) {
  const objs = await connector.DiscoverObjects(companyIntegration, contextUser);
  const list = Array.isArray(objs) ? objs : [];
  const objectNames = list.map((o) => o && o.Name).filter((n) => n != null);
  const fields = {};
  for (const name of objectNames) {
    const fset = await connector.DiscoverFields(companyIntegration, name, contextUser);
    fields[name] = normalizeFields(fset);
  }
  return { Objects: objectNames, Fields: fields };
}

async function main() {
  const manifest = JSON.parse(process.env.MJ_TIER_FIXTURES || '{}');
  let tr;
  try { tr = await setupTransport(manifest); }
  catch (e) { emit({ ok: false, reason: 'transport setup failed: ' + clip(e && e.message ? e.message : e, 200) }); return; }

  let ctx;
  try { ctx = await loadConnector(tr.configuration); }
  catch (e) { tr.teardown(); emit({ ok: false, reason: clip(e && e.message ? e.message : e, 240) }); return; }
  if (tr.transport === 'http' && tr.baseURL) tr.wireBaseURL(ctx.connector);

  const out = { ok: true, integrationName: ctx.connector.IntegrationName, data: {} };
  try {
    // Two independent passes: fresh discovery each time (a non-deterministic
    // extractor — random ordering, sampled fields — diverges here).
    out.data.passA = await discoverOnce(ctx.connector, ctx.companyIntegration, ctx.contextUser);
    out.data.passB = await discoverOnce(ctx.connector, ctx.companyIntegration, ctx.contextUser);
  } catch (e) {
    out.data.discoverError = clip(e && e.message ? e.message : e, 240);
  } finally {
    tr.teardown();
  }
  emit(out);
}

main().catch((e) => emit({ ok: false, reason: 'runner crashed: ' + clip(e && e.message ? e.message : e, 200) }));
`;
