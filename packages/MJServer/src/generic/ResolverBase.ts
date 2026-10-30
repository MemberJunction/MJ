import {
  AggregateExpression,
  AssertClientInputWritableForUser,
  BaseEntity,
  BaseEntityEvent,
  CompositeKey,
  DatabaseProviderBase,
  EntityFieldInfo,
  EntityFieldTSType,
  EntityInfo,
  EntityPermissionType,
  EntitySaveOptions,
  IMetadataProvider,
  IRunViewProvider,
  KeyValuePair,
  LogDebug,
  LogError,
  LogErrorEx,
  LogStatus,
  Metadata,
  ProjectEntityValuesForUser,
  ReadableFieldsTransportKey,
  RecordChangeFieldSecurityProjector,
  RecordChangePayloadFields,
  RunView,
  RunViewParams,
  RunViewResult,
  UserInfo,
  ViewPropertyValues,
} from '@memberjunction/core';
import { MJAuditLogEntity, MJErrorLogEntity, MJUserViewEntityExtended, UserViewEngine } from '@memberjunction/core-entities';

/**
 * Extended RunViewResult carrying a non-enumerable reference to the resolved view entity
 * so downstream resolvers (e.g. RunViewResolver) do not re-query `MJ: User Views` a third time.
 */
export type RunViewResultWithResolvedView<T = unknown> = RunViewResult<T> & {
  _resolvedViewEntity?: MJUserViewEntityExtended;
};
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { ClientClauseScreen, UserCache, type EntityBaseViewAllowList } from '@memberjunction/generic-database-provider';
import { PubSubEngine, AuthorizationError } from 'type-graphql';
import { GraphQLError } from 'graphql';
import { RefusalExtensions } from './refusalExtensions.js';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import sql from 'mssql';
import { httpTransport, CloudEvent, emitterFor } from 'cloudevents';

import { RunViewGenericParams, UserPayload } from '../types.js';
import { RunDynamicViewInput, RunViewByIDInput, RunViewByNameInput } from './RunViewResolver.js';
import { DeleteOptionsInput } from './DeleteOptionsInput.js';
import { MJEvent, MJEventType, MJGlobal, UUIDsEqual, ENCRYPTED_SENTINEL, ReplaceByteArraysWithBase64, EscapeSQLString, IsValueEncrypted, IsOnlyTimezoneShift } from '@memberjunction/global';
import { SQLParser, IsBalancedSQLFragment, LexSQL, StrictFragmentValidator, type StrictStatementReads } from '@memberjunction/sql-parser';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { EncryptionEngine, IsEncryptionKeyUnavailable, ReportEncryptionKeyUnavailable } from '@memberjunction/encryption';
import { PUSH_STATUS_UPDATES_TOPIC, PublishStatusUpdate, StatusUpdateOwnerID } from './PushStatusResolver.js';
import { CACHE_INVALIDATION_TOPIC, MayBroadcastRecordData } from './CacheInvalidationResolver.js';
import { PubSubManager } from './PubSubManager.js';
import { FieldMapper } from '@memberjunction/graphql-dataprovider';
import { Subscription } from 'rxjs';

/**
 * Entities whose update is always hydrated from the stored row, never from the client's `OldValues___`, though they
 * do not track record changes: their server-side write rules compare against the prior state, which a client could
 * otherwise supply itself (lower-case names). See `ResolverBase.MustLoadTruthFromDatabase`.
 *
 * `mj: conversations` and `mj: ai agent sessions` carry the anonymous realtime-session ownership key
 * (`ExternalID` / `ConversationID`), which their server entities refuse an anonymous visitor to change — a rule
 * that decides on `Dirty`, so the baseline must be the stored row, not a client-supplied one (#4931).
 *
 * `mj: projects` (conversation folders) is refused a change to `OwnerUserID` or `ParentID` by anyone but the
 * stored owner, a rule that reads the stored owner, so it must hold even if a host stops tracking its changes.
 */
const ENTITIES_THAT_ALWAYS_LOAD_STORED_ROW: ReadonlySet<string> = new Set([
  'mj: record changes',
  'mj: conversation details',
  'mj: data context items',
  'mj: conversations',
  'mj: ai agent sessions',
  'mj: ai agent runs',
  'mj: projects',
]);

export class ResolverBase {
  private static _emit = process.env.CLOUDEVENTS_HTTP_TRANSPORT ? emitterFor(httpTransport(process.env.CLOUDEVENTS_HTTP_TRANSPORT)) : null;
  private static _cloudeventsHeaders = process.env.CLOUDEVENTS_HTTP_HEADERS ? JSON.parse(process.env.CLOUDEVENTS_HTTP_HEADERS) : {};

  private static _eventSubscriptionKey: string = '___MJServer___ResolverBase___EventSubscriptions';
  private get eventSubscriptions(): Map<string, Subscription> {
    // here we use the global object store instead of a static member becuase in some cases based on import code paths/bundling/etc, the static member
    // could actually be duplicated and we'd end up with multiple instances of the same map, which would be bad.
    const g = MJGlobal.Instance.GetGlobalObjectStore();
    if (!g[ResolverBase._eventSubscriptionKey]) {
      LogDebug(`>>>>> MJServer.ResolverBase.EventSubscriptions: Creating new Map - this should only happen once per server instance <<<<<<`);
      g[ResolverBase._eventSubscriptionKey] = new Map<string, Subscription>();
    }
    return g[ResolverBase._eventSubscriptionKey];
  }

  /**
   * Maps field names to their GraphQL-safe CodeNames and handles encryption for API responses.
   *
   * For encrypted fields coming from raw SQL queries (not entity objects):
   * - AllowDecryptInAPI=true: Decrypt the value before sending to client
   * - AllowDecryptInAPI=false + SendEncryptedValue=true: Keep encrypted ciphertext
   * - AllowDecryptInAPI=false + SendEncryptedValue=false: Replace with sentinel
   *
   * Returns a COPY — `dataObject` is never written to. Callers routinely pass rows straight
   * from `findBy`/`RunView`, which are the server cache's own objects held by reference, and
   * `LocalCacheManager` deep-freezes them. Renaming in place therefore threw
   * `Cannot add property _mj__CreatedAt, object is not extensible` on every `UserByEmail` /
   * `UserByID` / `UserByEmployeeID` call and on every generated single-record resolver whose
   * entity has caching enabled. (Before the freeze it did something worse but quieter: it
   * rewrote the cached row's keys, so later readers were served transport-shaped rows that
   * `BaseEntity.SetMany` rejects.) Copying here fixes every call site at once and makes the
   * hazard unreachable for future ones.
   *
   * @param entityName - The entity name
   * @param dataObject - The data object with field values. Not modified.
   * @param contextUser - Optional user context for decryption (required for encrypted fields)
   * @returns A new object in transport shape, or null when there is nothing to map
   */
  /**
   * Precomputed per-entity / per-request field-mapping plan shared across rows in
   * {@link MapFieldNamesToCodeNames} and {@link ArrayMapFieldNamesToCodeNames}.
   */
  private buildFieldMappingPlan(
    entityName: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    deniedReadFields?: Set<string>,
    recordChangeProjector?: RecordChangeFieldSecurityProjector
  ): {
    entityInfo: EntityInfo;
    fieldsToProcess: Array<{ name: string; mappedFieldName: string; isDenied: boolean }>;
    readableFields: string[] | null;
    projector: RecordChangeFieldSecurityProjector | undefined;
    encryptedFields: EntityFieldInfo[];
    checkBinary: boolean;
  } {
    const md = provider ?? new Metadata();
    const entityInfo = md.EntityByName(entityName);
    if (!entityInfo) throw new Error(`Entity ${entityName} not found in metadata`);

    const denied = deniedReadFields ?? (
      entityInfo.FieldLevelSecurityApplies && contextUser
        ? entityInfo.GetDeniedReadFields(contextUser)
        : null
    );

    const mapper = new FieldMapper();
    const fieldsToProcess: Array<{ name: string; mappedFieldName: string; isDenied: boolean }> = [];
    for (const f of entityInfo.Fields) {
      const mappedFieldName = mapper.MapFieldName(f.CodeName);
      const isDenied = Boolean(denied?.has(f.Name.trim().toLowerCase()));
      if (isDenied || mappedFieldName !== f.Name) {
        fieldsToProcess.push({ name: f.Name, mappedFieldName, isDenied });
      }
    }

    const readableFields = this.BuildReadableFieldsTransportValue(entityInfo, denied);
    const projector = contextUser && RecordChangeFieldSecurityProjector.IsRecordChangesEntity(entityInfo)
      ? (recordChangeProjector ?? new RecordChangeFieldSecurityProjector(md, contextUser))
      : undefined;
    const encryptedFields = entityInfo.EncryptedFields ?? [];
    const checkBinary = entityInfo.HasBinaryFields !== false;

    return {
      entityInfo,
      fieldsToProcess,
      readableFields,
      projector,
      encryptedFields,
      checkBinary,
    };
  }

  /**
   * Applies synchronous field renaming, FLS stripping, readable-fields transport stamping, and
   * Record Changes payload projection for a single row using a precomputed mapping plan.
   */
  private mapRowSynchronously(
    dataObject: Record<string, unknown> | null | undefined,
    plan: ReturnType<ResolverBase['buildFieldMappingPlan']>
  ): Record<string, unknown> | null {
    if (!dataObject || Object.keys(dataObject).length === 0) {
      return null;
    }
    let row: Record<string, unknown> = plan.checkBinary
      ? ReplaceByteArraysWithBase64({ ...dataObject })
      : { ...dataObject };

    for (let i = 0; i < plan.fieldsToProcess.length; i++) {
      const fp = plan.fieldsToProcess[i];
      if (Object.prototype.hasOwnProperty.call(row, fp.name)) {
        if (fp.isDenied) {
          delete row[fp.name];
          delete row[fp.mappedFieldName];
        } else {
          row[fp.mappedFieldName] = row[fp.name];
          delete row[fp.name];
        }
      }
    }

    if (plan.readableFields) {
      row[ReadableFieldsTransportKey] = plan.readableFields;
    }

    if (plan.projector) {
      row = plan.projector.ProjectRow(row);
    }

    return row;
  }

  /**
   * Decrypts or masks encrypted fields on a mapped row when `plan.encryptedFields.length > 0`.
   */
  private async decryptRowEncryptedFields(
    row: Record<string, unknown>,
    encryptedFields: EntityFieldInfo[],
    contextUser?: UserInfo
  ): Promise<void> {
    for (const field of encryptedFields) {
      const fieldName = field.CodeName;
      const value = row[fieldName];

      if (value === null || value === undefined) continue;

      const engine = EncryptionEngine.Instance;
      await engine.Config(false, contextUser);
      const keyMarker = field.EncryptionKeyID ? engine.GetKeyByID(field.EncryptionKeyID)?.Marker : undefined;
      if (typeof value === 'string' && IsValueEncrypted(value, keyMarker)) {
        if (field.AllowDecryptInAPI) {
          if (contextUser) {
            try {
              const decryptedValue = await engine.Decrypt(value, contextUser);
              row[fieldName] = decryptedValue;
            } catch (err) {
              if (IsEncryptionKeyUnavailable(err)) {
                ReportEncryptionKeyUnavailable(err);
              } else {
                LogError(`Failed to decrypt field ${fieldName} for API response: ${err}`);
              }
              row[fieldName] = ENCRYPTED_SENTINEL;
            }
          } else {
            row[fieldName] = ENCRYPTED_SENTINEL;
          }
        } else if (!field.SendEncryptedValue) {
          row[fieldName] = ENCRYPTED_SENTINEL;
        }
      }
    }
  }

  protected async MapFieldNamesToCodeNames(
    entityName: string,
    dataObject: any,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    deniedReadFields?: Set<string>,
    recordChangeProjector?: RecordChangeFieldSecurityProjector
  ): Promise<any> {
    if (!dataObject || Object.keys(dataObject).length === 0) {
      return null;
    }
    const plan = this.buildFieldMappingPlan(entityName, contextUser, provider, deniedReadFields, recordChangeProjector);
    const mapped = this.mapRowSynchronously(dataObject as Record<string, unknown>, plan);
    if (mapped && plan.encryptedFields.length > 0) {
      await this.decryptRowEncryptedFields(mapped, plan.encryptedFields, contextUser);
    }
    return mapped;
  }

  /**
   * Reverse-maps GraphQL-safe field names back to entity CodeNames in a mutation input object.
   * For example, `_mj__integration_SyncStatus` is mapped back to `__mj_integration_SyncStatus`.
   * Also reverse-maps keys inside the `OldValues___` array if present.
   * This is the inverse of MapFieldNamesToCodeNames and must be called before passing
   * GraphQL input to entity SetMany() or field lookups.
   */
  protected ReverseMapInputFieldNames(input: Record<string, unknown>): Record<string, unknown> {
    const mapper = new FieldMapper();
    const mapped: Record<string, unknown> = {};
    for (const key of Object.keys(input)) {
      if (key === 'OldValues___') {
        // Reverse-map the Key property inside each OldValues entry
        const oldValues = input[key] as Array<{ Key: string; Value: unknown }>;
        mapped[key] = oldValues.map((item) => ({
          Key: mapper.ReverseMapFieldName(item.Key),
          Value: item.Value,
        }));
      } else if (key === 'RestoreContext___') {
        // Pass through the restore-context blob unchanged — its inner field
        // names (SourceChangeID, Reason) are not entity-field names.
        mapped[key] = input[key];
      } else {
        mapped[mapper.ReverseMapFieldName(key)] = input[key];
      }
    }
    return mapped;
  }

  /**
   * Applies an inbound RestoreContext___ blob to a server-side BaseEntity.
   * Mirrors the OldValues___ pattern — the client-side BaseEntity's
   * `_restoreContext` doesn't traverse the network, so the server must
   * reconstruct it from the mutation input before calling Save().
   *
   * Returns true when context was applied; false when no context was on the input.
   */
  protected applyRestoreContext(
    entityObject: BaseEntity,
    input: { RestoreContext___?: { SourceChangeID?: string; Reason?: string | null } | null },
  ): boolean {
    const ctx = input?.RestoreContext___;
    if (!ctx || !ctx.SourceChangeID) return false;
    entityObject.SetRestoreContext(ctx.SourceChangeID, ctx.Reason ?? null);
    return true;
  }

