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
 * The full canonical algorithm has three more steps that need a follow-up PR
 * because they require additional schema + AI wiring:
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
 *   (b) AI PK INFERENCE for custom tables.  When a Discovered table has no
 *       explicit PK marker, the SoftPKClassifier today runs
 *       universal-convention → naming → statistical → LLM, but the LLM tier
 *       takes a callback that we DON'T currently wire (`opts.llmInference`
 *       is undefined).  Wire to AIEngine so when explicit + naming +
 *       statistical all fail, an LLM proposes a (potentially composite)
 *       PK from the field schema + sample rows.
 *
 *   (c) DROP IF NO PK DETERMINABLE.  Today an IO with `Confident=false`
 *       persists as a row with no PK (entity codegen gated downstream).
 *       Canonical behavior: DELETE the IO row entirely so a fully
 *       unidentifiable table doesn't pollute the catalog.  Currently NOT
 *       implemented — call sites would need to handle "row vanished after
 *       refresh" gracefully.
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

        if (transitionedToActive) {
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
        const provider: IMetadataProvider | undefined = (this as unknown as { ProviderToUse?: IMetadataProvider }).ProviderToUse;

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
            connector = ConnectorFactory.Resolve(integration as unknown as Parameters<typeof ConnectorFactory.Resolve>[0]);
        } catch (resolveErr) {
            LogError(`[MJCompanyIntegrationEntityServer] No connector registered for ClassName=${integration.ClassName}: ${resolveErr instanceof Error ? resolveErr.message : String(resolveErr)}`);
            return;
        }

        // Build the LLM PK callback so SoftPKClassifier's LLM tier can run
        // (the 4th tier in the cascade — universal → naming → statistical → LLM
        // → none).  Without this callback the LLM tier is silently skipped and
        // any custom table without an obvious convention/heuristic match comes
        // back as `Confident=false` → gets dropped by the pipeline (see
        // StagePKClassify in IntegrationConnectorCreationPipeline.ts).
        const llmInference = await buildIntegrationLLMPKCallback(user);

        // The pipeline takes a fully-typed CompanyIntegration; the entity instance
        // itself satisfies the contract (it IS the entity).
        const pipeline = new IntegrationConnectorCreationPipeline();
        const result = await pipeline.Run({
            Connector: connector,
            CompanyIntegration: this as unknown as Parameters<typeof pipeline.Run>[0]['CompanyIntegration'],
            ContextUser: user,
            Provider: provider,
            ConsoleMirror: true,
            TriggerType: 'Manual',
            LLMInference: llmInference ?? undefined,
        });

        // Pipeline persists IO/IOF rows — refresh metadata caches so subsequent
        // reads see them without an MJAPI restart.
        try { await new Metadata().Refresh(); } catch { /* best-effort */ }
        try { await IntegrationEngine.Instance.Config(true, user, provider); } catch { /* best-effort */ }

        LogStatus(
            `[MJCompanyIntegrationEntityServer] Schema refresh complete for ${this.Integration ?? this.ID}: ` +
            `${result.PersistResult?.ObjectsCreated ?? 0} created, ${result.PersistResult?.ObjectsUpdated ?? 0} updated, ` +
            `${result.PersistResult?.FieldsCreated ?? 0} fields created, ${result.PersistResult?.FieldsUpdated ?? 0} fields updated, ` +
            `${result.UnresolvedObjects.length} IOs PK-unresolved (deferred for additionalSchemaInfo authoring).`
        );
    }
}
