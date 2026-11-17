import { ApplyPlattCalibration, type PlattCalibration } from '@memberjunction/ai';
import { IsPlainObject, NormalizeUUID } from '@memberjunction/global';
import type { DecisionAnsweringModel, DecisionCalibrationKey } from './decision-calibration';

/**
 * Key under `ExecuteAgentParams.data` where the client's lazy Edge AI pre-discovery
 * worker attaches its untrusted advisory hint.
 */
export const EDGE_PRE_DISCOVERY_DATA_KEY = 'EdgePreDiscoveryHint';

/** Quantized bi-encoder model ID verified in the Edge AI PoC (`32 MB`, ~5ms WASM). */
export const EDGE_PRE_DISCOVERY_BI_ENCODER_MODEL = 'Xenova/bge-small-en-v1.5';

/** Quantized cross-encoder model ID verified in the Edge AI PoC (`22 MB`, ~25ms WASM batch=5). */
export const EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL = 'Xenova/ms-marco-MiniLM-L-6-v2';

/** Quantized resolved cross-encoder model identifier matching metadata calibration rows. */
export const EDGE_PRE_DISCOVERY_CROSS_ENCODER_RESOLVED_MODEL = `${EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL}@q8`;

/** Combined model stamp identifying the default two-stage WASM pre-discovery pipeline. */
export const EDGE_PRE_DISCOVERY_DEFAULT_MODEL_ID =
    `${EDGE_PRE_DISCOVERY_BI_ENCODER_MODEL}@q8+${EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL}@q8`;

/** Metadata `MJ: AI Models` name carrying the cross-encoder's `ModelConfiguration.Decision.Calibrations`. */
export const EDGE_PRE_DISCOVERY_CALIBRATION_MODEL = 'ms-marco-MiniLM-L-6-v2 (Local)';

/** Calibration `Use` key in `ModelConfiguration.Decision.Calibrations` for edge cross-encoder reranking. */
export const EDGE_PRE_DISCOVERY_CALIBRATION_USE = 'edge-agent-discovery';

/** Calibration `Question` key in `ModelConfiguration.Decision.Calibrations` for top-candidate fit. */
export const EDGE_PRE_DISCOVERY_CALIBRATION_QUESTION = 'matches';

/** Lookup key passed to `AIEngineBase.FindDecisionCalibration` for edge agent pre-discovery. */
export const EDGE_PRE_DISCOVERY_CALIBRATION_KEY: DecisionCalibrationKey = Object.freeze({
    Use: EDGE_PRE_DISCOVERY_CALIBRATION_USE,
    Question: EDGE_PRE_DISCOVERY_CALIBRATION_QUESTION,
});

/**
 * Fallback Platt fit (`N=75` PoC) used when `AIEngineBase` is not yet configured or the local DB
 * has not yet synced `metadata/ai-models/.edge-discovery-models.json`.
 */
export const EDGE_PRE_DISCOVERY_DEFAULT_PLATT_CALIBRATION: PlattCalibration = Object.freeze({
    A: 1.0,
    B: 3.8,
});

/**
 * Calibrated cross-encoder logit threshold from the empirical MJ PoC (`N=75`):
 * `logit >= -2.0` achieved 100.0% precision (20/20) and 0.0% false triggers across all 15 `none` cases.
 */
export const EDGE_PRE_DISCOVERY_LOGIT_THRESHOLD = -2.0;

/** Minimum calibrated confidence required for direct pre-discovery suggestion (`>= 0.85`). */
export const EDGE_PRE_DISCOVERY_MIN_CONFIDENCE = 0.85;

/** Default number of top bi-encoder candidates forwarded to the cross-encoder / hint. */
export const EDGE_PRE_DISCOVERY_TOP_K = 5;

/** Hard upper bound on candidate IDs accepted from an untrusted client hint. */
export const EDGE_PRE_DISCOVERY_MAX_CANDIDATES = 25;

/**
 * Untrusted advisory hint produced by client-side local ONNX/WASM pre-discovery
 * (`bge-small-en-v1.5` top-5 narrowing + `ms-marco-MiniLM-L-6-v2` reranking).
 *
 * **SERVER GUARD OF TRUTH**: Every ID in this hint MUST be re-verified server-side
 * against `AIAgentPermissionHelper.HasPermission`, `AllowedAgentIDs`, and `IsRunnable` /
 * `IsDirectlyDiscoverable`. Unauthorized, non-existent, or malformed IDs are silently
 * discarded, and uncertain/absent hints fall back to standard server discovery.
 */
