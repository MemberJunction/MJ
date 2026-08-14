import { RegisterClass } from '@memberjunction/global';
import {
    BaseEntity,
    EntitySaveOptions,
    LogError,
    LogStatus,
    Metadata,
    RunView,
    type UserInfo,
    type IMetadataProvider,
} from '@memberjunction/core';
import { MJCompanyIntegrationEntity, MJIntegrationEntity } from '@memberjunction/core-entities';
import {
    IntegrationConnectorCreationPipeline,
    IntegrationEngine,
    ConnectorFactory,
} from '@memberjunction/integration-engine';
import { buildIntegrationLLMPKCallback } from './IntegrationLLMPKCallback';

/**
 * Server-side extension of MJCompanyIntegrationEntity that:
 *
 *   Awaits `IntegrationConnectorCreationPipeline.Run()` whenever `IsActive`
 *   transitions `false → true` on a successful save.  This is the wizard-Finish
 *   trigger point — when an operator activates a connection (via the wizard,
 *   the Update mutation, direct entity edit, or any other code path that saves
 *   IsActive=true on a previously-inactive row), the pipeline runs:
 *
 *     1. TestConnection           — verify credentials still pass
 *     2. IntrospectSchema         — live describe across all objects
 *     3. PersistDiscoveredSchema  — overlay-aware upsert (Declared/Discovered/Custom)
 *     4. SoftPKClassifier         — 4-tier cascade for IOs lacking explicit PK
 *     5. Metadata.Refresh         — engine cache picks up the new rows
 *
 *   The pipeline emits structured JSON events to the MJAPI log via
 *   `IntegrationProgressEmitter` so operators can watch progress in real time:
 *     `tail -f /tmp/mjapi.log | grep '"event":"\(introspect\|persist\|pk\|entity\|stage\|run\)\.'`
 *
 *   PER-RUN JSONL ARTIFACTS land at:
 *     `<cwd>/logs/integration-runs/<runID>/{manifest,progress,result}.json`
 *
 * SYNCHRONOUS EXECUTION.  The pipeline now AWAITS so the wizard's Finish
 * button (which does `ci.IsActive=true; ci.Save()`) stays in its "Saving..."
 * state until the schema refresh completes.  HubSpot ~130 objects × 8-way
 * parallel describe lands ~10-30s; that becomes the wizard's perceived load
 * time — which is the correct UX (the wizard is, in fact, updating).
 *
 * IDEMPOTENT BY DESIGN.  The pipeline overlays existing rows; the transition
 * guard (was-false → now-true) keeps repeat saves (renames, config tweaks)
 * from re-firing.
 *
 * FAILURE ISOLATION.  Pipeline failure does NOT undo the Save.  Operator can
 * re-run via the standalone `IntegrationRefreshConnectorSchema` GraphQL
 * mutation if needed.  The save still returns true even on pipeline failure.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ALGORITHM GAPS — DEFERRED FOR FOLLOWUP PR (not Phase 0 PR1)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Phase 0 ships the OVERLAY-ADD half of the algorithm: discovered fields
 * the IO doesn't already know about get added with `MetadataSource='Discovered'`.
 * The full canonical algorithm has more steps; (a) and (d) remain genuine
 * follow-up deferrals because they require additional schema + UI wiring,
 * while (b) is now IMPLEMENTED and (c) is largely mooted (see below):
 *
 *   (a) DECLARED-BUT-MISSING-IN-INSTANCE → DEPRECATED.  When the Declared
 *       catalog has a field for table X, but THIS customer's live introspect
 *       doesn't return that field, mark it deprecated FOR THIS COMPANY
 *       INTEGRATION only (other tenants still see Active).  This is per-
 *       instance state — needs either a new junction (CompanyIntegration ×
 *       IntegrationObjectField with Status) or a Configuration JSON listing
 *       on CompanyIntegration.  Currently NOT implemented: existing IOFs
 *       stay Active even when missing from the live instance.
 *
 *   (b) AI PK INFERENCE for custom tables.  IMPLEMENTED.  When a Discovered
 *       table has no explicit PK marker, the SoftPKClassifier runs
 *       universal-convention → naming → statistical → LLM.  The LLM tier's
 *       callback IS wired here: `buildIntegrationLLMPKCallback(user)` is built
 *       below and passed into the pipeline as `LLMInference`, so when explicit
 *       + naming + statistical all fail, an LLM proposes a (potentially
 *       composite) PK from the field schema + sample rows.  (The callback can
 *       still return undefined if no AI model resolves, in which case the LLM
 *       tier degrades to a no-op — but the wiring itself is no longer a gap.)
 *
 *   (c) DROP IF NO PK DETERMINABLE.  Largely MOOTED.  The original concern was
 *       that an IO ending with `Confident=false` would persist as a PK-less row
 *       polluting the catalog, so canonical behavior would DELETE it.  With
 *       SoftPKClassifier's now-default synthetic-PK fallback, almost nothing
 *       reaches `Confident=false` — a synthetic identifier is emitted as the
 *       last resort — so the drop-if-no-PK path is rarely if ever exercised.
 *       Not implemented as an explicit delete, but no longer a practical gap.
 *
 *   (d) DETAILED PROGRESS UI in the wizard.  Today the wizard shows a
 *       generic "Saving..." spinner while the pipeline runs.  Operators
 *       want plain-English step indicators ("Discovering tables...",
 *       "Analyzing 47 fields for Contacts...", "Inferring primary key
 *       for custom_quote_item...").  Needs an Angular wizard update +
 *       either SSE/WebSocket progress streaming or polling.  Pre-existing
 *       Angular dashboards build issues on this branch block that work
 *       (out of Phase 0 PR scope).
 */
