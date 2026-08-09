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
    } else {
      // The name matched the CRUD convention but resolves to no entity — so the
      // metadata half of the redactor contributes nothing and, absent any @NoLog
      // field, this arg falls through to shortenForLog with its values intact.
      //
      // This is the silent case: the boot audit tests only the NAME pattern, so an
      // input like `CreateConnectionInput` is classified as metadata-bound and never
      // warned about, while the lookup here quietly fails. Every hand-written
      // `Create*Input` in the resolvers hits this — codegen inputs embed the entity
      // ClassName (`CreateMJCredentialInput`), hand-written ones do not.
      //
      // Report it once per input type so the operator who enabled variables logging
      // learns which args are unprotected, rather than discovering it in a log file.
      warnUnboundCrudInput(ctx.inputTypeName);
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

/**
 * Input type names already reported by {@link warnUnboundCrudInput}. Warning once
 * per type keeps a hot mutation from flooding the log with the same diagnostic.
 */
const warnedUnboundInputTypes = new Set<string>();

/**
 * Reports, once per input type, that an arg named like a CRUD input resolves to no
 * entity and is therefore logged unredacted unless its fields carry `@NoLog`.
 *
 * Exported for tests; not part of the redaction path's contract.
 */
export function warnUnboundCrudInput(inputTypeName: string): void {
  if (warnedUnboundInputTypes.has(inputTypeName)) {
    return;
  }
  warnedUnboundInputTypes.add(inputTypeName);
  console.warn(
    `[MJServer] Variables logging: '${inputTypeName}' matches the Create/Update/Delete input ` +
      `naming convention but maps to no entity, so encrypted-field redaction cannot apply to it. ` +
      `Its values are being logged. Mark any sensitive @Field() on this input with @NoLog.`,
  );
}

/** Test seam — clears the once-per-type warning state. */
export function resetUnboundCrudInputWarnings(): void {
  warnedUnboundInputTypes.clear();
}
