/**
 * Calendar events tied to MemberJunction records.
 *
 * {@link CalendarEventLinks} creates, updates and cancels an event through a communication provider
 * and keeps its `MJ: Calendar Event Links` row in step, and syncs a calendar's changes back: it reads
 * them with the provider's `SyncEvents`, from the cursor kept in `MJ: Calendar Sync States`, updates
 * the links they touch, and hands each change to the record's entity through a
 * {@link BaseCalendarEventLinkHandler}. That handler is how "the meeting moved in Outlook" reaches the
 * app's own Meeting row: MemberJunction knows the link, only the app knows its record.
 *
 * Nothing here runs unless called; with no links and no syncs, Communication behaves as before.
 */
import { CompositeKey, IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, MJGlobal, OptionalKeyedSpecialization } from '@memberjunction/global';
import type { MJCalendarEventLinkEntity, MJCalendarSyncStateEntity } from '@memberjunction/core-entities';
import {
    BaseCommunicationProvider,
    CalendarEvent,
    CalendarEventChange,
    CalendarEventInput,
    CalendarTarget,
    CalendarTargetError,
    ProviderCredentialsBase,
    SyncEventsResult
} from '@memberjunction/communication-types';
import { CredentialEngine } from '@memberjunction/credentials';
import { CommunicationEngine } from './Engine';

const LINK_ENTITY = 'MJ: Calendar Event Links';
const SYNC_STATE_ENTITY = 'MJ: Calendar Sync States';
const DAY_MS = 24 * 60 * 60 * 1000;
/** The window a full sync reads when the caller gives none. */
const DEFAULT_WINDOW_PAST_DAYS = 30;
const DEFAULT_WINDOW_FUTURE_DAYS = 365;

/**
 * How a call supplies the provider's credentials. All optional: with none, the provider uses its
 * own environment fallback, as every Communication call does. A stored credential (an
 * `MJ: Credentials` row) is decrypted through CredentialEngine, so a scheduled sync needs no code
 * that holds secrets; its values are used alone, with the environment fallback off.
 */
export type CalendarCredentialSource = {
    Credentials?: ProviderCredentialsBase;
    CredentialID?: string;
    CredentialName?: string;
};

export type CreateLinkedEventParams = CalendarCredentialSource & {
    /** The `MJ: Communication Providers` name, e.g. 'Microsoft Graph' or 'Gmail'. */
    ProviderName: string;
    /** Whose calendar. Required: the link records it, and later changes go to the same account. */
    Target: CalendarTarget;
    Event: CalendarEventInput;
    /** The record the event belongs to. */
    EntityName: string;
    RecordKey: CompositeKey;
};

/** Finds a record's active link. `Identifier` narrows it when the record has events in several accounts of one provider. */
export type LinkedEventKey = CalendarCredentialSource & {
    ProviderName: string;
    EntityName: string;
    RecordKey: CompositeKey;
    Identifier?: string;
};

export type UpdateLinkedEventParams = LinkedEventKey & { Changes: Partial<CalendarEventInput> };
export type CancelLinkedEventParams = LinkedEventKey & { Comment?: string };

export type LinkedEventResult = {
    Success: boolean;
    ErrorMessage?: string;
    Link?: MJCalendarEventLinkEntity;
    Event?: CalendarEvent;
};

export type SyncCalendarParams = CalendarCredentialSource & {
    ProviderName: string;
    Target: CalendarTarget;
    /** The window of a full sync (the first, or after the provider refused the token). Default: 30 days back to a year ahead. */
    WindowStart?: Date;
    WindowEnd?: Date;
};

export type SyncCalendarResult = {
    Success: boolean;
    ErrorMessage?: string;
    /** Changes the provider reported. */
    Changes: number;
    /** Links those changes touched. */
    LinksUpdated: number;
    /** The stored token was refused and a full sync of the window ran instead. */
    Resynced: boolean;
    /** Per-link failures. Any of them keeps the old token, so the next sync delivers the same changes again. */
    Errors: string[];
};

/** One change to a linked event, as a {@link BaseCalendarEventLinkHandler} receives it. */
export type CalendarLinkChange = {
    /** The link, already saved with the change (new event ID, status, LastSyncedAt). */
    Link: MJCalendarEventLinkEntity;
    Kind: CalendarEventChange['Kind'];
    /** The event as the calendar now has it: times, location, attendees with their responses. Absent when it was removed. */
    Event?: CalendarEvent;
    /** Removed from the calendar, or cancelled by its organizer. */
    IsCancelled: boolean;
};

