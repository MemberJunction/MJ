/**
 * T3_DocStructureSelfCheck — is the connector's structured output STABLE against
 * its own persisted metadata?
 *
 * The connector persisted an object model into the registry integration-metadata
 * file (`.<connector>.json` — the IO/IOF rows that mj-sync pushes). T3 re-runs the
 * connector's discovery against its recorded source and asserts the structured
 * output it produces NOW still agrees with what was persisted. Drift between the
 * connector code and the metadata it claims to emit → Fail.
 *
 * Concretely we compare two sets of claims:
 *   - **Persisted** — the object Names + per-object PK/FK field claims read from
 *     the integration-metadata file (the same file T1 reads).
 *   - **Re-extracted** — the object Names + per-object PK/FK field claims the
 *     connector's `DiscoverObjects`/`DiscoverFields` return right now.
 *
 * A symmetric set-diff produces the drift report. The check is intentionally
 * tolerant about FIELDS that the connector discovers dynamically but does not
 * persist (a connector may persist only a curated subset) — it flags:
 *   (a) a persisted object the connector no longer discovers,
 *   (b) a persisted PK that the connector no longer marks as a PK,
 *   (c) a persisted FK whose target the connector no longer reports.
 * These are the structure-defining claims; cosmetic field-set differences are
 * reported as warnings, not failures.
 *
 * **SHAPE-AGNOSTIC.** Both sides reduce to `{objects, pk, fk}` regardless of REST
 * vs file-feed. **CREDENTIAL-FREE.** Re-extraction uses an offline config.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHILD_PREAMBLE, CHILD_TRANSPORT, spawnChildRunner, clipStderr, REGISTRY_ROOT, type ConnectorIdentity } from './childRunner.js';
import { isExplicitCredentialAbsence } from './credentialAbsence.js';
import { loadFixtures, type FixtureManifest } from './fixtures.js';

/** Portion of a TierResult an individual tier handler returns. */
interface TierHandlerResult {
    Status: 'Pass' | 'Fail' | 'Skipped';
    Output: string;
    Errors: string[];
    Details?: Record<string, unknown>;
}

/** The structure-defining claims about one object. */
interface ObjectClaims {
    Name: string;
    PrimaryKeys: string[];
    ForeignKeys: Array<{ Field: string; Target: string | null }>;
}

/** Re-extracted snapshot emitted by the child. */
interface T3Data {
    objects?: ObjectClaims[];
    discoverError?: string;
}

