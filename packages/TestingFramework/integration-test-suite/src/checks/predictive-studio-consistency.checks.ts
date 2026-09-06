/**
 * predictive-studio-consistency.checks.ts — the 'predictive-studio-consistency' bundle (PSC1–PSC6):
 * cross-row INVARIANTS over every Predictive Studio row that exists, not over a fixture the test
 * just made.
 *
 * WHY THIS BUNDLE EXISTS, stated plainly, because it is the whole design rationale:
 *
 * Ten defects were found building the signal/finding/architecture layers. Four thousand unit tests
 * caught none of them, and neither did PS1–PS8 — because every one of those asserts about rows the
 * test itself created moments earlier. The defects lived in rows produced by REAL runs, which no
 * fixture-based test ever looks at.
 *
 * All four of the expensive ones share one shape: **a row claims something another row contradicts.**
 *
 *   - a component said `IsTrained` while carrying no artifact  → reuse was never actually reachable
 *   - a finding was saved with a Story and a NULL StoryVector   → searchable-by-meaning, silently not
 *   - a plan decided `compose`, the pipeline carried no graph   → a bare model trained under a composed decision
 *   - a model pointed at a root component that did not point back
 *
 * None of that needs an LLM, a sidecar, or a training run to detect. It needs someone to ask whether
 * the rows agree with each other. That is all this bundle does, which is why it belongs in the
 * DETERMINISTIC tier and costs a handful of reads.
 *
 * VACUITY IS REPORTED, NEVER HIDDEN. An invariant sweep over an empty table passes trivially, and a
 * trivial pass reported as a real one is a false green. Every check prints the size of the population
 * it scanned, and says the word VACUOUS when that population is zero.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Offending rows listed in a failure message before it is truncated. */
const MAX_REPORTED = 10;

/** Rows in scope, counted without fetching them. */
async function population(entity: string, filter: string, user: UserInfo): Promise<number> {
    const r = await new RunView().RunView(
        { EntityName: entity, ExtraFilter: filter, ResultType: 'count_only', BypassCache: true }, user,
    );
    Assert(r.Success, `counting '${entity}' failed: ${r.ErrorMessage}`);
    return r.TotalRowCount;
}

/** The rows that violate an invariant. `filter` states the CONTRADICTION, so a match is a defect. */
async function violations<T extends object>(
    entity: string, filter: string, fields: string[], user: UserInfo,
): Promise<T[]> {
    const r = await new RunView().RunView<T>(
        { EntityName: entity, ExtraFilter: filter, Fields: fields, ResultType: 'simple', BypassCache: true }, user,
    );
    Assert(r.Success, `sweeping '${entity}' failed: ${r.ErrorMessage}`);
    return r.Results ?? [];
}

/** One row's worth of identity for a failure message. */
function describe(row: Record<string, unknown>): string {
    const name = row.Name ?? row.Statement ?? '(unnamed)';
    return `${String(row.ID)} "${String(name)}"`;
}

/**
 * Report and assert in one place, so every check reports its population the same way and a vacuous
 * pass is impossible to mistake for a real one.
 */
function verdict(label: string, scanned: number, bad: Record<string, unknown>[]): void {
    if (scanned === 0) {
        console.log(`      → VACUOUS: no rows in scope for ${label} — this check proved nothing this run`);
        return;
    }
    const listed = bad.slice(0, MAX_REPORTED).map(describe).join('; ');
    const more = bad.length > MAX_REPORTED ? ` (+${bad.length - MAX_REPORTED} more)` : '';
    Assert(bad.length === 0, `${label}: ${bad.length} of ${scanned} rows contradict the invariant — ${listed}${more}`);
    console.log(`      → ${label}: ${scanned} rows scanned, all consistent`);
}

