/**
 * The two sides of a validation error's trip over the wire.
 *
 * `ValidationErrorInfo` is a class. The server holds instances in `LatestResult.Errors`; the client
 * gets a plain object out of a GraphQL error's `extensions` (or a remote-op output). These helpers
 * are the ONE place that flattening and rehydration live, so the tests pin the contract both
 * producer (ResolverBase, SaveEntityGraphOperation) and consumer (GraphQLDataProvider, BaseEntity)
 * rely on — written from the expected behaviour, not from the implementation.
 */
import { describe, expect, it } from 'vitest';
import { DeserializeValidationErrors, SerializeValidationErrors, ValidationErrorInfo, ValidationErrorType } from '../ValidationTypes';

describe('SerializeValidationErrors', () => {
    it('flattens ValidationErrorInfo instances to plain Source/Message/Value/Type objects', () => {
        const out = SerializeValidationErrors([
            new ValidationErrorInfo('TagID', 'No such Tag exists.', 'abc-123'),
            new ValidationErrorInfo('Name', 'Name looks odd', 'x', ValidationErrorType.Warning),
        ]);
        expect(out).toEqual([
            { Source: 'TagID', Message: 'No such Tag exists.', Value: 'abc-123', Type: 'Failure' },
            { Source: 'Name', Message: 'Name looks odd', Value: 'x', Type: 'Warning' },
        ]);
        // Plain objects, not class instances — that is the point of the flattening.
        expect(out[0]).not.toBeInstanceOf(ValidationErrorInfo);
        expect(Object.getPrototypeOf(out[0])).toBe(Object.prototype);
    });

    it('returns [] for nothing to carry — undefined, null, or an empty array', () => {
        expect(SerializeValidationErrors(undefined)).toEqual([]);
        expect(SerializeValidationErrors(null)).toEqual([]);
        expect(SerializeValidationErrors([])).toEqual([]);
    });

    it('skips entries without an MJ-shaped Message — a plain Error has only lowercase message', () => {
        // `BaseEntityResult.Errors` is any[] and DOES mix these in. They have no field to paint and
        // their text already reaches the client via CompleteMessage.
        const out = SerializeValidationErrors([new Error('boom'), 'a string', null, 42, { Message: '   ' }]);
        expect(out).toEqual([]);
    });

    it('normalises a missing Source to "" (field-agnostic) and an unknown Type to Failure', () => {
        const out = SerializeValidationErrors([{ Message: 'Record-level refusal' }, { Source: 'A', Message: 'm', Type: 'Bogus' }]);
        expect(out).toEqual([
            { Source: '', Message: 'Record-level refusal', Value: null, Type: 'Failure' },
            { Source: 'A', Message: 'm', Value: null, Type: 'Failure' },
        ]);
    });

    it('reduces Value to something JSON carries predictably', () => {
        const when = new Date('2026-09-04T12:00:00.000Z');
        const out = SerializeValidationErrors([
            new ValidationErrorInfo('A', 'm', 12),
            new ValidationErrorInfo('B', 'm', true),
            new ValidationErrorInfo('C', 'm', when),
            new ValidationErrorInfo('D', 'm', new Date('not a date')),
            new ValidationErrorInfo('E', 'm', { nested: 'object' }),
            new ValidationErrorInfo('F', 'm', undefined),
        ]);
        expect(out.map(e => e.Value)).toEqual([12, true, '2026-09-04T12:00:00.000Z', null, null, null]);
    });
});

describe('DeserializeValidationErrors', () => {
    it('rebuilds real ValidationErrorInfo instances from plain wire objects', () => {
        const out = DeserializeValidationErrors([
            { Source: 'TagID', Message: 'No such Tag exists.', Value: 'abc-123', Type: 'Failure' },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0]).toBeInstanceOf(ValidationErrorInfo);
        expect(out[0].Source).toBe('TagID');
        expect(out[0].Message).toBe('No such Tag exists.');
        expect(out[0].Value).toBe('abc-123');
        expect(out[0].Type).toBe(ValidationErrorType.Failure);
    });

    it('never throws on garbage — a client must not crash because a server sent something odd', () => {
        for (const raw of [undefined, null, 'text', 42, {}, { validationErrors: [] }, [null, 1, 'x', { message: 'lowercase' }]]) {
            expect(DeserializeValidationErrors(raw)).toEqual([]);
        }
    });

    it('round-trips: serialize → JSON → deserialize yields equal errors', () => {
        const original = [
            new ValidationErrorInfo('Amount', 'Amount must be positive', -5),
            new ValidationErrorInfo('', 'Nothing to paint, still worth saying', null, ValidationErrorType.Warning),
        ];
        const back = DeserializeValidationErrors(JSON.parse(JSON.stringify(SerializeValidationErrors(original))));
        expect(back).toEqual(original);
        expect(back.every(e => e instanceof ValidationErrorInfo)).toBe(true);
    });
});
