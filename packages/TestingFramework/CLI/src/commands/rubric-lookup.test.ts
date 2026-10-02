import { beforeEach, describe, expect, it, vi } from 'vitest';

const views: { EntityName: string; ExtraFilter?: string }[] = [];
const responses: { Success: boolean; ErrorMessage?: string; Results?: Record<string, unknown>[] }[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            static FromMetadataProvider() {
                return new this();
            }
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                views.push(params);
                return responses.shift() ?? { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('../lib/mj-provider', () => ({
    InitializeMJProvider: async () => undefined,
    GetContextUser: async () => ({ ID: 'user' }),
    GetMJProvider: () => ({}),
}));

import { LookupRubricOverride } from './rubric-cli.js';
import { RubricCommands } from './rubric-commands.js';

const rubricId = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';

describe('rubric lookup queries', () => {
    beforeEach(() => {
        views.length = 0;
        responses.length = 0;
    });

    it('queries a name by Name and refuses a failed view', async () => {
        responses.push({ Success: true, Results: [{ ID: rubricId, Name: 'Reply check' }] });
        await expect(LookupRubricOverride('Reply check', {} as never)).resolves.toEqual({ rubricId });
        expect(views[0].ExtraFilter).toBe("Name='Reply check'");
        responses.push(
            { Success: true, Results: [{ ID: rubricId, Name: 'Reply check' }] },
            { Success: false, ErrorMessage: 'versions unread' },
        );
        await expect(LookupRubricOverride(`${rubricId}@1.0.0`, {} as never)).rejects.toThrow('versions unread');
        expect(views.at(-2)?.ExtraFilter).toBe(`ID='${rubricId}'`);
        responses.push({ Success: false, ErrorMessage: 'rubrics unread' });
        await expect(new RubricCommands().List()).rejects.toThrow('rubrics unread');
    });
});
