/**
 * @fileoverview In-memory index of user routine schedules, so the User Routine Dispatcher can say
 * when it next has work without querying the database (#6217).
 *
 * Server only: it lives in the scheduling engine, not in `SchedulingEngineBase`, which browsers load.
 *
 * @module @memberjunction/scheduling-engine
 */

import { BaseEngine, BaseEnginePropertyConfig, BaseEntityEvent, CacheChangedEvent, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJUserRoutineEntity } from '@memberjunction/core-entities';
import { ToEpochMs } from '@memberjunction/global';
import { Observable, Subject } from 'rxjs';
import { RoutineNeedsSeeding, UserRoutineScheduleFields } from './UserRoutineProcessor';

const USER_ROUTINES_ENTITY = 'MJ: User Routines';

/**
 * Holds every `MJ: User Routines` row and answers "when is the next routine due?" from memory.
 *
 * Kept current by BaseEngine entity events: saves and deletes on this server apply at once, and
 * saves on other servers arrive through the shared cache when Redis is configured. Without Redis,
 * the scheduler re-reads the index on its safety-net cadence ({@link EnsureFresh}).
 *
 * The rows are loaded unfiltered (no `Filter`), so the base engine applies entity events through
 * its immediate-mutation path and the index is reconciled by the time {@link Changed$} fires; the
 * Active check is done in memory.
 */
export class UserRoutineScheduleIndex extends BaseEngine<UserRoutineScheduleIndex> {
    public static get Instance(): UserRoutineScheduleIndex {
        return super.getInstance<UserRoutineScheduleIndex>();
    }

    private _routines: MJUserRoutineEntity[] = [];
    private _loadedAt = 0;
    private readonly _changed = new Subject<void>();

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: USER_ROUTINES_ENTITY,
                PropertyName: '_routines',
            },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
        this._loadedAt = Date.now();
        this._changed.next();
    }

    /** True once the routines have been read; until then the dispatcher stays on its cron. */
    public get IsLoaded(): boolean {
        return this._loadedAt > 0;
    }

    /** The routine rows, all statuses. */
    public get Routines(): MJUserRoutineEntity[] {
        return this._routines;
    }

    /** Fires after the index changed (loaded, re-read, or a routine saved or deleted). */
    public get Changed$(): Observable<void> {
        return this._changed.asObservable();
    }

    /**
     * Loads the index the first time, and re-reads it from the database when it is older than
     * `maxAgeMs` (less a small slack, so a timer that wakes on that cadence does re-read). The
     * re-read is what carries routine changes made on another server when there is no Redis.
     */
    public async EnsureFresh(contextUser: UserInfo, provider: IMetadataProvider, maxAgeMs: number, now: number = Date.now()): Promise<void> {
        if (!this.IsLoaded) {
            await this.Config(false, contextUser, provider);
            return;
        }
        const slack = Math.min(60_000, Math.floor(maxAgeMs / 10));
        if (now - this._loadedAt >= maxAgeMs - slack) {
            await this.Config(true, contextUser, provider);
        }
    }

    /**
     * When the dispatcher next has work: now when a routine needs its NextRunAt seeded, otherwise
     * the earliest time an Active routine is due inside its activation window, or null when no
     * routine will ever be due as things stand.
     */
    public NextDueAt(now: Date): Date | null {
        let earliest: number | null = null;
        for (const routine of this._routines) {
            const dueMs = UserRoutineScheduleIndex.RoutineDueAtMs(routine, now);
            if (dueMs !== null && (earliest === null || dueMs < earliest)) {
                earliest = dueMs;
            }
        }
        return earliest === null ? null : new Date(earliest);
    }

    /**
     * When one routine next needs the dispatcher, in epoch ms, or null for never. Mirrors the
     * dispatcher's own checks (`IsRoutineDue`, `RoutineNeedsSeeding`) projected forward in time.
     */
    public static RoutineDueAtMs(routine: UserRoutineScheduleFields, now: Date): number | null {
        if (routine.Status !== 'Active') {
            return null;
        }
        const nowMs = now.getTime();
        const startMs = routine.StartAt != null ? ToEpochMs(routine.StartAt) : null;
        const endMs = routine.EndAt != null ? ToEpochMs(routine.EndAt) : null;

        if (routine.NextRunAt == null) {
            // Needs seeding now, or once its activation window opens.
            if (RoutineNeedsSeeding(UserRoutineScheduleIndex.withDates(routine), now)) {
                return nowMs;
            }
            if (startMs !== null && startMs > nowMs) {
                const opensAt = new Date(startMs);
                return RoutineNeedsSeeding(UserRoutineScheduleIndex.withDates(routine), opensAt) ? startMs : null;
            }
            return null;
        }

        const dueMs = Math.max(ToEpochMs(routine.NextRunAt), startMs ?? Number.MIN_SAFE_INTEGER);
        if (endMs !== null && endMs <= dueMs) {
            return null;
        }
        return dueMs;
    }

    /**
     * The schedule fields with their dates as `Date` objects. They are declared `Date` but can hold
     * an ISO string once a serialized cache payload has replaced the rows, and the processor's
     * helpers call `getTime()` on them.
     */
    private static withDates(routine: UserRoutineScheduleFields): UserRoutineScheduleFields {
        const toDate = (value: Date | null): Date | null => (value == null ? null : new Date(ToEpochMs(value)));
        // Field by field: a routine entity exposes its fields as prototype getters, which a spread drops.
        return {
            Status: routine.Status,
            CronExpression: routine.CronExpression,
            Timezone: routine.Timezone,
            ScheduleMode: routine.ScheduleMode,
            StartAt: toDate(routine.StartAt),
            EndAt: toDate(routine.EndAt),
            NextRunAt: toDate(routine.NextRunAt),
        };
    }

    protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        const handled = await super.HandleIndividualBaseEntityEvent(event);
        if (this.isUserRoutinesEvent(event)) {
            this._changed.next();
        }
        return handled;
    }

    protected override async OnExternalCacheChange(config: BaseEnginePropertyConfig, event: CacheChangedEvent): Promise<void> {
        await super.OnExternalCacheChange(config, event);
        if (config.EntityName?.toLowerCase().trim() === USER_ROUTINES_ENTITY.toLowerCase()) {
            this._changed.next();
        }
    }

    private isUserRoutinesEvent(event: BaseEntityEvent): boolean {
        const name = event.type === 'remote-invalidate'
            ? event.entityName
            : event.baseEntity?.EntityInfo?.Name;
        return name?.toLowerCase().trim() === USER_ROUTINES_ENTITY.toLowerCase();
    }
}
