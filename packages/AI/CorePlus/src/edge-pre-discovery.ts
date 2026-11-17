import { IsPlainObject, NormalizeUUID } from '@memberjunction/global';

/**
 * Key under `ExecuteAgentParams.data` where the client's lazy Edge AI pre-discovery
 * worker attaches its untrusted advisory hint.
 */
export const EDGE_PRE_DISCOVERY_DATA_KEY = 'EdgePreDiscoveryHint';

/** Quantized bi-encoder model ID verified in the Edge AI PoC (`32 MB`, ~5ms WASM). */
export const EDGE_PRE_DISCOVERY_BI_ENCODER_MODEL = 'Xenova/bge-small-en-v1.5';

/** Quantized cross-encoder model ID verified in the Edge AI PoC (`22 MB`, ~25ms WASM batch=5). */
export const EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL = 'Xenova/ms-marco-MiniLM-L-6-v2';

/** Combined model stamp identifying the default two-stage WASM pre-discovery pipeline. */
export const EDGE_PRE_DISCOVERY_DEFAULT_MODEL_ID =
    `${EDGE_PRE_DISCOVERY_BI_ENCODER_MODEL}@q8+${EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL}@q8`;

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

/**
 * Maps an `ms-marco-MiniLM-L-6-v2` raw cross-encoder logit to `[0, 1]` such that
 * the PoC high-precision threshold (`logit >= -2.0`) maps to `>= 0.85` (`~0.858`),
 * while lower logits (`-3.0`, `-4.0`) sit well below `0.85`.
 */
export function CalibrateEdgeLogitToConfidence(logit: number): number {
    if (!Number.isFinite(logit)) {
        return 0;
    }
    const calibrated = 1 / (1 + Math.exp(-(logit + 3.8)));
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
    allowedAgents: ReadonlySet<string> | ReadonlyArray<{ ID: string }>
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
            sanitized.Confidence = CalibrateEdgeLogitToConfidence(sanitized.TopLogit);
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
    minLogit: number = EDGE_PRE_DISCOVERY_LOGIT_THRESHOLD
): boolean {
    if (!hint || !hint.SuggestedAgentId) {
        return false;
    }
    if (typeof hint.TopLogit === 'number') {
        if (!Number.isFinite(hint.TopLogit) || hint.TopLogit < minLogit) {
            return false;
        }
        const effectiveConf = typeof hint.Confidence === 'number' && Number.isFinite(hint.Confidence)
            ? hint.Confidence
            : CalibrateEdgeLogitToConfidence(hint.TopLogit);
        return effectiveConf >= minConfidence;
    }
    return typeof hint.Confidence === 'number'
        && Number.isFinite(hint.Confidence)
        && hint.Confidence >= minConfidence;
}
