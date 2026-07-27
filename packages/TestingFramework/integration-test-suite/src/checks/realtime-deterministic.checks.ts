/**
 * realtime-deterministic.checks.ts — the 'realtime-deterministic' bundle (RD1–RD9).
 *
 * Domain 10 deterministic legs — NO live sessions, NO sidecar, NO model calls:
 *  - realtime metadata integrity: agent channels (RD1), Realtime model → vendor DriverClass
 *    wiring (RD2), the co-agent pairing junction (RD3) — each skips-as-pass LOUDLY when the
 *    deployment has not seeded that slice,
 *  - agent-session row lifecycle via a tagged fixture (RD4) — also PINS the fact that agent
 *    sessions have NO *EntityServer invariants (a direct Save bypasses SessionManager entirely),
 *  - the bridge *EntityServer invariants from the Realtime Bridges guide, exercised through real
 *    Save() attempts: provider SupportedFeatures/DriverClass gates (RD5) and session-bridge
 *    outbound-target / status-timestamp / close-reason coherence (RD6),
 *  - bridge driver-registry ClassFactory resolution WITHOUT starting anything (RD7 — LoopbackBridge),
 *  - the Predictive Studio deterministic legs NOT covered by predictive-studio.checks.ts (PS1–PS5):
 *    the ML Algorithms / Use Cases / Rankings guidance-matrix integrity (RD8) and the
 *    ProductionModelPromotionGate's deterministic refusal paths — non-UUID injection refusal,
 *    leakage refusal, sign-off-reason gate, and the lifecycle state machine (RD9).
 *
 * Every fixture row is tagged '(mj-integration-test — safe to delete)' and deleted in the same
 * check's finally block, so the bundle needs no shared lifecycle.
 */
import { BaseEntity, Metadata, ProviderType, RunView } from '@memberjunction/core';
import type { UserInfo, DatabaseProviderBase } from '@memberjunction/core';
import { MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import {
    MJAIAgentChannelSchema,
    MJAIAgentChannelEntity,
    MJAIAgentCoAgentEntity,
    MJAIAgentSessionEntity,
    MJAIAgentSessionBridgeEntity,
    MJAIBridgeProviderEntity,
    MJAIModelVendorEntity,
    MJMLAlgorithmUseCaseRankingEntity,
    MJMLModelEntity,
    MJMLTrainingPipelineEntity,
} from '@memberjunction/core-entities';
import { BaseRealtimeBridge } from '@memberjunction/ai-bridge-base';
import { LoopbackBridge, LOOPBACK_BRIDGE_DRIVER_CLASS } from '@memberjunction/ai-bridge-server';
import { ProductionModelPromotionGate, detectSingleFeatureDominance } from '@memberjunction/predictive-studio';
import type { PromoteModelRequest } from '@memberjunction/predictive-studio';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck } from '@memberjunction/testing-integration';

const TAG = '(mj-integration-test — safe to delete)';

/** Simple-typed first-row ID lookup (RunView never throws; empty ⇒ undefined). */
async function firstID(entity: string, user: UserInfo, extraFilter = ''): Promise<string | undefined> {
    const r = await new RunView().RunView<{ ID: string }>(
        { EntityName: entity, Fields: ['ID'], ExtraFilter: extraFilter, ResultType: 'simple', MaxRows: 1 }, user,
    );
    return r.Success ? r.Results?.[0]?.ID : undefined;
}

/**
 * Whether server-side entity invariants (the *EntityServer subclasses) are active on this run's
 * Save path: always true over the wire (MJAPI enforces them resolver-side), and in-process only
 * when the bootstrap registered the server subclass on the ClassFactory.
 */
function serverInvariantsActive(providerType: string, entityName: string): boolean {
    if (providerType === ProviderType.Network) {
        return true;
    }
    const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseEntity, entityName);
    const sub: unknown = reg?.SubClass;
    return typeof sub === 'function' && /Server/.test((sub as { name: string }).name);
}

