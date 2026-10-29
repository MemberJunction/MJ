/**
 * Server-set query parameters and the reserved `Context` object (#4789 A17).
 *
 * - A caller value for an `IsServerSet` parameter, for a name a composed query protects, or for
 *   `Context` is refused with an error naming it, and logged.
 * - A server-set parameter takes its value from `ServerParameters` only.
 * - `Context.*` renders server values worked out from the user, the clock and the zone; a template
 *   that never reads `Context` renders exactly as it did without it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BuildQueryTemplateContext, RunQuerySQLFilterManager } from '@memberjunction/core';
import type { QueryTemplateContext } from '@memberjunction/core';

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: logError };
});

import { QueryParameterProcessor } from '../queryParameterProcessor.js';

function param(overrides: Record<string, unknown> = {}) {
    return {
        QueryID: 'q1', Name: 'p', Type: 'string', IsRequired: false, DefaultValue: null, Description: null,
        SampleValue: null, ValidationFilters: null, DetectionMethod: 'Manual', AutoDetectConfidenceScore: null,
        IsServerSet: false, ...overrides,
    };
}

const USER = { ID: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', Email: 'ada@example.com', Name: "Ada O'Lovelace" };
/** Wednesday 14 October 2026, 23:30 UTC — already Thursday in Tokyo. */
const NOW = new Date('2026-10-14T23:30:00.000Z');

/** The Context for one render: the fixed clock, the zone, and the user (none when `null`). */
function context(timeZone?: string, user: typeof USER | null = USER): QueryTemplateContext {
    return BuildQueryTemplateContext({ User: user ?? undefined, Now: NOW, TimeZone: timeZone });
}

function template(sql: string, parameters: ReturnType<typeof param>[] = []) {
    return { SQL: sql, UsesTemplate: true, Parameters: parameters } as never;
}

const CHAPTER = param({ Name: 'ChapterID', Type: 'number', IsRequired: true, IsServerSet: true });
const CHAPTER_SQL = 'SELECT * FROM Members WHERE ChapterID = {{ ChapterID | sqlNumber }}';

beforeEach(() => {
    RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
    logError.mockClear();
});

