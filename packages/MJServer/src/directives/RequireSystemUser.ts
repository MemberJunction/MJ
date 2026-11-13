import { FieldMapper, MapperKind, getDirective, mapSchema } from '@graphql-tools/utils';
import { GraphQLFieldResolver, defaultFieldResolver } from 'graphql';
import { AuthorizationError, Directive } from 'type-graphql';
import { AppContext, DirectiveBuilder } from '../types.js';

const DIRECTIVE_NAME = 'RequireSystemUser';

export function RequireSystemUser(): PropertyDecorator & MethodDecorator & ClassDecorator;
export function RequireSystemUser(): PropertyDecorator | MethodDecorator | ClassDecorator {
  return (targetOrPrototype, propertyKey, descriptor) => Directive(`@${DIRECTIVE_NAME}`)(targetOrPrototype, propertyKey, descriptor);
}

export const RequireSystemUserDirective: DirectiveBuilder = {
  typeDefs: `directive @${DIRECTIVE_NAME} on FIELD_DEFINITION`,
  transformer: (schema) => {
    const fieldMapper: FieldMapper = (fieldConfig) => {
      const directive = getDirective(schema, fieldConfig, DIRECTIVE_NAME)?.[0];
      if (!directive) {
        return fieldConfig;
      }
      const { resolve = defaultFieldResolver } = fieldConfig;
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
      return {
        ...fieldConfig,
        resolve: directiveResolver,
      };
    };
    return mapSchema(schema, { [MapperKind.OBJECT_FIELD]: fieldMapper });
  },
};

/** @deprecated Use {@link RequireSystemUserDirective}. */
export const requireSystemUserDirective = RequireSystemUserDirective;
