import '@angular/compiler'; // JIT support — the service module evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type UserInfo } from '@memberjunction/core';
import { ConversationEngine, type ConversationBranchRow, type ConversationScope } from '@memberjunction/core-entities';
import { DataCacheService } from '../lib/services/data-cache.service';

/**
 * `DataCacheService.LoadConversationDetails` reads the messages of one scope. Without a scope it
 * reads the path the conversation currently shows; the deprecated alias forwards to it.
 */

const USER = { ID: 'USER-1' } as UserInfo;
const B: ConversationBranchRow = { ID: 'BRANCH-B', ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: 2, Name: null };
const BRANCH_SCOPE: ConversationScope = { ConversationID: 'CONV-1', BranchID: 'BRANCH-B', Branches: [B] };

describe('DataCacheService conversation details read', () => {
    let runView: ReturnType<typeof vi.fn>;
    let service: DataCacheService;

    function lastParams(): { EntityName: string; ExtraFilter: string } {
        return runView.mock.calls[runView.mock.calls.length - 1][0] as { EntityName: string; ExtraFilter: string };
    }

    beforeEach(() => {
        runView = vi.fn(async () => ({ Success: true, Results: [] }));
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        service = new DataCacheService();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads the details in the given scope', async () => {
        const loadCurrent = vi.spyOn(ConversationEngine, 'LoadCurrentScope');

        await service.LoadConversationDetails('CONV-1', USER, BRANCH_SCOPE);

        expect(loadCurrent).not.toHaveBeenCalled();
        expect(lastParams().EntityName).toBe('MJ: Conversation Details');
        expect(lastParams().ExtraFilter).toBe(ConversationEngine.ScopeFilter(BRANCH_SCOPE));
    });

    it('reads the current scope of the conversation when no scope is given', async () => {
        const loadCurrent = vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(BRANCH_SCOPE);

        await service.LoadConversationDetails('CONV-1', USER);

        expect(loadCurrent).toHaveBeenCalledWith('CONV-1', USER, service.Provider);
        expect(lastParams().ExtraFilter).toBe(ConversationEngine.ScopeFilter(BRANCH_SCOPE));
    });

    it('the deprecated alias reads the current scope when no scope is given', async () => {
        const loadCurrent = vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(BRANCH_SCOPE);

        await service.loadConversationDetails('CONV-1', USER);

        expect(loadCurrent).toHaveBeenCalledWith('CONV-1', USER, service.Provider);
        expect(lastParams().ExtraFilter).toBe(ConversationEngine.ScopeFilter(BRANCH_SCOPE));
    });

    it('the deprecated alias reads a given scope', async () => {
        await service.loadConversationDetails('CONV-1', USER, ConversationEngine.TrunkScope('CONV-1'));

        expect(lastParams().ExtraFilter).toBe(`[ConversationID]='CONV-1' AND [BranchID] IS NULL`);
    });

    it('rejects a scope of another conversation without reading', async () => {
        const loadCurrent = vi.spyOn(ConversationEngine, 'LoadCurrentScope');

        await expect(service.LoadConversationDetails('CONV-1', USER, ConversationEngine.TrunkScope('CONV-2')))
            .rejects.toThrow(/CONV-2/);
        expect(loadCurrent).not.toHaveBeenCalled();
        expect(runView).not.toHaveBeenCalled();
    });
});
