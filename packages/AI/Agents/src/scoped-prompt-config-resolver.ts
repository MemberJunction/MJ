import { LogStatus } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import { MJScopedPromptConfigEntity } from "@memberjunction/core-entities";
import { AIEngine } from "@memberjunction/aiengine";
import { SecondaryScopeValue } from "@memberjunction/ai-core-plus";
import { PromptComponentScope } from "./prompt-component-resolver";

/** Statuses eligible for resolution. Archived configs are excluded. */
const RESOLVABLE_STATUSES = new Set<string>(["Active", "Provisional"]);

/**
 * The subset of `AIPromptParams` fields a resolved config writes onto. Kept as a minimal
 * structural shape (rather than importing `AIPromptParams`) so the apply step is unit-testable
 * and free of a hard prompt-runtime dependency — `AIPromptParams` is structurally assignable to it.
 */
export interface ScopedPromptConfigTarget {
    override?: { modelId?: string; vendorId?: string };
    configurationId?: string;
    effortLevel?: number;
    additionalParameters?: Record<string, unknown>;
}

/**
 * ScopedPromptConfigResolver — the run-settings sibling of {@link PromptComponentResolver}.
 * Picks the single most-specific in-scope `MJ: Scoped Prompt Configs` row for a prompt (whole-row
 * wins: SecondaryScopes match (+4) > PrimaryScopeRecord (+2) > global (+1), tie-broken by
 * `Priority`), then overlays its non-null columns onto the prompt run's params.
 *
 * **Pluggable (ClassFactory).** Obtained via
 * `MJGlobal.Instance.ClassFactory.CreateInstance(ScopedPromptConfigResolver)` — base by default, or
 * a `@RegisterClass(ScopedPromptConfigResolver)` subclass. Protected hooks
 * ({@link getCandidates}, {@link isInScope}, {@link score}) are the override points, mirroring
 * the parts resolver.
 */
export class ScopedPromptConfigResolver {
    /** Resolve the single winning config for `promptID` under `scope`, or null if none in scope. */
    public Resolve(promptID: string, scope: PromptComponentScope): MJScopedPromptConfigEntity | null {
        const inScope = this.getCandidates(promptID).filter((c) => this.isInScope(c, scope));
        if (inScope.length === 0) return null;
        inScope.sort((a, b) => this.score(b) - this.score(a) || b.Priority - a.Priority);
        return inScope[0];
    }

    // ── Protected hooks (override points) ──────────────────────────────────────

    /** Candidate configs for a prompt: same PromptID + resolvable Status. */
    protected getCandidates(promptID: string): MJScopedPromptConfigEntity[] {
        return AIEngine.Instance.ScopedPromptConfigs.filter(
            (c) => UUIDsEqual(c.PromptID, promptID) && RESOLVABLE_STATUSES.has(c.Status),
        );
    }

    /** Is this config compatible with the run scope? (cascading: it may only require dims the run has) */
    protected isInScope(c: MJScopedPromptConfigEntity, scope: PromptComponentScope): boolean {
        if (c.PrimaryScopeRecordID) {
            if (
                !scope.primaryScopeRecordId ||
                c.PrimaryScopeRecordID.toLowerCase() !== scope.primaryScopeRecordId.toLowerCase()
            ) {
                return false;
            }
            if (
                c.PrimaryScopeEntityID &&
                scope.primaryScopeEntityId &&
                !UUIDsEqual(c.PrimaryScopeEntityID, scope.primaryScopeEntityId)
            ) {
                return false;
            }
        }
        const cfgScopes = this.parseScopes(c.SecondaryScopes);
        for (const key of Object.keys(cfgScopes)) {
            const runValue = scope.secondaryScopes?.[key];
            if (runValue === undefined || String(runValue) !== String(cfgScopes[key])) {
                return false;
            }
        }
        return true;
    }

    /** Specificity score: SecondaryScopes match (+4) > PrimaryScopeRecord (+2) > Global (+1). */
    protected score(c: MJScopedPromptConfigEntity): number {
        let s = 1;
        if (c.PrimaryScopeRecordID) s += 2;
        if (Object.keys(this.parseScopes(c.SecondaryScopes)).length > 0) s += 4;
        return s;
    }

    protected parseScopes(raw: string | null): Record<string, unknown> {
        if (!raw) return {};
        try {
            const o = JSON.parse(raw);
            return o && typeof o === "object" ? (o as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
}

/**
 * Overlay a resolved `ScopedPromptConfig` onto a prompt run's params. Only sets values the caller
 * has NOT already specified (runtime-explicit overrides win); null columns are skipped (inherit the
 * prompt default). Model/vendor → `override.{modelId,vendorId}`; configuration → `configurationId`;
 * effort → `effortLevel`; the sampling knobs → `additionalParameters` (existing keys win). Returns
 * the applied config (for observability) or null when nothing resolved.
 */
export function ApplyScopedPromptConfig(
    resolver: ScopedPromptConfigResolver,
    promptID: string,
    scope: PromptComponentScope,
    params: ScopedPromptConfigTarget,
): MJScopedPromptConfigEntity | null {
    const cfg = resolver.Resolve(promptID, scope);
    if (!cfg) return null;

    if (cfg.ModelID && !params.override?.modelId) {
        params.override = { ...(params.override ?? {}), modelId: cfg.ModelID };
        if (cfg.VendorID && !params.override.vendorId) {
            params.override.vendorId = cfg.VendorID;
        }
    }
    if (cfg.ConfigurationID && params.configurationId == null) {
        params.configurationId = cfg.ConfigurationID;
    }
    if (cfg.EffortLevel != null && params.effortLevel == null) {
        params.effortLevel = cfg.EffortLevel;
    }

    // Sampling knobs → additionalParameters (existing/runtime keys win).
    const knobs: Record<string, unknown> = {};
    if (cfg.Temperature != null) knobs.temperature = cfg.Temperature;
    if (cfg.TopP != null) knobs.topP = cfg.TopP;
    if (cfg.TopK != null) knobs.topK = cfg.TopK;
    if (cfg.MinP != null) knobs.minP = cfg.MinP;
    if (cfg.FrequencyPenalty != null) knobs.frequencyPenalty = cfg.FrequencyPenalty;
    if (cfg.PresencePenalty != null) knobs.presencePenalty = cfg.PresencePenalty;
    if (cfg.Seed != null) knobs.seed = cfg.Seed;
    if (cfg.StopSequences) knobs.stopSequences = cfg.StopSequences;
    if (cfg.ResponseFormat) knobs.responseFormat = cfg.ResponseFormat;
    if (Object.keys(knobs).length > 0) {
        params.additionalParameters = { ...knobs, ...(params.additionalParameters ?? {}) };
    }

    LogStatus(
        `ScopedPromptConfigResolver: applied config ${cfg.ID} for prompt ${promptID} ` +
            `(scope record=${scope.primaryScopeRecordId ?? "global"}` +
            `${cfg.ModelID ? `, model=${cfg.ModelID}` : ""})`,
    );
    return cfg;
}

// Re-export the shared scope shape for convenience.
export type { PromptComponentScope, SecondaryScopeValue };
