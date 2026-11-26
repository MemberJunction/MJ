/**
 * @fileoverview Canonical tour snapshot hashing & `MJ: Tour Versions` publisher service.
 * Ensures idempotent saves and two-phase `mj sync push` never mint duplicate versions
 * when canonical step/path/goal/start-location/configuration content is unchanged.
 * @module @memberjunction/tours-server
 */

import { createHash } from 'node:crypto';
import {
    RunView,
    type IEntityDataProvider,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import {
    MJTourEntity,
    MJTourStepEntity,
    MJTourStepPathEntity,
    MJTourStepTypeEntity,
    MJTourVersionEntity,
    type MJTourVersionEntity_ITourVersionDefinition,
    type MJTourVersionEntity_ITourVersionStepPathSnapshot,
    type MJTourVersionEntity_ITourVersionStepSnapshot,
} from '@memberjunction/core-entities';
import { BaseSingleton, EscapeSQLString, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import {
    ValidateTourGraph,
    type TourDefinition,
    type TourStepDefinition,
    type TourStepPathDefinition,
    type TourStepPlacement,
} from '@memberjunction/tours-runtime';

export interface TourSnapshotOptions {
    ChangeSummary?: string;
    ValidateGraph?: boolean;
}

export interface TourSnapshotResult {
    Success: boolean;
    TourVersionId?: string;
    VersionNumber?: number;
    ContentHash?: string;
    UnchangedSnapshot?: boolean;
    ErrorMessage?: string;
}

/**
 * Recursively sorts object keys so canonical JSON serialization is deterministic
 * regardless of property insertion order across DB drivers or metadata files.
 */
export function CanonicalizeJsonValue(value: unknown): unknown {
    if (value === null || value === undefined) {
        return null;
    }
    if (Array.isArray(value)) {
        return value.map((item) => CanonicalizeJsonValue(item));
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        const keys = Object.keys(record).sort();
        for (const key of keys) {
            const v = record[key];
            if (v !== undefined) {
                sorted[key] = CanonicalizeJsonValue(v);
            }
        }
        return sorted;
    }
    return value;
}

function safeParseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
    if (!raw || !raw.trim()) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        return null;
    } catch {
        return null;
    }
}

function parseConditionValue(raw: string | null | undefined): Record<string, unknown> | string | null {
    if (raw == null) {
        return null;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.startsWith('{')) {
        const obj = safeParseJsonObject(trimmed);
        return obj ?? trimmed;
    }
    return trimmed;
}

function toRuntimePlacement(placement: MJTourStepEntity['Placement']): TourStepPlacement {
    switch (placement) {
        case 'Top':
            return 'top';
        case 'Bottom':
            return 'bottom';
        case 'Left':
            return 'left';
        case 'Right':
            return 'right';
        case 'Center':
            return 'center';
        default:
            return 'auto';
    }
}

/**
 * Canonical projection hashed to detect meaningful tour content edits.
 * Omits volatile DB timestamps/IDs where appropriate while capturing every semantic
 * step, path, goal, start location, and configuration field.
 */
