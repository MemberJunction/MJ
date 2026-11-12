import {
    EntityFieldInfo,
    EntityInfo,
    IMetadataProvider,
    LogError,
    LogStatus,
    RunView,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIDecisionParams, AIPromptRunner, RunDecisionUse, type ShadowDecisionRunner } from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import {
    BuildLinkedRecordPrimaryKeyFilter,
    DetectReferencedRestrictedFieldsDeterministic,
    MergeRestrictedFieldsIntoAnchorMetadata,
    ParseConversationAnchorMetadata,
    type MJConversationEntity
} from '@memberjunction/core-entities';
import {
    AnsweredByOf,
    BuildRestrictedFieldQuestions,
    BuildRestrictedFieldState,
    CompareRestrictedFieldDecision,
    FlaggedFieldsFromVerdicts,
    GetRestrictedFieldClassifierDecisionMode,
    ReadRestrictedFieldVerdicts,
    RESTRICTED_FIELD_CLASSIFIER_USE
} from './RestrictedFieldDecision';

/**
 * Input passed to a semantic LLM classifier to determine whether an unanchored or
 * section-anchored comment is discussing any Field-Level Security (FLS) restricted fields.
 */
export interface RestrictedFieldClassifierPrompt {
    EntityName: string;
    EntityDisplayName: string;
    MessageText: string;
    AnchorType: MJConversationEntity['AnchorType'];
    AnchorKey: string | null;
    CandidateFields: ReadonlyArray<{
        Name: string;
        DisplayName: string;
        Description: string | null;
    }>;
}

/**
 * Callback signature for classifying whether a comment semantically discusses one or more
 * candidate FLS-restricted fields. Returns canonical `EntityFieldInfo.Name` strings.
 */
export type RestrictedFieldLLMClassifierCallback = (
    prompt: RestrictedFieldClassifierPrompt,
    contextUser: UserInfo
) => Promise<string[]>;

let customRestrictedFieldClassifier: RestrictedFieldLLMClassifierCallback | null = null;

/**
 * Registers (or clears with `null`) a custom semantic classifier callback for detecting
 * references to FLS-restricted fields in record comments. Used by tests and custom
 * enterprise classification policies; when `null`, the default `AIEngine` classifier runs.
 */
export function RegisterRestrictedFieldLLMClassifier(
    callback: RestrictedFieldLLMClassifierCallback | null
): void {
    customRestrictedFieldClassifier = callback;
}

/**
 * Returns the currently registered custom classifier callback, if any.
 */
export function GetRegisteredRestrictedFieldLLMClassifier(): RestrictedFieldLLMClassifierCallback | null {
    return customRestrictedFieldClassifier;
}

/**
 * Result of inspecting a comment message against the linked entity's Field-Level Security rules.
 */
export interface RestrictedFieldInspectionResult {
    /**
     * `false` when the authoring user is denied Read permission on a restricted field
     * referenced by their own comment (prevents probing or spoofing restricted fields).
     */
    Allowed: boolean;
    /** Human-readable refusal reason when `Allowed === false`. */
    Reason: string | null;
    /** Canonical `EntityFieldInfo.Name` values of all FLS-governed fields referenced by the comment. */
    DetectedFields: string[];
    /** Subset of `DetectedFields` that the authoring user is denied Read access to. */
    AuthorDeniedFields: string[];
}

/**
 * Inspects a comment (`messageText`) posted on an anchored conversation to detect whether it
 * references any FLS-governed fields on `entityInfo`, and stamps any newly detected field names
 * into `conversation.AnchorMetadataObject.restrictedFields`.
 *
 * Two-stage detection:
 * 1. **Stage 1 (Deterministic, 0ms)**: Checks direct field anchors (`AnchorType === 'Field'`),
 *    restricted field names/labels (`Name`, camelCase words, `DisplayName`), and actual restricted
 *    field values loaded from the linked record.
 * 2. **Stage 2 (Semantic LLM Classifier)**: If `entityInfo` has remaining unmatched FLS fields and
 *    `messageText` is non-empty, invokes either the registered `RestrictedFieldLLMClassifierCallback`
 *    or a lightweight `AIEngine` language model to detect semantic/paraphrased references
 *    (for example `"making six figures"` → `Salary`).
 */
