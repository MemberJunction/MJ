/**
 * EntityDocumentTemplateDataBuilder — the data an entity document's template renders.
 *
 * Vector sync renders this data into the text it embeds and stores; duplicate detection renders it
 * into the text it queries with. Detection once built its own data from the record's fields alone,
 * so every `Entity` param (a person's phones, emails, addresses) rendered empty on the query side
 * and genuine duplicates fell below the threshold. These tests pin the shared behavior both now use.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EntityInfo, RunView, UserInfo } from '@memberjunction/core';
import type { MJTemplateEntityExtended } from '@memberjunction/core-entities';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn() };
});

import { EntityDocumentTemplateDataBuilder } from '../models/EntityDocumentTemplateData';

const INDIVIDUALS = {
    Name: 'Individuals',
    FirstPrimaryKey: { Name: 'individual_id', NeedsQuotes: true },
} as unknown as EntityInfo;

const TEMPLATE = {
    ID: 'tpl-1',
    Params: [
        { Name: 'Entity', Type: 'Record' },
        { Name: 'Phones', Type: 'Entity', Entity: 'Phones', LinkedParameterField: 'individual_id', ExtraFilter: null },
        { Name: 'Emails', Type: 'Entity', Entity: 'Emails', LinkedParameterField: 'individual_id', ExtraFilter: "Status = 'Active'" },
        { Name: 'Nickname', Type: 'Scalar' },
    ],
} as unknown as MJTemplateEntityExtended;

const USER = { ID: 'user-1' } as unknown as UserInfo;

describe('EntityDocumentTemplateDataBuilder', () => {
    const runViewFn = vi.fn();
    let builder: EntityDocumentTemplateDataBuilder;

    beforeEach(() => {
        runViewFn.mockReset();
        runViewFn.mockImplementation(async (params: { EntityName: string }) => ({
            Success: true,
            Results: params.EntityName === 'Phones'
                ? [{ individual_id: 'A', Number: '1' }, { individual_id: 'B', Number: '2' }]
                : [{ individual_id: 'A', Address: 'a@x.org' }],
        }));
        builder = new EntityDocumentTemplateDataBuilder({ RunView: runViewFn } as unknown as RunView, USER);
    });

    describe('LoadRelatedData', () => {
        it('loads each Entity param once for the whole batch, with the param\'s own ExtraFilter, as the context user', async () => {
            const related = await builder.LoadRelatedData(INDIVIDUALS, [{ individual_id: 'A' }, { individual_id: 'B' }], TEMPLATE);

            expect(runViewFn).toHaveBeenCalledTimes(2);
            expect(runViewFn.mock.calls[0]).toEqual([
                { EntityName: 'Phones', ExtraFilter: "individual_id in ('A','B')", ResultType: 'simple' }, USER,
            ]);
            expect(runViewFn.mock.calls[1][0].ExtraFilter).toBe("(individual_id in ('A','B')) AND (Status = 'Active')");
            expect(related.map((r) => r.ParamName)).toEqual(['Phones', 'Emails']);
        });

        it('escapes a quote inside a key value', async () => {
            await builder.LoadRelatedData(INDIVIDUALS, [{ individual_id: "O'Brien" }], TEMPLATE);
            expect(runViewFn.mock.calls[0][0].ExtraFilter).toBe("individual_id in ('O''Brien')");
        });

        it('gives every Entity param an empty list, without a query, when no record has a key (an unsaved record, an empty page)', async () => {
            const related = await builder.LoadRelatedData(INDIVIDUALS, [{ individual_id: null }], TEMPLATE);

            expect(runViewFn).not.toHaveBeenCalled();
            expect(related).toEqual([{ ParamName: 'Phones', Data: [] }, { ParamName: 'Emails', Data: [] }]);
            expect(await builder.LoadRelatedData(INDIVIDUALS, [], TEMPLATE)).toEqual(related);
        });

        it('leaves a param whose rows fail to load out of the result, and MissingRelatedParams names it', async () => {
            runViewFn.mockImplementation(async (params: { EntityName: string }) => params.EntityName === 'Phones'
                ? { Success: false, Results: [], ErrorMessage: 'boom' }
                : { Success: true, Results: [] });

            const related = await builder.LoadRelatedData(INDIVIDUALS, [{ individual_id: 'A' }], TEMPLATE);

            expect(related.map((r) => r.ParamName)).toEqual(['Emails']);
            expect(builder.MissingRelatedParams(TEMPLATE, related)).toEqual(['Phones']);
            expect(builder.MissingRelatedParams(TEMPLATE, [...related, { ParamName: 'Phones', Data: [] }])).toEqual([]);
        });
    });

    describe('BuildTemplateData', () => {
        it('puts the record\'s fields at the top level, gives each Entity param only that record\'s rows, and reads Scalar params', async () => {
            const related = await builder.LoadRelatedData(INDIVIDUALS, [{ individual_id: 'A' }, { individual_id: 'B' }], TEMPLATE);

            const data = builder.BuildTemplateData(INDIVIDUALS, { individual_id: 'B', FirstName: 'Bo' }, TEMPLATE, related);

            expect(data).toEqual({
                individual_id: 'B',
                FirstName: 'Bo',
                Phones: [{ individual_id: 'B', Number: '2' }],
                Emails: [],
                Nickname: '',
            });
        });
    });
});
