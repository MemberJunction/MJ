/**
 * communication.checks.ts — the 'communication' bundle (CM1–CM4): live, end-to-end integration
 * checks for the Communication framework's DRY-RUN seam through the REAL CommunicationEngine:
 * metadata-selected provider → ClassFactory provider instance → message processing → the
 * Communication Log audit lifecycle → the provider's full payload construction — stopping at the
 * external transport boundary. ABSOLUTELY NOTHING LEAVES THE PROCESS: every send in this bundle
 * sets `Message.DryRun = true`, which every shipped provider honors by returning a DryRun-marked
 * success WITHOUT contacting its external service (see Communication/base-types BaseProvider.ts).
 *
 *   - CM1: engine Config + provider inventory — resolves the first Active, sendable provider from
 *          live metadata whose class is ClassFactory-registered; GetProvider error contract for an
 *          unregistered name. SKIP-AS-PASS (loudly) when the deployment has no usable provider.
 *   - CM2: the dry-run send — engine.SendSingleMessage with DryRun:true succeeds, the result is
 *          DryRun-marked, and exactly one Communication Log audit row is written for it.
 *   - CM3: audit-row semantics — the log row is Status 'Complete', Direction 'Sending', error-free,
 *          and its MessageContent JSON carries the explicit `DryRun: true` marker, so no persisted
 *          state can be mistaken for a real delivery.
 *   - CM4: previewOnly stays distinct — it short-circuits BEFORE the provider, is NOT DryRun-marked,
 *          and writes NO audit row.
 *
 * Credentials: the send is attempted first with deployment/environment credentials; if the
 * provider's credential preflight rejects (unconfigured deployment), it retries with syntactically
 * valid DUMMY credentials — safe precisely because DryRun never contacts the external service, and
 * it keeps the pipeline (credential resolution → payload construction) fully exercised anywhere.
 *
 * Deterministic (no model calls, no network). Teardown deletes the tagged Communication Log rows
 * (and any linked Communication Runs) best-effort, reporting loudly if the entity forbids deletes.
 */
import { RunView } from '@memberjunction/core';
import { MJCommunicationLogEntity, MJCommunicationRunEntity } from '@memberjunction/core-entities';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message, MessageResult, ProviderCredentialsBase } from '@memberjunction/communication-types';
// Provider packages are imported for their @RegisterClass side effects (the ClassFactory
// registrations GetProvider resolves); the class references below pin the imports.
import { SendGridProvider } from '@memberjunction/communication-sendgrid';
import { GmailProvider } from '@memberjunction/communication-gmail';
import { TwilioProvider } from '@memberjunction/communication-twilio';
import { MSGraphProvider } from '@memberjunction/communication-ms-graph';
import { ExpoPushProvider } from '@memberjunction/communication-expo-push';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { NotificationEngine } from '@memberjunction/notifications';
import type { MJUserNotificationPreferenceEntity, MJUserNotificationTypeEntity } from '@memberjunction/core-entities';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import type { CommunicationFixture } from '@memberjunction/testing-integration';

const TAG = '(mj-integration-test — safe to delete)';

/** Static references that pin the provider imports so their @RegisterClass decorators fire. */
const REGISTERED_PROVIDER_CLASSES: ReadonlyArray<Function> = [
    SendGridProvider,
    GmailProvider,
    TwilioProvider,
    MSGraphProvider,
    ExpoPushProvider,
];

/**
 * Syntactically valid dummy credentials per provider registration name. Only ever used on the
 * DryRun path (which never contacts the external service) and only when the deployment's own
 * environment credentials fail the provider's preflight.
 */
const DUMMY_CREDENTIALS: Readonly<Record<string, ProviderCredentialsBase>> = {
    'SendGrid': { apiKey: 'SG.mj-integration-test-dry-run' } as ProviderCredentialsBase,
    'Gmail': {
        clientId: 'mj-it-dry-run-client',
        clientSecret: 'mj-it-dry-run-secret',
        redirectUri: 'http://localhost/oauth2/callback',
        refreshToken: 'mj-it-dry-run-refresh',
    } as ProviderCredentialsBase,
    'Twilio': {
        accountSid: 'AC00000000000000000000000000000000',
        authToken: 'mj-it-dry-run-token',
        phoneNumber: '+15005550006',
    } as ProviderCredentialsBase,
    'Microsoft Graph': {
        tenantId: '00000000-0000-0000-0000-000000000001',
        clientId: '00000000-0000-0000-0000-000000000002',
        clientSecret: 'mj-it-dry-run-secret',
        accountEmail: 'mj-it-dry-run@integration.test',
    } as ProviderCredentialsBase,
    'Expo Push': {} as ProviderCredentialsBase,
};

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext): CommunicationFixture {
    Assert(ctx.CommunicationFixture != null, 'communication fixture missing (bundle Setup did not run)');
    return ctx.CommunicationFixture!;
}