@RegisterClass(BaseEntity, 'MJ: Company Integrations')
export class MJCompanyIntegrationEntityServer extends MJCompanyIntegrationEntity {
    /**
     * Transient (never persisted) opt-out: when true, activating this connection does NOT run the
     * schema refresh inside `Save()`. Set it only when the CALLER is going to run the refresh itself
     * — `IntegrationCreateConnection` does exactly that for `awaitSchemaRefresh: false`.
     *
     * Two reasons the caller sometimes has to own it:
     *
     *  1. LATENCY. The refresh below is awaited, so a create mutation costs one full live introspect
     *     (minutes on a large catalog) no matter what the caller asked for. A caller that wants to
     *     hand the client a tailable run ID and return immediately cannot do that while this fires.
     *
     *  2. ROLLBACK SAFETY. `IntegrationCreateConnection` saves the connection, THEN optionally runs a
     *     live connection test, and deletes both the CompanyIntegration and its Credential if that
     *     test fails. A refresh fired from inside the Save has already written IntegrationObject /
     *     IntegrationObjectField rows for a connection that is about to be deleted. Deferring the
     *     refresh past the rollback decision means a rejected connection leaves nothing behind.
     *
     * Default false, so every other path (wizard Finish via a direct entity edit, the Update
     * mutation, any internal code that flips IsActive) keeps the awaited behaviour unchanged.
     */
    public SuppressActivationSchemaRefresh: boolean = false;

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // Snapshot the pre-save IsActive value so we can detect the transition
        // AFTER `super.Save()` returns successfully.  When the row is new
        // (`!this.IsSaved`), prior is `false` by default — the framework's
        // IsActive defaults to false for new rows and the wizard explicitly
        // flips it to true on Finish.
        const priorIsActive = this.IsSaved
            ? !!this.GetFieldByName('IsActive').OldValue
            : false;
        const nowIsActive = !!this.IsActive;
        const transitionedToActive = !priorIsActive && nowIsActive;

        const saved = await super.Save(options);
        if (!saved) return false;

