/**
 * EntityDocumentTemplateDataBuilder — the data an entity document's template renders.
 *
 * Vector sync renders this data into the text it embeds and stores; duplicate detection renders it
 * into the text it queries with. Detection once built its own data from the record's fields alone,
 * so every `Entity` param (a person's phones, emails, addresses) rendered empty on the query side
 * and genuine duplicates fell below the threshold. These tests pin the shared behavior both now use.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
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

        it('renders a related row\'s date-only field as its stored day, as the main record\'s is', async () => {
            const jobs = {
                Name: 'Jobs',
                Fields: [
                    { Name: 'individual_id', Type: 'nvarchar' },
                    { Name: 'StartDate', Type: 'date' },
                ],
            } as unknown as EntityInfo;
            const withJobs = new EntityDocumentTemplateDataBuilder(
                { RunView: async () => ({ Success: true, Results: [{ individual_id: 'A', StartDate: new Date('1984-05-07T00:00:00.000Z') }] }) } as unknown as RunView,
                USER,
                { Entities: [jobs] } as unknown as IMetadataProvider,
            );
            const jobsTemplate = {
                ID: 'tpl-3',
                Params: [{ Name: 'Jobs', Type: 'Entity', Entity: 'Jobs', LinkedParameterField: 'individual_id', ExtraFilter: null }],
            } as unknown as MJTemplateEntityExtended;

            const related = await withJobs.LoadRelatedData(INDIVIDUALS, [{ individual_id: 'A' }], jobsTemplate);

            expect(related).toEqual([{ ParamName: 'Jobs', Data: [{ individual_id: 'A', StartDate: '1984-05-07' }] }]);
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

        // A `date` column arrives as a Date at UTC midnight. Rendered as-is it became
        // "Sun May 06 1984 20:00:00 GMT-0400 (Eastern Daylight Time)" for a stored 1984-05-07 (#6055).
        it('renders a date-only field as its stored day and a timestamp as ISO 8601', () => {
            const people = {
                Name: 'People',
                FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
                Fields: [
                    { Name: 'ID', Type: 'uniqueidentifier' },
                    { Name: 'DateOfBirth', Type: 'date' },
                    { Name: 'LastSeenAt', Type: 'datetimeoffset' },
                ],
            } as unknown as EntityInfo;
            const recordOnly = { ID: 'tpl-2', Params: [{ Name: 'Entity', Type: 'Record' }] } as unknown as MJTemplateEntityExtended;

            const data = builder.BuildTemplateData(people, {
                ID: 'P1',
                DateOfBirth: new Date('1984-05-07T00:00:00.000Z'),
                LastSeenAt: new Date('2026-10-22T18:53:06.123Z'),
            }, recordOnly, []);

            expect(data).toEqual({ ID: 'P1', DateOfBirth: '1984-05-07', LastSeenAt: '2026-10-22T18:53:06.123Z' });
        });

        it('gives a Scalar param that names a date field the stored day', () => {
            const people = {
                Name: 'People',
                FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
                Fields: [{ Name: 'ID', Type: 'uniqueidentifier' }, { Name: 'DateOfBirth', Type: 'date' }],
            } as unknown as EntityInfo;
            const scalarOnly = { ID: 'tpl-4', Params: [{ Name: 'DateOfBirth', Type: 'Scalar' }] } as unknown as MJTemplateEntityExtended;

            const data = builder.BuildTemplateData(people, { ID: 'P1', DateOfBirth: new Date('1984-05-07T00:00:00.000Z') }, scalarOnly, []);

            expect(data).toEqual({ DateOfBirth: '1984-05-07' });
        });
    });
});