  /**
   * Array form of {@link MapFieldNamesToCodeNames}. Returns a NEW array of NEW objects; neither
   * the input array nor its rows are modified. Both matter: the cache freezes the array as well
   * as the rows it contains, so collecting the mapped copies (rather than mapping in place and
   * returning the original) is what makes this safe on cache-served input.
   */
  protected async ArrayMapFieldNamesToCodeNames(entityName: string, dataObjectArray: any[], contextUser?: UserInfo, provider?: IMetadataProvider): Promise<any[]> {
    if (!dataObjectArray || dataObjectArray.length === 0) {
      return dataObjectArray;
    }
    // Precompute the entity lookup, FieldMapper plan, denied-fields set, readable-fields list,
    // and Record Changes projector ONCE for the whole array rather than per row.
    const plan = this.buildFieldMappingPlan(entityName, contextUser, provider);
    const hasEncryptedFields = plan.encryptedFields.length > 0;
    const mapped: Array<Record<string, unknown> | null> = new Array(dataObjectArray.length);
    for (let i = 0; i < dataObjectArray.length; i++) {
      const row = this.mapRowSynchronously(dataObjectArray[i] as Record<string, unknown>, plan);
      if (row && hasEncryptedFields) {
        await this.decryptRowEncryptedFields(row, plan.encryptedFields, contextUser);
      }
      mapped[i] = row;
    }
    return mapped;
  }

  /**
   * The CodeNames this user may read on this entity, for the field-security transport key — or
   * null when there is nothing to state (no denials, so every field is readable and the client
   * needs no help distinguishing a withheld null from a genuine one).
   *
   * Carries entity field NAMES, not CodeNames and not the `_mj__` transport shape. The client
   * consumes this after it has already reversed the transport mapping, and it matches names
   * against `EntityFieldInfo.Name` — the same key the denied set itself is built from. Sending
   * the one shape both sides already agree on avoids a second mapping that could drift.
   */
  protected BuildReadableFieldsTransportValue(
    entityInfo: EntityInfo,
    deniedReadFields: Set<string> | null | undefined
  ): string[] | null {
    if (!deniedReadFields || deniedReadFields.size === 0) {
      return null;
    }
    return entityInfo.Fields
      .filter((f) => !deniedReadFields.has(f.Name.trim().toLowerCase()))
      .map((f) => f.Name);
  }

  /**
   * Loads a single external-data-source-backed entity record by primary key and returns it in
   * GraphQL field-name (CodeName) shape, or null if not found.
   *
   * External entities (`Entity.ExternalDataSourceID` set) have no MJ base view or sproc — their
   * data is proxied live from a remote system — so the generated single-record resolver cannot run
   * `SELECT * FROM <baseView>`. Instead it loads through a BaseEntity object, whose `InnerLoad`
   * the data provider dispatches to the external read router's `LoadExternalRecord` (a composite-key
   * aware, quoted, parameter-bound single-record lookup), applying the same RLS gate and field
   * post-processing (decryption / datetime normalization) as the MJ-DB path. The caller is
   * responsible for the `CheckUserReadPermissions` gate beforehand.
   */
  protected async LoadExternalRecordByKey<T>(
    entityName: string,
    compositeKey: CompositeKey,
    provider: DatabaseProviderBase,
    userPayload: UserPayload,
  ): Promise<T | null> {
    const contextUser = this.GetUserFromPayload(userPayload);
    const entityObject = await provider.GetEntityObject(entityName, contextUser);
    const loaded = await entityObject.InnerLoad(compositeKey);
    if (!loaded) {
      return null;
    }
    // fls-guard: MapFieldNamesToCodeNames drops the fields the caller may not read
    const mapped = await this.MapFieldNamesToCodeNames(entityName, entityObject.GetAll(), contextUser);
    return mapped as T;
  }

  /**
   * Filters encrypted field values before sending to the API client.
   *
   * For each encrypted field in the entity:
   * - If AllowDecryptInAPI is true: value passes through unchanged (already decrypted by data provider)
   * - If AllowDecryptInAPI is false and SendEncryptedValue is true: re-encrypt and send ciphertext
   * - If AllowDecryptInAPI is false and SendEncryptedValue is false: replace with sentinel value
   *
   * @param entityName - Name of the entity
   * @param dataObject - The data object containing field values
   * @param encryptionEngine - Optional encryption engine for re-encryption (lazy loaded if needed)
   * @param contextUser - User context for encryption operations
   * @param fieldKey - What the object's keys are: field CodeNames (GraphQL transport rows, the
   *   default) or field Names (raw provider rows, such as dataset item results)
   * @returns The filtered data object
   */
  protected async FilterEncryptedFieldsForAPI(
    entityName: string,
    dataObject: Record<string, unknown>,
    contextUser: UserInfo,
    provider?: IMetadataProvider,
    fieldKey: 'CodeName' | 'Name' = 'CodeName'
  ): Promise<Record<string, unknown>> {
    if (!dataObject) return dataObject;

    const md = provider ?? new Metadata();
    const entityInfo = md.EntityByName(entityName);
    if (!entityInfo) return dataObject;

    // Find all encrypted fields that need filtering
    const encryptedFields = entityInfo.EncryptedFields;
    if (encryptedFields.length === 0) return dataObject;

    // Process each encrypted field
    for (const field of encryptedFields) {
      const fieldName = fieldKey === 'Name' ? field.Name : field.CodeName;
      const value = dataObject[fieldName];

      // Skip null/undefined values
      if (value === null || value === undefined) continue;

      // If AllowDecryptInAPI is true, the decrypted value passes through
      if (field.AllowDecryptInAPI) continue;

      // AllowDecryptInAPI is false - we need to filter the value
      const engine = EncryptionEngine.Instance;
      await engine.Config(false, contextUser);
      const keyMarker = field.EncryptionKeyID ? engine.GetKeyByID(field.EncryptionKeyID)?.Marker : undefined;
      if (field.SendEncryptedValue) {
        // Re-encrypt the value before sending
        // Only re-encrypt if it's not already encrypted (data provider decrypted it)
        if (typeof value === 'string' && !IsValueEncrypted(value, keyMarker)) {
          try {
            const encryptedValue = await engine.Encrypt(
              value,
              field.EncryptionKeyID as string,
              contextUser
            );
            dataObject[fieldName] = encryptedValue;
          } catch (err) {
            // If re-encryption fails, use sentinel for safety
            LogError(`Failed to re-encrypt field ${fieldName} for API response: ${err}`);
            dataObject[fieldName] = ENCRYPTED_SENTINEL;
          }
        }
        // If already encrypted (shouldn't happen normally), keep as-is
      } else {
        // SendEncryptedValue is false - replace with sentinel
        dataObject[fieldName] = ENCRYPTED_SENTINEL;
      }
    }

    return dataObject;
  }

  /**
   * Filters encrypted fields for an array of data objects. `fieldKey` is as for
   * {@link FilterEncryptedFieldsForAPI}.
   */
  protected async ArrayFilterEncryptedFieldsForAPI(
    entityName: string,
    dataObjectArray: Record<string, unknown>[],
    contextUser: UserInfo,
    provider?: IMetadataProvider,
    fieldKey: 'CodeName' | 'Name' = 'CodeName'
  ): Promise<Record<string, unknown>[]> {
    if (!dataObjectArray || dataObjectArray.length === 0) return dataObjectArray;

    // Check if entity has any encrypted fields first to avoid unnecessary processing
    const md = provider ?? new Metadata();
    const entityInfo = md.EntityByName(entityName);
    if (!entityInfo) return dataObjectArray;

    const encryptedFields = entityInfo.Fields.filter(f => f.Encrypt && !f.AllowDecryptInAPI);
    if (encryptedFields.length === 0) return dataObjectArray;

    // Process each element
    for (const element of dataObjectArray) {
      await this.FilterEncryptedFieldsForAPI(entityName, element, contextUser, provider, fieldKey);
    }

    return dataObjectArray;
  }

  /**
   * Renders one `findBy` predicate value as the SQL literal text it will become inside the
   * `ExtraFilter` that method builds.
   *
   * The two slots have different exposure, so they are handled differently:
   *
   * - **Quoted slot** (`NeedsQuotes` — every type except Number and Boolean). The value sits
   *   inside a single-quoted literal, so it is escaped with `EscapeSQLString`: quotes are
   *   doubled and null bytes stripped, leaving the payload inert *inside* the literal.
   * - **Unquoted slot** (Number and Boolean fields). There is no literal to break out of
   *   here — the value lands in the clause bare, so a string value simply *is* SQL and no
   *   amount of quote escaping helps. Only a genuine number or boolean is accepted; anything
   *   else is refused rather than interpolated. Numeric and boolean strings are accepted too
   *   (a client may legitimately send `"42"`), since neither can carry SQL.
   *
   * A `null`/`undefined` value is refused in either slot. `EscapeSQLString` maps both to `''`
   * by design, which would silently turn a by-value lookup into `Field = ''` — for this
   * caller a missing value is a bug, not a query.
   *
   * @param value the raw value supplied for the field
   * @param fieldName field name, for the error message
   * @param entity entity name, for the error message
   * @param needsQuotes whether the field's type requires a quoted literal
   * @returns the literal text (including quotes when the slot is quoted)
   * @throws when the value cannot be rendered safely for the slot it is destined for
   */
  private formatFilterValue(value: unknown, fieldName: string, entity: string, needsQuotes: boolean): string {
    if (value === null || value === undefined) {
      throw new Error(
        `Field ${fieldName} in entity ${entity} was given a ${value === null ? 'null' : 'undefined'} value. findBy builds an equality predicate, which needs a value to compare against.`
      );
    }

    if (needsQuotes) {
      return `'${EscapeSQLString(String(value))}'`;
    }

    // Unquoted slot — accept only what cannot carry SQL, and render it exactly as before.
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      return String(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
      if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase();
    }

    throw new Error(
      `Field ${fieldName} in entity ${entity} is a numeric or boolean field, so its value is not quoted in the filter — only a number or boolean can be used. Received: ${typeof value}.`
    );
  }

  protected async findBy<T = any>(provider: DatabaseProviderBase, entity: string, params: any, contextUser: UserInfo): Promise<Array<T>> {
    // build the SQL query based on the params passed in
    const rv = provider as any as IRunViewProvider;
    const e = provider.Entities.find((e) => e.Name === entity);
    if (!e) throw new Error(`Entity ${entity} not found in metadata`);
    // now build a SQL string using the entityInfo and using the properties in the params object
    let extraFilter = "";
    const keys = Object.keys(params);
    keys.forEach((k, i) => {
      if (i > 0) extraFilter += ' AND ';
      // look up the field in the entityInfo to see if it needs quotes
      const field = e.Fields.find((f) => f.Name === k);
      if (!field) throw new Error(`Field ${k} not found in entity ${entity}`);
      extraFilter += `${k} = ${this.formatFilterValue(params[k], k, entity, field.NeedsQuotes)}`;
    });

    // ok, now we have a SQL string, run it and return the results
    // use the SQLServerDataProvider
    const result = await rv.RunView({
      EntityName: entity,
      ExtraFilter: extraFilter,
    }, contextUser)
    if (result && result.Success && result.Results.length > 0) {
      return result.Results;
    }
    else {
      return [];
    }
  }

  /**
   * Resolves a User View by name, consulting the in-memory {@link UserViewEngine} cache first
   * and falling back to a database `RunView` only on a cache miss.
   */
  protected async resolveUserViewByName(
    viewName: string,
    provider: DatabaseProviderBase,
    contextUser?: UserInfo,
  ): Promise<MJUserViewEntityExtended | null> {
    if (UserViewEngine.Instance.Loaded) {
      const cached = UserViewEngine.Instance.GetViewByName(viewName);
      if (cached) {
        return cached;
      }
    }
    const rv = provider as unknown as IRunViewProvider;
    const result = await rv.RunView<MJUserViewEntityExtended>({
      EntityName: 'MJ: User Views',
      // SECURITY: the view name is client-supplied and lands inside a SQL literal.
      ExtraFilter: "Name='" + EscapeSQLString(viewName) + "'",
    }, contextUser);
    if (result && result.Success && result.Results.length > 0) {
      return result.Results[0];
    }
    return null;
  }

  /**
   * Resolves a User View by ID, consulting the in-memory {@link UserViewEngine} cache first
   * and falling back to an entity `Load()` only on a cache miss.
   */
  protected async resolveUserViewByID(
    viewID: string,
    provider: DatabaseProviderBase,
    contextUser?: UserInfo,
  ): Promise<MJUserViewEntityExtended | null> {
    if (UserViewEngine.Instance.Loaded) {
      const cached = UserViewEngine.Instance.GetViewById(viewID);
      if (cached) {
        return cached;
      }
    }
    const viewInfo = await provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', contextUser);
    await viewInfo.Load(viewID);
    return viewInfo;
  }

