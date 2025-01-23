import { FieldMapper, MapperKind, getDirective, mapSchema } from '@graphql-tools/utils';
import { AuthorizationError, Directive } from 'type-graphql';
import { DirectiveBuilder } from '../types.js';

const DIRECTIVE_NAME = 'RequireSystemUser';

export function RequireSystemUser(): PropertyDecorator & MethodDecorator & ClassDecorator;
export function RequireSystemUser(): PropertyDecorator | MethodDecorator | ClassDecorator {
  return (targetOrPrototype, propertyKey, descriptor) => Directive(`@${DIRECTIVE_NAME}`)(targetOrPrototype, propertyKey, descriptor);
}

export const requireSystemUserDirective: DirectiveBuilder = {
  typeDefs: `directive @${DIRECTIVE_NAME} on FIELD_DEFINITION`,
  transformer: (schema) => {
    const fieldMapper: FieldMapper = (fieldConfig) => {
      const directive = getDirective(schema, fieldConfig, DIRECTIVE_NAME)?.[0];
      return {
        ...fieldConfig,
        resolve: (source, args, context, info) => {
          if (directive) {
            if (!context.userPayload.isSystemUser) {
              throw new AuthorizationError('Operation not permitted for this user');
            }
          }
          return fieldConfig.resolve(source, args, context, info);
        },
      };
    };
    return mapSchema(schema, { [MapperKind.OBJECT_FIELD]: fieldMapper });
  },
};
