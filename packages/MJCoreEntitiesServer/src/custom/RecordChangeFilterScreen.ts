import {
    BaseEntity,
    CompositeFilter,
    CompositeFilterDescriptor,
    EntityInfo,
    FilterDescriptor,
    IMetadataProvider,
    IsCompositeFilter,
    Metadata,
    ParseStoredRecordKey,
    PreRunViewHook,
    ReadableRecordKeyTexts,
    RecordChangesEntityName,
    RecordKeyText,
    RunViewParams,
    UserInfo,
    UserReadsEveryRecord,
    WellKnownUserSource
} from '@memberjunction/core';
import { MJUserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities';
import { IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import { EntityNamesMatch, ResolveTargetEntityNameAsync } from './ArtifactSecurityHookHelpers';
import { ClauseEquality, ClauseIdentifiers, ReadClauseTokens, TopLevelEqualities } from './RecordChangeClauseReader';

/**
 * Fields of `MJ: Record Changes` that say which record changed, how, by whom and when. Every
 * other field, including any field added later, counts as change content.
 */
const LOCATOR_FIELDS = new Set([
    'id', 'entityid', 'entity', 'recordid', 'userid', 'user', 'type', 'source', 'changedat', 'status',
    'integrationid', 'integration', 'replayrunid', '__mj_createdat', '__mj_updatedat'
]);

const USER_VIEWS_ENTITY_NAME = 'MJ: User Views';
const SAVED_VIEW_REFUSAL = 'The saved view could not be read, so the read of it was not run.';

const CONTENT_REFUSAL =
    'Reads of MJ: Record Changes that filter, sort or search on change content must be limited to one entity ' +
    'whose records the caller can all read, or to one record the caller can read.';
const UNREADABLE_REFUSAL =
    'Reads of MJ: Record Changes must not name the entity\'s own view or table in a filter or sort, and ' +
    'their filters and sorts must use plain SQL, so the change content they test can be checked.';

/** The parts of a read that the database evaluates against change rows. */
interface ReadClauses {
    /** Filter and sort text: ExtraFilter, OverrideExcludeFilter, OrderBy and the saved view's stored text. */
    Texts: string[];
    /** Filter text whose top-level terms can make the read's scope visible: ExtraFilter and the saved view's WhereClause. */
    ScopeTexts: string[];
    /** Field names used by the structured filter and the saved view's declared properties. */
    FieldNames: string[];
    HasSearch: boolean;
}

function textOf(value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value !== 'string') {
        throw new Error(UNREADABLE_REFUSAL);
    }
    return value;
}

/** The saved view the provider will run, loaded the same way the provider loads it. */
async function loadSavedView(params: RunViewParams, user: UserInfo): Promise<MJUserViewEntityExtended | null> {
    if (params.ViewEntity) {
        return params.ViewEntity as MJUserViewEntityExtended;
    }
    if (params.ViewID) {
        return ViewInfo.GetViewEntity(params.ViewID, user);
    }
    if (params.ViewName) {
        return ViewInfo.GetViewEntityByName(params.ViewName, user);
    }
    return null;
}

/**
 * The read with its stored view fixed: a copy of the view from one lookup, set as the read's
 * `ViewEntity`. The provider runs that copy, so a later lookup or a change to the cached view
 * cannot add clauses that the screen did not read. The copy is built for the user the view object
 * was built for (the caller when it has none), so it holds the same fields as the view. Throws when
 * the copy cannot be loaded. A read that names no stored view is returned as is.
 */
async function withFixedSavedView(params: RunViewParams, user: UserInfo, provider: IMetadataProvider): Promise<RunViewParams> {
    const view = await loadSavedView(params, user);
    if (!(view instanceof BaseEntity)) {
        return view ? { ...params, ViewEntity: view } : params;
    }
    const data = view.GetAll();
    const copy = await provider.GetEntityObject<MJUserViewEntityExtended>(USER_VIEWS_ENTITY_NAME, view.ContextCurrentUser ?? user);
    if (!(await copy.LoadFromData(data))) {
        throw new Error(SAVED_VIEW_REFUSAL);
    }
    return { ...params, ViewEntity: copy };
}

function structuredFilterFields(filter: RunViewParams['Filter']): string[] {
    if (!filter) {
        return [];
    }
    const root: CompositeFilterDescriptor | FilterDescriptor = filter instanceof CompositeFilter ? filter.ToDescriptor() : filter;
    const walk = (node: CompositeFilterDescriptor | FilterDescriptor): string[] =>
        IsCompositeFilter(node) ? node.filters.flatMap(walk) : [String(node.field ?? '')];
    return walk(root);
}

async function collectReadClauses(params: RunViewParams, user: UserInfo): Promise<ReadClauses> {
    const view = await loadSavedView(params, user);
    const extraFilter = textOf(params.ExtraFilter);
    const viewWhere = textOf(view?.WhereClause);
    const orderBy = textOf(params.OrderBy) || textOf(view?.OrderByClause);
    return {
        Texts: [extraFilter, textOf(params.OverrideExcludeFilter), orderBy, viewWhere, textOf(view?.SmartFilterWhereClause)],
        ScopeTexts: [extraFilter, viewWhere],
        FieldNames: [
            ...structuredFilterFields(params.Filter),
            ...(view?.PropertiesObject ?? []).map((p) => String(p.Target?.Field ?? ''))
        ],
        HasSearch: textOf(params.UserSearchString).trim().length > 0
    };
}

/** Lower-case names of the entity's content fields. */
function contentFieldNames(entity: EntityInfo): Set<string> {
    return new Set(entity.Fields.map((f) => f.Name.toLowerCase()).filter((n) => !LOCATOR_FIELDS.has(n)));
}

/**
 * True when the read makes the database test change content. Throws when a text cannot be read
 * or names the entity's own view or table, which would let a subquery test other change rows.
 */
function readUsesContent(clauses: ReadClauses, entity: EntityInfo): boolean {
    const content = contentFieldNames(entity);
    const ownObjects = new Set([entity.BaseView, entity.BaseTable].filter(Boolean).map((n) => n.toLowerCase()));
    let usesContent = clauses.HasSearch;
    for (const text of clauses.Texts.filter((t) => t.trim().length > 0)) {
        const tokens = ReadClauseTokens(text);
        if (!tokens) {
            throw new Error(UNREADABLE_REFUSAL);
        }
        const identifiers = ClauseIdentifiers(tokens);
        if (identifiers.some((name) => ownObjects.has(name))) {
            throw new Error(UNREADABLE_REFUSAL);
        }
        usesContent ||= identifiers.some((name) => content.has(name));
    }
    const fieldNames = clauses.FieldNames.map((f) => f.split('.').pop()?.trim().toLowerCase() ?? '');
    return usesContent || fieldNames.some((name) => !LOCATOR_FIELDS.has(name));
}

/** The one entity the read is limited to by top-level equalities, or null when there is not exactly one. */
function scopedEntity(terms: ClauseEquality[], provider: IMetadataProvider): EntityInfo | null {
    const named = terms.filter((t) => t.Column === 'entity' || t.Column === 'entityid');
    const entities = named.map((t) =>
        t.Column === 'entity' ? provider.EntityByName(t.Value) : IsValidUUID(t.Value.trim()) ? provider.EntityByID(t.Value.trim()) : undefined
    );
    if (entities.length === 0 || entities.some((e) => !e)) {
        return null;
    }
    const first = entities[0] as EntityInfo;
    return entities.every((e) => UUIDsEqual((e as EntityInfo).ID, first.ID)) ? first : null;
}

/** The one stored RecordID the read is limited to, or null when there is not exactly one value. */
function scopedRecordID(terms: ClauseEquality[]): string | null {
    const values = [...new Set(terms.filter((t) => t.Column === 'recordid').map((t) => t.Value))];
    return values.length === 1 ? values[0] : null;
}

async function callerReadsRecord(provider: IMetadataProvider, user: UserInfo, entity: EntityInfo, recordID: string | null): Promise<boolean> {
    const key = ParseStoredRecordKey(entity, recordID);
    if (!key) {
        return false;
    }
    const readable = await ReadableRecordKeyTexts(provider, user, entity, [key]);
    return readable?.has(RecordKeyText(entity, key)) ?? false;
}

/**
 * True when every change row the read can reach is one the read hooks keep: the read is limited
 * to one entity whose records the caller all reads, or to one record of an entity that the caller
 * can read.
 */
async function scopeIsVisible(clauses: ReadClauses, provider: IMetadataProvider, user: UserInfo): Promise<boolean> {
    const terms: ClauseEquality[] = [];
    for (const text of clauses.ScopeTexts.filter((t) => t.trim().length > 0)) {
        terms.push(...TopLevelEqualities(ReadClauseTokens(text) ?? []));
    }
    const entity = scopedEntity(terms, provider);
    if (!entity) {
        return false;
    }
    return UserReadsEveryRecord(entity, user) || callerReadsRecord(provider, user, entity, scopedRecordID(terms));
}

function resolveProvider(user: UserInfo, provider?: IMetadataProvider): IMetadataProvider | null {
    return provider ?? user.OwningProvider ?? Metadata.Provider ?? null; // global-provider-ok: fallback when neither the hook nor UserInfo has a provider
}

/**
 * Server-side `PreRunView` hook for `MJ: Record Changes`. The read hook removes change rows the
 * caller may not see only after the database has filtered, sorted, paged and counted them, so a
 * read by a caller who is not the system user may test change content only when every row it can
 * reach is one the caller may see. Such a read is refused before any SQL runs, as is a filter or
 * sort that cannot be read with certainty or that names the entity's own view or table. A read
 * that names a stored view gets a fixed copy of that view, which is the view the provider runs.
 */
export const RecordChangeFilterScreenHook: PreRunViewHook = async (
    params: RunViewParams,
    contextUser: UserInfo | undefined,
    provider?: IMetadataProvider
): Promise<RunViewParams> => {
    const md = contextUser ? resolveProvider(contextUser, provider) : null;
    if (!contextUser || !md || md.ProviderType !== 'Database' || WellKnownUserSource.Instance.IsSystemUser(contextUser)) {
        return params;
    }
    const fixed = await withFixedSavedView(params, contextUser, md);
    const entityName = await ResolveTargetEntityNameAsync(fixed, md, contextUser);
    const entity = EntityNamesMatch(entityName, RecordChangesEntityName, md) ? md.EntityByName(RecordChangesEntityName) : undefined;
    if (!entity) {
        return fixed;
    }
    const clauses = await collectReadClauses(fixed, contextUser);
    if (readUsesContent(clauses, entity) && !(await scopeIsVisible(clauses, md, contextUser))) {
        throw new Error(CONTENT_REFUSAL);
    }
    return fixed;
};
