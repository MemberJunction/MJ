import { describe, it, expect, vi } from 'vitest';

/**
 * `ParamRedaction` needs only two things from `@memberjunction/core`: the `BaseEntity` class (for the
 * `instanceof` check that routes a live record through `GetAll()`) and nothing else. Mocking it keeps
 * these tests free of the provider/metadata bootstrap.
 */
vi.mock('@memberjunction/core', () => ({
    // Declared inside the factory: vi.mock is hoisted above every top-level binding in the file.
    BaseEntity: class MockBaseEntity {
        private _data: Record<string, unknown>;
        constructor(data: Record<string, unknown>) {
            this._data = data;
        }
        // Deliberately a getter, exactly like the generated entity classes — this is the whole reason
        // 'Entity Object Data' and GetAll() exist.
        public get Name(): unknown { return this._data['Name']; }
        public GetAll(): Record<string, unknown> { return { ...this._data }; }
    }
}));

// The mocked class, re-imported so tests can construct it.
import { BaseEntity } from '@memberjunction/core';
const MockBaseEntity = BaseEntity as unknown as new (data: Record<string, unknown>) => object;

import {
    RedactParams,
    RedactParamsToJSON,
    IsRedactedParam,
    MAX_REDACTED_KEYS,
    RedactedParam,
    LoggedParam
} from '../ParamRedaction';
import { ActionParam } from '../ActionEngine-Base';
import { MJActionParamEntity, MJEntityActionParamEntity } from '@memberjunction/core-entities';

// ── Test fixture builders ────────────────────────────────────────────────────────────────────────
// The redaction code reads only a handful of fields off each entity, so partial literals cast through
// their real types keep the tests readable without standing up generated entity instances.

function actionParam(name: string, value: unknown, type: 'Input' | 'Output' | 'Both' = 'Input'): ActionParam {
    return { Name: name, Value: value, Type: type };
}

function definition(id: string, name: string, logValue: boolean = true): MJActionParamEntity {
    return { ID: id, Name: name, LogValue: logValue } as MJActionParamEntity;
}

function binding(actionParamID: string, valueType: string, logValue: boolean | null = null): MJEntityActionParamEntity {
    return { ActionParamID: actionParamID, ValueType: valueType, LogValue: logValue } as MJEntityActionParamEntity;
}

function asRedacted(param: LoggedParam): RedactedParam {
    expect(IsRedactedParam(param)).toBe(true);
    return param as RedactedParam;
}