export function ComputeCanonicalTourContentHash(definition: MJTourVersionEntity_ITourVersionDefinition): string {
    const canonicalProjection = {
        TourKey: definition.TourKey,
        Name: definition.Name,
        Description: definition.Description ?? null,
        EstimatedMinutes: definition.EstimatedMinutes ?? null,
        DefaultGuideMode: definition.DefaultGuideMode,
        AllowAgentActions: definition.AllowAgentActions,
        DriverClass: definition.DriverClass ?? null,
        PresenterClass: definition.PresenterClass ?? null,
        Goal: definition.Goal ?? null,
        StartLocation: definition.StartLocation ?? null,
        Configuration: definition.Configuration ?? null,
        Steps: [...definition.Steps]
            .sort((a, b) => a.Sequence - b.Sequence || a.StepKey.localeCompare(b.StepKey))
            .map((s) => ({
                StepKey: s.StepKey,
                Sequence: s.Sequence,
                StepTypeName: s.StepTypeName,
                StepTypeDriverClass: s.StepTypeDriverClass,
                StepTypeRendererClass: s.StepTypeRendererClass ?? null,
                StepTypeComponentID: s.StepTypeComponentID ?? null,
                DriverClass: s.DriverClass ?? null,
                Title: s.Title,
                Body: s.Body ?? null,
                Configuration: s.Configuration ?? null,
                Anchor: s.Anchor ?? null,
                Placement: s.Placement,
                Mode: s.Mode,
                Prepare: s.Prepare ?? null,
                Completion: s.Completion ?? null,
                SkipWhen: s.SkipWhen ?? null,
                OnMissing: s.OnMissing,
                IsOptional: s.IsOptional,
                GuideNotes: s.GuideNotes ?? null,
                VoiceScript: s.VoiceScript ?? null,
            })),
        Paths: [...definition.Paths]
            .sort(
                (a, b) =>
                    a.FromStepKey.localeCompare(b.FromStepKey) ||
                    a.ToStepKey.localeCompare(b.ToStepKey) ||
                    a.Sequence - b.Sequence ||
                    a.Priority - b.Priority,
            )
            .map((p) => ({
                FromStepKey: p.FromStepKey,
                ToStepKey: p.ToStepKey,
                Condition: p.Condition ?? null,
                Label: p.Label ?? null,
                Priority: p.Priority,
                Sequence: p.Sequence,
                IsDefault: p.IsDefault,
                Configuration: p.Configuration ?? null,
            })),
    };

    const json = JSON.stringify(CanonicalizeJsonValue(canonicalProjection));
    return createHash('sha256').update(json).digest('hex');
}

/**
 * Converts a stored `MJTourVersionEntity_ITourVersionDefinition` into a runtime
 * `TourDefinition` suitable for `ValidateTourGraph` or delivery to hosts.
 */
export function VersionDefinitionToRuntimeTour(
    def: MJTourVersionEntity_ITourVersionDefinition,
    metadata?: {
        TourID?: string;
        TourVersionID?: string;
        VersionNumber?: number;
        ApplicationID?: string | null;
        Status?: TourDefinition['Status'];
        RunInAuthenticatedHosts?: boolean;
        Priority?: number;
    },
): TourDefinition {
    const steps: TourStepDefinition[] = def.Steps.map((s) => ({
        ID: s.ID,
        StepKey: s.StepKey,
        Sequence: s.Sequence,
        StepType: s.StepTypeName,
        DriverClass: s.DriverClass ?? null,
        Title: s.Title,
        Body: s.Body ?? undefined,
        Configuration: (s.Configuration ?? undefined) as TourStepDefinition['Configuration'],
        Anchor: (s.Anchor ?? null) as TourStepDefinition['Anchor'],
        Placement: toRuntimePlacement(s.Placement),
        Mode: s.Mode,
        Prepare: (s.Prepare ?? null) as TourStepDefinition['Prepare'],
        Completion: (s.Completion ?? null) as TourStepDefinition['Completion'],
        SkipWhen: (s.SkipWhen ?? null) as TourStepDefinition['SkipWhen'],
        OnMissing: s.OnMissing === 'Agent Recover' ? 'AgentRecover' : s.OnMissing,
        IsOptional: s.IsOptional,
        GuideNotes: s.GuideNotes ?? undefined,
        VoiceScript: s.VoiceScript ?? undefined,
    }));

    const paths: TourStepPathDefinition[] = def.Paths.map((p) => ({
        ID: p.ID,
        FromStepKey: p.FromStepKey,
        ToStepKey: p.ToStepKey,
        Condition: (p.Condition ?? null) as TourStepPathDefinition['Condition'],
        Label: p.Label ?? undefined,
        Priority: p.Priority,
        IsDefault: p.IsDefault,
        Configuration: (p.Configuration ?? undefined) as TourStepPathDefinition['Configuration'],
    }));

    return {
        ID: metadata?.TourID,
        TourKey: def.TourKey,
        Name: def.Name,
        Description: def.Description ?? undefined,
        ApplicationID: metadata?.ApplicationID ?? null,
        RunInAuthenticatedHosts: metadata?.RunInAuthenticatedHosts ?? true,
        Status: metadata?.Status ?? 'Active',
        CurrentVersionID: metadata?.TourVersionID ?? null,
        VersionNumber: metadata?.VersionNumber,
        EstimatedMinutes: def.EstimatedMinutes ?? undefined,
        Priority: metadata?.Priority,
        DefaultGuideMode: def.DefaultGuideMode,
        AllowAgentActions: def.AllowAgentActions,
        DriverClass: def.DriverClass ?? null,
        PresenterClass: def.PresenterClass ?? null,
        Goal: (def.Goal ?? null) as TourDefinition['Goal'],
        StartLocation: (def.StartLocation ?? null) as TourDefinition['StartLocation'],
        Configuration: (def.Configuration ?? null) as TourDefinition['Configuration'],
        Steps: steps,
        Paths: paths,
    };
}

