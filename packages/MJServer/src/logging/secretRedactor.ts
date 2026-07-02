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

// Delete is included so DeleteMJ*Input resolvers resolve to their entity (yielding an empty
// or value-free encrypted-field walk) instead of falling to the fail-open shortenForLog path —
// keeps the boot audit quiet on them. Security is identical either way: Delete inputs carry
// PK + Options only, no encrypted values. Must stay in sync with bootAudit.ts's INPUT_TYPE_REGEX.
const INPUT_TYPE_REGEX = /^(Create|Update|Delete)(?<name>.+)Input$/;

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

  // Determine the encrypted-field set from entity metadata IF this input maps to a known entity.
  // Custom / non-CRUD inputs (e.g. GetDataInput) have no entity binding — that's fine; field-level
  // @NoLog still applies below. The entity path only adds metadata-driven encrypted-field names.
  let encryptedFieldNames: ReadonlySet<string> = EMPTY_SET;
  const match = INPUT_TYPE_REGEX.exec(ctx.inputTypeName);
  if (match?.groups?.name) {
    const entity = ctx.provider.Entities.find((e) => e.ClassName === match.groups!.name);
    if (entity) {
      encryptedFieldNames = new Set(entity.EncryptedFields.map((f) => f.Name));
    }
  }

  // Walk top-level keys whenever we have BOTH a redaction source (encrypted fields or @NoLog fields)
  // AND a plain-object value. This honors field-level @NoLog even on non-entity-bound inputs — the
  // exact case @NoLog exists for (custom resolvers, e.g. GetDataInputType.Token). Without a redaction
  // source, or for non-object values, fall through to shortenForLog as before.
  const canWalk =
    (encryptedFieldNames.size > 0 || ctx.noLogFields.size > 0) &&
    ctx.rawValue !== null &&
    typeof ctx.rawValue === 'object' &&
    !Array.isArray(ctx.rawValue);

  if (!canWalk) {
    return shortenForLog(ctx.rawValue);
  }

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

const EMPTY_SET: ReadonlySet<string> = new Set<string>();