export async function InspectAndStampRestrictedFieldsForComment(params: {
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
    Conversation: MJConversationEntity;
    EntityInfo: EntityInfo;
    MessageText: string | null | undefined;
    RecordValues?: Readonly<Record<string, unknown>> | null;
    SkipLLMStage?: boolean;
}): Promise<RestrictedFieldInspectionResult> {
    const { Provider, ContextUser, Conversation, EntityInfo: entityInfo, MessageText } = params;

    // fls-guard: inspect and stamp restrictedFields on anchored conversation comments
    if (!entityInfo.FieldLevelSecurityApplies) {
        return {
            Allowed: true,
            Reason: null,
            DetectedFields: [],
            AuthorDeniedFields: []
        };
    }

    const restrictedFields = entityInfo.Fields.filter((f) => f.HasFieldPermissions);
    if (restrictedFields.length === 0) {
        return {
            Allowed: true,
            Reason: null,
            DetectedFields: [],
            AuthorDeniedFields: []
        };
    }

    // Security invariant: never value-match against fields the authoring user is denied Read access to.
    // An author who cannot read a field cannot be disclosing its value from the record, and matching their
    // comment text against hidden system-loaded values would create a yes/no guessing oracle.
    // Only fields the author CAN read are eligible for record-value matching (to stamp restrictedFields
    // so downstream readers who lack access to that field do not see the thread).
    const deniedLower = entityInfo.GetDeniedReadFields(ContextUser);
    const authorReadableRestrictedFields = restrictedFields.filter(
        (f) => !deniedLower.has(f.Name.trim().toLowerCase())
    );

    let readableRecordValues: Record<string, unknown> | null = null;
    if (authorReadableRestrictedFields.length > 0 && (MessageText ?? '').trim().length > 0) {
        const rawRecordValues =
            params.RecordValues ??
            (Conversation.LinkedRecordID
                ? await loadLinkedRecordRestrictedFieldValues(
                      Provider,
                      ContextUser,
                      entityInfo,
                      Conversation.LinkedRecordID,
                      authorReadableRestrictedFields
                  )
                : null);
        if (rawRecordValues) {
            readableRecordValues = {};
            for (const f of authorReadableRestrictedFields) {
                if (Object.prototype.hasOwnProperty.call(rawRecordValues, f.Name)) {
                    readableRecordValues[f.Name] = rawRecordValues[f.Name];
                }
            }
        }
    }

    // Stage 1: Deterministic detection (field anchor + field names/labels + author-readable record values)
    const deterministicMatches = DetectReferencedRestrictedFieldsDeterministic(
        entityInfo,
        MessageText,
        Conversation.AnchorType,
        Conversation.AnchorKey,
        readableRecordValues
    );
    const detectedSet = new Set<string>(deterministicMatches);

    // Stage 2: Semantic LLM classification for any remaining FLS-governed fields
    const text = (MessageText ?? '').trim();
    const unmatchedFields = restrictedFields.filter((f) => !detectedSet.has(f.Name));
    if (!params.SkipLLMStage && text.length > 0 && unmatchedFields.length > 0) {
        const llmMatches = await runSemanticRestrictedFieldClassifier(
            entityInfo,
            unmatchedFields,
            text,
            Conversation.AnchorType,
            Conversation.AnchorKey,
            ContextUser
        );
        for (const fieldName of llmMatches) {
            detectedSet.add(fieldName);
        }
    }

    const detectedFields = [...detectedSet];

    // Also include any previously stamped restrictedFields on the conversation when checking author access
    const existingMeta = ParseConversationAnchorMetadata(
        Conversation.AnchorMetadataObject ?? Conversation.AnchorMetadata
    );
    const allThreadRestrictedFields = new Set<string>(detectedFields);
    if (Array.isArray(existingMeta?.restrictedFields)) {
        for (const f of existingMeta.restrictedFields) {
            if (typeof f === 'string' && f.trim()) {
                allThreadRestrictedFields.add(f.trim());
            }
        }
    }

    // Check whether the authoring user is denied Read access on any referenced restricted field.
    // Return a generic message without naming which field matched.
    const authorDeniedFields = [...allThreadRestrictedFields].filter((f) =>
        deniedLower.has(f.trim().toLowerCase())
    );
    if (authorDeniedFields.length > 0) {
        return {
            Allowed: false,
            Reason: 'You do not have permission to comment on restricted fields.',
            DetectedFields: detectedFields,
            AuthorDeniedFields: authorDeniedFields
        };
    }

    // Stamp newly detected restricted fields onto the parent conversation's AnchorMetadataObject
    if (detectedFields.length > 0) {
        const { Metadata, Changed } = MergeRestrictedFieldsIntoAnchorMetadata(
            existingMeta,
            detectedFields
        );
        if (Changed) {
            Conversation.AnchorMetadataObject = Metadata;
            if (Conversation.IsSaved) {
                const saved = await Conversation.Save();
                if (!saved) {
                    LogError(
                        `InspectAndStampRestrictedFieldsForComment: failed to update AnchorMetadata on conversation ${Conversation.ID}: ${
                            Conversation.LatestResult?.CompleteMessage ?? 'unknown error'
                        }`
                    );
                }
            }
        }
    }

    return {
        Allowed: true,
        Reason: null,
        DetectedFields: detectedFields,
        AuthorDeniedFields: []
    };
}

