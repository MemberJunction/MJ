import type { IMetadataProvider } from '@memberjunction/core';
import { shortenForLog } from './shortenForLog.js';

/**
 * Input to the redactor. Built per `@Arg` per resolver call by the variables-logging middleware.
 *
 * - `inputTypeName` is the GraphQL input type name from the schema (e.g. `"CreateMJCredentialInput"`),
 *   derived from `info.parentType.getFields()[info.fieldName].args[i].type` — NOT from any
 *   `args[i].constructor.name`, because type-graphql v2.0.0-beta.3 passes raw plain-object args
 *   to middleware (conversion to typed instances happens after the middleware chain unwinds).
 * - `provider` is the per-request metadata provider (`context.providers[0].provider`).
 * - `noLogParameter` indicates the `@Arg` itself was decorated `@NoLog` at the parameter level.
 * - `noLogFields` lists field names that were decorated `@NoLog` at the `@Field()` level on the
 *   input class. The redactor honors both `EntityFieldInfo.Encrypt=true` (metadata-driven) and
 *   this set (decorator-driven) when walking top-level keys.
 */
export type RedactionContext = {
  inputTypeName: string;
  rawValue: unknown;
  provider: IMetadataProvider;
  noLogParameter: boolean;
  noLogFields: ReadonlySet<string>;
};

const INPUT_TYPE_REGEX = /^(Create|Update)(?<name>.+)Input$/;

// Assumes EntityFieldInfo.Name === GraphQLFieldName for input-type fields.
// True today for all codegen output (323 Create*Input + 323 Update*Input).
// type-graphql allows @Field({ name: 'overrideName' }) to rename fields at the
// GraphQL layer; MJ codegen does not use this. A future maintainer renaming an
// encrypted field at the GraphQL layer would silently miss redaction.
export function redactArg(ctx: RedactionContext): unknown {
  if (ctx.noLogParameter) {
    return '<redacted>';
  }

  if (ctx.provider.Entities.length === 0) {
    return '<metadata-not-ready>';
  }

  const match = INPUT_TYPE_REGEX.exec(ctx.inputTypeName);
  if (!match || !match.groups?.name) {
    return shortenForLog(ctx.rawValue);
  }

  const entityClassName = match.groups.name;
  const entity = ctx.provider.Entities.find((e) => e.ClassName === entityClassName);
  if (!entity) {
    return shortenForLog(ctx.rawValue);
  }

  if (ctx.rawValue === null || typeof ctx.rawValue !== 'object' || Array.isArray(ctx.rawValue)) {
    return shortenForLog(ctx.rawValue);
  }

  const encryptedFieldNames = new Set(entity.EncryptedFields.map((f) => f.Name));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx.rawValue as Record<string, unknown>)) {
    if (encryptedFieldNames.has(key) || ctx.noLogFields.has(key)) {
      result[key] = '<redacted>';
    } else {
      result[key] = shortenForLog(value);
    }
  }
  return result;
}
