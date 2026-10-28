import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentItemTagBridge } from '../ContentItemTagBridge';
import { TagEngine } from '../TagEngine';

/** The tagged-item half of the bridge, shared by the autotagger and the content pipeline's Tag stage. */
describe('ContentItemTagBridge — Entity Record Documents lookup', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // On the server a cached RunView widens Fields to every column (DocumentText, VectorJSON) so its
    // slot can serve any field set. A lookup by ERD ID is single-use, so it bypasses the cache.
    it('reads EntityID and RecordID by ERD ID, bypassing the RunView cache, and links through TagEngine', async () => {
        const calls: Array<Record<string, unknown>> = [];
        const provider = {
            RunView: async (params: Record<string, unknown>) => {
                calls.push(params);
                if (params.EntityName === 'MJ: Content Items') {
                    return { Success: true, Results: [{ ID: 'ci-1', EntityRecordDocumentID: 'erd-1' }] };
                }
                if (params.EntityName === 'MJ: Entity Record Documents') {
                    return { Success: true, Results: [{ EntityID: 'ent-1', RecordID: 'rec-1' }] };
                }
                return { Success: true, Results: [] };
            },
        };
        const createTaggedItem = vi.spyOn(TagEngine.prototype, 'CreateTaggedItem').mockResolvedValue({} as never);
        const contentItemTag = { ItemID: 'ci-1', Tag: 'Technology', Weight: 0.9 };
        const user = { ID: 'user-1' };

        const bridge = new ContentItemTagBridge(provider as never) as unknown as {
            createTaggedItem(tag: unknown, tagID: string, user: unknown): Promise<void>;
        };
        await bridge.createTaggedItem(contentItemTag, 'tag-1', user);

        const erdCall = calls.find((c) => c.EntityName === 'MJ: Entity Record Documents');
        expect(erdCall).toMatchObject({
            ExtraFilter: "ID='erd-1'",
            Fields: ['EntityID', 'RecordID'],
            MaxRows: 1,
            BypassCache: true,
        });
        expect(createTaggedItem).toHaveBeenCalledWith('tag-1', 'ent-1', 'rec-1', 0.9, user);
    });
});