        if (transitionedToActive && this.SuppressActivationSchemaRefresh) {
            // The caller owns the refresh (see SuppressActivationSchemaRefresh). Logged rather than
            // silent, because "activated but no schema appeared" is otherwise a confusing state to
            // debug from the server log alone.
            LogStatus(
                `[MJCompanyIntegrationEntityServer] IsActive false→true on ${this.Integration ?? this.ID} ` +
                `(${this.ID}); activation schema refresh SUPPRESSED at the caller's request — the caller ` +
                `is running it instead.`
            );
        } else if (transitionedToActive) {
            // AWAIT the pipeline — the wizard's Finish button stays in its
            // "Saving…" state until the schema refresh completes, so the
            // operator sees real visual feedback during the actual work
            // instead of an instant fake-done.  Pipeline failure is logged
            // and surfaced via LatestResult but does NOT undo the activation
            // — the connection is still saved; only the schema discovery
            // failed and can be retried via IntegrationRefreshConnectorSchema.
            try {
                await this.fireSchemaRefreshPipeline();
            } catch (err) {
                LogError(`[MJCompanyIntegrationEntityServer] Schema refresh pipeline error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        return true;
    }

    /**
     * Resolves the registered connector for this CompanyIntegration, runs the
     * Phase 0 v5.39.x pipeline, and refreshes the in-memory caches so the next
     * read sees the newly-persisted IO/IOF rows.
     */
    private async fireSchemaRefreshPipeline(): Promise<void> {
        const user: UserInfo | undefined = this.ContextCurrentUser;
        if (!user) {
            LogStatus(`[MJCompanyIntegrationEntityServer] Schema refresh skipped for ${this.ID}: no ContextCurrentUser on entity`);
            return;
        }
        // `ProviderToUse` is typed `IEntityDataProvider`; the pipeline/engine APIs
        // want the broader `IMetadataProvider`. The concrete server provider
        // implements both, but the two interfaces don't structurally overlap, so a
        // single `as` won't compile — narrow to `as IMetadataProvider` via unknown.
        const provider: IMetadataProvider | undefined = this.ProviderToUse as unknown as IMetadataProvider | undefined;

        LogStatus(`[MJCompanyIntegrationEntityServer] IsActive false→true detected on ${this.Integration ?? this.ID} (${this.ID}); firing schema refresh pipeline.`);

        // Make sure the IntegrationEngine cache is hot so ConnectorFactory.Resolve
        // can look up the registered class for this Integration.
        await IntegrationEngine.Instance.Config(false, user, provider);

        // Load the parent Integration row to feed ConnectorFactory.Resolve.
        const rv = new RunView();
        const integResult = await rv.RunView<MJIntegrationEntity>({
            EntityName: 'MJ: Integrations',
            ExtraFilter: `ID='${this.IntegrationID}'`,
            ResultType: 'entity_object',
            MaxRows: 1,
        }, user);
        const integration = integResult.Success ? integResult.Results[0] : undefined;
        if (!integration) {
            LogError(`[MJCompanyIntegrationEntityServer] Integration row not found for IntegrationID=${this.IntegrationID}; pipeline skipped.`);
            return;
        }

        let connector;
        try {
            connector = ConnectorFactory.Resolve(integration);
        } catch (resolveErr) {
            LogError(`[MJCompanyIntegrationEntityServer] No connector registered for ClassName=${integration.ClassName}: ${resolveErr instanceof Error ? resolveErr.message : String(resolveErr)}`);
            return;
        }

        // Build the LLM PK callback so SoftPKClassifier's LLM tier can run
        // (the 4th tier in the cascade — universal → naming → statistical → LLM
        // → synthetic).  Without this callback the LLM tier is silently skipped
        // and any custom table without an obvious convention/heuristic match
        // falls through to the synthetic-PK fallback (see StagePKClassify in
        // IntegrationConnectorCreationPipeline.ts); wiring it gives such tables
        // a chance at a more meaningful AI-proposed key first.
        const llmInference = await buildIntegrationLLMPKCallback(user);

        // The pipeline takes a fully-typed CompanyIntegration; this class extends
        // MJCompanyIntegrationEntity, so `this` satisfies the contract directly.
        const pipeline = new IntegrationConnectorCreationPipeline();
        const result = await pipeline.Run({
            Connector: connector,
            CompanyIntegration: this,
            ContextUser: user,
            Provider: provider,
            ConsoleMirror: true,
            TriggerType: 'Manual',
            LLMInference: llmInference ?? undefined,
        });

        // Pipeline persists IO/IOF rows — refresh metadata caches so subsequent
        // reads see them without an MJAPI restart.
        try { await (provider ?? new Metadata()).Refresh(); } catch { /* best-effort */ }
        try { await IntegrationEngine.Instance.Config(true, user, provider); } catch { /* best-effort */ }

        LogStatus(
            `[MJCompanyIntegrationEntityServer] Schema refresh complete for ${this.Integration ?? this.ID}: ` +
            `${result.PersistResult?.ObjectsCreated ?? 0} created, ${result.PersistResult?.ObjectsUpdated ?? 0} updated, ` +
            `${result.PersistResult?.FieldsCreated ?? 0} fields created, ${result.PersistResult?.FieldsUpdated ?? 0} fields updated, ` +
            `${result.UnresolvedObjects.length} IOs PK-unresolved (deferred for additionalSchemaInfo authoring).`
        );
    }
}