/**
 * Applies calendar changes to the records of one entity. Register a subclass with
 * `@RegisterClass(BaseCalendarEventLinkHandler, '<entity name>')`; a sync finds it through the
 * ClassFactory by the link's entity. With none registered, only the link is updated.
 *
 * A change can arrive more than once (a sync that fails anywhere keeps its token and is replayed),
 * so a handler must be idempotent: set the record to the event's state, do not add to it.
 */
@OptionalKeyedSpecialization()
export abstract class BaseCalendarEventLinkHandler {
    /** Returns true when the record was updated (or needed nothing); false to have the sync report it and replay it. */
    public abstract HandleChange(change: CalendarLinkChange, contextUser: UserInfo, provider: IMetadataProvider): Promise<boolean>;
}

type PreparedProvider = { Provider: BaseCommunicationProvider; ProviderID: string; Credentials?: ProviderCredentialsBase };

/** Creates, changes and syncs calendar events tied to records. Stateless; server-side (it needs a context user). */
export class CalendarEventLinks {
    private readonly metadataProvider?: IMetadataProvider;

    /** @param provider - the metadata provider to read and write through. Defaults to the global one. */
    constructor(provider?: IMetadataProvider) {
        this.metadataProvider = provider;
    }

    private get md(): IMetadataProvider {
        return this.metadataProvider ?? Metadata.Provider;
    }

    /**
     * Creates the event in the target calendar (attendees get invitations) and links it to the record,
     * storing the event's iCalendar UID so other calendars' copies can be matched to it.
     */
    public async CreateLinkedEvent(params: CreateLinkedEventParams, contextUser: UserInfo): Promise<LinkedEventResult> {
        try {
            const refusal = CalendarTargetError('CreateLinkedEvent', params.Target);
            const entity = this.md.EntityByName(params.EntityName);
            if (refusal || !entity) return { Success: false, ErrorMessage: refusal ?? `Entity '${params.EntityName}' not found.` };
            const prepared = await this.prepare(params.ProviderName, params, contextUser);
            const created = await prepared.Provider.CreateEvent({ Target: params.Target, Event: params.Event }, prepared.Credentials);
            if (!created.Success || !created.Event) return { Success: false, ErrorMessage: created.ErrorMessage ?? 'The provider returned no event.' };

            const link = await this.md.GetEntityObject<MJCalendarEventLinkEntity>(LINK_ENTITY, contextUser);
            link.CommunicationProviderID = prepared.ProviderID;
            link.AccountIdentifier = params.Target.Identifier.trim();
            link.CalendarID = params.Target.CalendarID?.trim() || null;
            link.EntityID = entity.ID;
            link.RecordID = params.RecordKey.ToCompactURLSegment();
            link.Status = 'Active';
            this.applyEvent(link, created.Event);
            if (!(await link.Save())) {
                // The event exists and invitations are out; say so, with its ID, rather than cancel it behind the caller's back.
                return { Success: false, Event: created.Event, ErrorMessage: `The event was created (${created.Event.ExternalEventID}) but its link was not saved: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}` };
            }
            return { Success: true, Link: link, Event: created.Event };
        } catch (err) {
            return { Success: false, ErrorMessage: this.describe('CreateLinkedEvent', err) };
        }
    }

    /** Changes the record's event in its calendar (attendees get the update) and refreshes the link. */
    public async UpdateLinkedEvent(params: UpdateLinkedEventParams, contextUser: UserInfo): Promise<LinkedEventResult> {
        return this.withLink('UpdateLinkedEvent', params, contextUser, async (link, prepared) => {
            const updated = await prepared.Provider.UpdateEvent({ Target: this.linkTarget(link), ExternalEventID: link.ExternalEventID, Changes: params.Changes }, prepared.Credentials);
            if (!updated.Success) return { Success: false, ErrorMessage: updated.ErrorMessage };
            if (updated.Event) this.applyEvent(link, updated.Event);
            else link.LastSyncedAt = new Date();
            return this.saveLink(link, updated.Event);
        });
    }

    /** Cancels the record's event in its calendar and marks the link Cancelled. */
    public async CancelLinkedEvent(params: CancelLinkedEventParams, contextUser: UserInfo): Promise<LinkedEventResult> {
        return this.withLink('CancelLinkedEvent', params, contextUser, async (link, prepared) => {
            const cancelled = await prepared.Provider.CancelEvent({ Target: this.linkTarget(link), ExternalEventID: link.ExternalEventID, Comment: params.Comment }, prepared.Credentials);
            if (!cancelled.Success) return { Success: false, ErrorMessage: cancelled.ErrorMessage };
            link.Status = 'Cancelled';
            link.LastSyncedAt = new Date();
            return this.saveLink(link);
        });
    }

