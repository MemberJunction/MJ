import { FieldMapper, MapperKind, getDirective, mapSchema } from '@graphql-tools/utils';
import { GraphQLFieldResolver, defaultFieldResolver } from 'graphql';
import { AuthorizationError, Directive } from 'type-graphql';
import { AppContext, DirectiveBuilder } from '../types';

const DIRECTIVE_NAME = 'Public';

export function Public(): PropertyDecorator & MethodDecorator & ClassDecorator;
export function Public(): PropertyDecorator | MethodDecorator | ClassDecorator {
  return (targetOrPrototype, propertyKey, descriptor) =>
    Directive(`@${DIRECTIVE_NAME}`)(targetOrPrototype, propertyKey, descriptor);
}

export const publicDirective: DirectiveBuilder = {
  typeDefs: `directive @${DIRECTIVE_NAME} on FIELD_DEFINITION`,
  transformer: (schema) => {
    const fieldMapper: FieldMapper = (fieldConfig) => {
      const directive = getDirective(schema, fieldConfig, DIRECTIVE_NAME)?.[0];
      if (directive) {
        return fieldConfig;
      } else {
        // `@Public` directive not present, so will require auth
        const { resolve = defaultFieldResolver } = fieldConfig;
        const directiveResolver: GraphQLFieldResolver<unknown, AppContext> = async (
          source,
          args,
          context,
          info
        ) => {
          // eslint-disable-next-line
          if (!context?.userPayload?.userRecord?.IsActive) {
            throw new AuthorizationError();
          }
          return await resolve(source, args, context, info);
        };

        return { ...fieldConfig, resolve: directiveResolver };
      }
    };
    return mapSchema(schema, { [MapperKind.OBJECT_FIELD]: fieldMapper });
  },
};