/**
 * Narrows an `IEntityDataProvider` from `BaseEntity.ProviderToUse` to `IMetadataProvider`
 * when metadata/query capabilities (`GetEntityObject`, `RunView`, `RunViews`) are present.
 */
export function IsTourMetadataProvider(
    provider: IEntityDataProvider | null | undefined,
): provider is IEntityDataProvider & IMetadataProvider {
    return Boolean(
        provider &&
        'GetEntityObject' in provider &&
        'RunView' in provider &&
        'RunViews' in provider,
    );
}

/**
 * Manages immutable `MJ: Tour Versions` snapshotting and canonical `ContentHash` diffing.
 */
export class TourPublisherService extends BaseSingleton<TourPublisherService> {
    private readonly _activeSnapshotTourIds = new Set<string>();
    private _autoSnapshotSuppressionDepth = 0;

    protected constructor() {
        super();
    }

    public static get Instance(): TourPublisherService {
        return super.getInstance<TourPublisherService>();
    }

    /** True while `SnapshotIfChanged` is updating `Tour.CurrentVersionID` to prevent re-entrant saves. */
    public IsSnapshottingTour(tourId: string): boolean {
        return this._activeSnapshotTourIds.has(tourId.toLowerCase());
    }

    /** True while a caller (e.g., batch import) suppresses step-level auto-snapshotting. */
    public get IsAutoSnapshotSuppressed(): boolean {
        return this._autoSnapshotSuppressionDepth > 0;
    }

    /** Runs `work` with step-save auto-snapshotting temporarily paused. */
    public async RunWithoutAutoSnapshot<T>(work: () => Promise<T>): Promise<T> {
        this._autoSnapshotSuppressionDepth++;
        try {
            return await work();
        } finally {
            this._autoSnapshotSuppressionDepth--;
        }
    }