/** True (with a loud console note) when the bundle must skip because no usable provider exists. */
function skipIfNoProvider(ctx: IntegrationCheckContext, checkId: string): boolean {
    const f = fx(ctx);
    if (!f.ProviderName) {
        console.log(`      → SKIP-AS-PASS (${checkId}): no usable communication provider — ${f.SkipReason ?? 'unknown reason'}`);
        return true;
    }
    return false;
}

function buildDryRunMessage(f: CommunicationFixture): Message {
    const msg = new Message();
    msg.From = 'mj-it-dry-run-sender@integration.test';
    msg.To = 'mj-it-dry-run-recipient@integration.test';
    msg.Subject = f.SubjectMarker;
    msg.Body = `Dry-run integration check body ${TAG}`;
    msg.DryRun = true;
    return msg;
}

/** The audit rows stamped with this run's unique subject marker (BypassCache — just written). */
async function findMarkedLogs(ctx: IntegrationCheckContext): Promise<MJCommunicationLogEntity[]> {
    const f = fx(ctx);
    const r = await new RunView().RunView<MJCommunicationLogEntity>(
        {
            EntityName: 'MJ: Communication Logs',
            ExtraFilter: `MessageContent LIKE '%${f.SubjectMarker}%'`,
            ResultType: 'entity_object',
            BypassCache: true,
        },
        ctx.User,
    );
    Assert(r.Success, `querying Communication Logs failed: ${r.ErrorMessage}`);
    return r.Results ?? [];
}

