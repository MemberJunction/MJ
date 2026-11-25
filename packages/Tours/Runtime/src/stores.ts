/**
 * @fileoverview In-memory / static-page implementations of `ITourDefinitionSource` and
 * `ITourProgressStore`, plus tour override merging (`TourOverrideDefinition`).
 * @module @memberjunction/tours-runtime
 */

import type {
    ITourDefinitionSource,
    ITourProgressStore,
    TourLocation,
    TourPrincipal,
} from './host-contracts';
import type {
    TourDefinition,
    TourOverrideDefinition,
    TourRunEvent,
    TourRunRecord,
} from './types';

export interface InlineTourSourceOptions {
    Definitions: TourDefinition[];
    Overrides?: TourOverrideDefinition[];
    Principal?: TourPrincipal;
}

/**
 * Definition source backed by static inline JSON definitions (used on static pages,
 * tests, and standalone harnesses without an MJ backend).
 */
export class InlineTourSource implements ITourDefinitionSource {
    private readonly _definitions: TourDefinition[];
    private readonly _overrides: TourOverrideDefinition[];
    private readonly _principal?: TourPrincipal;

    constructor(definitionsOrOptions: TourDefinition[] | InlineTourSourceOptions) {
        if (Array.isArray(definitionsOrOptions)) {
            this._definitions = [...definitionsOrOptions];
            this._overrides = [];
        } else {
            this._definitions = [...definitionsOrOptions.Definitions];
            this._overrides = [...(definitionsOrOptions.Overrides ?? [])];
            this._principal = definitionsOrOptions.Principal;
        }
    }

    public async GetTours(_location: TourLocation): Promise<TourDefinition[]> {
        return this._definitions
            .filter((tour) => tour.Status === 'Active')
            .map((tour) => MergeTourOverrides(tour, this._overrides, this._principal))
            .filter((tour): tour is TourDefinition => tour !== null);
    }

    public async GetTourByKey(tourKey: string): Promise<TourDefinition | null> {
        const found = this._definitions.find((t) => t.TourKey === tourKey);
        if (!found) {
            return null;
        }
        return MergeTourOverrides(found, this._overrides, this._principal);
    }
}

export interface MemoryProgressStoreOptions {
    InitialRuns?: TourRunRecord[];
    OnRecordEvents?: (events: TourRunEvent[]) => void | Promise<void>;
}

/**
 * Progress store keeping runs and events in memory, optionally forwarding recorded
 * events to a page-supplied telemetry callback sink.
 */
export class MemoryProgressStore implements ITourProgressStore {
    private readonly _runs = new Map<string, TourRunRecord>();
    private readonly _events: TourRunEvent[] = [];
    private readonly _onRecordEvents?: (events: TourRunEvent[]) => void | Promise<void>;

    constructor(options: MemoryProgressStoreOptions = {}) {
        for (const run of options.InitialRuns ?? []) {
            this._runs.set(run.RunID, { ...run, PathTaken: [...run.PathTaken], Steps: [...run.Steps] });
        }
        this._onRecordEvents = options.OnRecordEvents;
    }

    public async GetRuns(): Promise<TourRunRecord[]> {
        return [...this._runs.values()];
    }

    public GetEvents(): readonly TourRunEvent[] {
        return this._events;
    }

    public UpsertRun(run: TourRunRecord): void {
        this._runs.set(run.RunID, {
            ...run,
            PathTaken: [...run.PathTaken],
            Steps: [...run.Steps],
        });
    }

    public async RecordEvents(events: TourRunEvent[]): Promise<void> {
        for (const event of events) {
            this._events.push(event);
            this.applyEventToRun(event);
        }
        if (this._onRecordEvents && events.length > 0) {
            await this._onRecordEvents(events);
        }
    }

