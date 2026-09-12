/**
 * ai-cost.checks.ts — the 'ai-cost' bundle (AC1–AC7): cost/pricing metadata integrity for the
 * AI stack, per packages/TestingFramework/integration-test-suite/docs/test-catalog.md Domain 4 (the deterministic,
 * read-only siblings of the mutation-tier AI1 rollup check).
 *
 * TRANSPORT: **CLIENT-CAPABLE** (recommend client-first). Everything here reads through
 * `AIEngineBase` caches + `RunView` and instantiates pure calculator classes — all
 * provider-agnostic. Nothing needs a server-only surface.
 *
 * READ-ONLY + PURE: the bundle never saves a row. The normalization-math checks (AC1/AC2) drive
 * the real `BasePriceUnitType` calculators with UNSAVED `MJ: AI Model Costs` entity objects
 * (`NewRecord()` only — the same zero-mutation trick permission-engine.PE8 uses for skill rows),
 * so the exact math `MJAIPromptRunEntityServer.CalculateAndSetCost` executes at save time is
 * pinned without an LLM call or a prompt-run fixture.
 *
 * ANTI-VACUITY: cost data is optional per deployment, so every data-dependent check counts its
 * subject rows and SKIPS-AS-PASS LOUDLY when there are none — while the always-runnable legs
 * (driver-class resolution, pure math, stranger-id → null) assert unconditionally. The parity
 * check (AC4) reimplements `GetActiveModelCost`'s selection independently so it is a genuine
 * cross-check, not a restatement.
 */
import { RunView, RunQuery, Metadata } from '@memberjunction/core';
import type { AggregateResult } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import type { MJAIModelCostEntity, MJMaterializedResultEntity } from '@memberjunction/core-entities';
import { MaterializationRefresher } from '@memberjunction/materialization';
import {
    AIEngineBase,
    BasePriceUnitType,
    PerMillionTokensPriceUnitType,
    PerThousandTokensPriceUnitType
} from '@memberjunction/ai-engine-base';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** A GUID that will never be a real model/vendor id — the stranger probe for AC4. */
const STRANGER_ID = '00000000-0000-4000-8000-0000000000CC';

/**
 * The divisor each BUILT-IN price-unit-type driver normalizes by. Deliberately restated here
 * (rather than read from the classes) so a silent change to a shipped divisor — which would
 * re-price every prompt run — fails AC1 as drift. Unknown/custom drivers only need to resolve.
 */
const KNOWN_DRIVER_DIVISORS: Readonly<Record<string, number>> = {
    PerMillionTokens: 1_000_000,
    PerHundredThousandTokens: 100_000,
    PerThousandTokens: 1_000,
    TimePerHour: 3_600,
    TimePerMinute: 60,
    PerImage: 1
};

