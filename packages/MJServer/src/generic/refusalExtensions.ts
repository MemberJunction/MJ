/**
 * @fileoverview The `extensions` object every write-refusal `GraphQLError` in `ResolverBase` carries.
 *
 * A save refused by `Validate()` / `ValidateAsync()` leaves its reasons — one `ValidationErrorInfo`
 * per field — in `LatestResult.Errors`. Until now the resolver threw only `CompleteMessage`, the
 * flattened prose, so the client got readable text but lost the *structure*: which field each
 * sentence belonged to. That is why a server-side `ValidateAsync()` refusal could only ever toast,
 * while the same rule written in a synchronous `Validate()` painted the offending field red — the
 * client runs sync validation locally and never needed the wire to tell it the field.
 *
 * `RefusalExtensions` keeps the message exactly as before and ADDS `validationErrors`, the
 * `Errors` array flattened by `SerializeValidationErrors` (so a class instance never has to survive
 * JSON). `GraphQLDataProvider.Save()` rehydrates it into `LatestResult.Errors` on the client, and the
 * form paints fields from there — the same path the sync branch already uses.
 *
 * Kept out of `ResolverBase.ts` so it is unit-testable without booting the resolver's dependency
 * graph, and so the three resolvers (create / update / delete) share one definition of the shape.
 */
import type { BaseEntityResult } from '@memberjunction/core';
import { SerializeValidationErrors, type SerializedValidationError } from '@memberjunction/global';

/** Error codes the write resolvers use; kept distinct so a client can tell the operations apart. */
export type WriteRefusalCode = 'CREATE_ENTITY_ERROR' | 'SAVE_ENTITY_ERROR' | 'DELETE_ENTITY_ERROR';

/** The `extensions` payload of a write-refusal `GraphQLError`. */
export type WriteRefusalExtensions = {
    code: WriteRefusalCode;
    entityName: string;
    /**
     * Present only when the refusal carried structured errors. Absent (not an empty array) otherwise,
     * so a client can distinguish "validation said no" from "the database said no".
     */
    validationErrors?: SerializedValidationError[];
};

/**
 * Builds the `extensions` for a refused create / update / delete.
 *
 * @param code - Which operation was refused.
 * @param entityName - The entity the operation targeted.
 * @param result - The entity's `LatestResult` after the failed call, if any.
 * @returns `{ code, entityName }`, plus `validationErrors` when `result.Errors` had anything to carry.
 */
export function RefusalExtensions(code: WriteRefusalCode, entityName: string, result: BaseEntityResult | null | undefined): WriteRefusalExtensions {
    const validationErrors = SerializeValidationErrors(result?.Errors);
    return validationErrors.length > 0
        ? { code, entityName, validationErrors }
        : { code, entityName };
}
