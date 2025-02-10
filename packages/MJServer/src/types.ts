import { UserViewEntity } from '@memberjunction/core-entities';
import { GraphQLSchema } from 'graphql';
import { PubSubEngine } from 'type-graphql';
import { DataSource, QueryRunner } from 'typeorm';

export type UserPayload = {
  email: string;
  userRecord: any;
  sessionId: string;
  isSystemUser?: boolean;
  apiKey?: string;
};

/**
 * AppContext is the context object that is passed to all resolvers.
 */
export type AppContext = {
  /**
   * The default and backwards compatible data source.
   */
  dataSource: DataSource;
  userPayload: UserPayload;
  queryRunner?: QueryRunner;
  /**
   * Array of data sources that have additional information about their intended use e.g. Admin, Read-Write, Read-Only.
   */
  dataSources: DataSourceInfo[];
};

export class DataSourceInfo  {
  dataSource: DataSource;
  host: string;
  port: number;
  instance?: string;
  database: string;
  userName: string;
  type: "Admin" | "Read-Write" | "Read-Only" | "Other";

  constructor(init: {dataSource: DataSource, type: "Admin" | "Read-Write" | "Read-Only" | "Other", host: string, port: number, database: string, userName: string} ) {
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
  viewInfo: UserViewEntity;
  dataSource: DataSource;
  extraFilter: string;
  orderBy: string;
  userSearchString: string;
  excludeUserViewRunID?: string;
  overrideExcludeFilter?: string;
  saveViewResults?: boolean;
  fields?: string[];
  ignoreMaxRows?: boolean;
  excludeDataFromAllPriorViewRuns?: boolean;
  forceAuditLog?: boolean;
  auditLogDescription?: string;
  resultType?: string;
  userPayload?: UserPayload;
  pubSub: PubSubEngine;
};