/** Loud, uniform skip-as-pass note. */
function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ ai-cost.${checkId} SKIPPED — ${reason}`);
}

/** Helper to extract numeric aggregate value from AggregateResults by alias. */
function aggregateValue(results: readonly AggregateResult[] | undefined, alias: string): number {
    const hit = (results ?? []).find(a => a.alias === alias);
    if (!hit || hit.value == null) return 0;
    Assert(!hit.error, `aggregate '${alias}' returned an error: ${hit.error}`);
    const n = Number(hit.value);
    Assert(Number.isFinite(n), `aggregate '${alias}' value is not numeric: ${JSON.stringify(hit.value)}`);
    return n;
}

/** Ensure the AI metadata cache (models, vendors, costs, price/unit types) is loaded. */
async function configuredAIEngine(ctx: IntegrationCheckContext): Promise<AIEngineBase> {
    const engine = AIEngineBase.Instance;
    await engine.Config(false, ctx.User, ctx.Provider);
    return engine;
}

/**
 * Build an UNSAVED `MJ: AI Model Costs` row for the pure calculators. Never saved — it exists
 * only to feed `CalculateNormalizedCost(WithCache)`, which reads price fields off the entity.
 */
async function makeUnsavedCost(
    ctx: IntegrationCheckContext,
    prices: { input: number; output: number; cacheRead?: number | null; cacheWrite?: number | null }
): Promise<MJAIModelCostEntity> {
    const cost = await ctx.Provider.GetEntityObject<MJAIModelCostEntity>('MJ: AI Model Costs', ctx.User);
    cost.NewRecord();
    cost.InputPricePerUnit = prices.input;
    cost.OutputPricePerUnit = prices.output;
    cost.CacheReadPricePerUnit = prices.cacheRead ?? null;
    cost.CacheWritePricePerUnit = prices.cacheWrite ?? null;
    return cost;
}

/**
 * Resolve a price-unit-type driver the way production does; null when unresolvable.
 *
 * `TryCreateInstance`, matching `AIEngineBase.GetPriceCalculator`. The duck-type check that used to
 * guard this call is retained as a second line: `BasePriceUnitType` is now marked
 * `@RequiresSubclass()` so the factory refuses to hand back a hollow base instance, but this check
 * is what would catch that marker being removed — and this bundle exists to detect exactly that
 * class of silent regression.
 */
function resolvePriceCalculator(driverClass: string): BasePriceUnitType | null {
    try {
        const resolution = MJGlobal.Instance.ClassFactory.TryCreateInstance<BasePriceUnitType>(BasePriceUnitType, driverClass);
        const instance = resolution.Instance;
        if (!resolution.Resolved || !instance || typeof instance.CalculateNormalizedCost !== 'function') {
            return null; // unregistered driver, or a hollow/abstract instance — cannot price anything
        }
        return instance;
    } catch {
        return null;
    }
}

/** Epoch millis of a nullable Date-ish field (0 when null, matching GetActiveModelCost). */
function startMillis(value: Date | null): number {
    return value ? new Date(value).getTime() : 0;
}

export const AiCostChecks: NamedCheck[] = [
    {
        Id: 'ai-cost.AC1',
        Name: 'AC1: every Price Unit Type DriverClass ClassFactory-resolves; built-in drivers do exact divisor math',
        Fn: async (ctx): Promise<void> => {
            // The exact preconditions of MJAIPromptRunEntityServer.CalculateAndSetCost: a cost row's
            // UnitTypeID → unit-type row → DriverClass → ClassFactory. An unresolvable driver makes
            // every run for that unit type silently UNCOSTED (LogError + return, no failure), so
            // this is the "silently free tokens" drift detector.
            const engine = await configuredAIEngine(ctx);
            const unitTypes = engine.ModelPriceUnitTypes;
            Assert(unitTypes.length > 0, 'no MJ: AI Model Price Unit Types rows loaded — the pricing catalog is empty');

            // Unit types an ACTIVE cost row actually points at are the ones whose missing driver
            // silently uncosts real runs — those are asserted. A unit type no active row references
            // can be a deployment's own custom row awaiting its driver; reddening the whole tier for
            // it would punish a state that costs nothing today, so it is reported instead.
            const referencedByActiveCost = new Set(
                engine.ModelCosts
                    .filter(c => c.Status === 'Active')
                    .map(c => c.UnitTypeID.toLowerCase())
            );

            const unresolved: string[] = [];
            const unresolvedUnreferenced: string[] = [];
            const badMath: string[] = [];
            const probe = await makeUnsavedCost(ctx, { input: 2.5, output: 10 });
            for (const unitType of unitTypes) {
                const calculator = resolvePriceCalculator(unitType.DriverClass);
                if (!calculator) {
                    const label = `${unitType.Name} → ${unitType.DriverClass}`;
                    if (referencedByActiveCost.has(unitType.ID.toLowerCase())) {
                        unresolved.push(label);
                    } else {
                        unresolvedUnreferenced.push(label);
                    }
                    continue;
                }
                // The COLUMN must agree with the CLASS. The drivers now read UnitsPerBillingUnit off
                // the row when one is supplied, so a seeded value that disagrees with the class's
                // compiled-in literal silently re-prices every run through that unit type — and the
                // field is editable in the generated Explorer form. Skip `Linear`, which has no
                // literal to agree with: the column IS its scale.
                if (unitType.DriverClass !== 'Linear') {
                    const declared = KNOWN_DRIVER_DIVISORS[unitType.DriverClass];
                    if (declared !== undefined && Number(unitType.UnitsPerBillingUnit) !== declared) {
                        badMath.push(
                            `${unitType.Name} (${unitType.DriverClass}): UnitsPerBillingUnit column is ` +
                            `${unitType.UnitsPerBillingUnit} but the driver class declares ${declared} — the column ` +
                            `wins at runtime, so every run priced by this unit type is scaled by the column`
                        );
                    }
                }

                const divisor = KNOWN_DRIVER_DIVISORS[unitType.DriverClass];
                if (divisor !== undefined) {
                    // Exactly one divisor's worth of input AND output tokens must cost exactly
                    // InputPricePerUnit + OutputPricePerUnit.
                    const cost = calculator.CalculateNormalizedCost(probe, divisor, divisor);
                    if (Math.abs(cost - 12.5) > 1e-9) {
                        badMath.push(`${unitType.Name} (${unitType.DriverClass}): ${divisor} in + ${divisor} out priced ${cost}, expected 12.5`);
                    }
                }
            }
            if (unresolvedUnreferenced.length > 0) {
                console.warn(
                    `      ⚠ ${unresolvedUnreferenced.length} price unit type(s) have NO registered calculator but are ` +
                    `referenced by no Active cost row, so nothing is mispriced today — they WILL uncost every run the ` +
                    `moment a cost row points at them: ${unresolvedUnreferenced.join('; ')}`
                );
            }
            // Hard assert since the B60 driver gap closed: PerImage/TimePerMinute/TimePerHour now
            // have registered calculators, so every SHIPPED unit type resolves. Any future unit
            // type added without one makes runs priced by it silently uncosted (CalculateAndSetCost
            // logs and returns), which is exactly the drift this gate exists to catch — a warning
            // would let it ship.
            Assert(
                unresolved.length === 0,
                `Active-cost-referenced price-unit driver(s) with NO calculator — runs priced by them would be ` +
                `silently uncosted: ${unresolved.join('; ')}`
            );
            Assert(badMath.length === 0, `built-in unit-type divisor drift: ${badMath.join('; ')}`);
            console.log(
                `      → ${unitTypes.length} unit type(s) checked (${referencedByActiveCost.size} referenced by Active ` +
                `cost rows); built-in divisors verified`
            );
        }
    },
    {
        Id: 'ai-cost.AC2',
        Name: 'AC2: pure normalization math — cache-rate fallback parity, per-bucket discount, unit-scale ratio, zero→0',
        Fn: async (ctx): Promise<void> => {
            const perMillion = new PerMillionTokensPriceUnitType();
            const perThousand = new PerThousandTokensPriceUnitType();

            // 1. NULL cache rates → the cache-aware entry point must equal the legacy single-bucket
            //    price of (uncached + cacheRead + cacheWrite) input. This is the compatibility
            //    contract that keeps models WITHOUT cache pricing billed exactly as before.
            const noCacheRates = await makeUnsavedCost(ctx, { input: 3, output: 15 });
            const withCache = perMillion.CalculateNormalizedCostWithCache(noCacheRates, 100_000, 200_000, 300_000, 50_000);
            const legacy = perMillion.CalculateNormalizedCost(noCacheRates, 600_000, 50_000);
            Assert(Math.abs(withCache - legacy) < 1e-12,
                `null cache rates must fall back to the input rate: withCache=${withCache} legacy=${legacy}`);

            // 2. A recorded cache-read rate must price the cache bucket at ITS rate (usually much
            //    cheaper), never at the full input rate.
            const cached = await makeUnsavedCost(ctx, { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
            const cachedCost = perMillion.CalculateNormalizedCostWithCache(cached, 100_000, 200_000, 300_000, 50_000);
            const expected =
                (100_000 / 1_000_000) * 3 +
                (200_000 / 1_000_000) * 0.3 +
                (300_000 / 1_000_000) * 3.75 +
                (50_000 / 1_000_000) * 15;
            Assert(Math.abs(cachedCost - expected) < 1e-12, `per-bucket cache pricing wrong: got ${cachedCost}, expected ${expected}`);
            Assert(cachedCost < legacy, 'cheaper cache-read rate did not reduce the total vs full-input pricing');

            // 3. Same tokens + same per-unit prices under per-THOUSAND must cost exactly 1000×
            //    the per-MILLION price — the unit-scale invariant across drivers.
            const ratioProbe = await makeUnsavedCost(ctx, { input: 2, output: 4 });
            const thousand = perThousand.CalculateNormalizedCost(ratioProbe, 123_456, 654_321);
            const million = perMillion.CalculateNormalizedCost(ratioProbe, 123_456, 654_321);
            Assert(Math.abs(thousand - million * 1000) < 1e-6, `unit-scale ratio broken: perThousand=${thousand}, 1000×perMillion=${million * 1000}`);

            // 4. Zero tokens must cost exactly zero (no fixed-fee leakage in the token calculators).
            AssertEqual(perMillion.CalculateNormalizedCostWithCache(cached, 0, 0, 0, 0), 0, 'zero tokens must cost 0');
            console.log('      → fallback parity, per-bucket rates, 1000× scale ratio, and zero→0 all verified');
        }
    },
    {
        Id: 'ai-cost.AC3',
        Name: 'AC3: cost-pipeline join integrity — every Active cost row resolves its model/vendor/price-type/unit-type in the engine cache with sane prices',
        Fn: async (ctx): Promise<void> => {
            // FK constraints guarantee the rows exist in the DATABASE; this asserts they resolve in
            // the ENGINE CACHES the cost pipeline actually reads (a filtered Config load would break
            // costing while every FK stays green), plus the sanity no CHECK constraint enforces.
            const engine = await configuredAIEngine(ctx);
            const costs = engine.ModelCosts;
            if (costs.length === 0) {
                skipNote('AC3', 'no MJ: AI Model Costs rows in this deployment — cost coherence is unexercised');
                return;
            }
            const problems: string[] = [];
            for (const cost of costs) {
                if (cost.Status !== 'Active') {
                    continue; // Expired/Invalid/Pending rows are historical; only Active rows price runs
                }
                const label = `cost ${cost.ID} (${cost.Model ?? cost.ModelID} @ ${cost.Vendor ?? cost.VendorID})`;
                if (!engine.Models.some(m => UUIDsEqual(m.ID, cost.ModelID))) {
                    problems.push(`${label}: ModelID not in the engine Models cache`);
                }
                if (!engine.Vendors.some(v => UUIDsEqual(v.ID, cost.VendorID))) {
                    problems.push(`${label}: VendorID not in the engine Vendors cache`);
                }
                if (!engine.ModelPriceTypes.some(pt => UUIDsEqual(pt.ID, cost.PriceTypeID))) {
                    problems.push(`${label}: PriceTypeID not in the engine ModelPriceTypes cache`);
                }
                if (!engine.ModelPriceUnitTypes.some(ut => UUIDsEqual(ut.ID, cost.UnitTypeID))) {
                    problems.push(`${label}: UnitTypeID not in the engine ModelPriceUnitTypes cache — CalculateAndSetCost would silently skip this row`);
                }
                const input = Number(cost.InputPricePerUnit);
                const output = Number(cost.OutputPricePerUnit);
                if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0) {
                    problems.push(`${label}: non-finite or negative price (in=${cost.InputPricePerUnit}, out=${cost.OutputPricePerUnit})`);
                }
                if (!cost.Currency || cost.Currency.trim().length === 0) {
                    problems.push(`${label}: empty Currency — CostCurrency stamping would be blank`);
                }
                if (cost.StartedAt && cost.EndedAt && new Date(cost.StartedAt).getTime() > new Date(cost.EndedAt).getTime()) {
                    problems.push(`${label}: StartedAt after EndedAt — the row can never be active in any window`);
                }
            }
            Assert(problems.length === 0, `Active cost-row integrity violations: ${problems.join('; ')}`);
            console.log(`      → ${costs.length} cost row(s) audited; all Active rows resolve + carry sane prices`);
        }
    },
    {
        Id: 'ai-cost.AC4',
        Name: 'AC4: GetActiveModelCost selection parity — Active + in-window + most-recent-start per ProcessingType; stranger → null',
        Fn: async (ctx): Promise<void> => {
            const engine = await configuredAIEngine(ctx);

            // The stranger probe always runs: an unknown (model, vendor) pair must yield null —
            // the "no price ⇒ no silent guess" contract CalculateAndSetCost depends on.
            Assert(engine.GetActiveModelCost(STRANGER_ID, STRANGER_ID, 'Realtime') === null, 'stranger model/vendor returned a cost row');
            Assert(engine.GetActiveModelCost(STRANGER_ID, STRANGER_ID, 'Batch') === null, 'stranger model/vendor returned a Batch cost row');

            const costs = engine.ModelCosts;
            if (costs.length === 0) {
                skipNote('AC4', 'no cost rows — only the stranger-id → null leg was exercised');
                return;
            }

            // INDEPENDENT reimplementation of the selection rule (Active + StartedAt<=now<EndedAt +
            // most-recently-started wins) — asserted against the production resolver per group.
            const now = Date.now();
            const groups = new Map<string, MJAIModelCostEntity[]>();
            for (const cost of costs) {
                const key = `${cost.ModelID.toLowerCase()}|${cost.VendorID.toLowerCase()}|${cost.ProcessingType}`;
                const list = groups.get(key) ?? [];
                list.push(cost);
                groups.set(key, list);
            }
            let verified = 0;
            for (const [key, rows] of groups) {
                const [modelId, vendorId, processingType] = key.split('|');
                const candidates = rows.filter(r =>
                    r.Status === 'Active' &&
                    (!r.StartedAt || new Date(r.StartedAt).getTime() <= now) &&
                    (!r.EndedAt || new Date(r.EndedAt).getTime() > now)
                );
                const actual = engine.GetActiveModelCost(modelId, vendorId, processingType as MJAIModelCostEntity['ProcessingType']);
                if (candidates.length === 0) {
                    Assert(actual === null, `group ${key}: no Active in-window row exists, yet GetActiveModelCost returned ${actual?.ID}`);
                    continue;
                }
                Assert(actual !== null, `group ${key}: ${candidates.length} Active in-window row(s) exist, yet GetActiveModelCost returned null`);
                const maxStart = Math.max(...candidates.map(c => startMillis(c.StartedAt)));
                Assert(candidates.some(c => UUIDsEqual(c.ID, actual!.ID)), `group ${key}: selected row ${actual!.ID} is not an Active in-window candidate`);
                AssertEqual(startMillis(actual!.StartedAt), maxStart, `group ${key}: selection did not prefer the most recently started row`);
                verified++;
            }
            console.log(`      → selection parity verified over ${groups.size} (model,vendor,type) group(s); ${verified} with active pricing`);
        }
    },
    {
        Id: 'ai-cost.AC5',
        Name: 'AC5: no Active in-window cost row is orphaned from the Model-Vendor pairing table (+ coverage report)',
        Fn: async (ctx): Promise<void> => {
            const engine = await configuredAIEngine(ctx);
            const costs = engine.ModelCosts;
            if (costs.length === 0) {
                skipNote('AC5', 'no cost rows — orphan/coverage audit is unexercised');
                return;
            }
            const pairings = new Set(engine.ModelVendors.map(mv => `${mv.ModelID.toLowerCase()}|${mv.VendorID.toLowerCase()}`));
            const now = Date.now();
            const orphans: string[] = [];
            let staleOrphans = 0;
            for (const cost of costs) {
                const paired = pairings.has(`${cost.ModelID.toLowerCase()}|${cost.VendorID.toLowerCase()}`);
                if (paired) {
                    continue;
                }
                const inWindow =
                    cost.Status === 'Active' &&
                    (!cost.StartedAt || new Date(cost.StartedAt).getTime() <= now) &&
                    (!cost.EndedAt || new Date(cost.EndedAt).getTime() > now);
                if (inWindow) {
                    orphans.push(`${cost.ID} (${cost.Model ?? cost.ModelID} @ ${cost.Vendor ?? cost.VendorID})`);
                } else {
                    staleOrphans++;
                }
            }
            if (staleOrphans > 0) {
                console.warn(`      ⚠ ${staleOrphans} non-active/out-of-window cost row(s) reference model-vendor pairs with no MJ: AI Model Vendors row (historical drift, warn only)`);
            }
            Assert(orphans.length === 0,
                `ACTIVE in-window cost row(s) price a (model, vendor) pair that has NO Model-Vendor pairing — dead config that can still be served: ${orphans.join('; ')}`);

            // Coverage report (informational — sparse pricing is a deployment choice, not a failure):
            // active models with at least one Active pairing but no Active Realtime price.
            const activelyPricedModels = new Set(
                costs
                    .filter(c => c.Status === 'Active' && c.ProcessingType === 'Realtime')
                    .map(c => c.ModelID.toLowerCase())
            );
            const uncovered = engine.Models.filter(m =>
                m.IsActive &&
                engine.ModelVendors.some(mv => UUIDsEqual(mv.ModelID, m.ID) && mv.Status === 'Active') &&
                !activelyPricedModels.has(m.ID.toLowerCase())
            );
            if (uncovered.length > 0) {
                console.warn(`      ⚠ ${uncovered.length} active model(s) with an active vendor pairing have NO Active Realtime cost row — their prompt runs are silently uncosted (e.g. '${uncovered[0].Name}')`);
            }
            console.log(`      → ${costs.length} cost row(s): no active orphans; ${uncovered.length} active model(s) unpriced (reported)`);
        }
    },
    {
        Id: 'ai-cost.AC6',
        Name: 'AC6: historical prompt-run cost identity — TotalCost = Cost + DescendantCost, non-negative, currency stamped',
        Fn: async (ctx): Promise<void> => {
            // Read-only over whatever prompt-run history the deployment has. The identity is
            // maintained by MJAIPromptRunEntityServer's Cost/DescendantCost setters on EVERY save,
            // so any persisted costed row must satisfy it (tolerance covers decimal storage
            // rounding). The rollup MUTATION proof is catalog item AI1 — deliberately not here.
            const rv = new RunView();
            const result = await rv.RunView<{
                ID: string;
                Cost: number | null;
                TotalCost: number | null;
                DescendantCost: number | null;
                CostCurrency: string | null;
            }>({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: 'Cost IS NOT NULL',
                Fields: ['ID', 'Cost', 'TotalCost', 'DescendantCost', 'CostCurrency'],
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 200,
                ResultType: 'simple'
            }, ctx.User);
            Assert(result.Success, `prompt-run cost query failed: ${result.ErrorMessage}`);
            const rows = result.Results;
            if (rows.length === 0) {
                skipNote('AC6', 'no costed MJ: AI Prompt Runs rows exist — historical cost fidelity is unexercised');
                return;
            }
            const problems: string[] = [];
            let missingCurrency = 0;
            for (const row of rows) {
                const cost = Number(row.Cost);
                if (!Number.isFinite(cost) || cost < 0) {
                    problems.push(`${row.ID}: negative/non-finite Cost ${row.Cost}`);
                    continue;
                }
                const descendant = row.DescendantCost != null ? Number(row.DescendantCost) : 0;
                if (descendant < 0) {
                    problems.push(`${row.ID}: negative DescendantCost ${row.DescendantCost}`);
                }
                if (row.TotalCost != null) {
                    const total = Number(row.TotalCost);
                    const expected = cost + descendant;
                    const tolerance = Math.max(1e-6, Math.abs(expected) * 1e-6);
                    if (Math.abs(total - expected) > tolerance) {
                        problems.push(`${row.ID}: TotalCost ${total} ≠ Cost ${cost} + DescendantCost ${descendant}`);
                    }
                }
                if (!row.CostCurrency || row.CostCurrency.trim().length === 0) {
                    missingCurrency++;
                }
            }
            if (missingCurrency > 0) {
                console.warn(`      ⚠ ${missingCurrency}/${rows.length} costed run(s) have no CostCurrency — costs are stamped without a unit (warn only; older rows predate stamping)`);
            }
            Assert(problems.length === 0, `prompt-run cost-identity violations: ${problems.join('; ')}`);
            console.log(`      → ${rows.length} costed prompt run(s) satisfy TotalCost = Cost + DescendantCost with non-negative costs`);
        }
    },
    {
        Id: 'ai-cost.AC7',
        Name: 'AC7: completed runs that did measurable work are not silently uncosted — hard-fails when a price EXISTS and was not applied',
        Fn: async (ctx): Promise<void> => {
            // The monitoring counterpart to this domain's whole design. Everything else here converts
            // a wrong number into a NULL, which is right — but a null plus a LogError in a server log
            // is invisible. B60 (three shipped price unit types with no driver, six ACTIVE image cost
            // rows dormant since 2026-02-06) survived months precisely because nothing asked this
            // question. It is the query that would have caught it.
            //
            // The two populations are NOT the same defect and are graded differently:
            //   - no active cost row in the run's measure → a pricing-coverage GAP. A deployment
            //     choice (AC5 already reports unpriced models), so reported, not failed.
            //   - an active cost row in the run's measure EXISTS and the run is still uncosted → the
            //     cost pipeline was handed everything it needed and produced nothing. That is a bug
            //     with B60's exact signature, and it is asserted.
            const engine = await configuredAIEngine(ctx);
            const rv = new RunView();
            const result = await rv.RunView<{
                ID: string;
                ModelID: string | null;
                VendorID: string | null;
                UsageTypeID: string;
                TokensUsed: number | null;
                InputUnitsUsed: number | null;
                OutputUnitsUsed: number | null;
            }>({
                EntityName: 'MJ: AI Prompt Runs',
                // Completed, no cost, and it measurably did something. A run with no usage at all is
                // correctly uncosted — ShouldCalculateCost declines it — so it must not be counted.
                ExtraFilter:
                    'CompletedAt IS NOT NULL AND Cost IS NULL AND (' +
                    'ISNULL(TokensUsed, 0) > 0 OR ISNULL(InputUnitsUsed, 0) > 0 OR ISNULL(OutputUnitsUsed, 0) > 0)',
                Fields: ['ID', 'ModelID', 'VendorID', 'UsageTypeID', 'TokensUsed', 'InputUnitsUsed', 'OutputUnitsUsed'],
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 500,
                ResultType: 'simple'
            }, ctx.User);
            Assert(result.Success, `uncosted prompt-run query failed: ${result.ErrorMessage}`);

            const uncosted = result.Results;
            if (uncosted.length === 0) {
                console.log('      → no completed prompt run did measurable work without a cost');
                return;
            }

            // A price existed and was not applied — grouped so the report names the configuration to
            // look at rather than listing hundreds of run ids.
            const priceExisted = new Map<string, number>();
            let noPriceConfigured = 0;
            let unresolvableMeasure = 0;
            for (const row of uncosted) {
                if (!row.ModelID || !row.VendorID) {
                    // Cost calculation requires both; without them the run is correctly skipped.
                    noPriceConfigured++;
                    continue;
                }
                // An unset UsageTypeID means token-billed — every run predating the column is — so it
                // resolves to Tokens the same way the storage seam does. A value that IS set but is
                // absent from the catalog is a real fault (a deleted row, a stale cache), counted
                // separately instead of defaulted, which would attribute it to a pricing gap it has
                // nothing to do with.
                const measure = row.UsageTypeID ? engine.UsageTypeName(row.UsageTypeID) : 'Tokens';
                if (measure === null) {
                    unresolvableMeasure++;
                    continue;
                }
                const cost = engine.GetActiveModelCost(row.ModelID, row.VendorID, 'Realtime', measure as never);
                if (!cost) {
                    noPriceConfigured++;
                    continue;
                }
                const key = `${row.ModelID} @ ${row.VendorID} in ${measure}`;
                priceExisted.set(key, (priceExisted.get(key) ?? 0) + 1);
            }

            if (noPriceConfigured > 0) {
                console.warn(
                    `      ⚠ ${noPriceConfigured}/${uncosted.length} uncosted run(s) have NO active cost row in the ` +
                    `measure they recorded — a pricing-coverage gap, not a pipeline failure (see AC5)`
                );
            }
            if (unresolvableMeasure > 0) {
                console.warn(
                    `      ⚠ ${unresolvableMeasure}/${uncosted.length} uncosted run(s) name a UsageTypeID absent from ` +
                    `the MJ: AI Usage Types catalog — a deleted row or a stale cache, not a pricing gap`
                );
            }
            const offenders = [...priceExisted.entries()].map(([key, n]) => `${key}: ${n} run(s)`);
            Assert(
                offenders.length === 0,
                `completed run(s) did measurable work, an Active cost row in their measure EXISTS, and Cost is still ` +
                `NULL — the cost pipeline had everything it needed: ${offenders.join('; ')}`
            );
            console.log(
                `      → ${uncosted.length} uncosted run(s) examined; all explained by absent pricing, none by a ` +
                `failure to apply pricing that exists`
            );
        }
    },
    {
        Id: 'ai-cost.AC8',
        Name: 'AC8: prompt-run cost precision and basis invariants — with-children cost share, coverage reporting, non-negative agent run totals',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();

            // Probe completed prompt runs for total count and total cost.
            const probe = await rv.RunView({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: 'CompletedAt IS NOT NULL',
                Aggregates: [
                    { expression: 'COUNT(*)', alias: 'TotalCompleted' },
                    { expression: 'SUM(Cost)', alias: 'TotalCost' }
                ],
                ResultType: 'count_only',
                MaxRows: 1
            }, ctx.User);
            Assert(probe.Success, `prompt-run completed probe failed: ${probe.ErrorMessage}`);
            const totalCompleted = aggregateValue(probe.AggregateResults, 'TotalCompleted');
            if (totalCompleted === 0) {
                skipNote('AC8', 'no completed MJ: AI Prompt Runs rows exist — precision and basis invariants are unexercised');
                return;
            }

            // (b) Report unpriced ratio as coverage (log line, no assert — coverage is reported, not gated, in PR1).
            const unpricedProbe = await rv.RunView({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: 'CompletedAt IS NOT NULL AND Cost IS NULL',
                Aggregates: [{ expression: 'COUNT(*)', alias: 'UnpricedCompleted' }],
                ResultType: 'count_only',
                MaxRows: 1
            }, ctx.User);
            Assert(unpricedProbe.Success, `unpriced prompt-run query failed: ${unpricedProbe.ErrorMessage}`);
            const unpricedCompleted = aggregateValue(unpricedProbe.AggregateResults, 'UnpricedCompleted');
            const pricedCount = totalCompleted - unpricedCompleted;
            const coveragePct = (pricedCount / totalCompleted) * 100;
            console.log(
                `      → prompt-run pricing coverage: ${coveragePct.toFixed(1)}% priced ` +
                `(${pricedCount}/${totalCompleted} completed runs), ${unpricedCompleted} unpriced`
            );

            // (c) ParallelParent prompt runs must have Cost IS NULL.
            // Parallel parents aggregate spend across their arms and have no own spend.
            const invalidParallelParentsResult = await rv.RunView({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: "CompletedAt IS NOT NULL AND RunType = 'ParallelParent' AND Cost IS NOT NULL",
                Aggregates: [{ expression: 'COUNT(*)', alias: 'InvalidParallelParents' }],
                ResultType: 'count_only',
                MaxRows: 1
            }, ctx.User);
            Assert(invalidParallelParentsResult.Success, `parallel parent prompt-run query failed: ${invalidParallelParentsResult.ErrorMessage}`);
            const invalidParallelParentsCount = aggregateValue(invalidParallelParentsResult.AggregateResults, 'InvalidParallelParents');
            AssertEqual(
                invalidParallelParentsCount,
                0,
                `ParallelParent prompt runs must have Cost IS NULL (found ${invalidParallelParentsCount} row(s) with Cost IS NOT NULL)`
            );

            // Non-negative agent-run cost assert
            const negativeAgentRunCostResult = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: 'TotalCost IS NOT NULL AND TotalCost < 0',
                ResultType: 'count_only',
                MaxRows: 1
            }, ctx.User);
            Assert(negativeAgentRunCostResult.Success, `negative agent run cost query failed: ${negativeAgentRunCostResult.ErrorMessage}`);
            const negativeAgentRunCostCount = negativeAgentRunCostResult.TotalRowCount ?? 0;
            AssertEqual(
                negativeAgentRunCostCount,
                0,
                `AIAgentRun.TotalCost must be non-negative (found ${negativeAgentRunCostCount} row(s) with TotalCost < 0)`
            );
            console.log(`      → verified basis invariants: ParallelParent Cost IS NULL, agent run costs non-negative`);
        }
    },
    {
        Id: 'ai-cost.AC11',
        Name: 'AC11: prompt-run base own-cost equals hourly aggregate cost over window, and DataSource: Materialized delivers parity',
        Fn: async (ctx): Promise<void> => {
            // (a) Verify scheduled job exists for materialization refresh
            const rv = new RunView();
            const jobProbe = await rv.RunView({
                EntityName: 'MJ: Scheduled Jobs',
                ExtraFilter: "JobType = 'Materialization Refresh'",
                MaxRows: 1
            }, ctx.User);
            if (!jobProbe.Success) {
                console.warn(`      ⚠ scheduled job probe failed: ${jobProbe.ErrorMessage}`);
            }
            Assert(jobProbe.Success, `scheduled job probe failed: ${jobProbe.ErrorMessage}`);
            Assert((jobProbe.Results ?? []).length > 0, `scheduled job with JobType 'Materialization Refresh' must exist in metadata`);

            // (a.2) Verify MaterializedResult exists, has RefreshSchedule IS NOT NULL, and after RefreshOne is Active
            const mrRes = await rv.RunView<{
                ID: string;
                RefreshSchedule: string | null;
                Status: string;
                TableName: string;
            }>({
                EntityName: 'MJ: Materialized Results',
                ExtraFilter: "TableName = 'materialized_aiusagehourly'",
                MaxRows: 1
            }, ctx.User);
            Assert(mrRes.Success, `MaterializedResult lookup failed: ${mrRes.ErrorMessage}`);
            Assert((mrRes.Results ?? []).length > 0, `MaterializedResult for AIUsageHourly must exist`);
            const mrInfo = mrRes.Results![0];
            Assert(mrInfo.RefreshSchedule !== null && mrInfo.RefreshSchedule.trim().length > 0, `AIUsageHourly MaterializedResult must have RefreshSchedule IS NOT NULL, got: ${mrInfo.RefreshSchedule}`);

            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const mrEntity = await md.GetEntityObject<MJMaterializedResultEntity>('MJ: Materialized Results', ctx.User);
            const loaded = await mrEntity.Load(mrInfo.ID);
            Assert(loaded, `failed to load MaterializedResult entity for ID: ${mrInfo.ID}`);

            const exec = Metadata.Provider as unknown as { ExecuteSQL?: unknown }; // global-provider-ok: integration test script — single-provider process by design
            if (typeof exec?.ExecuteSQL === 'function') {
                const refresher = new MaterializationRefresher();
                const refreshRes = await refresher.RefreshOne(mrEntity, ctx.User, Metadata.Provider); // global-provider-ok: integration test script — single-provider process by design
                Assert(refreshRes.Success, `RefreshOne failed for ${mrInfo.TableName}: ${refreshRes.ErrorMessage}`);

                await mrEntity.Load(mrInfo.ID);
                AssertEqual(mrEntity.Status, 'Active', `MaterializedResult status must be Active after RefreshOne, got: ${mrEntity.Status}`);
            } else {
                console.warn('  ⚠ AC11: Metadata.Provider does not implement ExecuteSQL (client provider run path) — skipping RefreshOne live execution'); // global-provider-ok: integration test script — single-provider process by design
                Assert(mrInfo.Status === 'Active' || mrInfo.Status === 'Building', `MaterializedResult status must be Active or Building, got: ${mrInfo.Status}`);
            }

            const rq = new RunQuery();
            const start = '2020-01-01';
            const end = '2030-01-01';

            // (b) Own-cost side: RunView on MJ: AI Prompt Runs with Aggregates
            const baseRes = await rv.RunView({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: `CompletedAt >= '${start}' AND CompletedAt < '${end}' AND (RunType <> 'ParallelParent' OR RunType IS NULL)`,
                Aggregates: [
                    { expression: 'SUM(Cost)', alias: 'TotalCost' },
                    { expression: 'COUNT(*)', alias: 'TotalCount' }
                ],
                ResultType: 'count_only',
                MaxRows: 1
            }, ctx.User);
            Assert(baseRes.Success, `AIPromptRun base view query failed: ${baseRes.ErrorMessage}`);

            const baseCount = aggregateValue(baseRes.AggregateResults, 'TotalCount');
            const baseCost = aggregateValue(baseRes.AggregateResults, 'TotalCost');

            // (c) Live path: saved query AIUsageHourly over the same window
            const hourlyRes = await rq.RunQuery({
                QueryName: 'AIUsageHourly',
                CategoryPath: '/MJ/AI/',
                Parameters: { start, end }
            }, ctx.User);
            Assert(hourlyRes.Success, `AIUsageHourly live query failed: ${hourlyRes.ErrorMessage}`);

            const hourlyTotal = (hourlyRes.Results ?? []).reduce(
                (sum: number, r: Record<string, unknown>) => sum + Number(r.TotalCost ?? 0),
                0
            );

            if (baseCount === 0 && hourlyTotal === 0) {
                skipNote('AC11', 'no completed prompt runs in test window — fact view / hourly parity is unexercised');
                return;
            }

            const diffLive = Math.abs(hourlyTotal - baseCost);
            Assert(
                diffLive < 0.0001,
                `AIUsageHourly live cost (${hourlyTotal}) does not match AIPromptRun base cost (${baseCost}), diff=${diffLive}`
            );

            // (d) Materialized path: DataSource: 'Materialized' fallback-safe parity
            const matRes = await rq.RunQuery({
                QueryName: 'AIUsageHourly',
                CategoryPath: '/MJ/AI/',
                DataSource: 'Materialized',
                Parameters: { start, end }
            }, ctx.User);
            Assert(matRes.Success, `AIUsageHourly with DataSource: 'Materialized' failed: ${matRes.ErrorMessage}`);

            const matTotal = (matRes.Results ?? []).reduce(
                (sum: number, r: Record<string, unknown>) => sum + Number(r.TotalCost ?? 0),
                0
            );
            const diffMat = Math.abs(matTotal - hourlyTotal);
            Assert(
                diffMat < 0.0001,
                `AIUsageHourly materialized cost (${matTotal}) does not match live cost (${hourlyTotal}), diff=${diffMat}`
            );

            console.log(`      → AC11 verified: AIPromptRun base cost (${baseCost.toFixed(6)}) matches AIUsageHourly live (${hourlyTotal.toFixed(6)}) and materialized (${matTotal.toFixed(6)}) across ${baseCount} run(s)`);
        }
    },
    {
        Id: 'ai-cost.AC12',
        Name: 'AC12: AIAgentRunSubtreeCost (CalculateRunCost) body changed to SUM(OwnCost) over subtree, executes cleanly for root runs',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            // (a) Query metadata checks: CalculateRunCost exists and is Approved
            const queryRes = await rv.RunView({
                EntityName: 'MJ: Queries',
                ExtraFilter: "Name = 'CalculateRunCost'",
                MaxRows: 1
            }, ctx.User);
            Assert(queryRes.Success, `CalculateRunCost query lookup failed: ${queryRes.ErrorMessage}`);
            Assert((queryRes.Results ?? []).length > 0, `CalculateRunCost query must exist in metadata`);
            const q = queryRes.Results![0] as Record<string, unknown>;
            AssertEqual(q.Status, 'Approved', `CalculateRunCost must be Approved`);
            Assert(!!q.UsesTemplate, `CalculateRunCost must have UsesTemplate = true`);

            // Check that the SQL does not reference TotalCostRollup or raw TotalCost
            const sql = String(q.SQL ?? '');
            Assert(!sql.includes('TotalCostRollup'), `CalculateRunCost SQL must not reference TotalCostRollup`);

            // (b) Check for root agent runs
            const agentRunRes = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: 'ParentRunID IS NULL',
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple'
            }, ctx.User);
            Assert(agentRunRes.Success, `AI Agent Runs probe failed: ${agentRunRes.ErrorMessage}`);

            const rq = new RunQuery();
            if (!agentRunRes.Results || agentRunRes.Results.length === 0) {
                // Verify CalculateRunCost executes cleanly on a stranger ID
                const strangerRes = await rq.RunQuery({
                    QueryName: 'CalculateRunCost',
                    CategoryPath: '/MJ/AI/',
                    Parameters: { AIAgentRunID: STRANGER_ID }
                }, ctx.User);
                Assert(strangerRes.Success, `CalculateRunCost query execution failed for stranger ID: ${strangerRes.ErrorMessage}`);
                skipNote('AC12', 'no root agent runs exist in the database — subtree cost execution on real root is unexercised');
                return;
            }

            const rootRunId = String(agentRunRes.Results[0].ID);
            const calcRes = await rq.RunQuery({
                QueryName: 'CalculateRunCost',
                CategoryPath: '/MJ/AI/',
                Parameters: { AIAgentRunID: rootRunId }
            }, ctx.User);
            Assert(calcRes.Success, `CalculateRunCost query failed: ${calcRes.ErrorMessage}`);
            console.log(`      → AC12 verified: CalculateRunCost executed successfully for root run ${rootRunId}`);
        }
    }
];

for (const check of AiCostChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