/** Run T3: diff persisted metadata against a fresh re-extraction. */
export function runT3DocSelfCheck(connector: string, identity: ConnectorIdentity): TierHandlerResult {
    const persisted = loadPersistedClaims(connector);
    if (!persisted) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [`No persisted integration metadata found for "${connector}" — nothing to self-check the connector's output against.`],
            Details: { connector, class: identity.ClassName, persistedFound: false },
        };
    }

    const { Manifest } = loadFixtures(connector);
    const manifest: FixtureManifest = Manifest ?? { Transport: 'http', Configuration: {}, Routes: [] };
    const outcome = spawnChildRunner<T3Data>({
        identity,
        connector, // REQUIRED: lets spawnChildRunner inject MJ_TIER_METADATA_FILE so the child's
                   // seedEngineCache() seeds IntegrationEngineBase from the Declared metadata. Without
                   // it, a Declared connector's cache-driven DiscoverObjects reads an EMPTY cache and
                   // returns 0 objects → every persisted object flags as "structure drift" → false T3
                   // fail + CodeBuild deadlock. (Harness bug, fixed 2026-06-15; affects all Declared connectors.)
        childSource: T3_CHILD_SOURCE,
        env: { MJ_TIER_FIXTURES: JSON.stringify(manifest) },
        timeoutMs: 60_000,
    });

    if (!outcome.parsed) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [
                `T3 child emitted no result for "${connector}" (exit=${String(outcome.status)}).`,
                ...(outcome.stderr.trim() ? [clipStderr(outcome.stderr)] : []),
            ],
            Details: { connector, class: identity.ClassName },
        };
    }
    // A connector whose discovery is a credential-gated runtime mechanism can't self-check
    // credential-free — honest Skip (proven at the live tier), not Fail. #H14: NARROWED to an EXPLICIT
    // credential-ABSENCE signal only — a generic auth/token/401 failure now FAILS (it means credential-free
    // discovery was implemented wrong — the T3-deadlock class), rather than being waved through as a Skip.
    const credGated = (msg: unknown) => isExplicitCredentialAbsence(String(msg ?? ''));
    if (!outcome.parsed.ok) {
        if (credGated(outcome.parsed.reason)) {
            return {
                Status: 'Skipped',
                Output: 'doc self-check requires credential-gated runtime discovery — proven at the live tier',
                Errors: ['discovery-requires-credentials'],
                Details: { connector, class: identity.ClassName, reason: 'discovery-requires-credentials', detail: String(outcome.parsed.reason).slice(0, 200) },
            };
        }
        return {
            Status: 'Fail',
            Output: '',
            Errors: [outcome.parsed.reason ? `T3 setup failed: ${outcome.parsed.reason}` : 'T3 setup failed.'],
            Details: { connector, class: identity.ClassName },
        };
    }

    const data = outcome.parsed.data ?? {};
    if (data.discoverError || !data.objects) {
        if (credGated(data.discoverError)) {
            return {
                Status: 'Skipped',
                Output: 'doc self-check requires credential-gated runtime discovery — proven at the live tier',
                Errors: ['discovery-requires-credentials'],
                Details: { connector, class: identity.ClassName, reason: 'discovery-requires-credentials', detail: String(data.discoverError).slice(0, 200) },
            };
        }
        return {
            Status: 'Fail',
            Output: '',
            Errors: [
                data.discoverError
                    ? `Connector re-extraction failed (cannot self-check against persisted metadata): ${data.discoverError}`
                    : 'Connector re-extraction produced no output to self-check.',
            ],
            Details: { connector, class: identity.ClassName },
        };
    }

    return evaluateDrift(connector, identity, persisted, data.objects);
}

/** Compare persisted vs re-extracted claims; structural drift fails, cosmetic warns. */
function evaluateDrift(
    connector: string,
    identity: ConnectorIdentity,
    persisted: ObjectClaims[],
    reextracted: ObjectClaims[],
): TierHandlerResult {
    const reByName = new Map(reextracted.map((o) => [o.Name.toLowerCase(), o]));
    const failures: string[] = [];
    const warnings: string[] = [];

    for (const p of persisted) {
        const r = reByName.get(p.Name.toLowerCase());
        if (!r) {
            failures.push(`Persisted object "${p.Name}" is no longer discovered by the connector (structure drift).`);
            continue;
        }
        driftPrimaryKeys(p, r, failures);
        driftForeignKeys(p, r, failures, warnings);
    }

    // Newly-discovered objects not in persisted metadata are a warning (metadata
    // may be a curated subset), not a failure.
    const persistedNames = new Set(persisted.map((p) => p.Name.toLowerCase()));
    for (const r of reextracted) {
        if (!persistedNames.has(r.Name.toLowerCase())) {
            warnings.push(`Connector discovers object "${r.Name}" that is not in persisted metadata (curated-subset or new object).`);
        }
    }

    if (failures.length > 0) {
        return {
            Status: 'Fail',
            Output: `Self-check DRIFT: ${failures.length} structural difference(s) between connector output and persisted metadata.`,
            Errors: failures,
            Details: { connector, class: identity.ClassName, structuralDrift: failures.length, warnings },
        };
    }

    return {
        Status: 'Pass',
        Output: `Connector output is stable against persisted metadata: ${persisted.length} persisted object(s) verified${warnings.length ? `, ${warnings.length} non-structural warning(s)` : ''}.`,
        Errors: [],
        Details: { connector, class: identity.ClassName, persistedObjects: persisted.length, warnings },
    };
}