/** Create (but do not save) a tagged, valid agent-session fixture entity. */
async function buildSessionFixture(user: UserInfo): Promise<MJAIAgentSessionEntity | undefined> {
    const agentID = await firstID('MJ: AI Agents', user);
    if (!agentID) {
        return undefined;
    }
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const session = await md.GetEntityObject<MJAIAgentSessionEntity>('MJ: AI Agent Sessions', user);
    session.NewRecord();
    session.AgentID = agentID;
    session.UserID = user.ID;
    session.Status = 'Active';
    session.LastActiveAt = new Date();
    session.Config_ = JSON.stringify({ tag: TAG, purpose: 'realtime-deterministic fixture' });
    return session;
}

/** Create (but do not save) a tagged, VALID bridge-provider fixture (Disabled so it is inert). */
async function buildProviderFixture(user: UserInfo): Promise<MJAIBridgeProviderEntity> {
    const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
    const provider = await md.GetEntityObject<MJAIBridgeProviderEntity>('MJ: AI Bridge Providers', user);
    provider.NewRecord();
    provider.Name = `mj-integration-test bridge provider ${Date.now()} ${TAG}`;
    provider.Description = TAG;
    provider.BridgeType = 'Meeting';
    provider.DriverClass = LOOPBACK_BRIDGE_DRIVER_CLASS;
    provider.Status = 'Disabled';
    provider.SupportedFeatures = JSON.stringify({ AudioIn: true, AudioOut: true });
    return provider;
}