export const CommunicationChecks: NamedCheck[] = [
    {
        Id: 'communication.CM1',
        Name: 'CM1: engine Config resolves an Active registered provider; GetProvider error contract holds',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = CommunicationEngine.Instance;
            Assert(engine.Loaded, 'CommunicationEngine metadata loaded (Setup ran Config)');
            Assert(REGISTERED_PROVIDER_CLASSES.length === 5, 'all five provider classes are statically referenced');

            // Error contract: an unregistered provider name throws, never returns the base class
            let threw = false;
            try {
                engine.GetProvider('mj-it-nonexistent-provider');
            } catch (e) {
                threw = true;
                Assert(e instanceof Error && /not found/i.test(e.message), `GetProvider error names the miss (got: ${e instanceof Error ? e.message : String(e)})`);
            }
            Assert(threw, 'GetProvider throws for an unregistered provider name');

            if (skipIfNoProvider(ctx, 'CM1')) {
                return;
            }
            const f = fx(ctx);
            const instance = engine.GetProvider(f.ProviderName!);
            Assert(instance != null && instance.constructor.name !== 'BaseCommunicationProvider',
                `GetProvider('${f.ProviderName}') returns a concrete provider subclass`);
            console.log(`      → selected provider '${f.ProviderName}' (message type '${f.MessageTypeName}'), class ${instance.constructor.name}`);
        }
    },
    {
        Id: 'communication.CM2',
        Name: 'CM2: DryRun send through the real engine succeeds, is DryRun-marked, and writes exactly one audit row',
        Fn: async (ctx: IntegrationCheckContext) => {
            if (skipIfNoProvider(ctx, 'CM2')) {
                return;
            }
            const f = fx(ctx);
            const engine = CommunicationEngine.Instance;

            // Attempt with deployment credentials first; fall back to dummy credentials when the
            // provider's preflight rejects (both paths are DryRun — nothing can leave the process).
            let result: MessageResult;
            let credentialMode = 'environment';
            try {
                result = await engine.SendSingleMessage(f.ProviderName!, f.MessageTypeName!, buildDryRunMessage(f));
            } catch (envErr) {
                credentialMode = 'dummy';
                console.log(`      → environment credentials rejected (${envErr instanceof Error ? envErr.message : String(envErr)}); retrying with dummy credentials`);
                result = await engine.SendSingleMessage(
                    f.ProviderName!, f.MessageTypeName!, buildDryRunMessage(f), undefined, false, DUMMY_CREDENTIALS[f.ProviderName!] ?? {},
                );
            }
            // Adversarial review C1: some providers (MS Graph) RETURN Success:false on missing
            // credentials instead of throwing — the catch above never fires for them. Gate the
            // dummy retry on the RESULT too, so provider selection order can't flip this check
            // into a false failure.
            if (result && !result.Success && credentialMode !== 'dummy') {
                credentialMode = 'dummy';
                console.log(`      → environment-credential attempt returned failure (${result.Error}); retrying with dummy credentials`);
                result = await engine.SendSingleMessage(
                    f.ProviderName!, f.MessageTypeName!, buildDryRunMessage(f), undefined, false, DUMMY_CREDENTIALS[f.ProviderName!] ?? {},
                );
            }

            Assert(result.Success, `dry-run send failed: ${result.Error}`);
            AssertEqual(result.DryRun, true, 'result is explicitly DryRun-marked');
            AssertEqual(result.Error, '', 'no error on the dry-run result');
            f.DryRunResultSuccess = result.Success;
            f.DryRunResultMarked = result.DryRun === true;

            // Exactly one audit row was written for this send (tracked for CM3 + teardown)
            // Bounded poll (adversarial review P1): a fixed settle raced the audit write under
            // aggregator load — poll for a COMPLETE marker row up to ~5s instead.
            let logs = await findMarkedLogs(ctx);
            for (let i = 0; i < 16 && !logs.some(l => l.Status === 'Complete'); i++) {
                await settle(300);
                logs = await findMarkedLogs(ctx);
            }
            // When the environment-credentials attempt is rejected at the provider preflight,
            // that FIRST attempt already wrote its own audit row (Status 'Pending' — StartLog ran, the provider threw before the status update) ahead of the documented
            // dummy-credential retry — so the marker can legitimately match two rows. The
            // delivery-state invariant is about COMPLETE rows: exactly one, ever.
            const completeLogs = logs.filter(l => l.Status === 'Complete');
            AssertEqual(completeLogs.length, 1, 'exactly one COMPLETE Communication Log audit row for the dry-run send');
            if (credentialMode === 'dummy') {
                Assert(logs.length <= 2, `at most the Pending preflight row + the Complete dry-run row may exist (got ${logs.length})`);
            } else {
                AssertEqual(logs.length, 1, 'exactly one audit row when environment credentials worked first try');
            }
            for (const l of logs) { f.LogIds.push(l.ID); }
            if (logs[0].CommunicationRunID) {
                f.RunIds.push(logs[0].CommunicationRunID);
            }
            console.log(`      → dry-run send via '${f.ProviderName}' (${credentialMode} credentials): Success + DryRun-marked, 1 audit row`);
        }
    },
    {
        Id: 'communication.CM3',
        Name: 'CM3: the audit row is Complete + error-free and its MessageContent carries the DryRun marker (nothing implies real delivery)',
        Fn: async (ctx: IntegrationCheckContext) => {
            if (skipIfNoProvider(ctx, 'CM3')) {
                return;
            }
            const f = fx(ctx);
            Assert(f.DryRunResultSuccess === true && f.DryRunResultMarked === true, 'CM2 recorded a successful DryRun-marked send (ordered bundle)');

            const logs = await findMarkedLogs(ctx);
            AssertEqual(logs.filter(l => l.Status === 'Complete').length, 1, 'still exactly one COMPLETE audit row for the marker (no duplicate delivery state)');
            const log = logs.find(l => l.Status === 'Complete')!; // the semantic assertions below are about the COMPLETED dry-run row, not a preflight-Failed sibling

            AssertEqual(log.Status, 'Complete', 'log row completed the audited lifecycle');
            AssertEqual(log.Direction, 'Sending', 'log row direction');
            Assert(log.ErrorMessage == null || log.ErrorMessage === '', `no error on the audit row (got: ${log.ErrorMessage})`);

            const content = JSON.parse(log.MessageContent ?? '{}') as Record<string, unknown>;
            AssertEqual(content.DryRun, true, 'MessageContent JSON carries the explicit DryRun: true marker');
            AssertEqual(content.To, 'mj-it-dry-run-recipient@integration.test', 'audited recipient matches the sent message');
            AssertEqual(content.Subject, f.SubjectMarker, 'audited subject matches the sent message');
            console.log('      → audit row Complete + error-free, MessageContent.DryRun=true — unmistakably NOT a real delivery');
        }
    },
    {
        Id: 'communication.CM4',
        Name: 'CM4: previewOnly stays distinct — no provider payload, no DryRun mark, NO audit row',
        Fn: async (ctx: IntegrationCheckContext) => {
            if (skipIfNoProvider(ctx, 'CM4')) {
                return;
            }
            const f = fx(ctx);
            const engine = CommunicationEngine.Instance;

            const previewMarker = `${f.SubjectMarker}-preview`;
            const msg = buildDryRunMessage(f);
            msg.Subject = previewMarker;
            msg.DryRun = undefined; // preview mode, not dry-run

            const result = await engine.SendSingleMessage(f.ProviderName!, f.MessageTypeName!, msg, undefined, true);
            Assert(result.Success, `previewOnly send failed: ${result.Error ?? ''}`);
            Assert(result.DryRun == null, 'previewOnly result is NOT DryRun-marked (the modes are distinct)');

            await settle(300);
            const r = await new RunView().RunView(
                {
                    EntityName: 'MJ: Communication Logs',
                    ExtraFilter: `MessageContent LIKE '%${previewMarker}%'`,
                    ResultType: 'simple',
                    BypassCache: true,
                },
                ctx.User,
            );
            Assert(r.Success, `querying Communication Logs failed: ${r.ErrorMessage}`);
            AssertEqual(r.Results?.length ?? 0, 0, 'previewOnly writes NO Communication Log row (dry-run does — CM2)');
            console.log('      → previewOnly: processed message returned, no DryRun mark, zero audit rows');
        }
    },
    {
        Id: 'communication.CM5',
        Name: 'CM5 (CT5): NotificationEngine delivery-channel precedence — force > master opt-out > per-channel pref > type default',
        Fn: async (ctx: IntegrationCheckContext) => {
            interface ChannelResolverCapable {
                resolveDeliveryChannels(
                    params: { forceDeliveryChannels?: { inApp: boolean; email: boolean; sms: boolean } },
                    prefs: MJUserNotificationPreferenceEntity | null,
                    type: MJUserNotificationTypeEntity,
                ): { inApp: boolean; email: boolean; sms: boolean };
            }
            const engine = NotificationEngine.Instance as unknown as ChannelResolverCapable;
            Assert(typeof engine.resolveDeliveryChannels === 'function', 'CM5: NotificationEngine.resolveDeliveryChannels seam missing');

            const type = await ctx.Provider.GetEntityObject<MJUserNotificationTypeEntity>('MJ: User Notification Types', ctx.User);
            type.NewRecord();
            type.DefaultInApp = true; type.DefaultEmail = false; type.DefaultSMS = false;
            type.AllowUserPreference = true;
            const prefs = await ctx.Provider.GetEntityObject<MJUserNotificationPreferenceEntity>('MJ: User Notification Preferences', ctx.User);
            prefs.NewRecord();

            // 1. force wins over EVERYTHING (even a master opt-out).
            prefs.Enabled = false;
            const forced = engine.resolveDeliveryChannels({ forceDeliveryChannels: { inApp: false, email: true, sms: true } }, prefs, type);
            AssertEqual(JSON.stringify(forced), JSON.stringify({ inApp: false, email: true, sms: true }), 'CM5: forceDeliveryChannels bypasses prefs AND defaults');

            // 2. master opt-out (Enabled=false) kills all channels.
            const optedOut = engine.resolveDeliveryChannels({}, prefs, type);
            AssertEqual(JSON.stringify(optedOut), JSON.stringify({ inApp: false, email: false, sms: false }), 'CM5: Enabled=false is a master kill switch');

            // 3. per-channel pref overrides the type default (email on despite DefaultEmail=false).
            prefs.Enabled = true; prefs.EmailEnabled = true; prefs.InAppEnabled = false;
            const prefWins = engine.resolveDeliveryChannels({}, prefs, type);
            AssertEqual(prefWins.email, true, 'CM5: an explicit per-channel pref overrides the type default (email)');
            AssertEqual(prefWins.inApp, false, 'CM5: an explicit per-channel pref overrides the type default (inApp)');

            // 4. AllowUserPreference=false locks channels to the TYPE defaults, prefs ignored.
            type.AllowUserPreference = false;
            const locked = engine.resolveDeliveryChannels({}, prefs, type);
            AssertEqual(JSON.stringify(locked), JSON.stringify({ inApp: true, email: false, sms: false }), 'CM5: AllowUserPreference=false pins the type defaults');

            // 5. no prefs at all → pure type defaults.
            type.AllowUserPreference = true;
            const defaults = engine.resolveDeliveryChannels({}, null, type);
            AssertEqual(JSON.stringify(defaults), JSON.stringify({ inApp: true, email: false, sms: false }), 'CM5: null prefs → type defaults');
        }
    },
];