/** Flag persisted PKs the connector EXPLICITLY contradicts. */
function driftPrimaryKeys(p: ObjectClaims, r: ObjectClaims, failures: string[]): void {
    // Declared-fallback overlay (matches IntegrationSchemaSync.decideBooleanOverlay: discovered=undefined
    // → no opinion → curated/static value sticks). A spec/OpenAPI connector's runtime DiscoverFields
    // cannot re-derive PKs (no machine PK marker) and returns an EMPTY PK set — that is SILENCE, not a
    // contradiction. PK is a build-time classification (id-convention + SoftPKClassifier); the static
    // metadata is authoritative when discovery is silent. Only a NON-EMPTY discovered PK set that omits
    // a persisted PK is real drift (the connector has a different opinion).
    const rPk = new Set(r.PrimaryKeys.map((k) => k.toLowerCase()));
    if (rPk.size === 0) return; // discovery silent on PKs → static metadata wins → NOT drift
    for (const pk of p.PrimaryKeys) {
        if (!rPk.has(pk.toLowerCase())) {
            failures.push(`${p.Name}.${pk}: persisted PRIMARY KEY contradicted by the connector's non-empty discovered key set (real drift).`);
        }
    }
}

/** Flag persisted FKs whose target the connector no longer reports. */
function driftForeignKeys(p: ObjectClaims, r: ObjectClaims, failures: string[], warnings: string[]): void {
    // Same Declared-fallback overlay as PKs: an empty discovered FK set is SILENCE (spec connectors
    // can't re-derive FKs), so the static/Declared FK stands — NOT drift. Only a non-empty discovered
    // FK set that omits a persisted FK is real drift.
    const rFk = new Map(r.ForeignKeys.map((fk) => [fk.Field.toLowerCase(), fk.Target]));
    if (rFk.size === 0) return; // discovery silent on FKs → static metadata wins → NOT drift
    for (const fk of p.ForeignKeys) {
        if (!rFk.has(fk.Field.toLowerCase())) {
            failures.push(`${p.Name}.${fk.Field}: persisted FOREIGN KEY contradicted by the connector's non-empty discovered FK set (real drift).`);
            continue;
        }
        const reTarget = rFk.get(fk.Field.toLowerCase()) ?? null;
        if (fk.Target && reTarget && fk.Target.toLowerCase() !== reTarget.toLowerCase()) {
            // Target name mismatch is a warning — connectors normalise target names
            // (singular/plural) differently between persisted and discovered forms.
            warnings.push(`${p.Name}.${fk.Field}: FK target persisted "${fk.Target}" vs discovered "${reTarget}".`);
        }
    }
}

// ── Persisted-metadata reader (parent side) ──────────────────────────

/** Root integration metadata file shape (subset T3 reads). */
interface PersistedFile {
    relatedEntities?: {
        'MJ: Integration Objects'?: Array<{
            fields?: { Name?: string };
            relatedEntities?: {
                'MJ: Integration Object Fields'?: Array<{
                    fields?: {
                        Name?: string;
                        IsPrimaryKey?: boolean;
                        IsForeignKey?: boolean;
                        RelatedIntegrationObjectID?: string | null;
                    };
                }>;
            };
        }>;
    };
}

/**
 * Read the persisted IO/IOF claims (object names + PK + FK target) from the
 * registry integration-metadata file. Returns null when no metadata file exists.
 */