  async RunViewByNameGeneric(viewInput: RunViewByNameInput, provider: DatabaseProviderBase, userPayload: UserPayload, pubSub: PubSubEngine) {
    try {
      // Log aggregate input for debugging
      if (viewInput.Aggregates?.length) {
        LogStatus(`[ResolverBase] RunViewByNameGeneric received aggregates: viewName=${viewInput.ViewName}, aggregateCount=${viewInput.Aggregates.length}, aggregates=${JSON.stringify(viewInput.Aggregates.map(a => ({ expression: a.expression, alias: a.alias })))}`);
      }

      const viewInfo = await this.resolveUserViewByName(viewInput.ViewName, provider, userPayload.userRecord);
      if (viewInfo) {
        return this.RunViewGenericInternal(
          provider,
          viewInfo,
          viewInput.ExtraFilter,
          viewInput.OrderBy,
          viewInput.UserSearchString,
          viewInput.ExcludeUserViewRunID,
          viewInput.OverrideExcludeFilter,
          viewInput.SaveViewResults,
          viewInput.Fields,
          viewInput.IgnoreMaxRows,
          viewInput.ExcludeDataFromAllPriorViewRuns,
          viewInput.ForceAuditLog,
          viewInput.AuditLogDescription,
          viewInput.ResultType,
          userPayload,
          viewInput.MaxRows,
          viewInput.StartRow,
          viewInput.Aggregates,
          viewInput.AfterKey
            ? CompositeKey.FromKeyValuePairs((viewInput.AfterKey as { KeyValuePairs: { FieldName: string; Value: string }[] }).KeyValuePairs)
            : undefined,
          viewInput.BypassCache,
          viewInput.DataSource,
          viewInput.IncludeBinaryFields,
          viewInput.AlternateBaseView,
          viewInput.Properties
        );
      }
      else {
        LogError(`RunViewByNameGeneric: View ${viewInput.ViewName} not found or no results returned`);
        return null;
      }
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  async RunViewByIDGeneric(viewInput: RunViewByIDInput, provider: DatabaseProviderBase, userPayload: UserPayload, pubSub: PubSubEngine) {
    try {
      // Log aggregate input for debugging
      if (viewInput.Aggregates?.length) {
        LogStatus(`[ResolverBase] RunViewByIDGeneric received aggregates: viewID=${viewInput.ViewID}, aggregateCount=${viewInput.Aggregates.length}, aggregates=${JSON.stringify(viewInput.Aggregates.map(a => ({ expression: a.expression, alias: a.alias })))}`);
      }

      const contextUser = this.GetUserFromPayload(userPayload);
      const viewInfo = await this.resolveUserViewByID(viewInput.ViewID, provider, contextUser);
      if (!viewInfo) {
        return null;
      }
      return this.RunViewGenericInternal(
        provider,
        viewInfo,
        viewInput.ExtraFilter,
        viewInput.OrderBy,
        viewInput.UserSearchString,
        viewInput.ExcludeUserViewRunID,
        viewInput.OverrideExcludeFilter,
        viewInput.SaveViewResults,
        viewInput.Fields,
        viewInput.IgnoreMaxRows,
        viewInput.ExcludeDataFromAllPriorViewRuns,
        viewInput.ForceAuditLog,
        viewInput.AuditLogDescription,
        viewInput.ResultType,
        userPayload,
        viewInput.MaxRows,
        viewInput.StartRow,
        viewInput.Aggregates,
        undefined,
        viewInput.BypassCache,
        viewInput.DataSource,
        viewInput.IncludeBinaryFields,
        viewInput.AlternateBaseView,
        viewInput.Properties
      );
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  async RunDynamicViewGeneric(viewInput: RunDynamicViewInput, provider: DatabaseProviderBase, userPayload: UserPayload, pubSub: PubSubEngine) {
    try {
      // Log aggregate input for debugging
      if (viewInput.Aggregates?.length) {
        LogStatus(`[ResolverBase] RunDynamicViewGeneric received aggregates: entityName=${viewInput.EntityName}, aggregateCount=${viewInput.Aggregates.length}, aggregates=${JSON.stringify(viewInput.Aggregates.map(a => ({ expression: a.expression, alias: a.alias })))}`);
      }

      const md = provider;
      const entity = md.Entities.find((e) => e.Name === viewInput.EntityName);
      if (!entity) throw new Error(`Entity ${viewInput.EntityName} not found in metadata`);

      const viewInfo: MJUserViewEntityExtended = {
        ID: '',
        Entity: viewInput.EntityName,
        EntityID: entity.ID,
        EntityBaseView: entity.BaseView as string,
      } as MJUserViewEntityExtended; // only providing a few bits of data here, but it's enough to get the view to run

      return this.RunViewGenericInternal(
        provider,
        viewInfo,
        viewInput.ExtraFilter,
        viewInput.OrderBy,
        viewInput.UserSearchString,
        viewInput.ExcludeUserViewRunID,
        viewInput.OverrideExcludeFilter,
        false,
        viewInput.Fields,
        viewInput.IgnoreMaxRows,
        false,
        viewInput.ForceAuditLog,
        viewInput.AuditLogDescription,
        viewInput.ResultType,
        userPayload,
        viewInput.MaxRows,
        viewInput.StartRow,
        viewInput.Aggregates,
        undefined,
        viewInput.BypassCache,
        viewInput.DataSource,
        viewInput.IncludeBinaryFields,
        viewInput.AlternateBaseView
      );
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  async RunViewsGeneric(
    viewInputs: (RunViewByNameInput & RunViewByIDInput & RunDynamicViewInput)[],
    provider: DatabaseProviderBase,
    userPayload: UserPayload
  ) {
    const md = provider;
    const contextUser = this.GetUserFromPayload(userPayload);
    let params: RunViewGenericParams[] = [];
    for (const viewInput of viewInputs) {
      try {
        let viewInfo: MJUserViewEntityExtended | null = null;

        if (viewInput.ViewName) {
          viewInfo = await this.resolveUserViewByName(viewInput.ViewName, provider, userPayload.userRecord);
          // Populate EntityName on the input so callers (e.g. RunViews resolver) can
          // look up the entity without re-querying the view
          if (viewInfo && !viewInput.EntityName) {
            viewInput.EntityName = viewInfo.Entity;
          }
        } else if (viewInput.ViewID) {
          viewInfo = await this.resolveUserViewByID(viewInput.ViewID, provider, contextUser);
          // Populate EntityName on the input so callers can look up the entity
          if (viewInfo && !viewInput.EntityName) {
            viewInput.EntityName = viewInfo.Entity;
          }
        } else if (viewInput.EntityName) {
          const entity = md.Entities.find((e) => e.Name === viewInput.EntityName);
          if (!entity) {
            throw new Error(`Entity ${viewInput.EntityName} not found in metadata`);
          }

          // only providing a few bits of data here, but it's enough to get the view to run
          viewInfo = {
            ID: '',
            Entity: viewInput.EntityName,
            EntityID: entity.ID,
            EntityBaseView: entity.BaseView,
          } as MJUserViewEntityExtended;
        } else {
          throw new Error('Unable to determine input type');
        }

        params.push({
          viewInfo,
          provider,
          extraFilter: viewInput.ExtraFilter,
          orderBy: viewInput.OrderBy,
          userSearchString: viewInput.UserSearchString,
          excludeUserViewRunID: viewInput.ExcludeUserViewRunID,
          overrideExcludeFilter: viewInput.OverrideExcludeFilter,
          saveViewResults: viewInput.EntityName ? false : viewInput.SaveViewResults,
          fields: viewInput.Fields,
          ignoreMaxRows: viewInput.IgnoreMaxRows,
          maxRows: viewInput.MaxRows,
          startRow: viewInput.StartRow,
          afterKey: viewInput.AfterKey
            ? CompositeKey.FromKeyValuePairs((viewInput.AfterKey as { KeyValuePairs: { FieldName: string; Value: string }[] }).KeyValuePairs)
            : undefined,
          excludeDataFromAllPriorViewRuns: viewInput.EntityName ? false : viewInput.ExcludeDataFromAllPriorViewRuns,
          forceAuditLog: viewInput.ForceAuditLog,
          auditLogDescription: viewInput.AuditLogDescription,
          resultType: viewInput.ResultType,
          userPayload,
          aggregates: viewInput.Aggregates,
          bypassCache: viewInput.BypassCache,
          dataSource: viewInput.DataSource,
          includeBinaryFields: viewInput.IncludeBinaryFields,
          alternateBaseView: viewInput.AlternateBaseView,
          properties: viewInput.Properties,
        });
      } catch (err) {
        LogError(err);
        return null;
      }
    }

    let results: RunViewResult[] = await this.RunViewsGenericInternal(params);
    return results;
  }

  /**
   * What an entity event may carry to a CloudEvents sink or a log line.
   *
   * The whole row for an entity without field security. For one where it applies (its own flag
   * or an IS-A ancestor's), and for `MJ: Record Changes` (whose payload columns hold other
   * entities' values), only the primary key and the names of the fields that changed: the sink
   * is outside MemberJunction with no reader to project the row for, and these events fire for
   * server-internal saves too, whose objects hold every column.
   */
  protected EntityEventPayload(baseEntity: BaseEntity, changedFieldNames?: string[]): Record<string, unknown> {
    const entityInfo = baseEntity.EntityInfo;
    if (!entityInfo?.FieldLevelSecurityApplies && !RecordChangeFieldSecurityProjector.IsRecordChangesEntity(entityInfo)) {
      // fls-guard: entity without field security and not the audit trail; whole row is the documented payload
      return baseEntity.GetAll();
    }
    return {
      // Read through Get() rather than PrimaryKey, which builds every field object of a raw-mode record.
      PrimaryKey: (entityInfo.PrimaryKeys ?? []).map((pk) => ({ FieldName: pk.Name, Value: baseEntity.Get(pk.Name) })),
      // A completed save has already rebased the object, so nothing on it is dirty: the event
      // carries the names the save wrote. Other events (save_started) still read them off the object.
      // GetDirtyFieldNames answers without building field objects for a record still in raw mode.
      ChangedFields: changedFieldNames ?? baseEntity.GetDirtyFieldNames(),
    };
  }

  private static _priorEmittedData: {Entity: string, PKey: CompositeKey}[] = [];
  protected async EmitCloudEvent({ component, event, eventCode, args }: MJEvent) {
    if (ResolverBase._emit && event === MJEventType.ComponentEvent && eventCode === BaseEntity.BaseEventCode) {
      const extendedType = args instanceof BaseEntityEvent ? `.${args.type}` : '';
      const type = `MemberJunction.${event}${extendedType}`;
      const source = `${process.env.CLOUDEVENTS_SOURCE ?? 'MemberJunction'}`;
      const subject = args instanceof BaseEntityEvent ? args.baseEntity.EntityInfo.CodeName : undefined;
      const data = args?.baseEntity ? this.EntityEventPayload(args.baseEntity, args.ChangedFieldNames) : {};

      const cloudEvent = new CloudEvent({ type, source, subject, data });

      try {
        // check to see if the combination of Entity and pkey was already emitted, if so, Log that condtion next
        const pkey = args.baseEntity.PrimaryKeys as CompositeKey;
        const emittedData = { Entity: args.baseEntity.EntityInfo.Name, PKey: pkey };
        if (ResolverBase._priorEmittedData.find((e) => {
          if (e.Entity !== emittedData.Entity) return false;
          // if we get here compare the pkeys
          const pkey2 = e.PKey as CompositeKey;
          if (pkey.KeyValuePairs.length !== pkey2.KeyValuePairs.length) 
            return false;
          for (const kv of pkey.KeyValuePairs) {
            // find the match by field name
            const kv2 = pkey2.KeyValuePairs.find((k) => k.FieldName === kv.FieldName);
            if (!kv2 || kv2.Value !== kv.Value) 
              return false;
          }
          return true; // if we get here, all the keys matched
        })) {
          console.log(`IMPORTANT: CloudEvent already emitted for ${JSON.stringify(emittedData)}`);
        }

        LogStatus(`Emitting CloudEvent: ${JSON.stringify(cloudEvent)}`);
        const cloudeventTransportResponse = await ResolverBase._emit(cloudEvent, { headers: ResolverBase._cloudeventsHeaders });
        const cloudeventResponse = JSON.stringify(cloudeventTransportResponse);
        if (/error/i.test(cloudeventResponse)) {
          console.error('CloudEvent ERROR', cloudeventResponse);
        }
      } catch (e) {
        console.error('CloudEvent ERROR', JSON.stringify(e));
      }
    }
  }

  protected CheckUserReadPermissions(entityName: string, userPayload: UserPayload | null, provider?: IMetadataProvider) {
    const md = provider ?? new Metadata();
    const entityInfo = md.EntityByName(entityName);
    if (!userPayload) {
      throw new Error(`userPayload is null`);
    }

    // first check permissions, the logged in user must have read permissions on the entity to run the view
    if (entityInfo) {
      // Prefer the authenticated session's payload user WHEN it carries roles — that is the
      // authoritative per-session identity (and, for magic-link sessions, carries claims-based
      // synthesized roles that are deliberately NOT persisted to the shared UserCache). For
      // normal users the payload user IS the UserCache user, so this is a no-op; we only diverge
      // for per-session synthesized identities. Fall back to the cache lookup when the payload
      // user has no roles attached (older/edge auth paths).
      const payloadUser = this.GetUserFromPayload(userPayload);
      const userInfo = (payloadUser && payloadUser.UserRoles && payloadUser.UserRoles.length > 0)
        ? payloadUser
        : UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload.email.toLowerCase().trim());
      if (!userInfo) {
        throw new Error(`User ${userPayload.email} not found in metadata`);
      }

      const userPermissions = entityInfo.GetUserPermisions(userInfo);
      if (!userPermissions.CanRead) {
        throw new Error(`User ${userPayload.email} does not have read permissions on ${entityInfo.Name}`);
      }
    }
    else {
      throw new Error(`Entity not found in metadata`);
    }
  }

  /**
   * Checks API key scope authorization. Only performs check if request
   * was authenticated via API key (apiKeyHash present in userPayload).
   * For OAuth/JWT auth, this is a no-op.
   *
   * @param scopePath - The scope path (e.g., 'entity:read', 'agent:execute')
   * @param resource - The resource name (e.g., entity name, agent name)
   * @param userPayload - The user payload from context
   * @throws AuthorizationError if API key lacks required scope
   */
  protected async CheckAPIKeyScopeAuthorization(
    scopePath: string,
    resource: string,
    userPayload: UserPayload
  ): Promise<void> {
    // Skip scope check for OAuth/JWT auth (no API key)
    if (!userPayload.apiKeyHash) {
      return;
    }

    // Get system user for authorization call
    // NOTE: We use system user here because Authorize() needs to run internal
    // database queries (loading scope rules, logging decisions). The system user
    // ensures these queries work regardless of what permissions the API key's
    // user has. The API key's associated user (in userPayload.userRecord) is
    // used later when the actual operation executes - their permissions are
    // the ultimate ceiling that scopes can only narrow, never expand.
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!systemUser) {
      throw new Error('System user not found');
    }

    const apiKeyEngine = GetAPIKeyEngine();

    // Check for full_access scope first (god power - bypasses all other checks).
    // Use skipLogging to avoid polluting the usage log with expected denials —
    // this is a fast-path optimization, not the real authorization decision.
    const fullAccessResult = await apiKeyEngine.Authorize(
      userPayload.apiKeyHash,
      'MJAPI',
      'full_access',
      '*',
      systemUser,
      { endpoint: '/graphql', method: 'POST' },
      { skipLogging: true }
    );

    if (fullAccessResult.Allowed) {
      // full_access granted - skip specific scope check
      return;
    }

    // Check specific scope. The acting context stamped on the session user (set
    // server-side in context.ts, never client-supplied) rides along so filtered
    // rules with {{Acting*}} tokens can validate their required values — without
    // it, a filtered rule fails closed even for a session carrying valid context.
    const sessionUser = this.GetUserFromPayload(userPayload);
    const result = await apiKeyEngine.Authorize(
      userPayload.apiKeyHash,
      'MJAPI',
      scopePath,
      resource,
      systemUser,
      {
        endpoint: '/graphql',
        method: 'POST'
      },
      {
        actingContext: sessionUser?.APIKeyActingContext
      }
    );

    if (!result.Allowed) {
      // Provide specific, actionable error message
      throw new AuthorizationError(
        `Access denied. This API key requires the '${scopePath}' scope ` +
        `for resource '${resource}' to perform this operation. ` +
        `Please update the API key's scopes or use an API key with appropriate permissions. ` +
        `Denial reason: ${result.Reason}`
      );
    }
  }

  /**
   * SECURITY — GraphQL-boundary screen for one client-supplied SQL clause fragment.
   *
   * `ValidateUserProvidedSQLClause` still blocks stacked statements, DML, comments, UNION
   * and WAITFOR, and still permits SELECT (server-internal engines pass richer filters).
   * A keyword ban on SELECT/EXISTS at this boundary (#4253) broke first-party clients that
   * use `IN (SELECT … FROM <entity base view>)` — that is a legitimate ExtraFilter.
   *
   * This screen uses `@memberjunction/sql-parser` (same wrap as EDS `assertReadOnlyClause`):
   * wrap the fragment as a single SELECT, fail closed if it does not parse as a read, then
   * allow a FROM only when it is an entity **BaseView**. Base tables (`Meeting`, `__mj.User`)
   * and catalogs are rejected. Server-internal RunView callers get only the provider's
   * statement-separator check, which cannot refuse a legitimate filter.
   *
   * The screen is `ClientClauseScreen` in `@memberjunction/generic-database-provider`, shared
   * with the REST view routes, ad-hoc list sources, and the provider's saved-view checks.
   *
   * Before that parse, the fragment must be balanced on its own (`IsBalancedSQLFragment`). The
   * provider and the tenant hook splice it inside parentheses and AND their own filters after
   * it, so a fragment that closes those parentheses (`1=1) OR (1=1`) would leave row-level
   * security, API-key row filters and tenant scope on one side of an OR the caller controls.
   * The parse wraps the fragment in parentheses too, which is why it cannot catch this alone.
   * A backslash inside a quoted string or identifier is refused as well: the parser reads `\'`
   * inside a plain literal as an escaped quote, but SQL Server and PostgreSQL end the literal
   * there, so the text after it could be code that the parse-based checks never saw.
   *
   * RLS is applied by RunView as an outer WHERE around the entity being queried, not compiled
   * into the view, and RunView removes denied fields from its own result only. A subquery reads a
   * base view directly with neither, so the screen refuses one over any entity the user reads under
   * a row filter or with denied fields (`ClientClauseScreen.AssertUnscopedRead`), the queried
   * entity included.
   */
  protected assertClientClauseUsesEntityBaseViews(
    clause: string | undefined | null,
    label: string,
    provider?: IMetadataProvider,
    user?: UserInfo,
    options?: { LeaveUnparseableToProvider?: boolean },
  ): void {
    if (!clause?.trim()) return;

    // The balance and backslash checks run before the shared screen: it parses the fragment
    // inside its own parentheses, so it cannot see a fragment that closes the parentheses the
    // provider and the tenant hook splice it into.
    const dialect = this.dialectForProvider(provider);
    if (SQLParser.HasStackedStatements(clause, dialect)) {
      throw new Error(`Invalid ${label}: multiple statements are not permitted in client-supplied filters`);
    }
    const balance = IsBalancedSQLFragment(clause, dialect);
    if (!balance.IsBalanced) {
      throw new Error(`Invalid ${label}: ${balance.Reason}`);
    }
    if (this.hasBackslashInQuotes(clause, dialect)) {
      throw new Error(`Invalid ${label}: a backslash inside a quoted string or identifier is not permitted in client-supplied filters`);
    }

    ClientClauseScreen.AssertClauseUsesEntityBaseViews(clause, label, provider?.Entities ?? [], dialect, user, options);
  }

  /**
   * SECURITY — screen for a FULL client-supplied SQL statement (ad-hoc query path). In addition
   * to the SELECT-only validation the caller performs, every table reference must resolve to an
   * entity BaseView the acting user can read UNSCOPED. A reference is excluded only when it reads a
   * CTE that is in scope there (`StatementRelation.IsCTEReference`): unqualified, declared by its
   * own SELECT or an enclosing one, and matched by the dialect's identifier rules. A name reserved
   * for the SQL parser is refused before parsing (`ClientClauseScreen.AssertNoIdentifierAliasNames`).
   * Fails closed: no user, or an unresolvable reference, refuses.
   *
   * The references come from a walk of the whole parse tree
   * (`StrictFragmentValidator.ValidateReadOnlyStatement`). The statement is refused when that walk does not
   * account for every SELECT in the text, or when a FROM item names no table (a table function or
   * a row list).
   *
   * Entity CanRead is not unscoped base-view read authority: RunView narrows a granted read with
   * row-level security and denied-field projection, and raw SQL applies neither. Rather than try
   * to rewrite arbitrary SQL (joins, CTEs) to compose that policy, this refuses any entity that
   * carries a row filter or a denied field for the caller — those reads belong on RunView. For
   * the remaining entities CanRead genuinely means "every row and field of the view".
   */
  protected assertFullQueryUsesReadableEntityViews(
    sqlText: string,
    provider: IMetadataProvider | undefined,
    user: UserInfo | undefined,
    label = 'SQL',
  ): void {
    if (!user) {
      throw new Error(`Invalid ${label}: no acting user resolved for ad-hoc SQL — refusing`);
    }
    const dialect = this.dialectForProvider(provider);
    ClientClauseScreen.AssertNoIdentifierAliasNames(sqlText, dialect, label);
    const reads = this.strictReadOnlyStatementReads(sqlText, dialect, label);
    ClientClauseScreen.AssertEverySelectAccountedFor(sqlText, dialect, reads, label);
    const allowed = this.entityBaseViewAllowList(provider);
    for (const relation of reads.Relations) {
      if (relation.IsCTEReference) continue;
      const entity = ClientClauseScreen.AssertRelationReadable(allowed, relation, label, user);
      if (entity) this.assertUnscopedRead(entity, user, label);
    }
  }

  /** Refuses an entity whose read is narrowed for this user; see `ClientClauseScreen.AssertUnscopedRead`. */
  private assertUnscopedRead(entity: EntityInfo, user: UserInfo, label: string): void {
    ClientClauseScreen.AssertUnscopedRead(entity, user, label);
  }

  /**
   * Applies {@link assertClientClauseUsesEntityBaseViews} to every client-supplied clause
   * a view request can carry that is actually a SQL fragment. GraphQL entry points
   * (RunViewByName, RunViewByID, RunDynamicView, RunViews) funnel through
   * RunViewGenericInternal / RunViewsGenericInternal.
   *
   * 🚨 `UserSearchString` is deliberately NOT screened here (#4392). It is not a clause — it is
   * the free text a person typed into a search box, and it never reaches SQL as a fragment.
   * `GenericDatabaseProvider.createViewUserSearchSQL` builds the predicate itself from
   * `IncludeInUserSearchAPI` metadata and lands the text only as a literal, doubling single
   * quotes and escaping LIKE metacharacters with an explicit `ESCAPE`. Running it through a
   * screen that parses its argument as SQL and fails closed rejected every term that is not
   * coincidentally valid SQL: `Marcus Chen` parses as nothing, `O'Leary` as an unterminated
   * literal — so essentially every real name search returned 0 rows.
   *
   * The provider-level denylist does NOT back this up — it was removed from `UserSearchString`
   * in the same change, for the same reason (it refused `Union Pacific`). What protects the value
   * is that it is never SQL: it reaches the database only as a quoted, quote-doubled literal.
   * The single place that is not true is a field carrying `UserSearchParamFormatAPI`, whose
   * admin-authored format may splice the term in unquoted; `createViewUserSearchSQL` re-applies
   * `ValidateUserProvidedSQLClause` for exactly those entities.
   *
   * Each `Aggregates[].expression` gets the same screen, except that text the parser cannot read
   * goes on to the provider, which refuses it per aggregate. The provider never runs the caller's
   * aggregate text: it runs the SQL that `CheckAggregateExpression` rebuilds from a single
   * aggregate call over the entity's columns, and refuses everything else per aggregate.
   */
  protected screenClientViewClauses(
    clauses: {
      extraFilter?: string | null;
      orderBy?: string | null;
      userSearchString?: string | null;
      overrideExcludeFilter?: string | null;
      aggregates?: AggregateExpression[] | null;
    },
    provider?: IMetadataProvider,
    user?: UserInfo,
  ): void {
    this.assertClientClauseUsesEntityBaseViews(clauses.extraFilter, 'ExtraFilter', provider, user);
    this.assertClientClauseUsesEntityBaseViews(clauses.orderBy, 'OrderBy', provider, user);
    this.assertClientClauseUsesEntityBaseViews(clauses.overrideExcludeFilter, 'OverrideExcludeFilter', provider, user);
    for (const aggregate of clauses.aggregates ?? []) {
      this.assertClientClauseUsesEntityBaseViews(aggregate?.expression, 'Aggregate', provider, user, { LeaveUnparseableToProvider: true });
    }
  }

  /**
   * True when a string literal or quoted identifier in `clause`, read the way the database reads
   * it, contains a backslash (see {@link assertClientClauseUsesEntityBaseViews}).
   */
  private hasBackslashInQuotes(clause: string, dialect: SQLParserDialect): boolean {
    return LexSQL(clause, dialect).some((t) => (t.Kind === 'string' || t.Kind === 'identifier') && t.Text.includes('\\'));
  }

  /**
   * Parses a whole statement with the strict validator and returns what it reads; throws unless it
   * is one plain read-only SELECT with no write or DDL at any depth.
   */
  private strictReadOnlyStatementReads(sqlText: string, dialect: SQLParserDialect, label: string): StrictStatementReads {
    const result = StrictFragmentValidator.ValidateReadOnlyStatement(sqlText, dialect, { CollectReads: true });
    if (result.Refusal === 'NestedWrite') {
      throw new Error(`Invalid ${label}: write/DDL nested in a subquery is not permitted`);
    }
    if (!result.IsValid || !result.Reads) {
      throw new Error(`Invalid ${label}: not a safe read-only statement — refusing under uncertainty`);
    }
    return result.Reads;
  }

  private dialectForProvider(provider?: IMetadataProvider): SQLParserDialect {
    return ClientClauseScreen.DialectFor(provider);
  }

  /** The entity base-view allow-list for a provider's entities. */
  private entityBaseViewAllowList(provider?: IMetadataProvider): EntityBaseViewAllowList {
    return ClientClauseScreen.BuildEntityBaseViewAllowList(provider?.Entities ?? []);
  }

  /**
   * Optimized RunViewGenericInternal implementation with:
   * - Field filtering at source (Fix #7)
   * - Improved error handling (Fix #9)
   */
  protected async RunViewGenericInternal(
    provider: DatabaseProviderBase,
    viewInfo: MJUserViewEntityExtended,
    extraFilter: string,
    orderBy: string,
    userSearchString: string,
    excludeUserViewRunID: string | undefined,
    overrideExcludeFilter: string | undefined,
    saveViewResults: boolean | undefined,
    fields: string[] | undefined,
    ignoreMaxRows: boolean | undefined,
    excludeDataFromAllPriorViewRuns: boolean | undefined,
    forceAuditLog: boolean | undefined,
    auditLogDescription: string | undefined,
    resultType: string | undefined,
    userPayload: UserPayload | null,
    maxRows: number | undefined,
    startRow: number | undefined,
    aggregates?: AggregateExpression[],
    afterKey?: CompositeKey,
    bypassCache?: boolean,
    dataSource?: 'Live' | 'Materialized',
    includeBinaryFields?: boolean,
    alternateBaseView?: string,
    properties?: ViewPropertyValues
  ) {
    try {
      if (!viewInfo || !userPayload) return null;

      // Prefer the authenticated session's payload user — it is the authoritative per-request
      // identity and (for magic-link sessions) carries the per-session resource scope / synthesized
      // roles that drive RLS. The cached lookup is a fallback for paths where the payload user
      // isn't populated. For normal users the two are the same instance, so this is a no-op.
      const user = this.GetUserFromPayload(userPayload)
        ?? UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload?.email.toLowerCase().trim());
      if (!user) throw new Error(`User ${userPayload?.email} not found in metadata`);

      // SECURITY: GraphQL ExtraFilter may contain IN (SELECT … FROM <base view>).
      // Screen at this boundary: parse, reject writes, allow only entity BaseViews the
      // acting user can read (subqueries do not inherit the top entity's permission check).
      this.screenClientViewClauses(
        { extraFilter, orderBy, userSearchString, overrideExcludeFilter, aggregates },
        provider as unknown as IMetadataProvider,
        user,
      );

      // Check API key scope authorization for view operations
      await this.CheckAPIKeyScopeAuthorization('view:run', viewInfo.Entity, userPayload);

      const md = provider

      const entityInfo = md.Entities.find((e) => e.Name === viewInfo.Entity);
      if (!entityInfo) throw new Error(`Entity ${viewInfo.Entity} not found in metadata`);

      const rv = md as any as IRunViewProvider;

      // Determine result type
      let rt: 'simple' | 'entity_object' | 'count_only' = 'simple';
      if (resultType?.trim().toLowerCase() === 'count_only') {
        rt = 'count_only';
      }

      // Fix #7: Implement field filtering - preprocess fields for more efficient field selection
      // This is passed to RunView() which uses it to optimize the SQL query
      let optimizedFields = fields;
      if (fields?.length) {
        // Always ensure primary keys are included for proper record handling
        const primaryKeys = entityInfo.PrimaryKeys.map(pk => pk.Name);
        const missingPrimaryKeys = primaryKeys.filter(pk => 
          !fields.find(f => f.toLowerCase() === pk.toLowerCase())
        );
        
        if (missingPrimaryKeys.length) {
          optimizedFields = [...fields, ...missingPrimaryKeys];
        }
      }

      // Log aggregate request for debugging
      if (aggregates?.length) {
        LogStatus(`[ResolverBase] RunViewGenericInternal with aggregates: entityName=${viewInfo.Entity}, viewName=${viewInfo.Name}, aggregateCount=${aggregates.length}, aggregates=${JSON.stringify(aggregates.map(a => ({ expression: a.expression, alias: a.alias })))}`);
      }

      const result = await rv.RunView(
        {
          ViewID: viewInfo.ID,
          ViewName: viewInfo.Name,
          ViewEntity: viewInfo.ID ? viewInfo : undefined,
          EntityName: viewInfo.Entity,
          ExtraFilter: extraFilter,
          OrderBy: orderBy,
          Fields: optimizedFields,  // Use optimized fields list
          UserSearchString: userSearchString,
          ExcludeUserViewRunID: excludeUserViewRunID,
          OverrideExcludeFilter: overrideExcludeFilter,
          SaveViewResults: saveViewResults,
          ExcludeDataFromAllPriorViewRuns: excludeDataFromAllPriorViewRuns,
          IgnoreMaxRows: ignoreMaxRows,
          MaxRows: maxRows,
          StartRow: startRow,
          AfterKey: afterKey,
          ForceAuditLog: forceAuditLog,
          AuditLogDescription: auditLogDescription,
          ResultType: rt,
          Aggregates: aggregates,
          BypassCache: bypassCache,
          DataSource: dataSource,
          IncludeBinaryFields: includeBinaryFields,
          AlternateBaseView: alternateBaseView,
          Properties: properties,
          TimeZone: userPayload?.TimeZone,
        },
        user
      );

      if (result && typeof result === 'object') {
        Object.defineProperty(result, '_resolvedViewEntity', {
          value: viewInfo,
          enumerable: false,
          configurable: true,
          writable: true,
        });
      }

      // Log aggregate results for debugging
      if (aggregates?.length) {
        LogStatus(`[ResolverBase] RunView result aggregate info: entityName=${viewInfo.Entity}, hasAggregateResults=${!!result?.AggregateResults}, aggregateResultCount=${result?.AggregateResults?.length || 0}, aggregateExecutionTime=${result?.AggregateExecutionTime}, aggregateResults=${JSON.stringify(result?.AggregateResults)}`);
      }

      // Process results for GraphQL transport.
      //
      // Map onto COPIES, never in place. `FieldMapper.MapFields` renames keys by
      // mutating (`obj[mapped] = obj[k]; delete obj[k]`), and these rows are the
      // provider's own result objects — which the server cache holds BY REFERENCE
      // under a reference-sharing storage provider. Mapping them in place rewrote
      // `__mj_CreatedAt` to the transport alias `_mj__CreatedAt` inside the live
      // cache, and because that cache is process-wide, one GraphQL response made
      // every later read hand back transport-shaped rows that `BaseEntity.SetMany`
      // rejects. `ArrayFilterEncryptedFieldsForAPI` mutates too, so it must also
      // see the copies. (FileResolver already maps a spread copy.)
      //
      // These copies are LOAD-BEARING, not merely defensive: LocalCacheManager now
      // deep-freezes cached rows (see ILocalStorageProvider.SharesReferences), so
      // mapping in place would throw rather than silently corrupt. `{ ...r }` is a
      // SHALLOW copy, which is sufficient here because the only post-map mutators
      // rename top-level keys and redact scalar fields — and the cache's freeze is
      // deep, so a nested value can no longer be reached through the copy either.
      const mapper = new FieldMapper();
      if (result?.Success && result.Results?.length) {
        result.Results = result.Results.map(r => mapper.MapFields({ ...r }));
        // Filter encrypted fields before sending to API client
        await this.ArrayFilterEncryptedFieldsForAPI(
          viewInfo.Entity,
          result.Results as Record<string, unknown>[],
          user,
          md
        );
      }

      return result;
    } catch (err) {
      // Fix #9: Improved error handling with structured logging
      const error = err as Error;
      LogError({
        service: 'RunView',
        operation: 'RunViewGenericInternal',
        error: error.message,
        entityName: viewInfo?.Entity,
        errorType: error.constructor.name,
        // Only include stack trace for non-validation errors
        stack: error.message?.includes('not found in metadata') ? undefined : error.stack
      });
      throw err;
    }
  }

  /**
   * Optimized implementation that:
   * 1. Fetches user info only once (fixes N+1 query)
   * 2. Processes views in parallel for independent operations
   * 3. Implements structured error logging
   */
  protected async RunViewsGenericInternal(params: RunViewGenericParams[]): Promise<RunViewResult[]> {
    try {
      // Skip processing if no params
      if (!params.length) return [];

      let md: IMetadataProvider | null = null;
      const rv = params[0].provider as any as IRunViewProvider;
      let runViewParams: RunViewParams[] = [];

      // Fix #1: Get user info only once for all queries
      let contextUser: UserInfo | null = null;
      if (params[0]?.userPayload?.email) {
        const userPayload = params[0].userPayload;
        const userEmail = userPayload.email.toLowerCase().trim();
        // Prefer the authenticated session's payload user — it is the authoritative per-request
        // identity and (for magic-link sessions) carries the per-session resource scope / synthesized
        // roles that drive RLS. The cached lookup is a fallback for paths where the payload user
        // isn't populated. For normal users the two are the same instance, so this is a no-op.
        const user = this.GetUserFromPayload(userPayload)
          ?? UserCache.Users.find(u => u.Email.toLowerCase().trim() === userEmail);
        if (!user) {
          throw new Error(`User ${userEmail} not found in metadata`);
        }
        contextUser = user;
      }

      // Create a map of entities to validate only once per entity
      const validatedEntities = new Set<string>();
      // Use the per-request provider that came in on params instead of `new Metadata()` so
      // multi-tenant servers resolve metadata against the request's own connection.
      md = params[0].provider as unknown as IMetadataProvider;

      // Transform parameters
      for (const param of params) {
        // SECURITY: same GraphQL-boundary BaseView screen as RunViewGenericInternal.
        this.screenClientViewClauses(
          {
            extraFilter: param.extraFilter,
            orderBy: param.orderBy,
            userSearchString: param.userSearchString,
            overrideExcludeFilter: param.overrideExcludeFilter,
            aggregates: param.aggregates,
          },
          md,
          contextUser ?? undefined,
        );

        if (param.viewInfo) {
          // Validate entity only once per entity type
          const entityName = param.viewInfo.Entity;
          if (!validatedEntities.has(entityName)) {
            const entityInfo = md.EntityByName(entityName);
            if (!entityInfo) {
              throw new Error(`Entity ${entityName} not found in metadata`);
            }
            validatedEntities.add(entityName);
          }
        }

        // Determine result type
        let rt: 'simple' | 'entity_object' | 'count_only' = 'simple';
        if (param.resultType?.trim().toLowerCase() === 'count_only') {
          rt = 'count_only';
        }

        // Build parameters
        runViewParams.push({
          ViewID: param.viewInfo.ID,
          ViewName: param.viewInfo.Name,
          ViewEntity: param.viewInfo.ID ? param.viewInfo : undefined,
          EntityName: param.viewInfo.Entity,
          ExtraFilter: param.extraFilter,
          OrderBy: param.orderBy,
          Fields: param.fields,
          UserSearchString: param.userSearchString,
          ExcludeUserViewRunID: param.excludeUserViewRunID,
          OverrideExcludeFilter: param.overrideExcludeFilter,
          SaveViewResults: param.saveViewResults,
          ExcludeDataFromAllPriorViewRuns: param.excludeDataFromAllPriorViewRuns,
          IgnoreMaxRows: param.ignoreMaxRows,
          MaxRows: param.maxRows,
          StartRow: param.startRow,
          AfterKey: param.afterKey,
          ForceAuditLog: param.forceAuditLog,
          AuditLogDescription: param.auditLogDescription,
          ResultType: rt,
          Aggregates: param.aggregates,
          BypassCache: param.bypassCache,
          DataSource: param.dataSource,
          IncludeBinaryFields: param.includeBinaryFields,
          AlternateBaseView: param.alternateBaseView,
          Properties: param.properties,
          TimeZone: param.userPayload?.TimeZone,
        });
      }

      // Fix #4: Run views in a single batch through RunViews
      const runViewResults: RunViewResult[] = await rv.RunViews(runViewParams, contextUser);

      // Process results
      const mapper = new FieldMapper();
      for (let i = 0; i < runViewResults.length; i++) {
        const runViewResult = runViewResults[i];
        if (runViewResult?.Success && runViewResult.Results?.length) {
          // Copy-then-map, same reason as the single-view path above: these rows
          // are cache-held references and MapFields renames keys in place.
          runViewResult.Results = runViewResult.Results.map(r => mapper.MapFields({ ...r }));
          // Filter encrypted fields before sending to API client
          // Use the corresponding param's entity name
          const entityName = params[i]?.viewInfo?.Entity;
          if (entityName && contextUser) {
            await this.ArrayFilterEncryptedFieldsForAPI(
              entityName,
              runViewResult.Results as Record<string, unknown>[],
              contextUser,
              md
            );
          }
        }
      }

      return runViewResults;
    } catch (err) {
      // Fix #9: Structured error logging with less verbosity
      console.log(err);
      throw err;
    }
  }

  protected async createRecordAccessAuditLogRecord(provider: DatabaseProviderBase, userPayload: UserPayload, entityName: string, recordId: any): Promise<any> {
    try {
      const md = provider;
      const entityInfo = md.Entities.find((e) => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase());
      if (!entityInfo) throw new Error(`Entity ${entityName} not found in metadata`);

      if (entityInfo.AuditRecordAccess) {
        // Prefer the per-session payload user (the actual actor for this request) over the cache lookup.
        const userInfo = this.GetUserFromPayload(userPayload)
          ?? UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload?.email.toLowerCase().trim());
        const auditLogTypeName = 'Record Accessed';
        const auditLogType = md.AuditLogTypes.find((a) => a.Name.trim().toLowerCase() === auditLogTypeName.trim().toLowerCase());

        if (!userInfo) throw new Error(`User ${userPayload?.email} not found in metadata`);
        if (!auditLogType) throw new Error(`Audit Log Type ${auditLogTypeName} not found in metadata`);

        return await this.createAuditLogRecord(provider, userPayload, null, auditLogTypeName, 'Success', null, entityInfo.ID, recordId);
      }
    } catch (e) {
      console.log(e);
    }
  }

  protected getRowLevelSecurityWhereClause(provider: DatabaseProviderBase, entityName: string, userPayload: UserPayload, type: EntityPermissionType, returnPrefix: string) {
    const md = provider;
    const entityInfo = md.Entities.find((e) => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase());
    if (!entityInfo) throw new Error(`Entity ${entityName} not found in metadata`);
    // Prefer the authenticated session's payload user — it is the authoritative per-request identity
    // and (for magic-link sessions) carries the per-session resource scope / synthesized roles that
    // the RLS WHERE clause (e.g. {{ScopeResourceID}}) depends on. Cache lookup is the fallback.
    const user = this.GetUserFromPayload(userPayload)
      ?? UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload?.email.toLowerCase().trim());
    if (!user) throw new Error(`User ${userPayload?.email} not found in metadata`);

    return entityInfo.GetEffectiveRowFilterWhereClause(user, type, returnPrefix);
  }

  protected async createAuditLogRecord(
    provider: DatabaseProviderBase,
    userPayload: UserPayload,
    authorizationName: string | null,
    auditLogTypeName: string,
    status: string,
    details: string | null,
    entityId: string,
    recordId: any | null
  ): Promise<any> {
    try {
      const md = provider;
      // Prefer the per-session payload user (the actual actor for this request) over the cache lookup.
      const userInfo = this.GetUserFromPayload(userPayload)
        ?? UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload?.email.toLowerCase().trim());
      const authorization = authorizationName
        ? md.Authorizations.find((a) => a.Name.trim().toLowerCase() === authorizationName.trim().toLowerCase())
        : null;
      const auditLogType = md.AuditLogTypes.find((a) => a.Name.trim().toLowerCase() === auditLogTypeName.trim().toLowerCase());

      if (!userInfo) throw new Error(`User ${userPayload?.email} not found in metadata`);
      if (!auditLogType) throw new Error(`Audit Log Type ${auditLogTypeName} not found in metadata`);

      const auditLog = await md.GetEntityObject<MJAuditLogEntity>('MJ: Audit Logs', userInfo); // must pass user context on back end as we're not authenticated the same way as the front end
      auditLog.NewRecord();
      auditLog.UserID = userInfo.ID;
      auditLog.AuditLogTypeID = auditLogType.ID;

      if (authorization) {
        auditLog.AuthorizationID = authorization.ID;
      }

      if (status?.trim().toLowerCase() === 'success') auditLog.Status = 'Success';
      else auditLog.Status = 'Failed';

      if (details) auditLog.Details = details;

      auditLog.EntityID = entityId;

      if (recordId) auditLog.RecordID = recordId;

      if (await auditLog.Save()) 
        return auditLog;
      else 
        throw new Error(`Error saving audit log record`);
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  protected safeFirstArrayElement<T = any>(arr: T[]) {
    if (arr && arr.length > 0) {
      return arr[0];
    }
    return null;
  }

  protected packageSPParam(paramValue: any, quoteString: string) {
    return paramValue === null || paramValue === undefined ? null : quoteString + paramValue + quoteString;
  }

  protected GetUserFromEmail(email: string): UserInfo | undefined {
    return UserCache.Users.find((u) => u.Email.toLowerCase().trim() === email.toLowerCase().trim());
  }
  protected GetUserFromPayload(userPayload: UserPayload): UserInfo | undefined {
    if (!userPayload) 
      return undefined;

    if (userPayload.userRecord)
      return userPayload.userRecord; // if we have a user record, use that directly

    if (!userPayload.email) 
      return undefined;

    return UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload.email.toLowerCase().trim());
  }

  public get MJCoreSchema(): string {
    return Metadata.Provider.ConfigData.MJCoreSchemaName; // global-provider-ok: process-wide config (schema name) read once at module level
  }

  /**
   * Publishes a CACHE_INVALIDATION event to connected browser clients after a successful
   * entity save or delete. Includes the originSessionId so the originating browser can
   * skip redundant re-fetches (it already handled the event locally).
   *
   * The row itself rides along ONLY for entities opted in via
   * `cacheSettings.recordDataBroadcastEntities`, and never for one under field-level security —
   * this event reaches every connected client unprojected, so the row would otherwise be readable
   * by sessions that could not read the record or its restricted fields.
   */
  protected PublishCacheInvalidation(entityObject: BaseEntity, action: 'save' | 'delete', userPayload: UserPayload): void {
    const entityName = entityObject.EntityInfo.Name;
    PubSubManager.Instance.Publish(CACHE_INVALIDATION_TOPIC, {
      entityName,
      primaryKeyValues: JSON.stringify(entityObject.PrimaryKey.KeyValuePairs),
      action,
      sourceServerId: MJGlobal.Instance.ProcessUUID,
      timestamp: new Date(),
      originSessionId: userPayload?.sessionId || null,
      recordData:
        action === 'save' && MayBroadcastRecordData(entityName, entityObject.EntityInfo)
          // fls-guard: MayBroadcastRecordData refuses FLS entities and Record Changes
          ? JSON.stringify(entityObject.GetAll())
          : undefined,
    });
  }

  /**
   * Publishes a push-status update to the client on {@link PUSH_STATUS_UPDATES_TOPIC}, stamping the
   * owner key of `userPayload` (`StatusUpdateOwnerID`: the request's user, or the widget guest an
   * elevated payload stands in for) so the subscription filter can bind delivery to identity (see B49 /
   * `StatusUpdatesFilter`). The ergonomic wrapper every resolver should use instead of calling
   * `pubSub.publish` on the topic directly — it makes omitting identity impossible. Non-resolver
   * publishers (services, the liveness heartbeat) call the shared `PublishStatusUpdate()` function
   * directly with an explicit `ownerUserId`.
   */
  protected PublishStatusUpdate(pubSub: PubSubEngine, sessionId: string, message: string | undefined, userPayload: UserPayload): void {
    PublishStatusUpdate(pubSub, {
      sessionId,
      ownerUserId: StatusUpdateOwnerID(userPayload),
      message,
    });
  }

  protected ListenForEntityMessages(entityObject: BaseEntity, pubSub: PubSubEngine, userPayload: UserPayload) {
    // The unique key is set up for each entity object via it's primary key to ensure that we only have one listener at most for each unique
    // entity in the system. This is important because we don't want to have multiple listeners for the same entity as it could
    // cause issues with multiple messages for the same event.
    const uniqueKey = entityObject.EntityInfo.Name;

    if (!this.eventSubscriptions.has(uniqueKey)) {
      // listen for events from the entityObject in case it is a long running task and we can push messages back to the client via pubSub
      LogDebug(`ResolverBase.ListenForEntityMessages: About to call MJGlobal.Instance.GetEventListener() to get the event listener subscription for ${uniqueKey}`);
      const theSub = MJGlobal.Instance.GetEventListener(false).subscribe(async (event: MJEvent) => {
        if (event) {
          const baseEntity = <BaseEntity>event.args?.baseEntity;

          // Only process events for the entity type this subscription was created for
          // This prevents duplicate CloudEvents when multiple entity types have active subscriptions
          if (baseEntity?.EntityInfo?.Name !== uniqueKey) {
            return;
          }

          const baseEntityValues = baseEntity ? this.EntityEventPayload(baseEntity, event.args instanceof BaseEntityEvent ? event.args.ChangedFieldNames : undefined) : null;
          const eventToLog = { entityName: entityObject.EntityInfo.Name, baseEntity: baseEntityValues, event: event.event, eventCode: event.eventCode };
          LogDebug(`ResolverBase.ListenForEntityMessages: Received Event from within MJGlobal.Instance.GetEventListener() callback. Will call EmitCloudEvent() next\nEvent data:\n${JSON.stringify(eventToLog)}`);
          await this.EmitCloudEvent(event);
          LogDebug(`ResolverBase.ListenForEntityMessages: EmitCloudEvent() completed successfully`);  

          if (event.args && event.args instanceof BaseEntityEvent && this.EntityEventBelongsToSession(event.args, userPayload)) {
            // message from an entity object of this session's user, relay it to the client
            LogDebug('ResolverBase.ListenForEntityMessages: About to publish PUSH_STATUS_UPDATES_TOPIC');
            this.PublishStatusUpdate(pubSub, userPayload.sessionId, this.EntityStatusMessage(event.args), userPayload);
          }
        }
      });
      this.eventSubscriptions.set(uniqueKey, theSub);
    }
  }

  /**
   * Whether an entity event may be relayed to the session whose call created the listener. The
   * listener is shared by every caller in the process for that entity, so an event raised by an
   * object loaded for another user (or for the system user) is never relayed to this session.
   */
  protected EntityEventBelongsToSession(event: BaseEntityEvent, userPayload: UserPayload): boolean {
    const sessionUserId = userPayload?.userRecord?.ID;
    const objectUserId = event.baseEntity?.ContextCurrentUser?.ID;
    return Boolean(sessionUserId && objectUserId && UUIDsEqual(sessionUserId, objectUserId));
  }

  /**
   * The status message relayed for an entity event: the entity, key and event type. The event's
   * payload is included only when it cannot carry record values: never for a delete (its payload
   * is the whole deleted row), an entity under field-level security, or `MJ: Record Changes`.
   */
  protected EntityStatusMessage(event: BaseEntityEvent): string {
    const entityInfo = event.baseEntity.EntityInfo;
    const mayCarryPayload = event.type !== 'delete'
      && !entityInfo.FieldLevelSecurityApplies
      && !RecordChangeFieldSecurityProjector.IsRecordChangesEntity(entityInfo);
    return JSON.stringify({
      status: 'OK',
      type: 'EntityObjectStatusMessage',
      entityName: entityInfo.Name,
      primaryKey: event.baseEntity.PrimaryKey,
      eventType: event.type,
      message: mayCarryPayload ? event.payload : undefined,
    });
  }

  /**
   * IS-A PROMOTION over the wire: an EXISTING parent record gaining a subtype — an Animal that is
   * now also a Dog. It arrives as the CHILD's create mutation carrying the existing parent's
   * primary key, because in IS-A the shared key is the relationship and the child has no key of
   * its own to mint. `NewRecord()` has just reset the whole chain to "new", so left alone the
   * parent would save as a CREATE: a second copy of a row that already exists (a unique-constraint
   * violation at best, a silently duplicated parent at worst).
   *
   * When a child create carries a complete primary key, bind the new child to the existing parent
   * row with `AttachToParent` (#3825): it loads the parent chain, so the parent saves as an UPDATE
   * and only the child is INSERTed. A key that matches no row leaves the fresh chain exactly as
   * `NewRecord()` built it — the ordinary whole-chain create. A non-IS-A entity, or a create with
   * no key, never gets past the guards.
   *
   * @returns true when the child was attached to an existing parent row.
   */
  protected async attachToExistingParentIfPromotion(entityObject: BaseEntity, input: Record<string, unknown>): Promise<boolean> {
    if (!entityObject.EntityInfo.IsChildType) {
      return false;
    }
    const key = this.primaryKeyFromInput(entityObject.EntityInfo, input);
    if (!key) {
      return false;
    }
    const attached = await entityObject.AttachToParent(key);
    if (!attached) {
      // No parent row under that key: this is a whole-chain create on the CALLER's key (the
      // client mints the shared key at the root and sends it, so honoring it keeps the client's
      // in-memory chain and the stored rows on one key). AttachToParent restored the fresh chain,
      // but the root's ReadOnly key slot is no longer writable — a later SetMany would silently
      // keep the server-minted value — so re-seed the chain with the supplied key explicitly.
      entityObject.NewRecord(key);
    }
    return attached;
  }

  /**
   * The entity's primary key as supplied on a mutation input, or null when any part of it is
   * missing. Composite keys are all-or-nothing: a half-specified key identifies nothing. An empty
   * string counts as missing, the same as null — it is never a valid key value, and a GUID or
   * string key that is "" identifies no row, so the create proceeds as a whole-chain create rather
   * than failing the lookup. A malformed non-empty key (e.g. a non-GUID for a uniqueidentifier)
   * is NOT swallowed: the load throws and the mutation fails loudly.
   */
  protected primaryKeyFromInput(entityInfo: EntityInfo, input: Record<string, unknown>): CompositeKey | null {
    const pairs: KeyValuePair[] = [];
    for (const pk of entityInfo.PrimaryKeys) {
      const value = input[pk.Name] ?? input[pk.CodeName];
      if (value === null || value === undefined || value === '') {
        return null;
      }
      pairs.push(new KeyValuePair(pk.Name, value));
    }
    return pairs.length > 0 ? CompositeKey.FromKeyValuePairs(pairs) : null;
  }

  protected async CreateRecord(entityName: string, input: any, provider: DatabaseProviderBase, userPayload: UserPayload, pubSub: PubSubEngine) {
    // Check API key scope authorization for entity create operations
    await this.CheckAPIKeyScopeAuthorization('entity:create', entityName, userPayload);

    // Reverse-map GraphQL field names (e.g. _mj__*) back to entity CodeNames (e.g. __mj_*)
    input = this.ReverseMapInputFieldNames(input);

    if (await this.BeforeCreate(provider, input)) {
      // fire event and proceed if it wasn't cancelled
      const entityObject = await provider.GetEntityObject(entityName, this.GetUserFromPayload(userPayload));
      entityObject.NewRecord();
      // Strip the RestoreContext___ blob from the field assignments — it's
      // metadata for the upcoming Save(), not a field on the record.
      const fieldsForSet: Record<string, unknown> = {};
      for (const key of Object.keys(input)) {
        if (key !== 'RestoreContext___') fieldsForSet[key] = input[key];
      }
      // IS-A promotion: bind the new child to its EXISTING parent row BEFORE the field
      // assignments, so values the client sent for parent fields land on the loaded parent
      // (as an update) instead of being wiped by the load.
      // Field-level security: refuse a key the caller may not read, or that names no field, before
      // anything is applied (the same gate as the update path).
      AssertClientInputWritableForUser(entityObject.EntityInfo, fieldsForSet, this.GetUserFromPayload(userPayload));
      await this.attachToExistingParentIfPromotion(entityObject, fieldsForSet);
      entityObject.SetMany(fieldsForSet);

      // Reconstruct the client-side restore context, if any, on this server
      // entity so the data provider writes the lineage columns on Save().
      this.applyRestoreContext(entityObject, input);

      this.ListenForEntityMessages(entityObject, pubSub, userPayload);

      // Pass the transactionScopeId from the user payload to the save operation
      if (await entityObject.Save()) {
        // save worked, fire the AfterCreate event and then return all the data
        await this.AfterCreate(provider, input); // fire event
        // Cache invalidation is now handled globally by the MJGlobal listener in index.ts
        const contextUser = this.GetUserFromPayload(userPayload);
        // MapFieldNamesToCodeNames now handles encryption filtering as well
        // fls-guard: MapFieldNamesToCodeNames drops the fields the caller may not read
        return await this.MapFieldNamesToCodeNames(entityName, entityObject.GetAll(), contextUser);
      }
      // save failed, throw error with message
      else {
        // The message is the prose a toast shows; `validationErrors` is the same refusal with its
        // field names intact, so the client can paint the fields a server-side ValidateAsync named.
        throw new GraphQLError(entityObject.LatestResult?.CompleteMessage ?? 'Unknown error creating record', {
          extensions: RefusalExtensions('CREATE_ENTITY_ERROR', entityName, entityObject.LatestResult),
        });
      }
    } else return null;
  }

  // Before/After CREATE Event Hooks for Sub-Classes to Override
  protected async BeforeCreate(provider: DatabaseProviderBase, input: any): Promise<boolean> {
    return true;
  }
  protected async AfterCreate(provider: DatabaseProviderBase, input: any) {}

  protected async UpdateRecord(entityName: string, input: any, provider: DatabaseProviderBase, userPayload: UserPayload, pubSub: PubSubEngine) {
    // Check API key scope authorization for entity update operations
    await this.CheckAPIKeyScopeAuthorization('entity:update', entityName, userPayload);

    // Reverse-map GraphQL field names (e.g. _mj__*) back to entity CodeNames (e.g. __mj_*)
    input = this.ReverseMapInputFieldNames(input);

    if (await this.BeforeUpdate(provider, input)) {
      // fire event and proceed if it wasn't cancelled
      const userInfo = this.GetUserFromPayload(userPayload);
      const entityObject = await provider.GetEntityObject(entityName, userInfo);
      const entityInfo = entityObject.EntityInfo;
      const clientNewValues = {};
      Object.keys(input).forEach((key) => {
        // Skip metadata blobs that aren't actual entity fields.
        if (key !== 'OldValues___' && key !== 'RestoreContext___') {
          clientNewValues[key] = input[key];
        }
      });

      // Field-level security: any value the client sends for a field it cannot READ is
      // fabricated by construction (the field was absent from every payload the client ever
      // received), so the input is refused before anything applies it. When any field is
      // denied we also force the truth-load branch below, so the denied columns keep what the
      // database holds rather than anything derived from the client's OldValues.
      const hasDeniedReadFields = this.AssertClientInputFieldSecurity(entityInfo, userInfo, input, clientNewValues);
      // The audit-trail equivalent. Its `true` matters most on THIS entity: 'MJ: Record Changes'
      // has TrackRecordChanges off, so without it a client sending OldValues takes the branch below
      // that hydrates from those values — never loading what the database actually holds.
      const hasNarrowedAuditPayload = this.StripRecordChangePayloadFromClientInput(entityInfo, userInfo, input, clientNewValues);

      if (this.MustLoadTruthFromDatabase(entityInfo, input, hasDeniedReadFields, hasNarrowedAuditPayload, userInfo)) {
        // We get here because the entity tracks record changes, OR the client did not provide OldValues,
        // OR field-level security or an Update row filter is in play — in every case we need the true
        // old values from the DB
        const cKey = new CompositeKey(
          entityInfo.PrimaryKeys.map((pk) => {
            return {
              FieldName: pk.Name,
              Value: input[pk.CodeName],
            };
          })
        );

        if (await entityObject.InnerLoad(cKey)) {
          // load worked, now, only IF we have OldValues, we need to check them against the values in the DB we just loaded.
          if (input.OldValues___) {
            // we DO have OldValues, so we need to do a more in depth analysis
            await this.TestAndSetClientOldValuesToDBValues(input, clientNewValues, entityObject, userInfo);
          } else {
            // no OldValues, so we can just set the new values from input
            entityObject.SetMany(clientNewValues);
          }
        } else {
          // Use a generic message to avoid leaking whether a record exists — distinguishing
          // "not found" from "access denied" would let an attacker enumerate valid record IDs.
          throw new GraphQLError(`Record not found or access denied`, {
            extensions: { code: 'LOAD_ENTITY_ERROR', entityName },
          });
        }
      } else {
        // we get here if we are NOT tracking changes and we DO have OldValues, so we can load from them
        const oldValues = {};
        // for each item in the oldValues array, add it to the oldValues object, typed like the field
        input.OldValues___?.forEach((item) => {
          const field = entityObject.EntityInfo.Fields.find((f) => f.CodeName === item.Key);
          oldValues[item.Key] = field ? this.ClientOldValueToFieldValue(field, item.Value) : item.Value;
        });

        // 1) load the old values, this will be the initial state of the object
        await entityObject.LoadFromData(oldValues);

        // 2) set the new values from the input, not including the OldValues property
        entityObject.SetMany(clientNewValues);
      }

      // Reconstruct the client-side restore context, if any, on this server
      // entity so the data provider writes the lineage columns on Save().
      this.applyRestoreContext(entityObject, input);

      this.ListenForEntityMessages(entityObject, pubSub, userPayload);

      if (await entityObject.Save()) {
        // save worked, fire afterevent and return all the data
        await this.AfterUpdate(provider, input); // fire event
        // Cache invalidation is now handled globally by the MJGlobal listener in index.ts

        // MapFieldNamesToCodeNames now handles encryption filtering as well
        // fls-guard: MapFieldNamesToCodeNames drops the fields the caller may not read
        return await this.MapFieldNamesToCodeNames(entityName, entityObject.GetAll(), userInfo);
      } else {
        // CompleteMessage, not Message. A validation refusal puts its reasons in `Errors` and leaves
        // `Message` unset, so reading `Message` here fell through to 'Unknown error' and discarded
        // every field-named explanation the entity had just produced. CreateRecord already read
        // CompleteMessage; this path did not, which is why the SAME rule on the SAME entity explained
        // itself on a create and said nothing on an update. CompleteMessage is a strict superset — it
        // starts from `Message`, then appends `Error` and `Errors` — so nothing previously reported is
        // lost, and it still yields undefined when there is genuinely nothing to say, leaving the
        // fallback below to fire rather than showing the user a blank error.
        throw new GraphQLError(entityObject.LatestResult?.CompleteMessage ?? 'Unknown error', {
          extensions: RefusalExtensions('SAVE_ENTITY_ERROR', entityName, entityObject.LatestResult),
        });
      }
    } else
      throw new GraphQLError('Save Canceled by BeforeSave() handler in ResolverBase', {
        extensions: { code: 'SAVE_ENTITY_ERROR', entityName },
      });
  }
  
  /**
   * Checks whether `oldValues` (`input.OldValues___`) contains every writable in-table field of
   * `entityInfo` (plus primary keys).
   *
   * With the delta-only `Save()` wire protocol, `GraphQLDataProvider.Save()` sends only primary keys
   * and dirty writable fields in `vars.input` and `OldValues___` on normal updates. Hydrating an
   * entity directly from a partial-delta `OldValues___` via `entityObject.LoadFromData(oldValues)`
   * (without first loading the authoritative row via `InnerLoad`) would leave every untouched column
   * `NotLoaded = true` (or `null`), causing `spUpdate` or custom `Validate()` hooks to see incomplete
   * state. Returning `false` for partial deltas ensures {@link MustLoadTruthFromDatabase} routes
   * delta updates through `InnerLoad(cKey)` + {@link TestAndSetClientOldValuesToDBValues}, even on
   * entities with `TrackRecordChanges === false`.
   */
  protected hasCompleteOldValues(
    entityInfo: EntityInfo,
    oldValues?: Array<{ Key: string; Value: unknown }> | null
  ): boolean {
    if (!oldValues || oldValues.length === 0) {
      return false;
    }
    const providedKeys = new Set(oldValues.map((kv) => kv.Key));
    return entityInfo.Fields.every(
      (f) => (!f.IsPrimaryKey && (f.ReadOnly || f.IsVirtual)) || providedKeys.has(f.Name) || providedKeys.has(f.CodeName)
    );
  }

  /**
   * Whether `UpdateRecord` must hydrate the entity from the DATABASE rather than from the
   * client's `OldValues___`.
   *
   * The `OldValues___` path exists as an optimization when a client supplies the complete pre-save
   * record (e.g. `IgnoreDirtyState: true`) and nothing else requires the database's authoritative prior
   * state. Under the delta-only `Save()` wire protocol, normal updates send only primary keys and dirty
   * writable fields in `OldValues___`, so {@link hasCompleteOldValues} returns `false` and forces the
   * database load (`InnerLoad`) so untouched columns retain their stored values.
   *
   * `FieldLevelSecurityApplies` (own flag or an IS-A ancestor's) is the security-critical one, and it is NOT redundant with
   * `hasDeniedReadFields`. That flag reports READ denials, and the canonical FLS configuration is
   * Read Allow + Update Deny — which leaves it false. Such a caller would be hydrated from its own
   * `OldValues___`, and a value it supplies there for an update-denied field arrives through
   * `LoadFromData`, which the `EntityField` setter records as that field's INITIAL value. The
   * field is therefore not dirty, `BaseEntity.CheckFieldLevelUpdatePermissions` only rejects
   * `field.Dirty && denied`, and `GenerateSaveSQL` sends every `IsSPParameter` field regardless of
   * dirtiness (it skips only `NotLoaded`). The fabricated value reached `spUpdate` having passed
   * every check: pinning a value in `OldValues___` was a write to a field the caller may not write.
   *
   * Forcing the truth-load closes that rather than relocating it. The entity is hydrated by
   * `InnerLoad` from the real row, and `TestAndSetClientOldValuesToDBValues` reads the client's
   * OldValues only to detect concurrent-edit overlap before ending in `SetMany(clientNewValues)` —
   * it never applies them to the entity. An update-denied field can then only become dirty by being
   * named in the mutation input itself, which is precisely the case that check does catch.
   *
   * The flag comes after the cheap terms, so the extra load lands only on entities that have the
   * feature switched on, which is almost none of them.
   *
   * `MJ: Record Changes` always loads from the database: its server class allows an update only when
   * Comments is the one dirty field, and "dirty" compared against client-supplied OldValues lets a
   * caller pin forged audit columns as both old and new values. It doesn't track its own changes, so
   * nothing else forces the load.
   *
   * `MJ: Data Context Items` always loads from the database for the same reason: its server class
   * lets only an administrator save an item that holds SQL, and decides that from the item's `Type`
   * and `SQL`. Hydrated from OldValues, a client could leave both out, and the stored procedure would
   * keep the stored SQL item while the rule saw none.
   *
   * `MJ: Conversation Details` always loads for the same reason: its write gate decides from the stored
   * row (who wrote a person's message, its role, the owner's rating), and an OldValues-hydrated entity
   * would let a grantee claim to be a message's author while rewriting it. See
   * {@link ENTITIES_THAT_ALWAYS_LOAD_STORED_ROW}.
   *
   * A caller under an Update row filter (a role's Update RLS filter or an API-key row filter) always
   * loads from the database too (#4919). The save's post-image check skips its query when no column
   * the filter reads is dirty, and dirtiness measured against client OldValues is the caller's to
   * choose: claiming the new value of a filter column as its old value made it clean, so the update
   * moved the row outside the caller's scope without the check ever running. Evaluated last: it
   * builds the filter clause, and only callers with such a filter pay for the load. A missing user
   * (a user-cache miss) also loads: with no user the filter can't be ruled out.
   */
  protected MustLoadTruthFromDatabase(
    entityInfo: EntityInfo,
    input: { OldValues___?: Array<{ Key: string; Value: unknown }> },
    hasDeniedReadFields: boolean,
    hasNarrowedAuditPayload: boolean,
    user: UserInfo | undefined
  ): boolean {
    return (
      entityInfo.TrackRecordChanges ||
      ENTITIES_THAT_ALWAYS_LOAD_STORED_ROW.has(entityInfo.Name.trim().toLowerCase()) ||
      !this.hasCompleteOldValues(entityInfo, input.OldValues___) ||
      hasDeniedReadFields ||
      hasNarrowedAuditPayload ||
      entityInfo.FieldLevelSecurityApplies ||
      !user ||
      entityInfo.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Update, '').length > 0
    );
  }