export interface EdgePreDiscoveryHint {
    /** Ranked candidate agent IDs from client bi-encoder narrowing (best first). */
    CandidateAgentIds: string[];
    /** Optional high-confidence top-1 agent ID when local cross-encoder clears threshold. */
    SuggestedAgentId?: string;
    /** Calibrated confidence score in `[0, 1]`. */
    Confidence?: number;
    /** Raw cross-encoder logit for the top-ranked candidate, when reranked. */
    TopLogit?: number;
    /** Identifier of the local model pipeline that produced the hint. */
    ModelId?: string;
}

/** Minimal calibration lookup contract satisfied by `AIEngineBase` / `AIEngine`. */
export interface EdgeDecisionCalibrationLookup {
    FindDecisionCalibration(key: DecisionCalibrationKey, answeredBy: DecisionAnsweringModel): PlattCalibration | null;
}

/**
 * Extracts the resolved cross-encoder model pair `(ModelName, ResolvedModel)` used to look up
 * `ModelConfiguration.Decision.Calibrations` in metadata for a hint's `ModelId`.
 */
export function EdgeDiscoveryAnsweredBy(modelId?: string | null): DecisionAnsweringModel {
    const trimmed = modelId?.trim() ?? '';
    let resolved = EDGE_PRE_DISCOVERY_CROSS_ENCODER_RESOLVED_MODEL;
    if (trimmed.length > 0) {
        const plusIdx = trimmed.indexOf('+');
        const candidate = plusIdx >= 0 ? trimmed.slice(plusIdx + 1).trim() : trimmed;
        if (candidate.length > 0) {
            resolved = candidate;
        }
    }
    return {
        ModelName: EDGE_PRE_DISCOVERY_CALIBRATION_MODEL,
        ResolvedModel: resolved,
    };
}

/**
 * Resolves the edge cross-encoder Platt calibration from metadata via `FindDecisionCalibration`,
 * falling back cleanly to {@link EDGE_PRE_DISCOVERY_DEFAULT_PLATT_CALIBRATION} when `AIEngineBase`
 * is unloaded or the local DB has not yet synced `.edge-discovery-models.json`.
 */
export function ResolveEdgePreDiscoveryCalibration(
    lookup?: EdgeDecisionCalibrationLookup | null,
    modelId?: string | null
): PlattCalibration {
    if (!lookup) {
        return EDGE_PRE_DISCOVERY_DEFAULT_PLATT_CALIBRATION;
    }
    try {
        const fit = lookup.FindDecisionCalibration(EDGE_PRE_DISCOVERY_CALIBRATION_KEY, EdgeDiscoveryAnsweredBy(modelId));
        if (fit && Number.isFinite(fit.A) && Number.isFinite(fit.B)) {
            return fit;
        }
    } catch {
        // Ignore unconfigured/permission-constrained engine errors and use the PoC fallback fit.
    }
    return EDGE_PRE_DISCOVERY_DEFAULT_PLATT_CALIBRATION;
}

/**
 * Maps an `ms-marco-MiniLM-L-6-v2` raw cross-encoder logit to `[0, 1]` by converting the raw
 * logit to a base probability via `sigmoid(logit)` and applying {@link ApplyPlattCalibration}.
 * With the PoC fit `{ A: 1.0, B: 3.8 }`, `logit >= -2.0` maps to `>= 0.85` (`~0.8581`),
 * while lower logits (`-3.0`, `-5.0`) sit well below `0.85`.
 */
export function CalibrateEdgeLogitToConfidence(logit: number, calibration?: PlattCalibration | null): number {
    if (!Number.isFinite(logit)) {
        return 0;
    }
    const effectiveCalibration =
        calibration && Number.isFinite(calibration.A) && Number.isFinite(calibration.B)
            ? calibration
            : EDGE_PRE_DISCOVERY_DEFAULT_PLATT_CALIBRATION;
    const rawProb = 1 / (1 + Math.exp(-logit));
    const calibrated = ApplyPlattCalibration(rawProb, effectiveCalibration);
    return Math.max(0, Math.min(1, Number(calibrated.toFixed(4))));
}

/**
 * Normalizes an allowed-agent collection into a lowercase/trimmed UUID Set for O(1) verification.
 */
function buildAllowedUuidSet(
    allowedAgents: ReadonlySet<string> | ReadonlyArray<{ ID: string }>
): Set<string> {
    const allowed = new Set<string>();
    if (allowedAgents instanceof Set) {
        for (const id of allowedAgents) {
            if (typeof id === 'string') {
                const norm = NormalizeUUID(id);
                if (norm.length > 0) {
                    allowed.add(norm);
                }
            }
        }
        return allowed;
    }
    for (const agent of allowedAgents as ReadonlyArray<{ ID: string }>) {
        if (agent && typeof agent.ID === 'string') {
            const norm = NormalizeUUID(agent.ID);
            if (norm.length > 0) {
                allowed.add(norm);
            }
        }
    }
    return allowed;
}