    /**
     * Syncs one calendar: reads its changes since the stored token (a full sync of the window when
     * there is none, or when the provider refuses it), applies them to the links they touch and to
     * their records, and stores the new token only when every change was applied.
     */
    public async SyncCalendar(params: SyncCalendarParams, contextUser: UserInfo): Promise<SyncCalendarResult> {
        const empty: SyncCalendarResult = { Success: false, Changes: 0, LinksUpdated: 0, Resynced: false, Errors: [] };
        try {
            const refusal = CalendarTargetError('SyncCalendar', params.Target);
            if (refusal) return { ...empty, ErrorMessage: refusal };
            const prepared = await this.prepare(params.ProviderName, params, contextUser);
            const state = await this.loadSyncState(prepared.ProviderID, params.Target, contextUser);
            const read = await this.readChanges(prepared, params, state);
            if (!read.Result.Success) return { ...empty, Resynced: read.Resynced, ErrorMessage: read.Result.ErrorMessage };

            const applied = await this.applyChanges(read.Result.Changes, prepared.ProviderID, params.Target, contextUser);
            const result: SyncCalendarResult = { Success: applied.Errors.length === 0, Changes: read.Result.Changes.length, LinksUpdated: applied.LinksUpdated, Resynced: read.Resynced, Errors: applied.Errors };
            if (!result.Success) return { ...result, ErrorMessage: 'Some changes were not applied; the sync token was kept so they are delivered again.' };
            return await this.storeToken(state, read.Result.NextSyncToken, result);
        } catch (err) {
            return { ...empty, ErrorMessage: this.describe('SyncCalendar', err) };
        }
    }

    // ── provider, credentials ─────────────────────────────────────────────────────────────────

    /** The provider instance, its `MJ: Communication Providers` row ID, and the credentials to call it with. Throws when either is missing. */
    private async prepare(providerName: string, source: CalendarCredentialSource, contextUser: UserInfo): Promise<PreparedProvider> {
        await CommunicationEngine.Instance.Config(false, contextUser, this.md);
        const wanted = providerName.trim().toLowerCase();
        const row = CommunicationEngine.Instance.Providers.find((p) => p.Name.trim().toLowerCase() === wanted);
        if (!row) throw new Error(`Communication provider '${providerName}' not found.`);
        const provider = CommunicationEngine.Instance.GetProvider(row.Name);
        return { Provider: provider, ProviderID: row.ID, Credentials: await this.resolveCredentials(source, contextUser) };
    }

    private async resolveCredentials(source: CalendarCredentialSource, contextUser: UserInfo): Promise<ProviderCredentialsBase | undefined> {
        if (source.Credentials) return source.Credentials;
        if (!source.CredentialID && !source.CredentialName) return undefined;
        await CredentialEngine.Instance.Config(false, contextUser);
        const resolved = await CredentialEngine.Instance.GetCredential(source.CredentialName ?? '', {
            credentialId: source.CredentialID,
            contextUser,
            subsystem: 'Communication'
        });
        const values: ProviderCredentialsBase = { ...resolved.values };
        values.disableEnvironmentFallback = true;
        return values;
    }

    // ── links ─────────────────────────────────────────────────────────────────────────────────

    /** Resolves the provider and the record's one active link, then runs `work` on them. */
    private async withLink(
        operation: string,
        key: LinkedEventKey,
        contextUser: UserInfo,
        work: (link: MJCalendarEventLinkEntity, prepared: PreparedProvider) => Promise<LinkedEventResult>
    ): Promise<LinkedEventResult> {
        try {
            const prepared = await this.prepare(key.ProviderName, key, contextUser);
            const found = await this.findActiveLink(key, prepared.ProviderID, contextUser);
            return typeof found === 'string' ? { Success: false, ErrorMessage: found } : await work(found, prepared);
        } catch (err) {
            return { Success: false, ErrorMessage: this.describe(operation, err) };
        }
    }