  /**
   * Field-level security gate on the update path's client input.
   *
   * For a caller denied at least one field on the entity, refuses (with a `FieldSecurityError`)
   * any key in the new values or in `OldValues___` that names a field the caller cannot READ, or
   * that names no field at all, with the same message for both (see
   * `AssertClientInputWritableForUser`), so the refusal does not reveal which columns exist.
   *
   * Refused rather than dropped: a field the caller cannot read was absent from every payload the
   * client received, so a value for it can only be fabricated. A well-behaved client never sends
   * one (it omits fields it did not load), so ordinary traffic is unaffected.
   *
   * There is no split by update permission: Read is required for Update, so a user denied read is
   * denied update too.
   *
   * Returns true when the user has a non-empty denied-read set on this entity. The caller must
   * then hydrate the entity from the DATABASE (never from client OldValues), so denied fields hold
   * true values the client input never touches.
   */
  protected AssertClientInputFieldSecurity(
    entityInfo: EntityInfo,
    userInfo: UserInfo,
    input: { OldValues___?: Array<{ Key: string; Value: unknown }> } & Record<string, unknown>,
    clientNewValues: Record<string, unknown>
  ): boolean {
    if (!entityInfo.FieldLevelSecurityApplies || !userInfo) {
      return false;
    }
    if (entityInfo.GetDeniedReadFields(userInfo).size === 0) {
      return false;
    }
    AssertClientInputWritableForUser(entityInfo, clientNewValues, userInfo);
    if (Array.isArray(input.OldValues___)) {
      const oldValueKeys: Record<string, unknown> = {};
      for (const item of input.OldValues___) {
        oldValueKeys[String(item.Key)] = null;
      }
      AssertClientInputWritableForUser(entityInfo, oldValueKeys, userInfo);
    }
    return true;
  }