async function loadLinkedRecordRestrictedFieldValues(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    entityInfo: EntityInfo,
    linkedRecordId: string,
    restrictedFields: readonly EntityFieldInfo[]
): Promise<Record<string, unknown> | null> {
    if (provider?.ProviderType !== 'Database' || restrictedFields.length === 0) {
        return null;
    }
    const pkFilter = BuildLinkedRecordPrimaryKeyFilter(entityInfo, linkedRecordId, provider);
    if (!pkFilter) {
        return null;
    }

    try {
        const systemUser = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? contextUser;
        const rv = RunView.FromMetadataProvider(provider);
        const fieldNames = [
            ...entityInfo.PrimaryKeys.map((pk) => pk.Name),
            ...restrictedFields.map((f) => f.Name)
        ];
        const result = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: entityInfo.Name,
                ExtraFilter: pkFilter,
                Fields: fieldNames,
                MaxRows: 1,
                ResultType: 'simple'
            },
            systemUser
        );
        if (result.Success && result.Results && result.Results.length > 0) {
            return result.Results[0];
        }
    } catch (error) {
        LogError(
            `loadLinkedRecordRestrictedFieldValues failed on ${entityInfo.Name} (${linkedRecordId}): ${
                error instanceof Error ? error.message : String(error)
            }`
        );
    }
    return null;
}

