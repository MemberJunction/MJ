/**
 * `CompleteMessage` is the LAST step of the server's refusal, and it silently discarded the message.
 *
 * The path this pins: a subclass's `ValidateAsync()` refuses a save with a `ValidationErrorInfo`;
 * `_InnerSave` throws the `ValidationResult`; its catch assigns `newResult.Errors = e.Errors`;
 * `ResolverBase` (or `SaveEntityGraphOperation`) hands `LatestResult.CompleteMessage` to the client.
 *
 * `ValidationErrorInfo` carries `Message` — capital M. `CompleteMessage` read `err.message` only, so
 * every one of those errors fell through to `JSON.stringify(err)` and the user was shown
 * `{"Source":"ParentContractID","Message":"…","Value":null,"Type":"Failure"}` in a toast. `Errors` is
 * typed `any[]`, so the compiler could not see it, and `JSON.stringify` never throws, so nothing at
 * runtime could either — the defect was observable only by reading a message a user received.
 *
 * These assert the OUTPUT a user reads, not the mechanism, so they stay honest through a refactor:
 * the first two fail against the old implementation, and the JSON fallback case pins that a shape
 * with neither field still says something rather than nothing.
 *
 * The last case drives the REAL `BaseEntity.Save()` rather than constructing the result, so the
 * whole chain is pinned and not just the getter: a future change to how `_InnerSave` populates
 * `Errors`, or to the shape it puts there, fails here too. It reuses the harness of
 * `baseEntity.validateAsync.test.ts`, with the same honest narrowing — the test entity overrides
 * `CheckPermissions()` so `Save()` reaches validation without a permissions fixture, and the mock
 * provider echoes the record back. Neither is under test.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ValidationErrorInfo, ValidationErrorType } from '@memberjunction/global';
import { BaseEntity, BaseEntityResult } from '../generic/baseEntity';
import { EntityInfo, ValidationResult } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider } from '../generic/interfaces';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

/** A result shaped exactly as `_InnerSave`'s catch block leaves it after a validation refusal. */
function resultFromValidationRefusal(...errors: ValidationErrorInfo[]): BaseEntityResult {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = 'create';
    result.Message = null as unknown as string; // a thrown ValidationResult has no lowercase `message`
    result.Errors = errors;
    return result;
}

