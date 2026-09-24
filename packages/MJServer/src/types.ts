import { AggregateExpression, CompositeKey, DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { GraphQLSchema } from 'graphql';
import sql from 'mssql';
import { GetSystemUser } from './auth/index.js';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';

/**
 * Augment Express Request to include MJ auth properties set by the unified auth middleware.
 */
declare module 'express' {
  interface Request {
    /** Set by the unified auth middleware after successful authentication */
    userPayload?: UserPayload;
  }
}

export type UserPayload = {
  email: string;
  userRecord: any;
  sessionId: string;
  isSystemUser?: boolean;
  apiKey?: string;
  /** ID of the MJ API key used for authentication (when using mj_sk_* format keys) */
  apiKeyId?: string;
  /** SHA-256 hash of the MJ API key (used for scope authorization) */
  apiKeyHash?: string;
  /**
   * The IdP's OIDC `email_verified` assertion from the verified JWT, when present.
   * Three-state: `true` (IdP vouched for the email), `false` (IdP explicitly says the email is
   * unverified — security-sensitive flows must not trust an email match), `undefined` (the IdP
   * omits the claim, or auth was via API key / magic link). Consumed by identity-claim
   * redemption; do not treat `undefined` as `false`.
   */
  emailVerified?: boolean;
};

/**
 * AppContext is the context object that is passed to all resolvers.
 */
export type AppContext = {
  /**
   * The default and backwards compatible connection pool.
   */
  dataSource: sql.ConnectionPool;
  userPayload: UserPayload;
  queryRunner?: sql.Request;
  /**
   * Array of connection pools that have additional information about their intended use e.g. Admin, Read-Write, Read-Only.
   */
  dataSources: DataSourceInfo[];

  /**
   * Per-request DatabaseProviderBase instances  
   */
  providers: Array<ProviderInfo>;
};

export class ProviderInfo {
  provider: DatabaseProviderBase;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  type: 'Admin' | 'Read-Write' | 'Read-Only' | 'Other';  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}

export class DataSourceInfo  {
  dataSource: sql.ConnectionPool;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  host: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  port: number;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  instance?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
  database: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  userName: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  type: "Admin" | "Read-Write" | "Read-Only" | "Other";  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply

  constructor(init: {dataSource: sql.ConnectionPool, type: "Admin" | "Read-Write" | "Read-Only" | "Other", host: string, port: number, database: string, userName: string} ) {
    this.dataSource = init.dataSource;
    this.host = init.host;
    this.port = init.port;
    this.database = init.database;
    this.userName = init.userName;
    this.type = init.type;
  }
};

export type DirectiveBuilder = {
  typeDefs: string;
  transformer: (schema: GraphQLSchema) => GraphQLSchema;
};

export type RunViewGenericParams = {
  viewInfo: MJUserViewEntityExtended;
  provider: DatabaseProviderBase;
  extraFilter: string;
  orderBy: string;
  userSearchString: string;
  excludeUserViewRunID?: string;
  overrideExcludeFilter?: string;
  saveViewResults?: boolean;
  fields?: string[];
  ignoreMaxRows?: boolean;
  maxRows?: number;
  startRow?: number;
  /**
   * Keyset (seek) pagination cursor — see {@link RunViewParams.AfterKey}.
   * When set, the entity must have a single-column PK; throws AfterKeyNotSupportedError otherwise.
   */
  afterKey?: CompositeKey;
  excludeDataFromAllPriorViewRuns?: boolean;
  forceAuditLog?: boolean;
  auditLogDescription?: string;
  resultType?: string;
  userPayload?: UserPayload;
  aggregates?: AggregateExpression[];
  /**
   * When true, the server-side cache layer is bypassed for this view run —
   * neither the pre-check cache lookup nor the post-query cache write
   * happens. Propagated to `RunViewParams.BypassCache`.
   */
  bypassCache?: boolean;
  /**
   * Optional source-of-truth selector for entities that have a base-view materialization.
   * 'Materialized' routes the read to the entity's materialized wrapper view; defaults to 'Live'.
   * Propagated to `RunViewParams.DataSource`.
   */
  dataSource?: 'Live' | 'Materialized';
};


export class MJServerEvent {
  type: 'setupComplete' | 'requestReceived' | 'requestCompleted' | 'requestFailed';  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  dataSources: DataSourceInfo[];  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  userPayload: UserPayload;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
  systemUser: UserInfo;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}

export const MJ_SERVER_EVENT_CODE = 'MJ_SERVER_EVENT';

export async function RaiseEvent(type: MJServerEvent['type'], dataSources: DataSourceInfo[], userPayload: UserPayload, component?: any) {
  const event = new MJServerEvent();
  event.type = type;
  event.dataSources = dataSources;
  event.userPayload = userPayload;
  event.systemUser = await GetSystemUser();

  const mje = new MJEvent();
  mje.args = event;
  mje.component = component;
  mje.event = MJEventType.ComponentEvent;
  mje.eventCode = MJ_SERVER_EVENT_CODE;
  MJGlobal.Instance.RaiseEvent(mje);
}

/** @deprecated Use {@link RaiseEvent}. */
export async function raiseEvent(type: MJServerEvent['type'], dataSources: DataSourceInfo[], userPayload: UserPayload, component?: any) {
  return RaiseEvent(type, dataSources, userPayload, component);
}