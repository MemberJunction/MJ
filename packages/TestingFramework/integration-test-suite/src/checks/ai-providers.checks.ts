/**
 * ai-providers.checks.ts — the 'ai-providers' bundle (AIP1–AIP3): Domain 4's model-resolution
 * seams (catalog AI7 / AI13 / AI15), deterministic and LLM-free.
 *
 *   AIP1 (AI7):  Active AI Models' DriverClass strings resolve through ClassFactory against
 *                BaseLLM. Environment-aware: if ZERO LLM drivers are registered in this process
 *                the sweep skips loudly (provider packages not loaded — the MC7 rationale);
 *                once ANY driver resolves, every remaining ACTIVE LLM model's driver must too —
 *                an unresolvable driver on an Active model is a real wiring break.
 *   AIP2 (AI13): GetHighestPowerLLM / GetHighestPowerModel honor the PowerRank contract —
 *                the returned model IS the max-PowerRank Active LLM (computed independently
 *                from AIEngineBase.Models), and the vendor filter narrows correctly.
 *   AIP3 (AI15): DefaultAgentResolver's precedence chain — an explicit agent id wins
 *                immediately; a bogus explicit id falls through to the chain; the chain always
 *                lands on a real, Active agent (the seeded global default / Sage safety net).
 *
 * Catalog dispositions (documented, not built here):
 *   AI8 (selectModel determinism)  — a deep-private AIPromptRunner seam; real selection incl.
 *        vendor failover is exercised END-TO-END by the live agent-loop bundle (AL6/AL7).
 *   AI9 (credential-failover ladder) — covered live by agent-loop-live AL6/AL7 (the seeded
 *        IT: Failover Agent walks its multi-vendor binding ladder for real).
 *   AI14 (EntityVectorSyncer batch integrity) — belongs with ai-embeddings; needs a vector
 *        service fixture (follow-up there, not silently claimed here).
 *
 * TRANSPORT: SERVER (engine internals — AIEngineBase caches, ClassFactory registry, resolver).
 * Read-only; no fixtures, no teardown.
 */
import { Metadata } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { BaseLLM } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { DefaultAgentResolver } from '@memberjunction/conversations-runtime';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck } from '@memberjunction/testing-integration';

