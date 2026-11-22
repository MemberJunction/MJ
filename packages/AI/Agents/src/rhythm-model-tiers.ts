/**
 * Rhythm Model Tiers: maps rhythm templates and user routines to their
 * effective `MJ: AI Configurations` tier (`Draft` -> `Fast`, `Standard` -> `Standard`,
 * `High` -> `High Power`), seeds `UserRoutine.AgentConfigurationID` from
 * `AIAgentRhythmTemplate.DefaultAgentConfigurationID` on creation, and resolves
 * the wake-time `configurationId` (`routine.AgentConfigurationID ?? template.DefaultAgentConfigurationID`).
 */
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRhythmTemplateEntity,
    MJAIConfigurationEntity,
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
} from '@memberjunction/core-entities';
import { EscapeSQLString, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';

/**
 * Logical model tier labels assigned to Chief of Staff rhythms.
 */
export type RhythmModelTier = 'Draft' | 'Standard' | 'High';

/**
 * Canonical default model tier metadata for a named rhythm template.
 */
export interface RhythmDefaultTierSpec {
    readonly WorkstreamKey: string;
    readonly DisplayName: string;
    readonly Tier: RhythmModelTier;
    readonly DefaultConfigurationName: string;
}

/**
 * Maps each logical {@link RhythmModelTier} to the core `MJ: AI Configurations.Name` row.
 */
export const RHYTHM_TIER_TO_CONFIGURATION_NAME: Record<RhythmModelTier, string> = {
    Draft: 'Fast',
    Standard: 'Standard',
    High: 'High Power',
};

/**
 * Default model tier assignments across core and skill-contributed rhythm templates:
 * - Draft (`Fast`): Daily triage, calendar guard, huddle prep, 15Five draft
 * - Standard (`Standard`): Weekly review, weekly OKR review, period close, weekly calendar lookahead, capability review
 * - High (`High Power`): Mid-quarter checkpoint, growth coaching, project risk review
 */
export const RHYTHM_DEFAULT_TIER_CATALOG: ReadonlyArray<RhythmDefaultTierSpec> = [
    {
        WorkstreamKey: 'tasks-daily-triage',
        DisplayName: 'Daily triage',
        Tier: 'Draft',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.Draft,
    },
    {
        WorkstreamKey: 'calendar-daily-review',
        DisplayName: 'Daily Calendar Guard & Conflict Check',
        Tier: 'Draft',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.Draft,
    },
    {
        WorkstreamKey: 'planning-huddle-prep',
        DisplayName: 'Huddle prep',
        Tier: 'Draft',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.Draft,
    },
    {
        WorkstreamKey: 'daily-15five',
        DisplayName: '15Five draft',
        Tier: 'Draft',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.Draft,
    },
    {
        WorkstreamKey: 'tasks-weekly-review',
        DisplayName: 'Weekly review',
        Tier: 'Standard',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.Standard,
    },
    {
        WorkstreamKey: 'calendar-weekly-review',
        DisplayName: 'Weekly Calendar Lookahead & Focus Protection',
        Tier: 'Standard',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.Standard,
    },
    {
        WorkstreamKey: 'planning-weekly-okr-review',
        DisplayName: 'Weekly OKR review',
        Tier: 'Standard',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.Standard,
    },
    {
        WorkstreamKey: 'planning-period-close',
        DisplayName: 'Period close',
        Tier: 'Standard',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.Standard,
    },
    {
        WorkstreamKey: 'capability-review',
        DisplayName: 'Monthly Capability & Rhythm Review',
        Tier: 'Standard',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.Standard,
    },
    {
        WorkstreamKey: 'planning-midquarter-checkpoint',
        DisplayName: 'Mid-quarter checkpoint',
        Tier: 'High',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.High,
    },
    {
        WorkstreamKey: 'growth-coaching',
        DisplayName: 'Growth coaching',
        Tier: 'High',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.High,
    },
    {
        WorkstreamKey: 'project-risk-review',
        DisplayName: 'Project risk review',
        Tier: 'High',
        DefaultConfigurationName: RHYTHM_TIER_TO_CONFIGURATION_NAME.High,
    },
];

const WORKSTREAM_KEY_ALIASES: Record<string, string> = {
    'daily-triage': 'tasks-daily-triage',
    'tasks-daily-triage': 'tasks-daily-triage',
    'calendar-guard': 'calendar-daily-review',
    'calendar-daily-review': 'calendar-daily-review',
    'huddle-prep': 'planning-huddle-prep',
    'planning-huddle-prep': 'planning-huddle-prep',
    '15five-draft': 'daily-15five',
    'daily-15five': 'daily-15five',
    'weekly-review': 'tasks-weekly-review',
    'tasks-weekly-review': 'tasks-weekly-review',
    'calendar-weekly-review': 'calendar-weekly-review',
    'weekly-okr-review': 'planning-weekly-okr-review',
    'planning-weekly-okr-review': 'planning-weekly-okr-review',
    'period-close': 'planning-period-close',
    'planning-period-close': 'planning-period-close',
    'capability-review': 'capability-review',
    'mid-quarter-checkpoint': 'planning-midquarter-checkpoint',
    'midquarter-checkpoint': 'planning-midquarter-checkpoint',
    'planning-midquarter-checkpoint': 'planning-midquarter-checkpoint',
    'growth-coaching': 'growth-coaching',
    'project-risk-review': 'project-risk-review',
};

const CATALOG_BY_KEY: ReadonlyMap<string, RhythmDefaultTierSpec> = new Map(
    RHYTHM_DEFAULT_TIER_CATALOG.map((spec) => [spec.WorkstreamKey.toLowerCase(), spec])
);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createRunView(metadataProvider?: IMetadataProvider): RunView {
    return metadataProvider ? RunView.FromMetadataProvider(metadataProvider) : new RunView(); // global-provider-ok: fallback when no scoped provider was supplied by caller
}

function normalizeOptionalID(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseRoutineWakeConfig(
    routine: Pick<MJUserRoutineEntity, 'WakeConfiguration' | 'WakeConfigurationObject'>,
    explicitWakeConfig?: MJUserRoutineEntity_IRoutineWakeConfiguration | null
): MJUserRoutineEntity_IRoutineWakeConfiguration | null {
    if (explicitWakeConfig) {
        return explicitWakeConfig;
    }
    if (routine.WakeConfigurationObject) {
        return routine.WakeConfigurationObject;
    }
    if (typeof routine.WakeConfiguration === 'string' && routine.WakeConfiguration.trim().length > 0) {
        return SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(routine.WakeConfiguration);
    }
    return null;
}

function extractRhythmTemplateIDFromWakeConfig(
    wakeConfig: MJUserRoutineEntity_IRoutineWakeConfiguration | null
): string | null {
    const resumeState = wakeConfig?.resumeState;
    if (!resumeState || typeof resumeState !== 'object') {
        return null;
    }
    const rawTemplateID = resumeState['rhythmTemplateID'];
    return typeof rawTemplateID === 'string' ? normalizeOptionalID(rawTemplateID) : null;
}

/**
 * Resolves the canonical default tier spec for a rhythm template `WorkstreamKey`
 * (case-insensitive, supporting both skill-prefixed and short aliases).
 */
export function ResolveDefaultTierForWorkstreamKey(
    workstreamKey: string | null | undefined
): RhythmDefaultTierSpec | null {
    if (typeof workstreamKey !== 'string') {
        return null;
    }
    const normalized = workstreamKey.trim().toLowerCase();
    if (normalized.length === 0) {
        return null;
    }
    const canonicalKey = WORKSTREAM_KEY_ALIASES[normalized] ?? normalized;
    return CATALOG_BY_KEY.get(canonicalKey) ?? null;
}

/**
 * Maps a logical {@link RhythmModelTier} (`Draft`, `Standard`, `High`) to the
 * matching `MJ: AI Configurations.Name` (`Fast`, `Standard`, `High Power`).
 */
export function ResolveConfigurationNameForTier(tier: RhythmModelTier): string {
    return RHYTHM_TIER_TO_CONFIGURATION_NAME[tier];
}

/**
 * Normalizes user/agent model tier input (`Draft`/`Fast`, `Standard`, `High`/`High Power`)
 * to a canonical {@link RhythmModelTier}, or returns `null` if unrecognized.
 */
export function NormalizeModelTierName(value: string | null | undefined): RhythmModelTier | null {
    if (typeof value !== 'string') {
        return null;
    }
    switch (value.trim().toLowerCase()) {
        case 'draft':
        case 'fast':
            return 'Draft';
        case 'standard':
            return 'Standard';
        case 'high':
        case 'high power':
        case 'high-power':
        case 'high_power':
            return 'High';
        default:
            return null;
    }
}

/**
 * Inputs for seeding a newly created `MJ: User Routines` row's `AgentConfigurationID`.
 */
export interface SeedRoutineAgentConfigurationParams {
    explicitAgentConfigurationID?: string | null;
    templateDefaultAgentConfigurationID?: string | null;
}

/**
 * Computes the `AgentConfigurationID` to persist on routine creation:
 * an explicit override (including explicit `null` to clear) wins; otherwise seeds
 * from the rhythm template's `DefaultAgentConfigurationID`.
 */
export function ResolveSeededRoutineAgentConfigurationID(
    params: SeedRoutineAgentConfigurationParams
): string | null {
    if (params.explicitAgentConfigurationID !== undefined) {
        return normalizeOptionalID(params.explicitAgentConfigurationID);
    }
    return normalizeOptionalID(params.templateDefaultAgentConfigurationID);
}

/**
 * Summary fields needed from `MJ: AI Agent Rhythm Templates` to seed or resolve tiers.
 */
export type RhythmTemplateTierRow = Pick<
    MJAIAgentRhythmTemplateEntity,
    'ID' | 'AgentID' | 'WorkstreamKey' | 'DefaultAgentConfigurationID'
>;

/**
 * Looks up the active `MJ: AI Agent Rhythm Templates` row for `(agentID, workstreamKey)`,
 * returning `null` cleanly if none exists or if the query fails.
 */
export async function LookupActiveRhythmTemplateForWorkstream(params: {
    agentID: string;
    workstreamKey: string;
    contextUser: UserInfo;
    metadataProvider?: IMetadataProvider;
}): Promise<RhythmTemplateTierRow | null> {
    const cleanAgentID = normalizeOptionalID(params.agentID);
    const cleanWorkstreamKey = params.workstreamKey.trim().toLowerCase();
    if (!cleanAgentID || cleanWorkstreamKey.length === 0) {
        return null;
    }

    try {
        const rv = createRunView(params.metadataProvider);
        const result = await rv.RunView<RhythmTemplateTierRow>(
            {
                EntityName: 'MJ: AI Agent Rhythm Templates',
                ExtraFilter: `AgentID='${EscapeSQLString(cleanAgentID)}' AND LOWER(WorkstreamKey)='${EscapeSQLString(cleanWorkstreamKey)}' AND Status='Active'`,
                Fields: ['ID', 'AgentID', 'WorkstreamKey', 'DefaultAgentConfigurationID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            params.contextUser
        );
        if (!result.Success || result.Results.length === 0) {
            return null;
        }
        return result.Results[0] ?? null;
    } catch {
        return null;
    }
}

/**
 * Inputs for resolving the effective `AgentConfigurationID` on a rhythm wake.
 */
export interface ResolveWakeAgentConfigurationParams {
    routine: Pick<MJUserRoutineEntity, 'AgentConfigurationID' | 'TargetID' | 'WakeConfiguration' | 'WakeConfigurationObject'>;
    wakeConfig?: MJUserRoutineEntity_IRoutineWakeConfiguration | null;
    template?: Pick<MJAIAgentRhythmTemplateEntity, 'DefaultAgentConfigurationID'> | null;
    contextUser: UserInfo;
    metadataProvider?: IMetadataProvider;
}

/**
 * Resolves the effective AI Configuration ID for a waking user routine using:
 * `routine.AgentConfigurationID ?? template.DefaultAgentConfigurationID`.
 * When `routine.AgentConfigurationID` is unset and `template` is not preloaded,
 * looks up the linked rhythm template by `wakeConfig.resumeState.rhythmTemplateID`
 * or `(routine.TargetID, wakeConfig.workstreamKey)`.
 */
export async function ResolveWakeAgentConfigurationID(
    params: ResolveWakeAgentConfigurationParams
): Promise<string | undefined> {
    const routineConfigID = normalizeOptionalID(params.routine.AgentConfigurationID);
    if (routineConfigID) {
        return routineConfigID;
    }

    if (params.template !== undefined) {
        return normalizeOptionalID(params.template?.DefaultAgentConfigurationID) ?? undefined;
    }

    const wakeConfig = parseRoutineWakeConfig(params.routine, params.wakeConfig);
    const templateID = extractRhythmTemplateIDFromWakeConfig(wakeConfig);

    if (templateID) {
        try {
            const rv = createRunView(params.metadataProvider);
            const result = await rv.RunView<Pick<MJAIAgentRhythmTemplateEntity, 'ID' | 'DefaultAgentConfigurationID'>>(
                {
                    EntityName: 'MJ: AI Agent Rhythm Templates',
                    ExtraFilter: `ID='${EscapeSQLString(templateID)}'`,
                    Fields: ['ID', 'DefaultAgentConfigurationID'],
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                params.contextUser
            );
            if (result.Success && result.Results.length > 0) {
                const fromTemplate = normalizeOptionalID(result.Results[0]?.DefaultAgentConfigurationID);
                if (fromTemplate) {
                    return fromTemplate;
                }
            }
        } catch {
            // Fall back cleanly if the template lookup fails during wake dispatch.
        }
    }

    const workstreamKey = wakeConfig?.workstreamKey;
    const targetID = normalizeOptionalID(params.routine.TargetID);
    if (workstreamKey && targetID) {
        const byWorkstream = await LookupActiveRhythmTemplateForWorkstream({
            agentID: targetID,
            workstreamKey,
            contextUser: params.contextUser,
            metadataProvider: params.metadataProvider,
        });
        const fromWorkstream = normalizeOptionalID(byWorkstream?.DefaultAgentConfigurationID);
        if (fromWorkstream) {
            return fromWorkstream;
        }
    }

    return undefined;
}

/**
 * Inputs for resolving a user/agent supplied configuration UUID or tier name.
 */
export interface ResolveAgentConfigurationInputParams {
    agentConfigurationID?: string | null;
    modelTier?: string | null;
    contextUser: UserInfo;
    metadataProvider?: IMetadataProvider;
}

/**
 * Result of resolving optional `AgentConfigurationID` / `ModelTier` action parameters.
 */
export interface ResolvedAgentConfigurationInput {
    Provided: boolean;
    ConfigurationID: string | null;
    ErrorMessage?: string;
}

type AIConfigurationLookupRow = Pick<MJAIConfigurationEntity, 'ID' | 'Name' | 'Status'>;

/**
 * Validates and resolves an optional `AgentConfigurationID` (UUID or configuration name)
 * or logical `ModelTier` (`Draft`, `Standard`, `High`) against `MJ: AI Configurations`.
 */
export async function ResolveAgentConfigurationIDInput(
    params: ResolveAgentConfigurationInputParams
): Promise<ResolvedAgentConfigurationInput> {
    const hasExplicitConfig = params.agentConfigurationID !== undefined;
    const hasExplicitTier = params.modelTier !== undefined && params.modelTier !== null && params.modelTier.trim().length > 0;

    if (!hasExplicitConfig && !hasExplicitTier) {
        return { Provided: false, ConfigurationID: null };
    }

    if (hasExplicitConfig && params.agentConfigurationID === null && !hasExplicitTier) {
        return { Provided: true, ConfigurationID: null };
    }

    const rawInput = normalizeOptionalID(params.agentConfigurationID) ?? normalizeOptionalID(params.modelTier);
    if (!rawInput) {
        return { Provided: true, ConfigurationID: null };
    }

    const rv = createRunView(params.metadataProvider);
    if (UUID_PATTERN.test(rawInput)) {
        const byID = await rv.RunView<AIConfigurationLookupRow>(
            {
                EntityName: 'MJ: AI Configurations',
                ExtraFilter: `ID='${EscapeSQLString(rawInput)}'`,
                Fields: ['ID', 'Name', 'Status'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            params.contextUser
        );
        if (!byID.Success) {
            return {
                Provided: true,
                ConfigurationID: null,
                ErrorMessage: byID.ErrorMessage || 'Failed to look up AI Configuration by ID',
            };
        }
        const match = byID.Results.find((row) => UUIDsEqual(row.ID, rawInput)) ?? byID.Results[0];
        if (!match) {
            return {
                Provided: true,
                ConfigurationID: null,
                ErrorMessage: `AI Configuration '${rawInput}' was not found`,
            };
        }
        return { Provided: true, ConfigurationID: match.ID };
    }

    const tier = NormalizeModelTierName(rawInput);
    const targetConfigName = tier ? ResolveConfigurationNameForTier(tier) : rawInput;
    const byName = await rv.RunView<AIConfigurationLookupRow>(
        {
            EntityName: 'MJ: AI Configurations',
            ExtraFilter: `Name='${EscapeSQLString(targetConfigName)}'`,
            Fields: ['ID', 'Name', 'Status'],
            OrderBy: 'Status ASC, Name ASC',
            MaxRows: 5,
            ResultType: 'simple',
        },
        params.contextUser
    );

    if (!byName.Success) {
        return {
            Provided: true,
            ConfigurationID: null,
            ErrorMessage: byName.ErrorMessage || `Failed to look up AI Configuration '${targetConfigName}'`,
        };
    }

    const activeMatch =
        byName.Results.find((row) => row.Status === 'Active') ?? byName.Results[0];
    if (!activeMatch) {
        return {
            Provided: true,
            ConfigurationID: null,
            ErrorMessage: `AI Configuration '${targetConfigName}' (from input '${rawInput}') was not found`,
        };
    }

    return { Provided: true, ConfigurationID: activeMatch.ID };
}
