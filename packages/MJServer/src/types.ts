import { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { UserViewEntityExtended } from '@memberjunction/core-entities';
import { GraphQLSchema } from 'graphql';
import sql from 'mssql';
import { getSystemUser } from './auth/index.js';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';

export type UserPayload = {
  email: string;
  userRecord: UserInfo;
  sessionId: string;
  isSystemUser?: boolean;
  apiKey?: string;
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
  dataSource: sql.ConnectionPool;
  host: string;
  port: number;
  instance?: string;
  database: string;
  userName: string;
  type: "Admin" | "Read-Write" | "Read-Only" | "Other";

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
  viewInfo: UserViewEntityExtended;
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
  excludeDataFromAllPriorViewRuns?: boolean;
  forceAuditLog?: boolean;
  auditLogDescription?: string;
  resultType?: string;
  userPayload?: UserPayload; 
};


export class MJServerEvent {
  type: 'setupComplete' | 'requestReceived' | 'requestCompleted' | 'requestFailed';
  dataSources: DataSourceInfo[];
  userPayload: UserPayload;
  systemUser: UserInfo;
}

export const MJ_SERVER_EVENT_CODE = 'MJ_SERVER_EVENT';

export async function raiseEvent(type: MJServerEvent['type'], dataSources: DataSourceInfo[], userPayload: UserPayload, component?: any) {
  const event = new MJServerEvent();
  event.type = type;
  event.dataSources = dataSources;
  event.userPayload = userPayload;
  event.systemUser = await getSystemUser();

  const mje = new MJEvent();
  mje.args = event;
  mje.component = component;
  mje.event = MJEventType.ComponentEvent;
  mje.eventCode = MJ_SERVER_EVENT_CODE;
  MJGlobal.Instance.RaiseEvent(mje);
}