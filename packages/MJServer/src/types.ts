import { GraphQLSchema } from 'graphql';
import { DataSource, QueryRunner } from 'typeorm';

export type UserPayload = {
  email: string;
  userRecord: any;
  sessionId: string;
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