/**
 * Reads the raw untrusted `EdgePreDiscoveryHint` value from `ExecuteAgentParams.data`.
 */
export function ReadEdgePreDiscoveryHint(data: Record<string, unknown> | undefined): unknown {
    return data?.[EDGE_PRE_DISCOVERY_DATA_KEY];
}

/**
 * Sanitizes an untrusted client `EdgePreDiscoveryHint` against a server-authoritative set of
 * permitted, runnable, directly-discoverable agent IDs.
 *
 * - Rejects non-objects and malformed fields without throwing.
 * - Silently discards any `CandidateAgentIds` or `SuggestedAgentId` not present in `allowedAgents`.
 * - Deduplicates `CandidateAgentIds` preserving order and caps length at {@link EDGE_PRE_DISCOVERY_MAX_CANDIDATES}.
 * - Clears `SuggestedAgentId` (along with `Confidence`/`TopLogit`) whenever `SuggestedAgentId` is not permitted.
 * - Returns `null` if neither any permitted candidate ID nor a permitted `SuggestedAgentId` remains.
 */
export function SanitizeEdgePreDiscoveryHint(
    raw: unknown,
    allowedAgents: ReadonlySet<string> | ReadonlyArray<{ ID: string }>,
    calibration?: PlattCalibration | null
): EdgePreDiscoveryHint | null {
    if (!IsPlainObject(raw)) {
        return null;
    }

    const allowed = buildAllowedUuidSet(allowedAgents);
    if (allowed.size === 0) {
        return null;
    }

    const rawCandidates = Array.isArray(raw.CandidateAgentIds) ? raw.CandidateAgentIds : [];
    const seen = new Set<string>();
    const candidateIds: string[] = [];

    for (const entry of rawCandidates) {
        if (typeof entry !== 'string') {
            continue;
        }
        const norm = NormalizeUUID(entry);
        if (!norm || !allowed.has(norm) || seen.has(norm)) {
            continue;
        }
        seen.add(norm);
        candidateIds.push(entry.trim());
        if (candidateIds.length >= EDGE_PRE_DISCOVERY_MAX_CANDIDATES) {
            break;
        }
    }

    let suggestedAgentId: string | undefined;
    if (typeof raw.SuggestedAgentId === 'string') {
        const normSuggested = NormalizeUUID(raw.SuggestedAgentId);
        if (normSuggested && allowed.has(normSuggested)) {
            suggestedAgentId = raw.SuggestedAgentId.trim();
        }
    }

    if (candidateIds.length === 0 && !suggestedAgentId) {
        return null;
    }

    const sanitized: EdgePreDiscoveryHint = {
        CandidateAgentIds: candidateIds,
    };

    if (suggestedAgentId) {
        sanitized.SuggestedAgentId = suggestedAgentId;
        if (typeof raw.TopLogit === 'number' && Number.isFinite(raw.TopLogit)) {
            sanitized.TopLogit = raw.TopLogit;
        }
        if (typeof raw.Confidence === 'number' && Number.isFinite(raw.Confidence) && raw.Confidence >= 0 && raw.Confidence <= 1) {
            sanitized.Confidence = raw.Confidence;
        } else if (sanitized.TopLogit !== undefined) {
            sanitized.Confidence = CalibrateEdgeLogitToConfidence(sanitized.TopLogit, calibration);
        }
    }

    if (typeof raw.ModelId === 'string') {
        const trimmedModel = raw.ModelId.trim();
        if (trimmedModel.length > 0) {
            sanitized.ModelId = trimmedModel.slice(0, 200);
        }
    }

    return sanitized;
}

/**
 * Returns `true` only when a server-sanitized {@link EdgePreDiscoveryHint} carries a permitted
 * `SuggestedAgentId` AND clears both the logit threshold (when `TopLogit` is provided) and the
 * calibrated confidence threshold (`>= 0.85`).
 */
export function IsEdgePreDiscoveryHintConfident(
    hint: EdgePreDiscoveryHint | null | undefined,
    minConfidence: number = EDGE_PRE_DISCOVERY_MIN_CONFIDENCE,
    minLogit: number = EDGE_PRE_DISCOVERY_LOGIT_THRESHOLD,
    calibration?: PlattCalibration | null
): boolean {
    if (!hint || !hint.SuggestedAgentId) {
        return false;
    }
    if (typeof hint.TopLogit === 'number') {
        if (!Number.isFinite(hint.TopLogit) || hint.TopLogit < minLogit) {
            return false;
        }
        const effectiveConf = CalibrateEdgeLogitToConfidence(hint.TopLogit, calibration);
        return effectiveConf >= minConfidence;
    }
    return typeof hint.Confidence === 'number'
        && Number.isFinite(hint.Confidence)
        && hint.Confidence >= minConfidence;
}
