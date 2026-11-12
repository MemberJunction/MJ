import { FieldMapper, MapperKind, getDirective, mapSchema } from '@graphql-tools/utils';
import { GraphQLFieldResolver, GraphQLSchema, defaultFieldResolver } from 'graphql';
import { AuthorizationError } from 'type-graphql';
import { AppContext } from '../types.js';

export * from './Public.js';
export * from './RequireSystemUser.js';

/**
 * Applies both @RequireSystemUser and @Public directive rules in a single schema pass
 * to avoid cloning the GraphQLSchema twice and allocating redundant wrapper closures.
 */
export function ApplyBuiltInDirectivesTransformer(schema: GraphQLSchema): GraphQLSchema {
  const fieldMapper: FieldMapper = (fieldConfig) => {
    const requireSystemUser = !!getDirective(schema, fieldConfig, 'RequireSystemUser')?.[0];
    const isPublic = !!getDirective(schema, fieldConfig, 'Public')?.[0];

    // If @Public is present and @RequireSystemUser is NOT present, no auth check is needed
    if (isPublic && !requireSystemUser) {
      return fieldConfig;
    }

    const { resolve = defaultFieldResolver } = fieldConfig;

    if (requireSystemUser && !isPublic) {
      const directiveResolver: GraphQLFieldResolver<unknown, AppContext> = (
        source,
        args,
        context,
        info
      ) => {
        if (!context?.userPayload?.userRecord?.IsActive) {
          throw new AuthorizationError();
        }
        if (!context?.userPayload?.isSystemUser) {
          throw new AuthorizationError('Operation not permitted for this user');
        }
        return resolve(source, args, context, info);
      };
      return { ...fieldConfig, resolve: directiveResolver };
    }

    if (requireSystemUser && isPublic) {
      const directiveResolver: GraphQLFieldResolver<unknown, AppContext> = (
        source,
        args,
        context,
        info
      ) => {
        if (!context?.userPayload?.isSystemUser) {
          throw new AuthorizationError('Operation not permitted for this user');
        }
        return resolve(source, args, context, info);
      };
      return { ...fieldConfig, resolve: directiveResolver };
    }

    // Default: not @Public, not @RequireSystemUser -> check active user
    const directiveResolver: GraphQLFieldResolver<unknown, AppContext> = (
      source,
      args,
      context,
      info
    ) => {
      if (!context?.userPayload?.userRecord?.IsActive) {
        throw new AuthorizationError();
      }
      return resolve(source, args, context, info);
    };
    return { ...fieldConfig, resolve: directiveResolver };
  };

  return mapSchema(schema, { [MapperKind.OBJECT_FIELD]: fieldMapper });
}

