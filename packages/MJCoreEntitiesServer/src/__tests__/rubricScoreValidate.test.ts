import { describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core-entities', () => {
    class MJRubricEvaluationScoreEntity {
        public IsComputed = false;
        public async ValidateAsync(): Promise<{ Success: boolean; Errors: { Message?: string }[] }> {
            return { Success: true, Errors: [] };
        }
    }
    return { MJRubricEvaluationScoreEntity };
});

import { MJRubricEvaluationScoreEntityServer } from '../custom/MJRubricEvaluationScoreEntityServer.server.js';

describe('MJRubricEvaluationScoreEntityServer.ValidateAsync', () => {
    it('refuses a client computed row and allows the evaluation server flag', async () => {
        const client = new MJRubricEvaluationScoreEntityServer();
        const clientHost = client as unknown as { IsComputed: boolean; allowServerComputedWrite: boolean };
        clientHost.IsComputed = true;
        clientHost.allowServerComputedWrite = false;
        const refused = await client.ValidateAsync();
        expect(refused.Success).toBe(false);

        const server = new MJRubricEvaluationScoreEntityServer();
        const serverHost = server as unknown as { IsComputed: boolean; allowServerComputedWrite: boolean };
        serverHost.IsComputed = true;
        serverHost.allowServerComputedWrite = true;
        const allowed = await server.ValidateAsync();
        expect(allowed.Success).toBe(true);
    });
});