    /** The record's active link for the provider, or why there is not exactly one. */
    private async findActiveLink(key: LinkedEventKey, providerID: string, contextUser: UserInfo): Promise<MJCalendarEventLinkEntity | string> {
        const entity = this.md.EntityByName(key.EntityName);
        if (!entity) return `Entity '${key.EntityName}' not found.`;
        const filters = [
            `CommunicationProviderID='${EscapeSQLString(providerID)}'`,
            `EntityID='${EscapeSQLString(entity.ID)}'`,
            `RecordID='${EscapeSQLString(key.RecordKey.ToCompactURLSegment())}'`,
            `Status='Active'`,
            ...(key.Identifier ? [`AccountIdentifier='${EscapeSQLString(key.Identifier.trim())}'`] : [])
        ];
        const links = await this.loadLinks(filters.join(' AND '), contextUser);
        if (links.length === 1) return links[0];
        return links.length === 0
            ? `No active calendar link for ${key.EntityName} ${key.RecordKey.ToCompactURLSegment()} on ${key.ProviderName}.`
            : `${links.length} active calendar links for ${key.EntityName} ${key.RecordKey.ToCompactURLSegment()} on ${key.ProviderName}; pass Identifier to choose one.`;
    }

    private async loadLinks(filter: string, contextUser: UserInfo): Promise<MJCalendarEventLinkEntity[]> {
        const result = await RunView.FromMetadataProvider(this.md).RunView<MJCalendarEventLinkEntity>(
            { EntityName: LINK_ENTITY, ExtraFilter: filter, ResultType: 'entity_object' },
            contextUser
        );
        if (!result.Success) throw new Error(`Loading calendar links failed: ${result.ErrorMessage}`);
        return result.Results ?? [];
    }

    private linkTarget(link: MJCalendarEventLinkEntity): CalendarTarget {
        return { Identifier: link.AccountIdentifier, ...(link.CalendarID ? { CalendarID: link.CalendarID } : {}) };
    }

    /** Copies what the calendar says about the event onto its link. */
    private applyEvent(link: MJCalendarEventLinkEntity, event: CalendarEvent): void {
        if (event.ExternalEventID) link.ExternalEventID = event.ExternalEventID;
        if (event.SeriesID) link.ExternalSeriesID = event.SeriesID;
        if (event.ICalUID) link.ICalUID = event.ICalUID;
        link.LastSyncedAt = new Date();
    }

    private async saveLink(link: MJCalendarEventLinkEntity, event?: CalendarEvent): Promise<LinkedEventResult> {
        if (await link.Save()) return { Success: true, Link: link, Event: event };
        return { Success: false, Event: event, ErrorMessage: `The calendar was changed but the link was not saved: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}` };
    }

    // ── sync ──────────────────────────────────────────────────────────────────────────────────

    /** The calendar's sync state row, or a new unsaved one. */
    private async loadSyncState(providerID: string, target: CalendarTarget, contextUser: UserInfo): Promise<MJCalendarSyncStateEntity> {
        const calendarID = target.CalendarID?.trim() || null;
        const filter = [
            `CommunicationProviderID='${EscapeSQLString(providerID)}'`,
            `AccountIdentifier='${EscapeSQLString(target.Identifier.trim())}'`,
            calendarID ? `CalendarID='${EscapeSQLString(calendarID)}'` : 'CalendarID IS NULL'
        ].join(' AND ');
        const result = await RunView.FromMetadataProvider(this.md).RunView<MJCalendarSyncStateEntity>(
            { EntityName: SYNC_STATE_ENTITY, ExtraFilter: filter, ResultType: 'entity_object', MaxRows: 1 },
            contextUser
        );
        if (!result.Success) throw new Error(`Loading the calendar sync state failed: ${result.ErrorMessage}`);
        if (result.Results?.length) return result.Results[0];
        const state = await this.md.GetEntityObject<MJCalendarSyncStateEntity>(SYNC_STATE_ENTITY, contextUser);
        state.CommunicationProviderID = providerID;
        state.AccountIdentifier = target.Identifier.trim();
        state.CalendarID = calendarID;
        return state;
    }