  /**
   * Refuses a client-sent `MJ: Record Changes` payload column from a caller who carries field
   * denials, and forces the update onto the load-truth-from-DB branch.
   *
   * This is the write half of the audit-trail projection, and without it that projection would
   * itself destroy audit history. A restricted caller is served a NARROWED `ChangesJSON` /
   * `FullRecordJSON` and no `ChangesDescription`. Those values hydrate a client-side entity as
   * ordinary loaded values, and `GenerateSaveSQL` writes EVERY `IsSPParameter` field rather than
   * only dirty ones — so a user who edits `Comments` on that record and saves would silently
   * overwrite the stored payload with the narrowed one they were shown. The row would keep looking
   * like a complete audit entry while the pruned fields were gone for everyone, permanently.
   *
   * The rule is the one field security already applies elsewhere: **a value a client could not
   * have seen in full is not user intent, it is a transport artifact, and it is ignored.** Here
   * that is widened from "fields the caller cannot read" to "the audit payload of a caller who
   * carries any denial", because the column is readable — it is its CONTENTS that were narrowed,
   * and which row's target entity did the narrowing is not knowable from the input alone.
   *
   * Returning true routes the caller through `InnerLoad`, so the stored values are restored from
   * the database before the save. Legitimate payload writes are unaffected: they happen
   * server-side (`SnapshotBuilder`, replay) and never through this resolver.
   */
  protected StripRecordChangePayloadFromClientInput(
    entityInfo: EntityInfo,
    userInfo: UserInfo,
    input: { OldValues___?: Array<{ Key: string; Value: unknown }> } & Record<string, unknown>,
    clientNewValues: Record<string, unknown>,
    provider?: IMetadataProvider
  ): boolean {
    if (!userInfo || !RecordChangeFieldSecurityProjector.IsRecordChangesEntity(entityInfo)) {
      return false;
    }
    const md = provider ?? new Metadata();
    if (!new RecordChangeFieldSecurityProjector(md, userInfo).CallerCarriesAnyDenial()) {
      return false; // this caller was served the payload whole, so what they send back is theirs
    }

    const payloadKeys = new Set(RecordChangePayloadFields.map((f) => f.toLowerCase()));
    const stripped: string[] = [];
    for (const key of Object.keys(clientNewValues)) {
      if (payloadKeys.has(key.trim().toLowerCase())) {
        delete clientNewValues[key];
        delete input[key];
        stripped.push(key);
      }
    }
    // OldValues too: a narrowed payload in the client's old values is not what the database holds,
    // so leaving it would read as a concurrent-edit conflict on a field nobody edited.
    if (Array.isArray(input.OldValues___)) {
      input.OldValues___ = input.OldValues___.filter((item) => !payloadKeys.has(String(item.Key).trim().toLowerCase()));
    }
    if (stripped.length > 0) {
      LogDebug(
        `[FieldSecurity] UpdateRecord on '${entityInfo.Name}' for user ${userInfo.Email}: ` +
          `ignored client-sent audit payload column(s) ${stripped.join(', ')} — the caller carries field ` +
          `denials, so the value they hold may be a narrowed projection rather than the stored one`
      );
    }
    // True even when nothing was stripped: the DB truth-load is what guarantees the payload the
    // save writes is the stored one, and a client that sent no payload key at all would otherwise
    // fall through to the OldValues branch and write whatever it did send.
    return true;
  }

