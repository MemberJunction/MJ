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
import { MJGlobal } from '@memberjunction/global';
import { BaseLLM, ChatParams, ChatResult, GetAIAPIKeyGlobal } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import {
    BuildLinkedRecordPrimaryKeyFilter,
    DetectReferencedRestrictedFieldsDeterministic,
    MergeRestrictedFieldsIntoAnchorMetadata,
    ParseConversationAnchorMetadata,
    type MJConversationEntity
} from '@memberjunction/core-entities';

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

    // Load the linked record's restricted field values when not already supplied so Stage 1 can
    // catch comments that quote a restricted value directly without naming the column.
    let recordValues = params.RecordValues ?? null;
    if (!recordValues && Conversation.LinkedRecordID && (MessageText ?? '').trim().length > 0) {
        recordValues = await loadLinkedRecordRestrictedFieldValues(
            Provider,
            ContextUser,
            entityInfo,
            Conversation.LinkedRecordID,
            restrictedFields
        );
    }

    // Stage 1: Deterministic detection (field anchor + field names/labels + record values)
    const deterministicMatches = DetectReferencedRestrictedFieldsDeterministic(
        entityInfo,
        MessageText,
        Conversation.AnchorType,
        Conversation.AnchorKey,
        recordValues
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

    // Check whether the authoring user is denied Read access on any referenced restricted field
    const deniedLower = entityInfo.GetDeniedReadFields(ContextUser);
    const authorDeniedFields = [...allThreadRestrictedFields].filter((f) =>
        deniedLower.has(f.trim().toLowerCase())
    );
    if (authorDeniedFields.length > 0) {
        return {
            Allowed: false,
            Reason: `You do not have permission to comment on restricted field(s): ${authorDeniedFields.join(', ')}.`,
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
    if (provider?.ProviderType !== 'Database') {
        return null;
    }
    const pkFilter = BuildLinkedRecordPrimaryKeyFilter(entityInfo, linkedRecordId);
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

async function runDefaultAIEngineRestrictedFieldClassifier(
    prompt: RestrictedFieldClassifierPrompt,
    contextUser: UserInfo,
    validByLower: ReadonlyMap<string, string>
): Promise<string[]> {
    try {
        await AIEngine.Instance.Config(false, contextUser);
    } catch {
        return [];
    }

    const activeModels = AIEngine.Instance.LanguageModels.filter(
        (m) => m.IsActive === true && Boolean(m.DriverClass)
    );
    if (activeModels.length === 0) {
        return [];
    }

    // Prefer a fast, lightweight model (lowest positive PowerRank first, falling back to first active model)
    const sorted = [...activeModels].sort((a, b) => (a.PowerRank ?? 999) - (b.PowerRank ?? 999));
    let selectedLLM: BaseLLM | null = null;
    let selectedApiName = '';

    for (const model of sorted) {
        const driverClass = model.DriverClass;
        if (!driverClass) {
            continue;
        }
        const apiKey = GetAIAPIKeyGlobal(driverClass);
        if (!apiKey) {
            continue;
        }
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
            BaseLLM,
            driverClass,
            apiKey
        );
        if (instance) {
            selectedLLM = instance;
            selectedApiName = model.APINameOrName;
            break;
        }
    }

    if (!selectedLLM) {
        return [];
    }

    const systemMessage =
        `You are a data security classifier for an enterprise application. ` +
        `Given an entity's Field-Level Security (FLS) restricted fields and a user comment posted on a record, ` +
        `identify which restricted fields (if any) the comment is semantically discussing, disclosing, or asking about ` +
        `(even if the comment uses synonyms, paraphrases, or indirect references like "six figures" for Salary). ` +
        `Return STRICT JSON ONLY with shape: {"restrictedFields": ["<ExactFieldName>"]}. ` +
        `If the comment does not discuss any of the listed restricted fields, return {"restrictedFields": []}.`;

    const fieldLines = prompt.CandidateFields.map(
        (f) =>
            `- ${f.Name} (Label: "${f.DisplayName}"${
                f.Description ? `, Description: ${f.Description}` : ''
            })`
    ).join('\n');

    const userMessage =
        `Entity: ${prompt.EntityDisplayName} (${prompt.EntityName})\n` +
        `Restricted Fields:\n${fieldLines}\n\n` +
        `Comment (${prompt.AnchorType ?? 'Record'}${prompt.AnchorKey ? ` / ${prompt.AnchorKey}` : ''}):\n` +
        `${prompt.MessageText}`;

    const chatParams: ChatParams = {
        model: selectedApiName,
        messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
        ],
        temperature: 0,
        responseFormat: 'JSON'
    };

    try {
        const result: ChatResult = await selectedLLM.ChatCompletion(chatParams);
        if (!result.success) {
            LogStatus(
                `[RestrictedFieldCommentClassifier] LLM classification skipped: ${result.errorMessage ?? 'unknown'}`
            );
            return [];
        }
        const content = result.data?.choices?.[0]?.message?.content;
        if (!content) {
            return [];
        }
        const parsed: unknown = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const list = (parsed as { restrictedFields?: unknown }).restrictedFields;
            if (Array.isArray(list)) {
                return normalizeMatchedFieldNames(
                    list.filter((item): item is string => typeof item === 'string'),
                    validByLower
                );
            }
        }
    } catch (error) {
        LogStatus(
            `[RestrictedFieldCommentClassifier] LLM classification exception: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
    }

    return [];
}