describe('RedactParams', () => {
    describe('rule 1 — whole-record value types are never logged', () => {
        it.each(['Entity Object', 'Entity Object Data'])('suppresses a value bound as %s', (valueType) => {
            const result = RedactParams(
                [actionParam('Record', { ID: 'x', Amount: 42 })],
                [definition('p1', 'Record')],
                [binding('p1', valueType)]
            );

            const redacted = asRedacted(result[0]);
            expect(redacted.Reason).toBe('WholeRecordValueType');
            expect(redacted.ValueType).toBe(valueType);
            expect(JSON.stringify(result)).not.toContain('42');
        });

        it('is case- and whitespace-insensitive on ValueType', () => {
            const result = RedactParams(
                [actionParam('Record', { Secret: 'nope' })],
                [definition('p1', 'Record')],
                [binding('p1', '  entity OBJECT data ')]
            );
            expect(asRedacted(result[0]).Reason).toBe('WholeRecordValueType');
        });

        it('cannot be re-enabled by LogValue=true on the binding', () => {
            const result = RedactParams(
                [actionParam('Record', { Secret: 'nope' })],
                [definition('p1', 'Record')],
                [binding('p1', 'Entity Object', true)]
            );
            expect(asRedacted(result[0]).Reason).toBe('WholeRecordValueType');
            expect(JSON.stringify(result)).not.toContain('nope');
        });

        it('cannot be re-enabled by LogValue=true on the definition', () => {
            const result = RedactParams(
                [actionParam('Record', { Secret: 'nope' })],
                [definition('p1', 'Record', true)],
                [binding('p1', 'Entity Object Data')]
            );
            expect(asRedacted(result[0]).Reason).toBe('WholeRecordValueType');
        });
    });

    describe('rule 2 — per-binding LogValue override', () => {
        it('suppresses when the binding says 0, even for a safe value type', () => {
            const result = RedactParams(
                [actionParam('Body', 'a private message')],
                [definition('p1', 'Body')],
                [binding('p1', 'Static', false)]
            );
            const redacted = asRedacted(result[0]);
            expect(redacted.Reason).toBe('BindingLogValueFalse');
            expect(JSON.stringify(result)).not.toContain('private message');
        });

        it('binding LogValue=true overrides a definition that opted out', () => {
            const result = RedactParams(
                [actionParam('Body', 'visible here')],
                [definition('p1', 'Body', false)],
                [binding('p1', 'Static', true)]
            );
            expect(IsRedactedParam(result[0])).toBe(false);
            expect((result[0] as ActionParam).Value).toBe('visible here');
        });

        it('binding LogValue=null inherits the definition', () => {
            const suppressed = RedactParams(
                [actionParam('Body', 'hidden')],
                [definition('p1', 'Body', false)],
                [binding('p1', 'Static', null)]
            );
            expect(asRedacted(suppressed[0]).Reason).toBe('ParamLogValueFalse');

            const logged = RedactParams(
                [actionParam('Body', 'shown')],
                [definition('p1', 'Body', true)],
                [binding('p1', 'Static', null)]
            );
            expect(IsRedactedParam(logged[0])).toBe(false);
        });
    });

    describe('rule 3 — parameter definition LogValue', () => {
        it('suppresses on a direct invocation with no binding at all', () => {
            const result = RedactParams(
                [actionParam('Data', { rows: [1, 2, 3] })],
                [definition('p1', 'Data', false)]
            );
            expect(asRedacted(result[0]).Reason).toBe('ParamLogValueFalse');
        });

        it('matches the definition case-insensitively and trimmed', () => {
            const result = RedactParams(
                [actionParam('  dATA ', 'x')],
                [definition('p1', 'Data', false)]
            );
            expect(asRedacted(result[0]).Reason).toBe('ParamLogValueFalse');
        });

        it('logs an undeclared parameter — there is no declaration to opt out with', () => {
            const result = RedactParams([actionParam('Ad Hoc', 'value')], [definition('p1', 'Something Else', false)]);
            expect(IsRedactedParam(result[0])).toBe(false);
        });

        it('logs when no definitions are supplied at all', () => {
            const result = RedactParams([actionParam('Anything', 'value')]);
            expect(IsRedactedParam(result[0])).toBe(false);
        });
    });

    describe('shape without content', () => {
        it('records key count and key names for an object, but no values', () => {
            const redacted = asRedacted(
                RedactParams(
                    [actionParam('Record', { ID: 'abc', Amount: 42, Notes: 'confidential' })],
                    [definition('p1', 'Record')],
                    [binding('p1', 'Entity Object Data')]
                )[0]
            );

            expect(redacted.KeyCount).toBe(3);
            expect(redacted.Keys).toEqual(['ID', 'Amount', 'Notes']);
            expect(redacted.KeysElided).toBeUndefined();
            expect(redacted.ByteLength).toBeGreaterThan(0);
            expect(JSON.stringify(redacted)).not.toContain('confidential');
        });

        it('truncates the key list on a very wide record and flags the elision', () => {
            const wide: Record<string, number> = {};
            for (let i = 0; i < MAX_REDACTED_KEYS + 10; i++) {
                wide[`Field${i}`] = i;
            }
            const redacted = asRedacted(
                RedactParams([actionParam('Record', wide)], [definition('p1', 'Record')], [binding('p1', 'Entity Object')])[0]
            );

            expect(redacted.KeyCount).toBe(MAX_REDACTED_KEYS + 10);
            expect(redacted.Keys).toHaveLength(MAX_REDACTED_KEYS);
            expect(redacted.KeysElided).toBe(true);
        });

        it('describes a BaseEntity through GetAll() — its getters are not own properties', () => {
            const entity = new MockBaseEntity({ ID: 'e1', Name: 'Widget', Amount: 7 });
            const redacted = asRedacted(
                RedactParams([actionParam('Record', entity)], [definition('p1', 'Record')], [binding('p1', 'Entity Object')])[0]
            );

            // Object.keys() on the live entity would report the private backing field, not the columns.
            expect(redacted.KeyCount).toBe(3);
            expect(redacted.Keys).toEqual(['ID', 'Name', 'Amount']);
            expect(JSON.stringify(redacted)).not.toContain('Widget');
        });

        it('records item count for arrays', () => {
            const redacted = asRedacted(
                RedactParams(
                    [actionParam('Messages', [{ text: 'a' }, { text: 'b' }])],
                    [definition('p1', 'Messages', false)]
                )[0]
            );
            expect(redacted.ItemCount).toBe(2);
            expect(redacted.KeyCount).toBeUndefined();
        });

        it('reports ByteLength 0 for a null value and does not throw', () => {
            const redacted = asRedacted(RedactParams([actionParam('Data', null)], [definition('p1', 'Data', false)])[0]);
            expect(redacted.ByteLength).toBe(0);
            expect(redacted.KeyCount).toBeUndefined();
        });

        it('reports ByteLength -1 rather than throwing on a circular value', () => {
            const circular: Record<string, unknown> = { name: 'loop' };
            circular['self'] = circular;
            const redacted = asRedacted(RedactParams([actionParam('Data', circular)], [definition('p1', 'Data', false)])[0]);
            expect(redacted.ByteLength).toBe(-1);
        });

        it('always keeps the parameter name and type — those are never the secret', () => {
            const redacted = asRedacted(
                RedactParams([actionParam('Payload', { x: 1 }, 'Both')], [definition('p1', 'Payload', false)])[0]
            );
            expect(redacted.Name).toBe('Payload');
            expect(redacted.Type).toBe('Both');
            expect(redacted.Logged).toBe(false);
        });
    });

    describe('pass-through and edges', () => {
        it('returns loggable params by reference, unmodified', () => {
            const param = actionParam('Count', 5);
            const result = RedactParams([param], [definition('p1', 'Count')]);
            expect(result[0]).toBe(param);
        });

        it('handles null/undefined param arrays', () => {
            expect(RedactParams(null)).toEqual([]);
            expect(RedactParams(undefined)).toEqual([]);
        });

        it('redacts only the parameters that need it, leaving the rest intact', () => {
            const result = RedactParams(
                [actionParam('Record', { Secret: 'x' }), actionParam('Mode', 'fast')],
                [definition('p1', 'Record'), definition('p2', 'Mode')],
                [binding('p1', 'Entity Object Data'), binding('p2', 'Static')]
            );
            expect(IsRedactedParam(result[0])).toBe(true);
            expect(IsRedactedParam(result[1])).toBe(false);
            expect((result[1] as ActionParam).Value).toBe('fast');
        });
    });

    describe('RedactParamsToJSON', () => {
        it('produces a JSON string with the value absent and the shape present', () => {
            const json = RedactParamsToJSON(
                [actionParam('Record', { ID: 'abc', Ssn: '123-45-6789' })],
                [definition('p1', 'Record')],
                [binding('p1', 'Entity Object Data')]
            );

            expect(json).not.toContain('123-45-6789');
            const parsed = JSON.parse(json) as RedactedParam[];
            expect(parsed[0].Logged).toBe(false);
            expect(parsed[0].Reason).toBe('WholeRecordValueType');
            expect(parsed[0].Keys).toEqual(['ID', 'Ssn']);
        });

        it('round-trips normal values unchanged', () => {
            const json = RedactParamsToJSON([actionParam('Mode', 'fast')], [definition('p1', 'Mode')]);
            expect(JSON.parse(json)).toEqual([{ Name: 'Mode', Value: 'fast', Type: 'Input' }]);
        });
    });
});

describe('IsRedactedParam', () => {
    it('distinguishes a redaction record from a live param', () => {
        expect(IsRedactedParam(actionParam('X', 1))).toBe(false);
        expect(
            IsRedactedParam({ Name: 'X', Type: 'Input', Logged: false, Reason: 'ParamLogValueFalse', ByteLength: 0 })
        ).toBe(true);
    });

    it('does not treat a param whose VALUE is false as redacted', () => {
        expect(IsRedactedParam(actionParam('Flag', false))).toBe(false);
    });
});