describe('server-set parameters', () => {
    it('refuses a caller value, names the parameter, and logs the refusal', () => {
        const result = QueryParameterProcessor.ProcessQueryTemplate(template(CHAPTER_SQL, [CHAPTER]), { ChapterID: 7 }, undefined, false, { ServerParameters: { ChapterID: 3 } });
        expect(result.success).toBe(false);
        expect(result.error).toContain("Parameter 'ChapterID' is set by the server; a caller value for it is refused");
        expect(logError).toHaveBeenCalledWith(expect.stringContaining("'ChapterID' is set by the server"));
    });

    it('applies the server value, and leaves it out of the parameters callers see', () => {
        const result = QueryParameterProcessor.ProcessQueryTemplate(template(CHAPTER_SQL, [CHAPTER]), undefined, undefined, false, { ServerParameters: { ChapterID: 3 } });
        expect(result.success).toBe(true);
        expect(result.processedSQL).toBe('SELECT * FROM Members WHERE ChapterID = 3');
        expect(result.appliedParameters).toEqual({});
    });

    it('refuses a run when a required server-set parameter has no server value, even with a caller value', () => {
        const none = QueryParameterProcessor.ValidateParameters(undefined, [CHAPTER] as never[]);
        expect(none.success).toBe(false);
        expect(none.errors).toEqual(["Required parameter 'ChapterID' is set by the server, and no server value was given"]);

        const callerOnly = QueryParameterProcessor.ValidateParameters({ ChapterID: 7 }, [CHAPTER] as never[]);
        expect(callerOnly.errors).toContain("Required parameter 'ChapterID' is set by the server, and no server value was given");
        expect(callerOnly.validatedParameters.ChapterID).toBeUndefined();
    });

    it('lets a server value set an ordinary parameter too, winning over the caller', () => {
        const region = param({ Name: 'Region' });
        const result = QueryParameterProcessor.ValidateParameters({ Region: 'West' }, [region] as never[], false, { ServerParameters: { Region: 'East' } });
        expect(result.success).toBe(true);
        expect(result.validatedParameters.Region).toBe('East');
    });

    it('keeps refusing unknown names, from the caller or the server', () => {
        const fromCaller = QueryParameterProcessor.ValidateParameters({ Bogus: 1 }, [CHAPTER] as never[], false, { ServerParameters: { ChapterID: 3 } });
        expect(fromCaller.errors).toEqual(["Unknown parameter: 'Bogus'"]);
        const fromServer = QueryParameterProcessor.ValidateParameters(undefined, [CHAPTER] as never[], false, { ServerParameters: { ChapterID: 3, Bogus: 1 } });
        expect(fromServer.errors).toEqual(["Unknown parameter: 'Bogus'"]);
    });

    it("refuses a caller value for a name that reaches a composed query's server-set parameter", () => {
        const result = QueryParameterProcessor.ProcessQueryTemplate(
            template('SELECT * FROM Dep WHERE ChapterID = {{ ChapterID | sqlNumber }}'),
            { ChapterID: 7 }, undefined, true, { ProtectedNames: ['ChapterID'] }
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain("Parameter 'ChapterID' is set by the server");
    });

    it('passes server values through to a composed query when force-processing', () => {
        const result = QueryParameterProcessor.ProcessQueryTemplate(
            template('SELECT * FROM Dep WHERE ChapterID = {{ ChapterID | sqlNumber }}'),
            undefined, undefined, true, { ProtectedNames: ['ChapterID'], ServerParameters: { ChapterID: 3 } }
        );
        expect(result.processedSQL).toBe('SELECT * FROM Dep WHERE ChapterID = 3');
    });
});

describe('the Context object', () => {
    const ALL = [
        'UserID={{ Context.UserID }}', 'UserEmail={{ Context.UserEmail }}', 'UserName={{ Context.UserName }}',
        'Now={{ Context.Now }}', 'Today={{ Context.Today }}', 'StartOfWeek={{ Context.StartOfWeek }}',
        'StartOfMonth={{ Context.StartOfMonth }}', 'StartOfQuarter={{ Context.StartOfQuarter }}', 'StartOfYear={{ Context.StartOfYear }}',
    ].join(' ');

    it('renders every member from the user, the clock and the zone (UTC when none)', () => {
        const result = QueryParameterProcessor.ProcessQueryTemplate(template(ALL), undefined, undefined, false, { Context: context() });
        expect(result.processedSQL).toBe(
            `UserID=${USER.ID} UserEmail=${USER.Email} UserName=${USER.Name} Now=2026-10-14T23:30:00.000Z ` +
            'Today=2026-10-14 StartOfWeek=2026-10-12 StartOfMonth=2026-10-01 StartOfQuarter=2026-10-01 StartOfYear=2026-01-01'
        );
    });

    it("works dates out in the run's time zone", () => {
        const result = QueryParameterProcessor.ProcessQueryTemplate(template('{{ Context.Today }}'), undefined, undefined, false, { Context: context('Asia/Tokyo') });
        expect(result.processedSQL).toBe('2026-10-15');
    });

    it('reports exactly the members the template read, and keeps them out of the applied parameters', () => {
        const result = QueryParameterProcessor.ProcessQueryTemplate(template('SELECT {{ Context.UserID }}, {{ Context.Today }}'), undefined, undefined, false, { Context: context() });
        expect(result.contextValues).toEqual({ UserID: USER.ID, Today: '2026-10-14' });
        expect(result.appliedParameters).toEqual({});
    });

    it('goes through the same SQL-safe filters as parameters', () => {
        const result = QueryParameterProcessor.ProcessQueryTemplate(template('WHERE Name = {{ Context.UserName | sqlString }}'), undefined, undefined, false, { Context: context() });
        expect(result.processedSQL).toBe("WHERE Name = 'Ada O''Lovelace'");
    });

    it('cannot be set by a caller: a Context value is refused, even as an unknown name', () => {
        for (const force of [false, true]) {
            const result = QueryParameterProcessor.ProcessQueryTemplate(
                template('{{ Context.UserID }}'), { Context: { UserID: 'someone-else' } }, undefined, force, { Context: context() }
            );
            expect(result.success).toBe(false);
            expect(result.error).toContain("Parameter 'Context' is reserved");
        }
    });

    it('fails the render, naming the member, when a member cannot be worked out', () => {
        const result = QueryParameterProcessor.ProcessQueryTemplate(template('{{ Context.UserID }}'), undefined, undefined, false, { Context: context(undefined, null) });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Context.UserID needs a context user');
    });
});

describe('a query with neither server-set parameters nor Context runs exactly as before', () => {
    const SQL = "SELECT * FROM T WHERE Region = {{ Region | sqlString }}{% if Since %} AND D >= {{ Since | sqlDate }}{% endif %}";
    const DEFS = [param({ Name: 'Region', IsRequired: true }), param({ Name: 'Since', Type: 'date' })];
    const VALUES = { Region: 'West', Since: '2026-01-01' };

    it('renders the same SQL and applied parameters with or without the server values', () => {
        const before = QueryParameterProcessor.ProcessQueryTemplate(template(SQL, DEFS), VALUES);
        const after = QueryParameterProcessor.ProcessQueryTemplate(template(SQL, DEFS), VALUES, undefined, false, { Context: context(), ServerParameters: undefined, ProtectedNames: [] });
        expect(after.processedSQL).toBe(before.processedSQL);
        expect(after.appliedParameters).toEqual(before.appliedParameters);
        expect(after.contextValues).toEqual({});
        expect(before.processedSQL).toBe("SELECT * FROM T WHERE Region = 'West' AND D >= '2026-01-01T00:00:00.000Z'");
        expect(logError).not.toHaveBeenCalled();
    });
});