  /**
   * Converts one client-sent old value (always a string on the wire; dates as epoch milliseconds,
   * the GraphQL Timestamp form) to the field's TypeScript type, so it compares equal to the stored
   * value. Both the OldValues comparison and the load-from-OldValues path use it: without it a date
   * old value becomes an Invalid Date and an unchanged date field reads as edited.
   */
  protected ClientOldValueToFieldValue(field: EntityFieldInfo | undefined, raw: unknown): string | number | boolean | Date | null {
    let val: unknown = raw;
    if ((val === null || val === undefined) && field && field.DefaultValue !== null && field.DefaultValue !== undefined && !field.AllowsNull)
      val = field.DefaultValue; // set default value as the field was never set and it does NOT allow nulls
    if (val === undefined) val = null;
    // A null old value stays null, except a boolean, which the comparison has always read as false.
    if (field?.TSType === EntityFieldTSType.Boolean && val === null) return false;
    if (val === null) return null;
    if (!field) {
      // No field metadata to convert by: pass scalars through, stringify anything else.
      return typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' || val instanceof Date ? val : String(val);
    }

    const text = String(val);
    switch (field.TSType) {
      case EntityFieldTSType.Number: {
        const integer = ['int', 'smallint', 'bigint', 'tinyint'].includes((field.Type as string).toLowerCase());
        return integer ? parseInt(text) : parseFloat(text);
      }
      case EntityFieldTSType.Boolean:
        return !(text === 'false' || text === '0' || parseInt(text) === 0);
      case EntityFieldTSType.Date:
        // Epoch milliseconds (the GraphQL Timestamp form) arrive as a numeric string.
        return new Date(text.trim() !== '' && !isNaN(Number(text)) ? parseInt(text) : text);
      default:
        return text; // already a string
    }
  }