    /**
     * Loads the tour's current draft steps, paths, and step types, computes the canonical
     * `MJTourVersionEntity_ITourVersionDefinition` and `ContentHash`, and creates a new
     * immutable `MJTourVersionEntity` only when the hash differs from `tour.CurrentVersionID`.
     */
    public async SnapshotIfChanged(
        tour: MJTourEntity,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        options?: TourSnapshotOptions,
    ): Promise<TourSnapshotResult> {
        const normalizedTourId = tour.ID.toLowerCase();
        if (this._activeSnapshotTourIds.has(normalizedTourId)) {
            return {
                Success: true,
                TourVersionId: tour.CurrentVersionID ?? undefined,
                UnchangedSnapshot: true,
            };
        }

        this._activeSnapshotTourIds.add(normalizedTourId);
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const escapedTourId = EscapeSQLString(tour.ID);

            const [stepsRes, pathsRes, stepTypesRes, versionsRes] = await rv.RunViews(
                [
                    {
                        EntityName: 'MJ: Tour Steps',
                        ExtraFilter: `TourID='${escapedTourId}'`,
                        OrderBy: 'Sequence ASC, StepKey ASC',
                        ResultType: 'entity_object',
                    },
                    {
                        EntityName: 'MJ: Tour Step Paths',
                        ExtraFilter: `TourID='${escapedTourId}'`,
                        OrderBy: 'Sequence ASC, Priority DESC',
                        ResultType: 'entity_object',
                    },
                    {
                        EntityName: 'MJ: Tour Step Types',
                        ResultType: 'entity_object',
                    },
                    {
                        EntityName: 'MJ: Tour Versions',
                        ExtraFilter: `TourID='${escapedTourId}'`,
                        OrderBy: 'VersionNumber DESC',
                        ResultType: 'entity_object',
                    },
                ],
                contextUser,
            );

            const failed = [stepsRes, pathsRes, stepTypesRes, versionsRes].find((r) => !r.Success);
            if (failed) {
                return {
                    Success: false,
                    ErrorMessage: failed.ErrorMessage || `Failed loading tour '${tour.TourKey}' snapshot inputs.`,
                };
            }

            const steps = (stepsRes.Results ?? []) as MJTourStepEntity[];
            const paths = (pathsRes.Results ?? []) as MJTourStepPathEntity[];
            const stepTypes = (stepTypesRes.Results ?? []) as MJTourStepTypeEntity[];
            const versions = (versionsRes.Results ?? []) as MJTourVersionEntity[];

            const stepTypeMap = new UUIDMap<MJTourStepTypeEntity>(
                stepTypes.map((st): [string, MJTourStepTypeEntity] => [st.ID, st]),
            );
            const stepKeyById = new UUIDMap<string>(
                steps.map((s): [string, string] => [s.ID, s.StepKey]),
            );

            const stepSnapshots: MJTourVersionEntity_ITourVersionStepSnapshot[] = [...steps]
                .sort((a, b) => a.Sequence - b.Sequence || a.StepKey.localeCompare(b.StepKey))
                .map((s) => {
                    const stepType = stepTypeMap.Get(s.StepTypeID);
                    return {
                        ID: s.ID,
                        StepKey: s.StepKey,
                        Sequence: s.Sequence,
                        StepTypeID: s.StepTypeID,
                        StepTypeName: stepType?.Name ?? s.StepType ?? 'Spotlight',
                        StepTypeDriverClass: stepType?.DriverClass ?? 'Spotlight',
                        StepTypeRendererClass: stepType?.RendererClass ?? null,
                        StepTypeComponentID: stepType?.ComponentID ?? null,
                        DriverClass: s.DriverClass ?? null,
                        Title: s.Title,
                        Body: s.Body ?? null,
                        Configuration: safeParseJsonObject(s.Configuration),
                        Anchor: safeParseJsonObject(s.Anchor),
                        Placement: s.Placement,
                        Mode: s.Mode,
                        Prepare: safeParseJsonObject(s.Prepare),
                        Completion: safeParseJsonObject(s.Completion),
                        SkipWhen: safeParseJsonObject(s.SkipWhen),
                        OnMissing: s.OnMissing,
                        IsOptional: s.IsOptional,
                        GuideNotes: s.GuideNotes ?? null,
                        VoiceScript: s.VoiceScript ?? null,
                    };
                });

            const pathSnapshots: MJTourVersionEntity_ITourVersionStepPathSnapshot[] = paths
                .map((p): MJTourVersionEntity_ITourVersionStepPathSnapshot | null => {
                    const fromKey = stepKeyById.Get(p.FromStepID);
                    const toKey = stepKeyById.Get(p.ToStepID);
                    if (!fromKey || !toKey) {
                        return null;
                    }
                    return {
                        ID: p.ID,
                        FromStepID: p.FromStepID,
                        FromStepKey: fromKey,
                        ToStepID: p.ToStepID,
                        ToStepKey: toKey,
                        Condition: parseConditionValue(p.Condition),
                        Label: p.Label ?? null,
                        Priority: p.Priority,
                        Sequence: p.Sequence,
                        IsDefault: p.IsDefault,
                        Configuration: safeParseJsonObject(p.Configuration),
                    };
                })
                .filter((p): p is MJTourVersionEntity_ITourVersionStepPathSnapshot => p !== null);

            const definition: MJTourVersionEntity_ITourVersionDefinition = {
                TourKey: tour.TourKey,
                Name: tour.Name,
                Description: tour.Description ?? null,
                EstimatedMinutes: tour.EstimatedMinutes ?? null,
                DefaultGuideMode: tour.DefaultGuideMode,
                AllowAgentActions: tour.AllowAgentActions,
                DriverClass: tour.DriverClass ?? null,
                PresenterClass: tour.PresenterClass ?? null,
                Goal: safeParseJsonObject(tour.Goal),
                StartLocation: safeParseJsonObject(tour.StartLocation),
                Configuration: safeParseJsonObject(tour.Configuration),
                Steps: stepSnapshots,
                Paths: pathSnapshots,
            };

            if (options?.ValidateGraph) {
                const runtimeTour = VersionDefinitionToRuntimeTour(definition, {
                    TourID: tour.ID,
                    ApplicationID: tour.ApplicationID,
                    Status: tour.Status,
                    RunInAuthenticatedHosts: tour.RunInAuthenticatedHosts,
                    Priority: tour.Priority,
                });
                const validation = ValidateTourGraph(runtimeTour);
                if (!validation.Valid) {
                    const issues: string[] = [];
                    if (validation.CycleResult.hasCycle) {
                        issues.push(
                            `Tour pathway contains a cycle involving: ${validation.CycleResult.path.join(', ')}`,
                        );
                    }
                    if (validation.DuplicateStepKeys.length > 0) {
                        issues.push(`Duplicate step keys: ${validation.DuplicateStepKeys.join(', ')}`);
                    }
                    if (validation.UnknownStepRefs.length > 0) {
                        issues.push(
                            `Unknown step references in paths: ${validation.UnknownStepRefs.map((r) => `${r.FromStepKey}->${r.ToStepKey}`).join(', ')}`,
                        );
                    }
                    return {
                        Success: false,
                        ErrorMessage: issues.join('; '),
                    };
                }
            }

            const contentHash = ComputeCanonicalTourContentHash(definition);

            const currentVersion = tour.CurrentVersionID
                ? versions.find((v) => UUIDsEqual(v.ID, tour.CurrentVersionID))
                : undefined;

            if (currentVersion && currentVersion.ContentHash === contentHash) {
                return {
                    Success: true,
                    TourVersionId: currentVersion.ID,
                    VersionNumber: currentVersion.VersionNumber,
                    ContentHash: contentHash,
                    UnchangedSnapshot: true,
                };
            }

            const maxVersion = versions.reduce(
                (max, v) => (v.VersionNumber > max ? v.VersionNumber : max),
                0,
            );
            const nextVersionNumber = maxVersion + 1;

            const newVersion = await provider.GetEntityObject<MJTourVersionEntity>(
                'MJ: Tour Versions',
                contextUser,
            );
            newVersion.TourID = tour.ID;
            newVersion.VersionNumber = nextVersionNumber;
            newVersion.ContentHash = contentHash;
            newVersion.Definition = JSON.stringify(definition);
            newVersion.PublishedAt = new Date();
            newVersion.PublishedByUserID = contextUser.ID || null;
            newVersion.ChangeSummary =
                options?.ChangeSummary?.trim() ||
                (nextVersionNumber === 1 ? 'Initial published snapshot' : `Version ${nextVersionNumber}`);

            if (!(await newVersion.Save())) {
                return {
                    Success: false,
                    ErrorMessage:
                        newVersion.LatestResult?.CompleteMessage ??
                        `Failed saving MJ: Tour Versions v${nextVersionNumber} for '${tour.TourKey}'.`,
                };
            }

            tour.CurrentVersionID = newVersion.ID;
            if (!(await tour.Save())) {
                return {
                    Success: false,
                    ErrorMessage:
                        tour.LatestResult?.CompleteMessage ??
                        `Failed updating CurrentVersionID on tour '${tour.TourKey}'.`,
                };
            }

            return {
                Success: true,
                TourVersionId: newVersion.ID,
                VersionNumber: nextVersionNumber,
                ContentHash: contentHash,
                UnchangedSnapshot: false,
            };
        } finally {
            this._activeSnapshotTourIds.delete(normalizedTourId);
        }
    }
}