describe('BaseEntityResult.CompleteMessage', () => {
    it('renders a ValidationErrorInfo as its prose, not as JSON', () => {
        const prose = 'Contract CTR-000123 is a Change Order, which must name the contract it changes.';
        const result = resultFromValidationRefusal(
            new ValidationErrorInfo('ParentContractID', prose, null, ValidationErrorType.Failure),
        );

        expect(result.CompleteMessage).toBe(prose);
        expect(result.CompleteMessage).not.toContain('{'); // the old output was a JSON object
    });

    it('keeps every error when a save is refused for several reasons at once', () => {
        const result = resultFromValidationRefusal(
            new ValidationErrorInfo('EndDate', 'The contract end date must be on or after the effective date.', null),
            new ValidationErrorInfo('HasModifications', 'This contract records modifications, so it cannot be marked unmodified.', false),
        );

        expect(result.CompleteMessage.split('\n')).toEqual([
            'The contract end date must be on or after the effective date.',
            'This contract records modifications, so it cannot be marked unmodified.',
        ]);
    });

    it('still reads a plain Error, which carries lowercase message', () => {
        const result = new BaseEntityResult();
        result.Errors = [new Error('the database refused the write')];

        expect(result.CompleteMessage).toBe('the database refused the write');
    });

    it('prefixes the result Message when both are present', () => {
        const result = new BaseEntityResult();
        result.Message = 'Save failed';
        result.Errors = [new ValidationErrorInfo('Name', 'Name is required.', null)];

        expect(result.CompleteMessage).toBe('Save failed\nName is required.');
    });

    it('falls back to JSON only for a shape carrying neither Message nor message', () => {
        const result = new BaseEntityResult();
        result.Errors = [{ code: 547, table: 'Contract' }];

        expect(result.CompleteMessage).toBe('{"code":547,"table":"Contract"}');
    });

    it('renders a bare string entry as itself, not as a quoted JSON string', () => {
        // `Errors` is `any[]` and a plain string is one of the shapes that lands in it — and the
        // single `Error` property has always accepted one. Without an explicit string branch the
        // helper finds neither `Message` nor `message` and falls to `JSON.stringify`, which wraps a
        // string in quotes and escapes its newlines: `"line one\nline two"` on ONE line.
        const result = new BaseEntityResult();
        result.Errors = ['the database refused the write', 'line one\nline two'];

        expect(result.CompleteMessage).toBe('the database refused the write\nline one\nline two');
        expect(result.CompleteMessage).not.toContain('"');
    });

    it('does not say the same thing twice when Message was built out of Errors', () => {
        // Exactly what `_InnerSave`/`_InnerDelete` leave behind on an IS-A parent failure: the
        // summary Message is composed FROM the errors, which are then also attached.
        const result = new BaseEntityResult();
        result.Message = "Failed to save parent entity 'Products': A; B";
        result.Errors = [
            new ValidationErrorInfo('A_Field', 'A', null),
            new ValidationErrorInfo('B_Field', 'B', null),
        ];

        expect(result.CompleteMessage).toBe("Failed to save parent entity 'Products': A; B");
    });

    it('still reports an error the Message did NOT already contain', () => {
        // The guard on the de-duplication above: it may only skip text already visible to the reader.
        const result = new BaseEntityResult();
        result.Message = "Failed to save parent entity 'Products': A";
        result.Errors = [
            new ValidationErrorInfo('A_Field', 'A', null),
            new ValidationErrorInfo('C_Field', 'C is a different problem entirely', null),
        ];

        expect(result.CompleteMessage).toBe(
            "Failed to save parent entity 'Products': A\nC is a different problem entirely",
        );
    });

    it('reads the single Error property the same way', () => {
        const result = new BaseEntityResult();
        result.Error = new ValidationErrorInfo('SourceURL', 'A template must record where its text came from.', null);

        expect(result.CompleteMessage).toBe('A template must record where its text came from.');
    });
});

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] };

/** The prose a developer wrote for a user to read. It has to survive all the way to the client. */
const REFUSAL = 'A Change Order must name the contract it changes.';

let productEntityInfo: EntityInfo;

/** The shape every application writes: a domain rule refusing the save with named-field prose. */
class RefusingEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        result.Success = false;
        result.Errors.push(new ValidationErrorInfo('ParentContractID', REFUSAL, null, ValidationErrorType.Failure));
        return result;
    }
}

describe('a save refused for real, not a result built by hand', () => {
    beforeAll(() => {
        const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
        productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
        Metadata.Provider = { Entities: entities, CurrentUser: MOCK_USER } as unknown as ProviderBase;
    });

    afterAll(() => {
        Metadata.Provider = null as unknown as ProviderBase;
    });

    it('hands back the rule the developer wrote', async () => {
        const provider = {
            CurrentUser: MOCK_USER,
            get SupportsEntityTransactions() {
                return true;
            },
            get IsInTransaction() {
                return false;
            },
            async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
                return entity.GetAll();
            },
            async Delete(): Promise<boolean> {
                return true;
            },
            SetCachedRecordName(): void {
                /* no-op */
            },
            GetCachedRecordName(): string | undefined {
                return undefined;
            },
        };
        const entity = new (RefusingEntity as never)(
            productEntityInfo,
            provider as unknown as IEntityDataProvider,
        ) as RefusingEntity;
        entity.NewRecord();
        entity.Set('Name', 'a-name');

        expect(await entity.Save(), 'the rule refused the save').toBe(false);

        // ValidateAsync threw the ValidationResult, _InnerSave's catch copied e.Errors onto the
        // result, and this is the string ResolverBase hands the client.
        expect(entity.LatestResult?.CompleteMessage).toBe(REFUSAL);
    });
});