  /**
   * Compares the client-supplied `OldValues___` array in `input` against the authoritative database
   * values just loaded onto `entityObject` via `InnerLoad`, checks for overlapping concurrent field
   * modifications, and then applies `clientNewValues` onto `entityObject` via `SetMany`.
   *
   * Supports both full-record and delta-only `OldValues___` payloads: only keys present in
   * `input.OldValues___` (e.g. primary keys + dirty writable fields) are compared against `dbValues`,
   * and `entityObject.SetMany(clientNewValues)` mutates only the fields sent in `clientNewValues`
   * while preserving all untouched DB-loaded fields on `entityObject`.
   *
   * ASSUMES: `input` has an `OldValues___` property that is an array of Key/Value pairs representing
   * the pre-mutation values of the fields the client is updating.
   */
  /**
   * Resolves a field on `entityInfo` by `CodeName` or `Name` in $O(1)$ via `FieldByCodeName` /
   * `FieldByName` when available on `EntityInfo`, falling back to `.Fields.find()` for test stubs.
   */
  private findEntityFieldByCodeNameOrName(entityInfo: EntityInfo, key: string): EntityFieldInfo | undefined {
    if (typeof entityInfo.FieldByCodeName === 'function') {
      return entityInfo.FieldByCodeName(key) ?? entityInfo.FieldByName(key);
    }
    return entityInfo.Fields.find((f) => f.CodeName === key || f.Name === key);
  }