function loadPersistedClaims(connector: string): ObjectClaims[] | null {
    const file = loadIntegrationFile(connector);
    if (!file) return null;
    const ios = file.relatedEntities?.['MJ: Integration Objects'] ?? [];
    return ios.map((io) => {
        const name = io.fields?.Name ?? '';
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        const primaryKeys: string[] = [];
        const foreignKeys: Array<{ Field: string; Target: string | null }> = [];
        for (const iof of iofs) {
            const f = iof.fields ?? {};
            if (!f.Name) continue;
            if (f.IsPrimaryKey === true) primaryKeys.push(f.Name);
            const isFk = f.IsForeignKey === true || (f.RelatedIntegrationObjectID != null && f.RelatedIntegrationObjectID !== '');
            if (isFk) foreignKeys.push({ Field: f.Name, Target: extractLookupTarget(f.RelatedIntegrationObjectID ?? null) });
        }
        return { Name: name, PrimaryKeys: primaryKeys, ForeignKeys: foreignKeys };
    }).filter((o) => o.Name.length > 0);
}

/** Load + normalise the integration metadata file (array-wrapped → first root). */
function loadIntegrationFile(connector: string): PersistedFile | null {
    const connectorDir = resolve(REGISTRY_ROOT, connector);
    const candidates = [
        resolve(connectorDir, 'metadata/integrations', `.${connector}.json`),
        resolve(connectorDir, 'metadata/integrations', `.${connector}.integration.json`),
        resolve(connectorDir, 'metadata/integrations', connector, `.${connector}.integration.json`),
        resolve(connectorDir, `.${connector}.integration.json`),
        resolve(connectorDir, `.${connector}.json`),
    ];
    for (const path of candidates) {
        if (!existsSync(path)) continue;
        const raw = JSON.parse(readFileSync(path, 'utf-8')) as PersistedFile | PersistedFile[];
        return Array.isArray(raw) ? (raw.length > 0 ? raw[0] : null) : raw;
    }
    return null;
}

/** Extract the `Name=` predicate of an `@lookup:` FK reference (target IO name). */
function extractLookupTarget(lookup: string | null): string | null {
    if (!lookup || !lookup.startsWith('@lookup:')) return null;
    const dot = lookup.indexOf('.');
    if (dot < 0) return null;
    for (const segment of lookup.slice(dot + 1).split('&')) {
        const eq = segment.indexOf('=');
        if (eq < 0) continue;
        if (segment.slice(0, eq).trim() === 'Name') {
            const value = segment.slice(eq + 1).trim();
            return value.length > 0 ? value : null;
        }
    }
    return null;
}

/** Child runner for T3: re-extract object/PK/FK claims via the connector's discovery. */
const T3_CHILD_SOURCE = `${CHILD_PREAMBLE}
import _http from 'node:http';
import { writeFileSync as _writeFileSync, mkdtempSync as _mkdtempSync } from 'node:fs';
import { tmpdir as _tmpdir } from 'node:os';
import { resolve as _pathResolve } from 'node:path';
${CHILD_TRANSPORT}

async function reextract(connector, companyIntegration, contextUser) {
  const objs = await connector.DiscoverObjects(companyIntegration, contextUser);
  const list = Array.isArray(objs) ? objs : [];
  const out = [];
  for (const o of list) {
    const name = o && o.Name;
    if (name == null) continue;
    const fields = await connector.DiscoverFields(companyIntegration, name, contextUser);
    const fs = Array.isArray(fields) ? fields : [];
    out.push({
      Name: name,
      PrimaryKeys: fs.filter((f) => f && f.IsPrimaryKey).map((f) => f.Name),
      ForeignKeys: fs.filter((f) => f && f.IsForeignKey).map((f) => ({ Field: f.Name, Target: (f && f.ForeignKeyTarget) || null })),
    });
  }
  return out;
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
  try { out.data.objects = await reextract(ctx.connector, ctx.companyIntegration, ctx.contextUser); }
  catch (e) { out.data.discoverError = clip(e && e.message ? e.message : e, 240); }
  finally { tr.teardown(); }
  emit(out);
}

main().catch((e) => emit({ ok: false, reason: 'runner crashed: ' + clip(e && e.message ? e.message : e, 200) }));
`;