export const PredictiveStudioConsistencyChecks: NamedCheck[] = [
    {
        Id: 'predictive-studio-consistency.PSC1',
        Name: 'PSC1: every ROOT component claiming IsTrained carries the model artifact that makes it reusable',
        Fn: async (ctx: IntegrationCheckContext) => {
            // Scoped to ROOT components deliberately. `IsTrained` and `ArtifactFileID` are two
            // different facts — the reuse loader separates them by design ("never trained" vs
            // "marked trained but has no stored artifact") — and a composed CHILD may legitimately
            // be fitted without being serialisable: the sidecar returns no artifact for a frozen
            // child or an unfitted template. A root is different: its artifact IS the model
            // artifact, so a root claiming IsTrained with none is the defect that made component
            // reuse unreachable for the entire life of the feature before it was found.
            const scope = `ParentComponentID IS NULL AND MLModelID IS NOT NULL AND IsTrained = 1 AND SourceComponentID IS NULL`;
            const scanned = await population('MJ: ML Components', scope, ctx.User);
            const bad = await violations<{ ID: string; Name: string }>(
                'MJ: ML Components', `${scope} AND ArtifactFileID IS NULL`, ['ID', 'Name'], ctx.User,
            );
            verdict('trained root components carry the model artifact', scanned, bad);
        }
    },
    {
        Id: 'predictive-studio-consistency.PSC2',
        Name: 'PSC2: nothing carries a Story that was never embedded — searchable by meaning, in fact and not only in intent',
        Fn: async (ctx: IntegrationCheckContext) => {
            // BaseEntity.EmbedTextLocal THROWS unless a subclass overrides it, and GenerateEmbedding
            // swallows the throw — so a missing server-side override does not fail a save, it just
            // writes NULL. Every row here is found by meaning or not at all, and the difference is
            // invisible until someone searches and gets nothing back.
            let totalScanned = 0;
            const allBad: Record<string, unknown>[] = [];
            for (const [entity, nameField] of [
                ['MJ: ML Components', 'Name'],
                ['MJ: ML Component Types', 'Name'],
                ['MJ: ML Findings', 'Statement'],
            ] as const) {
                // Portable across the SQL Server and PostgreSQL lanes of the tier — no T-SQL-only LEN().
                const scope = `Story IS NOT NULL AND Story <> ''`;
                totalScanned += await population(entity, scope, ctx.User);
                const bad = await violations<Record<string, unknown>>(
                    entity, `${scope} AND StoryVector IS NULL`, ['ID', nameField], ctx.User,
                );
                allBad.push(...bad.map((b) => ({ ...b, ID: `${entity} ${String(b.ID)}` })));
            }
            verdict('stories are embedded', totalScanned, allBad);
        }
    },
    {
        Id: 'predictive-studio-consistency.PSC3',
        Name: 'PSC3: the model → root component link points back — a one-way link is a lineage that does not exist',
        Fn: async (ctx: IntegrationCheckContext) => {
            const models = await violations<{ ID: string; RootComponentID: string }>(
                'MJ: ML Models', 'RootComponentID IS NOT NULL', ['ID', 'RootComponentID'], ctx.User,
            );
            const bad: Record<string, unknown>[] = [];
            for (const m of models) {
                const roots = await violations<{ ID: string; Name: string; MLModelID: string | null }>(
                    'MJ: ML Components', `ID='${m.RootComponentID}'`, ['ID', 'Name', 'MLModelID'], ctx.User,
                );
                const root = roots[0];
                if (!root) {
                    bad.push({ ID: m.ID, Name: `RootComponentID ${m.RootComponentID} does not resolve` });
                } else if (!root.MLModelID || !UUIDsEqual(root.MLModelID, m.ID)) {
                    bad.push({ ID: m.ID, Name: `root component ${root.ID} points at model ${root.MLModelID ?? 'NULL'}` });
                }
            }
            verdict('model ↔ root component round-trips', models.length, bad);
        }
    },
    {
        Id: 'predictive-studio-consistency.PSC4',
        Name: 'PSC4: a composed model was trained from a graph — the decision to compose reached the thing that trains',
        Fn: async (ctx: IntegrationCheckContext) => {
            // The defect this exists for: the architecture gate approved `compose`, the builder trained
            // a bare model, and nothing anywhere recorded a disagreement. Persisted, the contradiction
            // is visible — a root component with children whose pipeline carries no ComponentGraph.
            // "Has children" is NOT composition. Every model materializes its INPUTS as child
            // components — that is the signal layer, and it makes the child count non-zero for
            // ordinary single-estimator models too (measured: 56 Input children vs 9 Model children).
            // Composition means a child that is itself a Model or a Structure, so the population is
            // narrowed to roots with such a child. Getting this wrong reports every model as a defect.
            const composedChildTypes = await violations<{ ID: string }>(
                'MJ: ML Component Types', `Kind IN ('Model','Structure')`, ['ID'], ctx.User,
            );
            const composedTypeIDs = new Set(composedChildTypes.map((t) => t.ID.toLowerCase()));
            const childRows = await violations<{ ID: string; ParentComponentID: string; ComponentTypeID: string }>(
                'MJ: ML Components', 'ParentComponentID IS NOT NULL',
                ['ID', 'ParentComponentID', 'ComponentTypeID'], ctx.User,
            );
            const composedParentIDs = new Set(
                childRows.filter((c) => composedTypeIDs.has(c.ComponentTypeID.toLowerCase()))
                         .map((c) => c.ParentComponentID.toLowerCase()),
            );
            const allRoots = await violations<{ ID: string; Name: string; MLModelID: string | null }>(
                'MJ: ML Components', 'ParentComponentID IS NULL AND MLModelID IS NOT NULL',
                ['ID', 'Name', 'MLModelID'], ctx.User,
            );
            const composedRoots = allRoots.filter((r) => composedParentIDs.has(r.ID.toLowerCase()));
            const bad: Record<string, unknown>[] = [];
            for (const root of composedRoots) {
                const models = await violations<{ ID: string; PipelineID: string }>(
                    'MJ: ML Models', `ID='${root.MLModelID}'`, ['ID', 'PipelineID'], ctx.User,
                );
                const pipelineID = models[0]?.PipelineID;
                if (!pipelineID) {
                    bad.push({ ID: root.ID, Name: `${root.Name}: model ${root.MLModelID} does not resolve` });
                    continue;
                }
                const withGraph = await population(
                    'MJ: ML Training Pipelines', `ID='${pipelineID}' AND ComponentGraph IS NOT NULL`, ctx.User,
                );
                if (withGraph === 0) {
                    bad.push({ ID: root.ID, Name: `${root.Name}: composed, but pipeline ${pipelineID} carries no ComponentGraph` });
                }
            }
            verdict('composed models carry their graph', composedRoots.length, bad);
        }
    },
    {
        Id: 'predictive-studio-consistency.PSC5',
        Name: 'PSC5: no component instantiates an abstract type — swept over every row, not one fixture',
        Fn: async (ctx: IntegrationCheckContext) => {
            // PS8 proves the server-side guard REFUSES an abstract instantiation. This proves no row
            // ever got past it — including rows written before the guard existed, which is the case
            // PS8 structurally cannot see.
            const abstractTypes = await violations<{ ID: string; Name: string }>(
                'MJ: ML Component Types', 'IsAbstract = 1', ['ID', 'Name'], ctx.User,
            );
            const scanned = await population('MJ: ML Components', '', ctx.User);
            const bad: Record<string, unknown>[] = [];
            for (const t of abstractTypes) {
                const instances = await violations<{ ID: string; Name: string }>(
                    'MJ: ML Components', `ComponentTypeID='${t.ID}'`, ['ID', 'Name'], ctx.User,
                );
                bad.push(...instances.map((i) => ({ ID: i.ID, Name: `${i.Name} instantiates abstract '${t.Name}'` })));
            }
            verdict(`no instances of ${abstractTypes.length} abstract types`, scanned, bad);
        }
    },
    {
        Id: 'predictive-studio-consistency.PSC6',
        Name: 'PSC6: a finding claiming Predictive Contribution carries the holdout number that backs the claim',
        Fn: async (ctx: IntegrationCheckContext) => {
            // The finding writer sets EvidenceType='Predictive Contribution' if and only if it has
            // out-of-sample backing, and that backing is what fills HoldoutMetric/HoldoutMetricValue.
            // If the two ever drift apart, a finding is asserting a stronger evidence tier than it can
            // show — the exact over-claim the whole epistemic-status design exists to prevent, and the
            // one thing nothing checks after the row is written.
            const scope = `EvidenceType='Predictive Contribution'`;
            const scanned = await population('MJ: ML Findings', scope, ctx.User);
            const bad = await violations<{ ID: string; Statement: string }>(
                'MJ: ML Findings',
                `${scope} AND (HoldoutMetric IS NULL OR HoldoutMetricValue IS NULL)`,
                ['ID', 'Statement'], ctx.User,
            );
            verdict('predictive claims are backed by a holdout number', scanned, bad);
        }
    },
];

for (const check of PredictiveStudioConsistencyChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