for (const check of CommunicationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('communication', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const fixture: CommunicationFixture = (ctx.CommunicationFixture = {
            SubjectMarker: `mj-comm-it-${Date.now()} ${TAG}`,
            LogIds: [],
            RunIds: [],
        });

        const engine = CommunicationEngine.Instance;
        await engine.Config(false, ctx.User, ctx.Provider);

        // Select the FIRST Active, sendable provider from live metadata whose class resolves on
        // the ClassFactory and that exposes at least one message type. Discovery-only: nothing is
        // created here, so there is nothing to tear down when no provider qualifies.
        // Sorted for DETERMINISTIC selection (review C1): the backing RunView has no OrderBy,
        // so natural order could flip which provider this bundle exercises between runs.
        const candidates = engine.Providers.filter((p) => p.Status === 'Active' && p.SupportsSending)
            .sort((a, b) => a.Name.localeCompare(b.Name));
        if (candidates.length === 0) {
            fixture.SkipReason = 'no Active+SupportsSending Communication Provider rows in metadata';
            return;
        }
        const reasons: string[] = [];
        for (const p of candidates) {
            const messageType = (p.MessageTypes ?? [])[0];
            if (!messageType) {
                reasons.push(`${p.Name}: no message types`);
                continue;
            }
            try {
                engine.GetProvider(p.Name); // throws when the class is not ClassFactory-registered
                fixture.ProviderName = p.Name;
                fixture.MessageTypeName = messageType.Name;
                return;
            } catch {
                reasons.push(`${p.Name}: class not registered`);
            }
        }
        fixture.SkipReason = `no candidate qualified (${reasons.join('; ')})`;
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.CommunicationFixture;
        if (!f) {
            return;
        }
        const md = ctx.Provider;
        const user = ctx.User;

        // Sweep by marker (covers rows CM2 tracked AND any partial rows a failed check left),
        // then remove any linked Communication Runs. Best-effort: some deployments forbid deletes
        // on audit entities — report loudly so the tagged rows are findable by hand.
        try {
            const logs = await new RunView().RunView<MJCommunicationLogEntity>(
                {
                    EntityName: 'MJ: Communication Logs',
                    // CM4's preview marker CONTAINS SubjectMarker, so this sweep covers both
                    ExtraFilter: `MessageContent LIKE '%${f.SubjectMarker}%'`,
                    ResultType: 'entity_object',
                    BypassCache: true,
                },
                user,
            );
            const runIds = new Set<string>(f.RunIds);
            for (const log of logs.Results ?? []) {
                if (log.CommunicationRunID) {
                    runIds.add(log.CommunicationRunID);
                }
                const deleted = await log.Delete().catch(() => false);
                if (!deleted) {
                    console.log(`      → teardown note: could not delete Communication Log ${log.ID} (rows are tagged '${TAG}')`);
                }
            }
            for (const runId of runIds) {
                const run = await md.GetEntityObject<MJCommunicationRunEntity>('MJ: Communication Runs', user);
                if (await run.Load(runId)) {
                    const deleted = await run.Delete().catch(() => false);
                    if (!deleted) {
                        console.log(`      → teardown note: could not delete Communication Run ${runId}`);
                    }
                }
            }
        } catch (e) {
            console.log(`      → teardown note: communication sweep failed (${e instanceof Error ? e.message : String(e)})`);
        }
        ctx.CommunicationFixture = undefined;
    }
});