async function runSemanticRestrictedFieldClassifier(
    entityInfo: EntityInfo,
    candidateFields: readonly EntityFieldInfo[],
    messageText: string,
    anchorType: MJConversationEntity['AnchorType'],
    anchorKey: string | null,
    contextUser: UserInfo
): Promise<string[]> {
    const prompt: RestrictedFieldClassifierPrompt = {
        EntityName: entityInfo.Name,
        EntityDisplayName: entityInfo.DisplayNameOrName,
        MessageText: messageText,
        AnchorType: anchorType,
        AnchorKey: anchorKey,
        CandidateFields: candidateFields.map((f) => ({
            Name: f.Name,
            DisplayName: f.DisplayNameOrName,
            Description: f.Description ?? null
        }))
    };

    const validByLower = new Map<string, string>();
    for (const f of candidateFields) {
        validByLower.set(f.Name.toLowerCase(), f.Name);
    }

    if (customRestrictedFieldClassifier) {
        try {
            const rawMatches = await customRestrictedFieldClassifier(prompt, contextUser);
            return normalizeMatchedFieldNames(rawMatches, validByLower);
        } catch (error) {
            LogError(
                `Custom RestrictedFieldLLMClassifier threw: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
            return [];
        }
    }

    return runDefaultAIEngineRestrictedFieldClassifier(prompt, contextUser, validByLower);
}

function normalizeMatchedFieldNames(
    rawNames: readonly string[] | null | undefined,
    validByLower: ReadonlyMap<string, string>
): string[] {
    if (!Array.isArray(rawNames)) {
        return [];
    }
    const canonical = new Set<string>();
    for (const name of rawNames) {
        if (typeof name === 'string') {
            const found = validByLower.get(name.trim().toLowerCase());
            if (found) {
                canonical.add(found);
            }
        }
    }
    return [...canonical];
}

const RESTRICTED_FIELD_CLASSIFIER_PROMPT_NAME = 'Anchored Comment Restricted Field Classifier';

/** The decision prompt the semantic stage asks when its mode is `Shadow` or `Decision`. */
const RESTRICTED_FIELD_DECISION_PROMPT_NAME = 'Default Decision';

let restrictedFieldDecisionRunner: ShadowDecisionRunner | null = null;

/**
 * Sets (or clears with `null`) the decision runner the semantic stage uses. For tests; the default is
 * a new `AIDecisionRunner` per call.
 */
export function SetRestrictedFieldDecisionRunner(runner: ShadowDecisionRunner | null): void {
    restrictedFieldDecisionRunner = runner;
}

/**
 * The default semantic stage: the governed prompt, the decision, or both, as
 * `GetRestrictedFieldClassifierDecisionMode()` says (see `RestrictedFieldDecision.ts`). Every failure
 * of the prompt reads as "nothing flagged", as it always has; a failed or unsure decision falls back
 * to the prompt.
 */
async function runDefaultAIEngineRestrictedFieldClassifier(
    prompt: RestrictedFieldClassifierPrompt,
    contextUser: UserInfo,
    validByLower: ReadonlyMap<string, string>
): Promise<string[]> {
    try {
        await AIEngine.Instance.Config(false, contextUser);
    } catch (error) {
        LogStatus(
            `[RestrictedFieldCommentClassifier] AIEngine.Config unavailable; skipping Stage 2 semantic classification: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return [];
    }

    const outcome = await RunDecisionUse<string[]>({
        Use: RESTRICTED_FIELD_CLASSIFIER_USE,
        Mode: GetRestrictedFieldClassifierDecisionMode(),
        BuildDecision: () => buildRestrictedFieldDecision(prompt, contextUser),
        FromDecision: (run) => {
            const flagged = FlaggedFieldsFromVerdicts(
                ReadRestrictedFieldVerdicts(prompt, run.Answers, AnsweredByOf(run), AIEngine.Instance)
            );
            return flagged === null ? null : normalizeMatchedFieldNames(flagged, validByLower);
        },
        RunExisting: () => runRestrictedFieldPrompt(prompt, contextUser, validByLower),
        Compare: (answers, existing, run) => CompareRestrictedFieldDecision(
            ReadRestrictedFieldVerdicts(prompt, answers, AnsweredByOf(run), AIEngine.Instance),
            existing
        ),
        Runner: restrictedFieldDecisionRunner ?? undefined
    });
    return outcome.Value;
}

/**
 * The decision for the semantic stage, asked as the commenting user, or null when there is no
 * active decision prompt or nothing to ask about.
 */
function buildRestrictedFieldDecision(prompt: RestrictedFieldClassifierPrompt, contextUser: UserInfo): AIDecisionParams | null {
    const decisionPrompt = AIEngine.Instance.Prompts?.find(
        (p) => p.Name === RESTRICTED_FIELD_DECISION_PROMPT_NAME && p.Status === 'Active'
    );
    if (!decisionPrompt || prompt.CandidateFields.length === 0) {
        return null;
    }
    const params = new AIDecisionParams();
    params.prompt = decisionPrompt;
    params.contextUser = contextUser;
    params.State = BuildRestrictedFieldState(prompt);
    params.Questions = BuildRestrictedFieldQuestions(prompt);
    return params;
}

/** The governed prompt: the semantic stage as it ran before decisions. Any failure flags nothing. */
async function runRestrictedFieldPrompt(
    prompt: RestrictedFieldClassifierPrompt,
    contextUser: UserInfo,
    validByLower: ReadonlyMap<string, string>
): Promise<string[]> {
    const aiPrompt = AIEngine.Instance.Prompts?.find(
        (p) => p.Name === RESTRICTED_FIELD_CLASSIFIER_PROMPT_NAME && p.Status === 'Active'
    );
    if (!aiPrompt) {
        return [];
    }

    try {
        const runner = new AIPromptRunner();
        const params = new AIPromptParams();
        params.prompt = aiPrompt;
        params.data = prompt as unknown as Record<string, unknown>;
        params.contextUser = contextUser;

        const execution = await runner.ExecutePrompt<{ restrictedFields?: unknown }>(params);
        if (!execution.success || !execution.result) {
            LogStatus(
                `[RestrictedFieldCommentClassifier] Governed prompt "${RESTRICTED_FIELD_CLASSIFIER_PROMPT_NAME}" returned unsuccessful result: ${
                    execution.errorMessage ?? 'unknown'
                }`
            );
            return [];
        }

        const list = execution.result.restrictedFields;
        if (Array.isArray(list)) {
            return normalizeMatchedFieldNames(
                list.filter((item): item is string => typeof item === 'string'),
                validByLower
            );
        }
    } catch (error) {
        LogStatus(
            `[RestrictedFieldCommentClassifier] Governed prompt "${RESTRICTED_FIELD_CLASSIFIER_PROMPT_NAME}" threw: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
    }

    return [];
}
