/**
 * What a write-refusal GraphQLError carries BESIDES its message.
 *
 * PR #3973 made the refusal's prose (`CompleteMessage`) reach the client. This is the structural
 * half: a `Validate()` / `ValidateAsync()` refusal names the offending FIELD in each
 * `ValidationErrorInfo.Source`, and the client's form can only paint that field red if the wire says
 * which field. `RefusalExtensions` adds `extensions.validationErrors` for exactly that; the message
 * is untouched. Written from the expected behaviour: the client (GraphQLDataProvider.Save) reads
 * `response.errors[0].extensions.validationErrors` and hands it to `DeserializeValidationErrors`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BaseEntityResult } from '@memberjunction/core';
import { DeserializeValidationErrors, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/global';
import { RefusalExtensions } from '../generic/refusalExtensions';

function refused(...errors: ValidationErrorInfo[]): BaseEntityResult {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Errors = errors;
    return result;
}

describe('RefusalExtensions', () => {
    it('always carries the code and entity name the client already depends on', () => {
        expect(RefusalExtensions('SAVE_ENTITY_ERROR', 'MJ: Tag Scopes', undefined)).toEqual({
            code: 'SAVE_ENTITY_ERROR',
            entityName: 'MJ: Tag Scopes',
        });
    });

    it('omits validationErrors (not an empty array) when the refusal had no structured errors', () => {
        // A SQL / provider failure sets Message and no Errors. A client must be able to tell
        // "validation said no" from "the database said no" by the KEY being absent.
        const dbFailure = new BaseEntityResult();
        dbFailure.Success = false;
        dbFailure.Message = 'Timeout expired while saving.';
        const ext = RefusalExtensions('CREATE_ENTITY_ERROR', 'Widgets', dbFailure);
        expect(ext).toEqual({ code: 'CREATE_ENTITY_ERROR', entityName: 'Widgets' });
        expect('validationErrors' in ext).toBe(false);
        expect('messageIncludesValidationErrors' in ext).toBe(false);
    });

    it('carries every field-named reason as a plain, JSON-safe object', () => {
        const ext = RefusalExtensions(
            'SAVE_ENTITY_ERROR',
            'MJ: Tag Scopes',
            refused(
                new ValidationErrorInfo('TagID', 'Cannot add TagScope row for tag "Global" because it is marked IsGlobal=1.', 'abc'),
                new ValidationErrorInfo('', 'Record-level note', null, ValidationErrorType.Warning),
            ),
        );
        expect(ext.validationErrors).toEqual([
            { Source: 'TagID', Message: 'Cannot add TagScope row for tag "Global" because it is marked IsGlobal=1.', Value: 'abc', Type: 'Failure' },
            { Source: '', Message: 'Record-level note', Value: null, Type: 'Warning' },
        ]);
        // The server states that the message it throws (CompleteMessage) already renders these — the
        // client must never have to infer that from the text.
        expect(ext.messageIncludesValidationErrors).toBe(true);
        // What GraphQL actually ships is JSON: the payload must survive it unchanged.
        expect(JSON.parse(JSON.stringify(ext))).toEqual(ext);
    });

    it('is what the client rehydrates: DeserializeValidationErrors(extensions.validationErrors) round-trips', () => {
        const original = [new ValidationErrorInfo('Amount', 'Amount must be positive', -5)];
        const ext = RefusalExtensions('SAVE_ENTITY_ERROR', 'Orders', refused(...original));
        const wire = JSON.parse(JSON.stringify(ext)) as { validationErrors?: unknown };
        expect(DeserializeValidationErrors(wire.validationErrors)).toEqual(original);
    });

    it('does not alter the message the throw already carries — CompleteMessage stays the prose', () => {
        const result = refused(new ValidationErrorInfo('TagID', 'No such Tag exists.', 'abc'));
        // The resolver throws `CompleteMessage ?? 'Unknown error'` and attaches RefusalExtensions;
        // both come from the same result, and the prose must remain a superset of the structured text.
        expect(result.CompleteMessage).toContain('No such Tag exists.');
        expect(RefusalExtensions('SAVE_ENTITY_ERROR', 'MJ: Tag Scopes', result).validationErrors?.[0].Message).toBe('No such Tag exists.');
    });
});

describe('ResolverBase attaches RefusalExtensions on every LatestResult-backed refusal throw', () => {
    const lines = readFileSync(fileURLToPath(new URL('../generic/ResolverBase.ts', import.meta.url)), 'utf8').split('\n');

    it('each `LatestResult?.CompleteMessage ??` throw passes RefusalExtensions within the next two lines', () => {
        const throws = lines
            .map((line, i) => ({ line, n: i + 1 }))
            .filter(({ line }) => /throw new GraphQLError\(entityObject\.LatestResult\?\.CompleteMessage \?\?/.test(line));
        expect(throws.length, 'create, update and delete refusals').toBe(3);
        for (const { n } of throws) {
            const window = lines.slice(n, n + 2).join('\n');
            expect(window, `throw at line ${n} must attach RefusalExtensions`).toMatch(/extensions:\s*RefusalExtensions\(/);
        }
    });

    it('keeps the three error codes distinct and passes LatestResult, not a literal extensions object', () => {
        const source = lines.join('\n');
        for (const code of ['CREATE_ENTITY_ERROR', 'SAVE_ENTITY_ERROR', 'DELETE_ENTITY_ERROR']) {
            expect(source).toMatch(new RegExp(`RefusalExtensions\\('${code}', entityName, entityObject\\.LatestResult\\)`));
        }
    });
});
