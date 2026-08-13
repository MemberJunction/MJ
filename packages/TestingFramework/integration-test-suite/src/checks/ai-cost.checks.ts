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
import { RunView } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import type { MJAIModelCostEntity } from '@memberjunction/core-entities';
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
                // UsageTypeID is NOT NULL with a default of Tokens, so an unresolvable value is a real
                // fault rather than an unset column — counted separately instead of defaulted to
                // Tokens, which would attribute it to a pricing gap it has nothing to do with.
                const measure = engine.UsageTypeName(row.UsageTypeID);
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
    }
];

for (const check of AiCostChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
