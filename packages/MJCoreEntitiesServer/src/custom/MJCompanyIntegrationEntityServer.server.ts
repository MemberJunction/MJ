import { RegisterClass } from '@memberjunction/global';
import {
    BaseEntity,
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
 * Server-side extension of MJCompanyIntegrationEntity that exposes
 * `RunSchemaRefreshPipeline()` — an explicitly-invoked run of
 * `IntegrationConnectorCreationPipeline` for this connection:
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
 * ───────────────────────────────────────────────────────────────────────────
 * NO IMPLICIT TRIGGER — DISCOVERY IS SOMETHING A CALLER ASKS FOR (#3738)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * This class used to override `Save()` and await the whole pipeline whenever
 * `IsActive` transitioned `false → true`.  That put an unbounded live scan of
 * the source — every object, every field, key inference, catalog write — inside
 * whatever HTTP request happened to write the row, and it fired for EVERY
 * writer of that transition, not only the resolvers that wanted it.  On a
 * ~354-object source it ran for tens of minutes on the single Node event loop,
 * and the create path reached it BEFORE the credential had been tested — so the
 * most expensive operation in the flow ran speculatively against a password
 * that might be wrong, and was thrown away when the connection rolled back.
 *
 * The trigger now lives with the callers that actually want a catalog:
 * `IntegrationCreateConnection` / `IntegrationUpdateConnection` /
 * `IntegrationReactivateConnection` (their `runSchemaRefresh` argument) and the
 * standalone `IntegrationRefreshConnectorSchema` mutation.  `Save()` saves.
 *
 * Nothing depended on the old hook having run: every consumer of the persisted
 * catalog (`IntegrationApplySchema`, `IntegrationApplyAll`,
 * `IntegrationApplyAllBatch`, `buildSchemaForConnector`) already falls back to
 * a live introspect when it finds no persisted IntegrationObject rows.
 *
 * IDEMPOTENT BY DESIGN.  The pipeline overlays existing rows, so a caller that
 * refreshes more often than strictly needed costs time, not correctness.
 *
 * FAILURE ISOLATION.  Failure throws out of this method and the caller decides.
 * The resolvers log it and leave the connection in place, since the operator
 * can always re-run `IntegrationRefreshConnectorSchema`.
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
     * Resolves the registered connector for this CompanyIntegration, runs the
     * Phase 0 v5.39.x pipeline, and refreshes the in-memory caches so the next
     * read sees the newly-persisted IO/IOF rows.
     *
     * EXPLICIT CALL ONLY.  Nothing on the save path invokes this — see the
     * class comment for why the `IsActive false→true` hook was removed (#3738).
     * A caller that wants a catalog asks for one, and owns the cost of doing so.
     */
    public async RunSchemaRefreshPipeline(): Promise<void> {
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
