/**
 * The description pass reads rows, waits seconds for the LLM, then saves them. A database save sends
 * every loaded column, not only the changed ones (SQLServerDataProvider's save-delete-paths.test.ts:
 * "the executed fullSQL still passes every column"), so a row read before the wait puts back
 * whatever it held. That is how a parameter marked server-set during the wait lost the mark (#6333).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, IRunViewProvider, RunViewParams, UserInfo } from '@memberjunction/core';

const { executePrompt } = vi.hoisted(() => ({ executePrompt: vi.fn() }));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn(async () => undefined), Prompts: [{ Name: 'SQL Query Parameter Extraction', Category: 'MJ: System' }] } },
}));
vi.mock('@memberjunction/ai-prompts', () => ({ AIPromptRunner: class { ExecutePrompt = executePrompt; } }));
vi.mock('@memberjunction/ai-core-plus', () => ({ AIPromptParams: class {} }));

import { RunDescriptionPass } from '../custom/query-extraction/descriptionPass';

interface StoredParameter {
    ID: string;
    Name: string;
    Type: string;
    IsRequired: boolean;
    IsServerSet: boolean;
    Description: string | null;
}

/** A parameter row as a read returns it: a copy, and a Save() that writes every column it holds. */
function loadedRow(stored: StoredParameter): StoredParameter & { Save(): Promise<boolean> } {
    const row = { ...stored };
    return Object.assign(row, {
        Save: async (): Promise<boolean> => {
            const { ID, Name, Type, IsRequired, IsServerSet, Description } = row;
            Object.assign(stored, { ID, Name, Type, IsRequired, IsServerSet, Description });
            return true;
        },
    });
}

/** A provider over one stored parameter. Reads return rows whose description is still empty. */
function providerOver(stored: StoredParameter): IMetadataProvider & IRunViewProvider {
    const fake = {
        RunView: async (params: RunViewParams) => ({
            Success: true,
            Results: params.EntityName === 'MJ: Query Parameters' && !stored.Description ? [loadedRow(stored)] : [],
        }),
    };
    return fake as unknown as IMetadataProvider & IRunViewProvider;
}

function chapterID(): StoredParameter {
    return { ID: 'p-1', Name: 'ChapterID', Type: 'number', IsRequired: true, IsServerSet: false, Description: null };
}

/** Runs the pass; `whileWaiting` happens during the LLM call, which then describes ChapterID. */
async function runPass(stored: StoredParameter, whileWaiting: () => void = () => undefined): Promise<void> {
    executePrompt.mockImplementation(async () => {
        whileWaiting();
        return { success: true, result: { parameters: [{ name: 'ChapterID', description: 'The chapter to read.' }] } };
    });
    await RunDescriptionPass({ QueryID: 'q-1', QueryName: 'Q', SQL: 'SELECT 1', Provider: providerOver(stored), User: {} as UserInfo });
}

describe('RunDescriptionPass', () => {
    beforeEach(() => executePrompt.mockReset());

    it('writes the description the LLM returned', async () => {
        const stored = chapterID();
        await runPass(stored);
        expect(stored.Description).toBe('The chapter to read.');
    });

    it('keeps a column changed while the LLM was answering', async () => {
        const stored = chapterID();
        await runPass(stored, () => { stored.IsServerSet = true; });
        expect(stored.IsServerSet).toBe(true);
        expect(stored.Description).toBe('The chapter to read.');
    });

    it('leaves a description written while the LLM was answering', async () => {
        const stored = chapterID();
        await runPass(stored, () => { stored.Description = 'Written by a person.'; });
        expect(stored.Description).toBe('Written by a person.');
    });
});