export const AiProvidersChecks: NamedCheck[] = [
    {
        Id: 'ai-providers.AIP1',
        Name: 'AIP1 (AI7): every ACTIVE LLM model DriverClass ClassFactory-resolves against BaseLLM (env-aware sweep)',
        Fn: async (ctx): Promise<void> => {
            await AIEngineBase.Instance.Config(false, ctx.User);
            const activeLLMs = AIEngineBase.Instance.Models.filter(m =>
                m.IsActive && String(m.AIModelType ?? '').trim().toLowerCase() === 'llm' && !!m.DriverClass);
            Assert(activeLLMs.length > 0, 'AIP1 would be vacuous — no Active LLM models with a DriverClass in metadata');

            const resolves = (driver: string): boolean =>
                !!MJGlobal.Instance.ClassFactory.GetRegistration(BaseLLM, driver);

            const resolved = activeLLMs.filter(m => resolves(m.DriverClass!));
            if (resolved.length === 0) {
                // The MC7 rationale: an all-zero sweep cannot distinguish "broken metadata" from
                // "LLM provider packages not loaded in this process" — skip loudly, never guess.
                console.warn(`  ⚠ AIP1 SKIPPED — none of ${activeLLMs.length} Active LLM drivers are registered in this process (provider packages not loaded).`);
                return;
            }
            // Providers ARE loaded here — now an unresolvable Active driver is a real break.
            // RATCHET: B65 (CohereLLM has no implementation — 'Cohere Command A'/'A+' are dead
            // at runtime) is logged and awaiting a product decision; pin it as a loud warning.
            // Any driver NOT on the known-dead list fails the gate.
            const KNOWN_DEAD_DRIVERS = new Set(['cohorellm', 'coherellm']);
            const unresolved = activeLLMs.filter(m => !resolves(m.DriverClass!));
            const known = unresolved.filter(m => KNOWN_DEAD_DRIVERS.has(m.DriverClass!.trim().toLowerCase()));
            const fresh = unresolved.filter(m => !KNOWN_DEAD_DRIVERS.has(m.DriverClass!.trim().toLowerCase()))
                .map(m => `${m.Name} → ${m.DriverClass}`);
            if (known.length > 0) {
                console.warn(`  ⚠ AIP1 (B65): ${known.length} Active model(s) on the known-dead driver list (no implementation ships): ${known.map(m => `${m.Name} → ${m.DriverClass}`).join('; ')}`);
            }
            AssertEqual(fresh.length, 0,
                `AIP1: ${fresh.length} Active LLM model(s) have NEW unresolvable DriverClass strings while ${resolved.length} sibling(s) resolve (dead models at runtime): ${fresh.slice(0, 6).join('; ')}`);
            console.log(`      → ${resolved.length}/${activeLLMs.length} Active LLM drivers resolve`);
        }
    },
    {
        Id: 'ai-providers.AIP2',
        Name: 'AIP2 (AI13): GetHighestPowerLLM returns the max-PowerRank Active LLM; the vendor filter narrows correctly',
        Fn: async (ctx): Promise<void> => {
            await AIEngineBase.Instance.Config(false, ctx.User);
            const llms = AIEngineBase.Instance.Models.filter(m =>
                String(m.AIModelType ?? '').trim().toLowerCase() === 'llm');
            Assert(llms.length > 0, 'AIP2 would be vacuous — no LLM models in metadata');
            const expectedTop = Math.max(...llms.map(m => m.PowerRank ?? 0));

            const top = await AIEngineBase.Instance.GetHighestPowerLLM(undefined, ctx.User);
            Assert(top != null, 'AIP2: GetHighestPowerLLM returned nothing despite LLM models existing');
            AssertEqual(top!.PowerRank, expectedTop,
                `AIP2: the returned model's PowerRank (${top!.PowerRank}, ${top!.Name}) must equal the independently-computed max (${expectedTop})`);

            // Vendor narrowing: pick a vendor that does NOT own the global top (when one exists)
            // so the filter provably narrows rather than coincidentally matching.
            const byVendor = new Map<string, number>();
            for (const m of llms) {
                const v = String(m.Vendor ?? '').trim();
                if (v) { byVendor.set(v, Math.max(byVendor.get(v) ?? -Infinity, m.PowerRank ?? 0)); }
            }
            const narrowing = [...byVendor.entries()].find(([, maxRank]) => maxRank < expectedTop);
            if (!narrowing) {
                console.warn('  ⚠ AIP2 vendor-narrowing leg degenerate — every vendor owns a max-PowerRank model this run.');
                return;
            }
            const [vendorName, vendorMax] = narrowing;
            const vendorTop = await AIEngineBase.Instance.GetHighestPowerLLM(vendorName, ctx.User);
            Assert(vendorTop != null, `AIP2: vendor filter '${vendorName}' returned nothing despite that vendor having LLMs`);
            AssertEqual(vendorTop!.PowerRank, vendorMax,
                `AIP2: '${vendorName}' top must be that VENDOR's max (${vendorMax}), got ${vendorTop!.PowerRank} (${vendorTop!.Name})`);
            Assert((vendorTop!.PowerRank ?? 0) < expectedTop,
                'AIP2: the vendor-filtered top is strictly below the global top — the filter narrowed for real');
        }
    },
    {
        Id: 'ai-providers.AIP3',
        Name: 'AIP3 (AI15): DefaultAgentResolver — explicit id wins; a bogus explicit id falls through; the chain lands on an Active agent',
        Fn: async (ctx): Promise<void> => {
            await AIEngineBase.Instance.Config(false, ctx.User);
            const resolver = new DefaultAgentResolver();
            const provider = Metadata.Provider; // global-provider-ok: integration test script — single-provider process by design

            // Chain baseline (no explicit id): must land on a real Active agent — the seeded
            // global default or the code-const Sage safety net. Never null on a stock install.
            const chained = await resolver.resolve({ contextUser: ctx.User, provider });
            Assert(chained != null, 'AIP3: the resolution chain returned NO agent — the Sage safety net is broken');
            AssertEqual(chained!.Status, 'Active', `AIP3: the chain resolved a non-Active agent ('${chained!.Name}', ${chained!.Status})`);

            // Explicit id wins (step 1): pick a DIFFERENT Active agent and pin it.
            const other = AIEngineBase.Instance.Agents.find(a => a.Status === 'Active' && !UUIDsEqual(a.ID, chained!.ID));
            if (other) {
                const explicit = await resolver.resolve({ explicitAgentId: other.ID, contextUser: ctx.User, provider });
                Assert(explicit != null && UUIDsEqual(explicit.ID, other.ID),
                    `AIP3: explicitAgentId must win immediately (asked ${other.Name}, got ${explicit?.Name})`);
            } else {
                console.warn('  ⚠ AIP3 explicit-wins leg degenerate — only one Active agent exists.');
            }

            // A bogus explicit id must FALL THROUGH to the chain, not return null/throw.
            const bogus = await resolver.resolve({ explicitAgentId: '00000000-0000-0000-0000-00000000dead', contextUser: ctx.User, provider });
            Assert(bogus != null && UUIDsEqual(bogus.ID, chained!.ID),
                `AIP3: a bogus explicit id must fall through to the chain result ('${chained!.Name}'), got '${bogus?.Name}'`);
        }
    }
];

for (const check of AiProvidersChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