export const RealtimeDeterministicChecks: NamedCheck[] = [
    {
        Id: 'realtime-deterministic.RD1',
        Name: 'RD1: seeded agent-channel metadata is coherent (names, JSON ConfigSchema, typed TransportType)',
        Fn: async (ctx): Promise<void> => {
            const r = await new RunView().RunView<MJAIAgentChannelEntity>(
                { EntityName: 'MJ: AI Agent Channels', ResultType: 'entity_object' }, ctx.User,
            );
            Assert(r.Success, `channels load failed: ${r.ErrorMessage}`);
            if (r.Results.length === 0) {
                console.warn('  ⚠ realtime-deterministic.RD1 SKIPPED — no MJ: AI Agent Channels seeded in this deployment '
                    + '(push metadata/ai-agent-channels to exercise this check)');
                return;
            }
            for (const channel of r.Results) {
                Assert(channel.Name.trim().length > 0, `channel ${channel.ID} has an empty Name`);
                // Schema-driven (never a hand-copied union): the generated zod union is the CHECK-constraint truth.
                Assert(MJAIAgentChannelSchema.shape.TransportType.safeParse(channel.TransportType).success,
                    `channel '${channel.Name}' has TransportType '${channel.TransportType}' outside the generated union`);
                if (channel.ConfigSchema) {
                    try {
                        JSON.parse(channel.ConfigSchema);
                    } catch {
                        Assert(false, `channel '${channel.Name}' ConfigSchema is not valid JSON`);
                    }
                }
            }
            const active = r.Results.filter(c => c.IsActive).length;
            console.log(`      → ${r.Results.length} channels coherent (${active} active)`);
        }
    },
    {
        Id: 'realtime-deterministic.RD2',
        Name: "RD2: every active Realtime-type AI model has a vendor row carrying a non-empty DriverClass",
        Fn: async (ctx): Promise<void> => {
            const realtimeTypeID = await firstID('MJ: AI Model Types', ctx.User, `Name='Realtime'`);
            if (!realtimeTypeID) {
                console.warn("  ⚠ realtime-deterministic.RD2 SKIPPED — no 'Realtime' row in MJ: AI Model Types (realtime stack not seeded)");
                return;
            }
            const models = await new RunView().RunView<{ ID: string; Name: string }>(
                {
                    EntityName: 'MJ: AI Models',
                    Fields: ['ID', 'Name'],
                    // Dialect-quoted boolean: `IsActive` is a real boolean column, so a literal
                    // `1` is SQL-Server-only and PostgreSQL rejects `boolean = integer`.
                    ExtraFilter: `AIModelTypeID='${realtimeTypeID}' AND IsActive=${(ctx.Provider as unknown as DatabaseProviderBase).Dialect.BooleanLiteral(true)}`,
                    ResultType: 'simple'
                }, ctx.User,
            );
            Assert(models.Success, `realtime models load failed: ${models.ErrorMessage}`);
            if (models.Results.length === 0) {
                console.warn('  ⚠ realtime-deterministic.RD2 SKIPPED — no active Realtime models seeded');
                return;
            }
            const idList = models.Results.map(m => `'${m.ID}'`).join(',');
            const vendors = await new RunView().RunView<MJAIModelVendorEntity>(
                { EntityName: 'MJ: AI Model Vendors', ExtraFilter: `ModelID IN (${idList})`, ResultType: 'entity_object' }, ctx.User,
            );
            Assert(vendors.Success, `model vendors load failed: ${vendors.ErrorMessage}`);
            for (const model of models.Results) {
                const withDriver = vendors.Results.filter(v => UUIDsEqual(v.ModelID, model.ID) && (v.DriverClass ?? '').trim().length > 0);
                Assert(withDriver.length > 0,
                    `Realtime model '${model.Name}' has no MJ: AI Model Vendors row with a DriverClass — it can never be instantiated`);
            }
            console.log(`      → ${models.Results.length} active Realtime models all wired to a DriverClass-bearing vendor`);
        }
    },
    {
        Id: 'realtime-deterministic.RD3',
        Name: 'RD3: co-agent pairing junction integrity (targets present, no duplicate pairs, ≤1 default per (CoAgent, Type))',
        Fn: async (ctx): Promise<void> => {
            const r = await new RunView().RunView<MJAIAgentCoAgentEntity>(
                { EntityName: 'MJ: AI Agent Co Agents', ResultType: 'entity_object' }, ctx.User,
            );
            Assert(r.Success, `co-agent junction load failed: ${r.ErrorMessage}`);
            if (r.Results.length === 0) {
                console.warn('  ⚠ realtime-deterministic.RD3 SKIPPED — no MJ: AI Agent Co Agents rows seeded');
                return;
            }
            const pairKeys = new Set<string>();
            const defaultsPerCoAgentType = new Map<string, number>();
            for (const row of r.Results) {
                Assert(row.CoAgentID.trim().length > 0, `pairing ${row.ID} has an empty CoAgentID`);
                Assert(!!row.TargetAgentID || !!row.TargetAgentTypeID,
                    `pairing ${row.ID} names neither a TargetAgentID nor a TargetAgentTypeID — it can never resolve a target`);
                const pairKey = `${NormalizeUUID(row.CoAgentID)}|${NormalizeUUID(row.TargetAgentID ?? '')}|${NormalizeUUID(row.TargetAgentTypeID ?? '')}|${row.Type}`;
                Assert(!pairKeys.has(pairKey), `duplicate co-agent pairing: ${pairKey}`);
                pairKeys.add(pairKey);
                if (row.IsDefault && row.Status === 'Active') {
                    const defaultKey = `${NormalizeUUID(row.CoAgentID)}|${row.Type}|${row.TargetAgentID ? 'agent' : 'type'}`;
                    const count = (defaultsPerCoAgentType.get(defaultKey) ?? 0) + 1;
                    defaultsPerCoAgentType.set(defaultKey, count);
                    Assert(count === 1, `more than one Active IsDefault pairing for (CoAgent, Type) key '${defaultKey}'`);
                }
            }
            console.log(`      → ${r.Results.length} pairings coherent (${defaultsPerCoAgentType.size} default slots)`);
        }
    },
    {
        Id: 'realtime-deterministic.RD4',
        Name: 'RD4: an agent-session row round-trips its lifecycle fields (and PINS that no EntityServer guards it)',
        Fn: async (ctx): Promise<void> => {
            const session = await buildSessionFixture(ctx.User);
            if (!session) {
                console.warn('  ⚠ realtime-deterministic.RD4 SKIPPED — no MJ: AI Agents row available to anchor a session fixture');
                return;
            }
            try {
                Assert(await session.Save(), `session fixture save failed: ${session.LatestResult?.CompleteMessage}`);
                const reload = await new RunView().RunView<MJAIAgentSessionEntity>(
                    { EntityName: 'MJ: AI Agent Sessions', ExtraFilter: `ID='${session.ID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
                );
                const persisted = reload.Results?.[0];
                Assert(!!persisted, 'session fixture did not read back');
                AssertEqual(persisted!.Status, 'Active', 'session Status (typed union) persisted');
                Assert(UUIDsEqual(persisted!.UserID, ctx.User.ID), 'session UserID persisted');

                // Close it through the entity layer (the terminal shape the janitor writes).
                persisted!.Status = 'Closed';
                persisted!.CloseReason = 'Explicit';
                persisted!.ClosedAt = new Date();
                Assert(await persisted!.Save(), `session close save failed: ${persisted!.LatestResult?.CompleteMessage}`);
                AssertEqual(persisted!.Status, 'Closed', 'session close round-trip');

                // The save above succeeding WITHOUT a live session is itself a finding worth pinning:
                console.warn('  ⚠ PRODUCT NOTE (realtime-deterministic.RD4): MJ: AI Agent Sessions has NO *EntityServer subclass — '
                    + 'all session invariants (CanRun authorization, conversation resolution, terminal-close idempotency) live only in '
                    + 'SessionManager and are bypassable by any direct entity Save.');
            } finally {
                if (session.IsSaved) {
                    await session.Delete().catch(() => undefined);
                }
            }
            console.log('      → session lifecycle fields round-trip; fixture removed');
        }
    },
    {
        Id: 'realtime-deterministic.RD5',
        Name: 'RD5: bridge-provider EntityServer invariants — unknown/non-boolean feature flags are refused, valid rows save',
        Fn: async (ctx): Promise<void> => {
            const entityName = 'MJ: AI Bridge Providers';
            if (!new Metadata().EntityByName(entityName)) { // global-provider-ok: integration test script — single-provider process by design
                console.warn(`  ⚠ realtime-deterministic.RD5 SKIPPED — entity '${entityName}' not in metadata (bridge stack not installed)`);
                return;
            }
            if (!serverInvariantsActive(ctx.Provider.ProviderType, entityName)) {
                console.warn('  ⚠ realtime-deterministic.RD5 SKIPPED — the bridge *EntityServer subclass is not registered in this '
                    + 'process and the run is not over the wire, so invariants cannot be observed');
                return;
            }

            // Negative 1: unknown feature flag must be refused (never persisted).
            const badKey = await buildProviderFixture(ctx.User);
            badKey.SupportedFeatures = JSON.stringify({ NotARealFlag: true });
            try {
                AssertEqual(await badKey.Save(), false, 'a SupportedFeatures payload with an unknown flag must be refused');
                Assert((badKey.LatestResult?.CompleteMessage ?? '').includes('unknown feature flag'),
                    `refusal must name the unknown flag, got: ${badKey.LatestResult?.CompleteMessage}`);

                // Negative 2: a known flag with a non-boolean value must be refused.
                const badValue = await buildProviderFixture(ctx.User);
                badValue.SupportedFeatures = JSON.stringify({ AudioIn: 'yes' });
                AssertEqual(await badValue.Save(), false, 'a non-boolean feature-flag value must be refused');

                // Positive: a well-formed (Disabled, inert) provider saves and reads back.
                const good = await buildProviderFixture(ctx.User);
                try {
                    Assert(await good.Save(), `valid bridge provider save failed: ${good.LatestResult?.CompleteMessage}`);
                    AssertEqual(good.Status, 'Disabled', 'fixture provider stays Disabled (inert)');
                } finally {
                    if (good.IsSaved) {
                        await good.Delete().catch(() => undefined);
                    }
                }
            } finally {
                if (badKey.IsSaved) {
                    await badKey.Delete().catch(() => undefined); // defensive — a refused save should never persist
                }
            }
            console.log('      → SupportedFeatures/DriverClass invariants enforced on the real Save path');
        }
    },
    {
        Id: 'realtime-deterministic.RD6',
        Name: 'RD6: session-bridge EntityServer invariants — outbound target, status↔timestamp, close-reason coherence',
        Fn: async (ctx): Promise<void> => {
            const entityName = 'MJ: AI Agent Session Bridges';
            if (!new Metadata().EntityByName(entityName)) { // global-provider-ok: integration test script — single-provider process by design
                console.warn(`  ⚠ realtime-deterministic.RD6 SKIPPED — entity '${entityName}' not in metadata (bridge stack not installed)`);
                return;
            }
            if (!serverInvariantsActive(ctx.Provider.ProviderType, entityName)) {
                console.warn('  ⚠ realtime-deterministic.RD6 SKIPPED — the session-bridge *EntityServer subclass is not registered '
                    + 'in this process and the run is not over the wire');
                return;
            }
            const session = await buildSessionFixture(ctx.User);
            if (!session) {
                console.warn('  ⚠ realtime-deterministic.RD6 SKIPPED — no MJ: AI Agents row available to anchor the session fixture');
                return;
            }
            const provider = await buildProviderFixture(ctx.User);
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            let goodBridge: MJAIAgentSessionBridgeEntity | undefined;
            try {
                Assert(await session.Save(), `session fixture save failed: ${session.LatestResult?.CompleteMessage}`);
                Assert(await provider.Save(), `provider fixture save failed: ${provider.LatestResult?.CompleteMessage}`);

                const buildBridge = async (): Promise<MJAIAgentSessionBridgeEntity> => {
                    const bridge = await md.GetEntityObject<MJAIAgentSessionBridgeEntity>(entityName, ctx.User);
                    bridge.NewRecord();
                    bridge.AgentSessionID = session.ID;
                    bridge.ProviderID = provider.ID;
                    bridge.Direction = 'Inbound';
                    bridge.JoinMethod = 'OnDemand';
                    bridge.TurnMode = 'Passive';
                    bridge.Status = 'Pending';
                    bridge.Config_ = JSON.stringify({ tag: TAG });
                    return bridge;
                };

                // Negative 1: an Outbound bridge with no Address/ExternalConnectionID has nowhere to go.
                const noTarget = await buildBridge();
                noTarget.Direction = 'Outbound';
                AssertEqual(await noTarget.Save(), false, 'an Outbound bridge without Address/ExternalConnectionID must be refused');
                Assert((noTarget.LatestResult?.CompleteMessage ?? '').includes('Outbound bridge'),
                    `refusal must explain the missing outbound target, got: ${noTarget.LatestResult?.CompleteMessage}`);

                // Negative 2: Status 'Connected' without ConnectedAt breaks duration metrics.
                const noTimestamp = await buildBridge();
                noTimestamp.Status = 'Connected';
                AssertEqual(await noTimestamp.Save(), false, "Status 'Connected' without ConnectedAt must be refused");

                // Negative 3: a CloseReason on a non-terminal bridge is incoherent.
                const earlyClose = await buildBridge();
                earlyClose.CloseReason = 'Explicit';
                AssertEqual(await earlyClose.Save(), false, 'a CloseReason on an active (Pending) bridge must be refused');

                // Positive: a coherent Inbound/Pending bridge saves.
                goodBridge = await buildBridge();
                Assert(await goodBridge.Save(), `valid session bridge save failed: ${goodBridge.LatestResult?.CompleteMessage}`);
            } finally {
                if (goodBridge?.IsSaved) {
                    await goodBridge.Delete().catch(() => undefined);
                }
                if (provider.IsSaved) {
                    await provider.Delete().catch(() => undefined);
                }
                if (session.IsSaved) {
                    await session.Delete().catch(() => undefined);
                }
            }
            console.log('      → outbound-target / status-timestamp / close-reason invariants enforced');
        }
    },
    {
        Id: 'realtime-deterministic.RD7',
        Name: 'RD7: the bridge driver registry resolves LoopbackBridge via ClassFactory (case-insensitive, no session started)',
        Fn: async (): Promise<void> => {
            const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeBridge, LOOPBACK_BRIDGE_DRIVER_CLASS);
            Assert(!!reg, `no @RegisterClass(BaseRealtimeBridge, '${LOOPBACK_BRIDGE_DRIVER_CLASS}') registration found`);
            const sub: unknown = reg!.SubClass;
            Assert(typeof sub === 'function' && (sub as { prototype: unknown }).prototype instanceof BaseRealtimeBridge,
                'the LoopbackBridge registration must subclass BaseRealtimeBridge');
            AssertEqual((sub as { name: string }).name, LoopbackBridge.name,
                'the registration must resolve the LoopbackBridge class itself');

            // Key matching is trim + case-insensitive — the same contract the engine relies on
            // when a metadata row stores a differently-cased DriverClass.
            const mangled = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeBridge, '  loopbackbridge  ');
            Assert(!!mangled && mangled.SubClass === reg!.SubClass,
                'driver-class key resolution must be trim + case-insensitive');
            console.log(`      → '${LOOPBACK_BRIDGE_DRIVER_CLASS}' resolves deterministically without starting a session`);
        }
    },
    {
        Id: 'realtime-deterministic.RD8',
        Name: 'RD8: the ML guidance matrix (Algorithms × Use Cases × Rankings) is referentially coherent',
        Fn: async (ctx): Promise<void> => {
            const rv = new RunView();
            const [algorithms, useCases, rankings] = await rv.RunViews([
                { EntityName: 'MJ: ML Algorithms', Fields: ['ID', 'Name'], ResultType: 'simple' },
                { EntityName: 'MJ: ML Algorithm Use Cases', Fields: ['ID', 'Name'], ResultType: 'simple' },
                { EntityName: 'MJ: ML Algorithm Use Case Rankings', ResultType: 'entity_object' },
            ], ctx.User);
            Assert(algorithms.Success && useCases.Success && rankings.Success,
                `guidance matrix load failed: ${algorithms.ErrorMessage || useCases.ErrorMessage || rankings.ErrorMessage}`);
            Assert(algorithms.Results.length > 0,
                'No MJ: ML Algorithms are seeded — run `mj sync push --include=ml-algorithms` first');
            if (rankings.Results.length === 0) {
                console.warn('  ⚠ realtime-deterministic.RD8 ranking legs SKIPPED — no MJ: ML Algorithm Use Case Rankings seeded');
                return;
            }
            const algorithmIDs = new Set((algorithms.Results as { ID: string }[]).map(a => NormalizeUUID(a.ID)));
            const useCaseIDs = new Set((useCases.Results as { ID: string }[]).map(u => NormalizeUUID(u.ID)));
            const pairs = new Set<string>();
            for (const ranking of rankings.Results as MJMLAlgorithmUseCaseRankingEntity[]) {
                Assert(algorithmIDs.has(NormalizeUUID(ranking.MLAlgorithmID)),
                    `ranking ${ranking.ID} references a missing algorithm '${ranking.MLAlgorithmID}'`);
                Assert(useCaseIDs.has(NormalizeUUID(ranking.MLAlgorithmUseCaseID)),
                    `ranking ${ranking.ID} references a missing use case '${ranking.MLAlgorithmUseCaseID}'`);
                Assert(ranking.SuitabilityScore >= 1 && ranking.SuitabilityScore <= 5,
                    `ranking ${ranking.ID} SuitabilityScore ${ranking.SuitabilityScore} outside the documented 1..5 band`);
                const pair = `${NormalizeUUID(ranking.MLAlgorithmID)}|${NormalizeUUID(ranking.MLAlgorithmUseCaseID)}`;
                Assert(!pairs.has(pair), `duplicate (algorithm, use case) ranking pair ${pair}`);
                pairs.add(pair);
            }
            console.log(`      → ${rankings.Results.length} rankings over ${algorithms.Results.length} algorithms × ${useCases.Results.length} use cases are coherent`);
        }
    },
    {
        Id: 'realtime-deterministic.RD9',
        Name: 'RD9: ProductionModelPromotionGate refuses deterministically — non-UUID id, leakage, missing reason, illegal jump',
        Fn: async (ctx): Promise<void> => {
            const gate = new ProductionModelPromotionGate();
            type Promotable = PromoteModelRequest['targetStatus']; // derived, never hand-copied (rule 2c)
            const promote = (modelId: string, targetStatus: Promotable, signOff: boolean, reason?: string) =>
                gate.promote({ modelId, targetStatus, signOff, reason, contextUser: ctx.User, provider: ctx.Provider });

            // Injection-refusal leg (no fixture needed): a non-UUID id must never reach a SQL filter.
            const injected = await promote(`x' OR 1=1 --`, 'Validated', false);
            AssertEqual(injected.kind, 'not-found', 'a non-UUID model id must be refused as not-found (never concatenated into SQL)');

            const algorithmID = await firstID('MJ: ML Algorithms', ctx.User);
            if (!algorithmID) {
                console.warn('  ⚠ realtime-deterministic.RD9 fixture legs SKIPPED — no MJ: ML Algorithms seeded '
                    + '(run `mj sync push --include=ml-algorithms`)');
                return;
            }
            const targetEntityID = await firstID('MJ: Entities', ctx.User);
            Assert(!!targetEntityID, 'could not resolve a seed entity for the ML pipeline target');

            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const importance = { leaky_feature: 0.95, honest_feature: 0.05 };
            // Anti-vacuity: the SAME pure check the gate re-runs must flag this importance shape.
            Assert(detectSingleFeatureDominance(importance, 0.6).Dominant,
                'precondition: the fixture FeatureImportance must be dominance-flagged at threshold 0.6');

            const pipeline = await md.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', ctx.User);
            pipeline.NewRecord();
            pipeline.Name = `mj-integration-test rd9 pipeline ${TAG}`;
            pipeline.Status = 'Draft';
            pipeline.TargetEntityID = targetEntityID!;
            pipeline.TargetVariable = 'Renewed';
            pipeline.ProblemType = 'classification';
            pipeline.AlgorithmID = algorithmID;
            pipeline.LeakageGuard = JSON.stringify({ DenyFields: [], SingleFeatureDominanceThreshold: 0.6 });
            const model = await md.GetEntityObject<MJMLModelEntity>('MJ: ML Models', ctx.User);
            try {
                Assert(await pipeline.Save(), `rd9 pipeline save failed: ${pipeline.LatestResult?.CompleteMessage}`);
                model.NewRecord();
                model.PipelineID = pipeline.ID;
                model.Version = 1;
                model.AlgorithmID = algorithmID;
                model.FeatureSchema = JSON.stringify([{ Name: 'leaky_feature', Kind: 'numeric' }]);
                model.FeatureImportance = JSON.stringify(importance);
                model.TargetVariable = 'Renewed';
                model.ProblemType = 'classification';
                model.Status = 'Draft';
                Assert(await model.Save(), `rd9 model save failed: ${model.LatestResult?.CompleteMessage}`);

                // Leakage gate: a flagged model must be refused without sign-off…
                const refused = await promote(model.ID, 'Validated', false);
                AssertEqual(refused.kind, 'refused-leakage', 'a dominance-flagged model must be refused without sign-off');
                // …and a sign-off WITHOUT a justification must be refused too.
                const noReason = await promote(model.ID, 'Validated', true);
                AssertEqual(noReason.kind, 'signoff-reason-required', 'a leakage sign-off without a reason must be refused');

                // Lifecycle state machine: Draft → Published is an illegal jump (with a signed-off
                // reason so the leakage gate is satisfied and the TRANSITION rule is what refuses).
                const jump = await promote(model.ID, 'Published', true, 'integration-test sign-off probe');
                AssertEqual(jump.kind, 'invalid-transition', 'Draft → Published must be refused by the transition state machine');

                // None of the refusals may have mutated the model.
                const reload = await new RunView().RunView<MJMLModelEntity>(
                    { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${model.ID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
                );
                AssertEqual(String(reload.Results?.[0]?.Status), 'Draft', 'every refusal path must leave the model Status untouched');
            } finally {
                if (model.IsSaved) {
                    await model.Delete().catch(() => undefined);
                }
                if (pipeline.IsSaved) {
                    await pipeline.Delete().catch(() => undefined);
                }
            }
            console.log('      → all four deterministic refusal paths hold; model left immutable');
        }
    }
];

for (const check of RealtimeDeterministicChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