  protected async TestAndSetClientOldValuesToDBValues(input: any, clientNewValues: any, entityObject: BaseEntity, contextUser: UserInfo) {
    // we have OldValues, so we need to compare them to the values we just loaded from the DB
    const clientOldValues = {};
    // for each item in the oldValues array, add it to the clientOldValues object
    input.OldValues___.forEach((item) => {
      // we need to do a quick transform on the values to make sure they match the TS Type for the given field because item.Value will always be a string
      const field = this.findEntityFieldByCodeNameOrName(entityObject.EntityInfo, item.Key);
      const val = this.ClientOldValueToFieldValue(field, item.Value);
      clientOldValues[item.Key] = val;
    });

    // clientOldValues now has all of the oldValues the CLIENT passed us. Now we need to build the same kind of object
    // with the DB values
    // fls-guard: compared on the server only, never returned
    const dbValues = entityObject.GetAll();

    // now we need to compare clientOldValues and dbValues and have a new array that has entries for any differences and have FieldName, clientOldValue and dbValue as properties
    const dbDifferences = [];
    Object.keys(clientOldValues).forEach((key) => {
      const f = this.findEntityFieldByCodeNameOrName(entityObject.EntityInfo, key);
      const dbVal = f && f.Name in dbValues ? dbValues[f.Name] : dbValues[key];
      let different = false;
      switch (typeof clientOldValues[key]) {
        case 'number':
          different = clientOldValues[key] !== dbVal;
          break;
        case 'boolean':
          different = clientOldValues[key] !== dbVal;
          break;
        case 'object':
          if (clientOldValues[key] instanceof Date) {
            const clientDate = clientOldValues[key] as Date;
            const dbDate = dbVal;
            if (dbDate == null || !(dbDate instanceof Date)) {
              different = true;
            } else if (clientDate.getTime() !== dbDate.getTime()) {
              // Check if this is a datetime/datetime2 field with only a timezone hour shift
              const sqlType = f?.SQLFullType?.trim().toLowerCase() || '';
              if (sqlType !== 'datetimeoffset' && IsOnlyTimezoneShift(clientDate, dbDate)) {
                console.warn(
                  `Timezone hour shift detected on field "${key}" (${sqlType || 'datetime'}). ` +
                  `Client: ${clientDate.toISOString()}, DB: ${dbDate.toISOString()}. ` +
                  `Consider using datetimeoffset to avoid timezone ambiguity.`
                );
                different = false; // Allow timezone shifts through for non-datetimeoffset fields
              } else {
                different = true;
              }
            }
          } else if (clientOldValues[key] === null) {
            different = dbVal !== null;
          }
          break;
        default:
          different = clientOldValues[key] !== dbVal;
          break;
      }
      if (different && f && !f.ReadOnly) {
        // only include updateable fields
        dbDifferences.push({
          FieldName: key,
          ClientOldValue: clientOldValues[key],
          DBValue: dbVal,
        });
      }
    });

    if (dbDifferences.length > 0) {
      // now we have an array of any dbDifferences with length > 0, between the clientOldValues and the dbValues, we need to check to see if any of the differences are on fields that the client is trying to update
      // first step is to get clientNewValues into an object that is like clientOldValues, get the diff and then compare that diff to the differences array that shows diff between DB and ClientOld
      const clientDifferences = [];
      Object.keys(clientOldValues).forEach((key) => {
        const f = this.findEntityFieldByCodeNameOrName(entityObject.EntityInfo, key);
        if (key in clientNewValues && clientOldValues[key] !== clientNewValues[key] && f && f.AllowUpdateAPI && !f.IsPrimaryKey) {
          // only include updateable fields
          clientDifferences.push({
            FieldName: key,
            ClientOldValue: clientOldValues[key],
            ClientNewValue: clientNewValues[key],
          });
        }
      });

      // now we have clientDifferences which shows what the client thinks they are changing. And, we have the dbDifferences array that shows changes between the clientOldValues and the dbValues
      // if there is ANY overlap in the FIELDS that appear in both arrays, we need to log a warning but allow the save to continue
      const dbDiffFieldNames = new Set(dbDifferences.map((dd) => dd.FieldName));
      const overlap = clientDifferences.filter((cd) => dbDiffFieldNames.has(cd.FieldName));
      if (overlap.length > 0) {
        const msg = {
          Message:
            'Inconsistency between old values provided for changed fields, and the values of one or more of those fields in the database. Save operation continued with warning.',
          ClientDifferences: clientDifferences,
          DBDifferences: dbDifferences,
          Overlap: overlap,
        };
        
        // Log as warning to console and ErrorLog table instead of throwing error
        console.warn('Entity save inconsistency detected but allowing save to continue:', JSON.stringify(msg));
        LogErrorEx({
          message: `Entity save inconsistency detected: ${JSON.stringify(msg)}`,
          severity: 'warning',
          category: 'ResolverBase.TestAndSetClientOldValuesToDBValues',
          metadata: {
            entityName: entityObject.EntityInfo.Name,
            clientDifferences: clientDifferences,
            dbDifferences: dbDifferences,
            overlap: overlap,
          },
        });

        // Create ErrorLog record in the database — use the entity's bound provider so the
        // ErrorLog write goes to the same connection as the entity that triggered it.
        try {
          const md = entityObject.ProviderToUse as unknown as IMetadataProvider;
          const errorLogEntity = await md.GetEntityObject<MJErrorLogEntity>('MJ: Error Logs', contextUser);
          // Code is NCHAR(20); a longer value is rejected at the database
          errorLogEntity.Code = 'SAVE_INCONSISTENCY';
          errorLogEntity.Message = `Entity save inconsistency detected for ${entityObject.EntityInfo.Name}: ${JSON.stringify(msg)}`;
          errorLogEntity.Status = 'Warning';
          errorLogEntity.Category = 'Entity Save';
          errorLogEntity.CreatedBy = contextUser.Email || contextUser.Name;
          
          const saveResult = await errorLogEntity.Save();
          if (!saveResult) {
            console.error(
              `Failed to save ErrorLog record for ${entityObject.EntityInfo.Name}: ${errorLogEntity.LatestResult?.CompleteMessage}`
            );
          }
        } catch (errorLogError) {
          console.error('Error creating ErrorLog record:', errorLogError);
        }
      }
    }

    // If we get here that means we've not thrown an exception, so there is
    // NO OVERLAP, so we can set the new values from the data provided from the client now...
    entityObject.SetMany(clientNewValues);
  }

  protected async DeleteRecord(
    entityName: string,
    key: CompositeKey,
    options: DeleteOptionsInput,
    provider: DatabaseProviderBase,
    userPayload: UserPayload,
    pubSub: PubSubEngine
  ) {
    // Check API key scope authorization for entity delete operations
    await this.CheckAPIKeyScopeAuthorization('entity:delete', entityName, userPayload);

    // ...which authorizes "may you delete", never "may you delete without an audit row". Strip
    // the capabilities no client may exercise before they reach the entity.
    options = DeleteOptionsInput.SanitizeFromWire(options, entityName, userPayload?.email);

    if (await this.BeforeDelete(provider, key)) {
      // fire event and proceed if it wasn't cancelled
      const entityObject = await provider.GetEntityObject(entityName, this.GetUserFromPayload(userPayload));
      const loadSuccess = await entityObject.InnerLoad(key);
      if (!loadSuccess) {
        // Use a generic message to avoid leaking whether a record exists — distinguishing
        // "not found" from "access denied" would let an attacker enumerate valid record IDs.
        throw new GraphQLError(`Record not found or access denied`, {
          extensions: { code: 'LOAD_ENTITY_ERROR', entityName },
        });
      }
      // Grab the values before we delete so we can return the last state if the delete succeeds,
      // projected for the caller in case the object holds a column they may not read.
      // fls-guard: projected by ProjectEntityValuesForUser
      const returnValue = ProjectEntityValuesForUser(provider, entityObject.EntityInfo, entityObject.GetAll(), this.GetUserFromPayload(userPayload));

      this.ListenForEntityMessages(entityObject, pubSub, userPayload);
      
      if (await entityObject.Delete(options)) {
        await this.AfterDelete(provider, key); // fire event
        // Cache invalidation is now handled globally by the MJGlobal listener in index.ts
        return returnValue;
      } else {
        // CompleteMessage, for the same reason as the update path above. It matters more going
        // forward: apps already refuse deletes by overriding Delete() and returning false with the
        // reason on LatestResult, and #3971 proposes a first-class delete-validation seam. Every one
        // of those reasons was being replaced by 'Unknown error' at the API boundary.
        throw new GraphQLError(entityObject.LatestResult?.CompleteMessage ?? 'Unknown error', {
          extensions: RefusalExtensions('DELETE_ENTITY_ERROR', entityName, entityObject.LatestResult),
        });
      }
    } else {
      throw new GraphQLError('Delete operation canceled by BeforeDelete() handler in ResolverBase', {
        extensions: { code: 'DELETE_ENTITY_ERROR', entityName },
      });
    }
  }

  // Before/After DELETE Event Hooks for Sub-Classes to Override
  protected async BeforeDelete(provider: DatabaseProviderBase, key: CompositeKey): Promise<boolean> {
    return true;
  }
  protected async AfterDelete(provider: DatabaseProviderBase, key: CompositeKey) {}

  // Before/After UPDATE Event Hooks for Sub-Classes to Override
  protected async BeforeUpdate(provider: DatabaseProviderBase, input: any): Promise<boolean> {
    return true;
  }
  protected async AfterUpdate(provider: DatabaseProviderBase, input: any) {}
}
