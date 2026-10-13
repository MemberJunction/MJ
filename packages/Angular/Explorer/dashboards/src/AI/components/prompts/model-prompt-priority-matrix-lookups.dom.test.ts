/**
 * Pins how the prompt × model priority matrix joins its rows. Each association used to scan every
 * prompt and model, and each matrix cell scanned every association. They now use indexes; these
 * specs hold them to the same answers: IDs matched in any case, associations to unknown prompts or
 * models dropped, and the first association for a pair winning.
 */
import { describe, it, expect } from 'vitest';
import type { MJAIPromptModelEntity } from '@memberjunction/core-entities';
import type { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { ModelPromptPriorityMatrixComponent } from './model-prompt-priority-matrix.component';

interface MatrixInternals {
    buildAssociations(dbAssociations: MJAIPromptModelEntity[]): void;
    buildMatrix(): void;
}

function matrix(associations: Array<{ PromptID: string; ModelID: string; Priority: number }>) {
    const c = Object.create(ModelPromptPriorityMatrixComponent.prototype) as ModelPromptPriorityMatrixComponent;
    c.Prompts = [{ ID: 'p1', Name: 'Summarize' }, { ID: 'p2', Name: 'Classify' }] as unknown as MJAIPromptEntityExtended[];
    c.Models = [{ ID: 'm1', Name: 'GPT' }, { ID: 'm2', Name: 'Claude' }] as unknown as MJAIModelEntityExtended[];
    const internals = c as unknown as MatrixInternals;
    internals.buildAssociations(associations.map(a => ({ ...a, Status: 'Active' })) as unknown as MJAIPromptModelEntity[]);
    internals.buildMatrix();
    return c;
}

describe('ModelPromptPriorityMatrixComponent joins', () => {
    it('joins associations to prompts and models in any ID case, dropping unknown ones', () => {
        const c = matrix([
            { PromptID: 'P2', ModelID: 'M1', Priority: 4 },
            { PromptID: 'p1', ModelID: 'm-gone', Priority: 9 },
            { PromptID: 'p1', ModelID: 'm2', Priority: 2 },
        ]);

        expect(c.Associations.map(a => `${a.promptName}/${a.modelName}/${a.priority}`)).toEqual(['Classify/GPT/4', 'Summarize/Claude/2']);
    });

    it('places each association in its cell and leaves the rest empty, the first of a duplicated pair winning', () => {
        const c = matrix([
            { PromptID: 'p1', ModelID: 'm2', Priority: 2 },
            { PromptID: 'P1', ModelID: 'M2', Priority: 7 },
            { PromptID: 'p2', ModelID: 'M1', Priority: 4 },
        ]);

        expect(c.Matrix.map(row => row.map(cell => cell.association?.priority ?? null))).toEqual([
            [null, 2],
            [4, null],
        ]);
    });
});