    /** One SyncEvents call; when the provider refuses the stored token, the token is cleared and a full sync of the window runs. */
    private async readChanges(prepared: PreparedProvider, params: SyncCalendarParams, state: MJCalendarSyncStateEntity): Promise<{ Result: SyncEventsResult; Resynced: boolean }> {
        const first = await this.callSync(prepared, params, state.SyncToken ?? undefined);
        if (!first.ResyncRequired) return { Result: first, Resynced: false };
        state.SyncToken = null;
        if (state.IsSaved && !(await state.Save())) {
            LogError(`SyncCalendar: clearing the refused token failed: ${state.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return { Result: await this.callSync(prepared, params, undefined), Resynced: true };
    }

    private callSync(prepared: PreparedProvider, params: SyncCalendarParams, token: string | undefined): Promise<SyncEventsResult> {
        const now = Date.now();
        return prepared.Provider.SyncEvents(
            {
                Target: params.Target,
                SyncToken: token,
                WindowStart: params.WindowStart ?? new Date(now - DEFAULT_WINDOW_PAST_DAYS * DAY_MS),
                WindowEnd: params.WindowEnd ?? new Date(now + DEFAULT_WINDOW_FUTURE_DAYS * DAY_MS)
            },
            prepared.Credentials
        );
    }

    /**
     * Matches each change to the calendar's active links, by event ID first and iCalendar UID second
     * (a removal carries only the ID), and applies it to each. Changes to unlinked events are skipped.
     *
     * ponytail: loads every active link of the calendar once per sync; filter by the changes' IDs if
     * one calendar ever holds many thousands of links.
     */
    private async applyChanges(changes: CalendarEventChange[], providerID: string, target: CalendarTarget, contextUser: UserInfo): Promise<{ LinksUpdated: number; Errors: string[] }> {
        const outcome = { LinksUpdated: 0, Errors: [] as string[] };
        if (changes.length === 0) return outcome;
        const calendarID = target.CalendarID?.trim() || null;
        const links = await this.loadLinks(
            [
                `CommunicationProviderID='${EscapeSQLString(providerID)}'`,
                `AccountIdentifier='${EscapeSQLString(target.Identifier.trim())}'`,
                calendarID ? `CalendarID='${EscapeSQLString(calendarID)}'` : 'CalendarID IS NULL',
                `Status='Active'`
            ].join(' AND '),
            contextUser
        );
        const byEventID = this.groupBy(links, (l) => l.ExternalEventID);
        const byICalUID = this.groupBy(links, (l) => l.ICalUID);
        for (const change of changes) {
            const matched = byEventID.get(change.ExternalEventID) ?? (change.Event?.ICalUID ? byICalUID.get(change.Event.ICalUID) : undefined) ?? [];
            for (const link of matched) {
                const error = await this.applyChange(link, change, contextUser);
                if (error) outcome.Errors.push(error);
                else outcome.LinksUpdated++;
            }
        }
        return outcome;
    }

    /** Saves the change onto one link, then hands it to the entity's handler. Returns an error, or null. */
    private async applyChange(link: MJCalendarEventLinkEntity, change: CalendarEventChange, contextUser: UserInfo): Promise<string | null> {
        const isCancelled = change.Kind === 'Removed' || change.Event?.IsCancelled === true;
        if (change.Event) this.applyEvent(link, change.Event);
        else link.LastSyncedAt = new Date();
        if (isCancelled) link.Status = 'Cancelled';
        if (!(await link.Save())) return `Link ${link.ID}: ${link.LatestResult?.CompleteMessage ?? 'save failed'}`;

        const handler = this.handlerFor(link.Entity);
        if (!handler) return null;
        try {
            const handled = await handler.HandleChange({ Link: link, Kind: change.Kind, Event: change.Event, IsCancelled: isCancelled }, contextUser, this.md);
            return handled ? null : `Link ${link.ID}: the ${link.Entity} handler did not apply the change.`;
        } catch (err) {
            return `Link ${link.ID}: the ${link.Entity} handler failed: ${err instanceof Error ? err.message : String(err)}`;
        }
    }

    /** The registered handler for an entity, or null when it has none (the link alone is updated). */
    private handlerFor(entityName: string): BaseCalendarEventLinkHandler | null {
        const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseCalendarEventLinkHandler>(BaseCalendarEventLinkHandler, entityName);
        return resolved.Resolved ? resolved.Instance : null;
    }

    private async storeToken(state: MJCalendarSyncStateEntity, token: string | undefined, result: SyncCalendarResult): Promise<SyncCalendarResult> {
        state.SyncToken = token ?? null;
        state.LastSyncedAt = new Date();
        if (await state.Save()) return result;
        return { ...result, Success: false, ErrorMessage: `The changes were applied but the sync token was not saved: ${state.LatestResult?.CompleteMessage ?? 'unknown error'}` };
    }

    private groupBy(links: MJCalendarEventLinkEntity[], keyOf: (link: MJCalendarEventLinkEntity) => string | null): Map<string, MJCalendarEventLinkEntity[]> {
        const groups = new Map<string, MJCalendarEventLinkEntity[]>();
        for (const link of links) {
            const key = keyOf(link);
            if (key) groups.set(key, [...(groups.get(key) ?? []), link]);
        }
        return groups;
    }

    private describe(operation: string, err: unknown): string {
        return `${operation} failed: ${err instanceof Error ? err.message : String(err)}`;
    }
}