    private applyEventToRun(event: TourRunEvent): void {
        const existing = this._runs.get(event.RunID);
        if (!existing) {
            if (event.EventType === 'RunStarted') {
                this._runs.set(event.RunID, {
                    RunID: event.RunID,
                    TourKey: event.TourKey,
                    TourVersionID: event.TourVersionID,
                    Status: 'In Progress',
                    GuideMode: event.GuideMode ?? 'Visual',
                    DirectorType: event.DirectorType ?? 'Visual',
                    CurrentStepKey: event.StepKey ?? null,
                    PathTaken: event.StepKey ? [event.StepKey] : [],
                    LaunchSource: event.LaunchSource ?? 'Launcher',
                    StartedAt: event.Timestamp,
                    Steps: [],
                });
            }
            return;
        }

        switch (event.EventType) {
            case 'StepEntered':
                if (event.StepKey) {
                    existing.CurrentStepKey = event.StepKey;
                    if (!existing.PathTaken.includes(event.StepKey)) {
                        existing.PathTaken.push(event.StepKey);
                    }
                    existing.Steps.push({
                        StepKey: event.StepKey,
                        EnteredAt: event.Timestamp,
                        Outcome: 'Completed',
                        AnchorResolution: event.AnchorResolution ?? 'Registered',
                        QuestionCount: 0,
                    });
                }
                break;
            case 'StepCompleted':
            case 'StepSkipped':
            case 'AnchorMissing': {
                if (event.StepKey) {
                    const last = [...existing.Steps].reverse().find((s) => s.StepKey === event.StepKey);
                    if (last) {
                        last.ExitedAt = event.Timestamp;
                        if (event.Outcome) {
                            last.Outcome = event.Outcome;
                        }
                        if (event.AnchorResolution) {
                            last.AnchorResolution = event.AnchorResolution;
                        }
                    }
                }
                break;
            }
            case 'DirectorChanged':
                if (event.DirectorType) {
                    existing.DirectorType = event.DirectorType;
                }
                if (event.GuideMode) {
                    existing.GuideMode = event.GuideMode;
                }
                break;
            case 'RunCompleted':
                existing.Status = 'Completed';
                existing.CompletedAt = event.Timestamp;
                break;
            case 'RunDismissed':
                existing.Status = 'Dismissed';
                existing.CompletedAt = event.Timestamp;
                break;
            case 'RunSnoozed':
                existing.Status = 'Snoozed';
                existing.SnoozedUntil = event.SnoozedUntil ?? null;
                break;
            case 'GoalMet':
                existing.GoalMetAt = event.Timestamp;
                break;
        }
    }
}

const SCOPE_ORDER: Record<TourOverrideDefinition['Scope'], number> = {
    Global: 1,
    Role: 2,
    User: 3,
};

/**
 * Merges active `TourOverrideDefinition` rows matching `principal` onto a `TourDefinition`.
 * Precedence order: `User` > `Role` > `Global`, then ascending `Precedence`.
 * Returns `null` if the winning override disables the tour (`IsDisabled === true`).
 */
export function MergeTourOverrides(
    tour: TourDefinition,
    overrides: readonly TourOverrideDefinition[],
    principal?: TourPrincipal,
): TourDefinition | null {
    const matching = overrides
        .filter((ov) => ov.Status === 'Active' && ov.TourKey === tour.TourKey)
        .filter((ov) => overrideMatchesPrincipal(ov, principal))
        .sort((a, b) => {
            const scopeDiff = SCOPE_ORDER[a.Scope] - SCOPE_ORDER[b.Scope];
            return scopeDiff !== 0 ? scopeDiff : a.Precedence - b.Precedence;
        });

    if (matching.length === 0) {
        return tour;
    }

    let merged: TourDefinition = { ...tour };
    for (const ov of matching) {
        if (ov.IsDisabled) {
            return null;
        }
        if (ov.AudienceFilter !== undefined) {
            merged = { ...merged, AudienceFilter: ov.AudienceFilter };
        }
        if (ov.LaunchPolicy) {
            merged = {
                ...merged,
                LaunchPolicy: {
                    ...(merged.LaunchPolicy ?? {}),
                    ...ov.LaunchPolicy,
                },
            };
        }
        if (typeof ov.Priority === 'number') {
            merged = { ...merged, Priority: ov.Priority };
        }
    }

    return merged;
}

function overrideMatchesPrincipal(override: TourOverrideDefinition, principal?: TourPrincipal): boolean {
    if (override.Scope === 'Global') {
        return true;
    }
    if (!principal || principal.Kind !== 'MJUser') {
        return false;
    }
    if (override.Scope === 'User') {
        return override.UserId === principal.UserId;
    }
    if (override.Scope === 'Role') {
        return Boolean(override.RoleName && principal.Roles.includes(override.RoleName));
    }
    return false;
}
