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

export type AppContext = {
  dataSource: DataSource;
  userPayload: UserPayload;
  queryRunner?: QueryRunner;
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
