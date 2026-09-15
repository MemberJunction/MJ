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
  provider: DatabaseProviderBase;
  type: 'Admin' | 'Read-Write' | 'Read-Only' | 'Other';
}

export class DataSourceInfo  {
  DataSource: sql.ConnectionPool;

  /** @deprecated Use {@link DataSource}. */
  get dataSource(): sql.ConnectionPool {
    return this.DataSource;
  }
  /** @deprecated Use {@link DataSource}. */
  set dataSource(value: sql.ConnectionPool) {
    this.DataSource = value;
  }
  Host: string;

  /** @deprecated Use {@link Host}. */
  get host(): string {
    return this.Host;
  }
  /** @deprecated Use {@link Host}. */
  set host(value: string) {
    this.Host = value;
  }
  Port: number;

  /** @deprecated Use {@link Port}. */
  get port(): number {
    return this.Port;
  }
  /** @deprecated Use {@link Port}. */
  set port(value: number) {
    this.Port = value;
  }
  instance?: string;
  Database: string;

  /** @deprecated Use {@link Database}. */
  get database(): string {
    return this.Database;
  }
  /** @deprecated Use {@link Database}. */
  set database(value: string) {
    this.Database = value;
  }
  UserName: string;

  /** @deprecated Use {@link UserName}. */
  get userName(): string {
    return this.UserName;
  }
  /** @deprecated Use {@link UserName}. */
  set userName(value: string) {
    this.UserName = value;
  }
  Type: "Admin" | "Read-Write" | "Read-Only" | "Other";

  /** @deprecated Use {@link Type}. */
  get type(): "Admin" | "Read-Write" | "Read-Only" | "Other" {
    return this.Type;
  }
  /** @deprecated Use {@link Type}. */
  set type(value: "Admin" | "Read-Write" | "Read-Only" | "Other") {
    this.Type = value;
  }

  constructor(init: {dataSource: sql.ConnectionPool, type: "Admin" | "Read-Write" | "Read-Only" | "Other", host: string, port: number, database: string, userName: string} ) {
    this.DataSource = init.dataSource;
    this.Host = init.host;
    this.Port = init.port;
    this.Database = init.database;
    this.UserName = init.userName;
    this.Type = init.type;
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
  type: 'setupComplete' | 'requestReceived' | 'requestCompleted' | 'requestFailed';
  dataSources: DataSourceInfo[];
  userPayload: UserPayload;
  systemUser: UserInfo;
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