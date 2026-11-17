import { describe, it, expect, afterEach, vi } from 'vitest';
import { ArtifactMetadataEngine, MJArtifactTypeEntity } from '@memberjunction/core-entities';
import { ArtifactToolManager } from '../ArtifactToolManager';
import { ResolvePresenceDomain } from '../artifact-presence-locator';
import { WhiteboardToolLibrary } from '../artifact-tools/WhiteboardToolLibrary';

describe('WhiteboardToolLibrary', () => {
    const lib = new WhiteboardToolLibrary();

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fails closed on malformed JSON artifact content', async () => {
        const res = await lib.InvokeTool('get_board_summary', {}, '{not valid json');
        expect(res.success).toBe(false);
        expect(res.errorMessage).toBeTruthy();
    });

    it('handles multi-page pageId routing, case-insensitive delete_elements with connector cleanup, and auto_layout', async () => {
        const initialBoard = JSON.stringify({
            version: 2,
            activePageId: 'p-1',
            pages: [
                {
                    id: 'p-1',
                    name: 'Main',
                    items: [],
                },
                {
                    id: 'p-2',
                    name: 'Architecture',
                    items: [],
                },
            ],
        });

        const addNodes = await lib.InvokeTool(
            'upsert_nodes',
            {
                pageId: 'p-2',
                nodes: [
                    { id: 'n-api', label: 'API Gateway', kind: 'shape' },
                    { id: 'n-db', label: 'Primary DB', kind: 'shape' },
                    { id: 'n-cache', label: 'Redis Cache', kind: 'shape' },
                ],
            },
            initialBoard,
        );
        expect(addNodes.success).toBe(true);
        const afterNodes = (addNodes.data as { updatedContent: string }).updatedContent;

        const connectRes = await lib.InvokeTool(
            'connect_nodes',
            {
                pageId: 'p-2',
                connections: [
                    { fromId: 'n-api', toId: 'n-db' },
                    { fromId: 'n-api', toId: 'n-cache' },
                ],
            },
            afterNodes,
        );
        expect(connectRes.success).toBe(true);
        const afterConnect = (connectRes.data as { updatedContent: string }).updatedContent;

        // Case-insensitive delete by label should delete Primary DB AND cascade-delete connector to n-db
        const delRes = await lib.InvokeTool(
            'delete_elements',
            {
                pageId: 'p-2',
                labels: ['primary db'],
            },
            afterConnect,
        );
        expect(delRes.success).toBe(true);
        const afterDel = (delRes.data as { updatedContent: string }).updatedContent;

        const listRes = await lib.InvokeTool('list_elements', { pageId: 'p-2' }, afterDel);
        expect(listRes.success).toBe(true);
        const listed = listRes.data as { elements: Array<{ ID: string; Kind?: string }> };
        expect(listed.elements.some((i) => i.ID === 'n-db')).toBe(false);
        expect(listed.elements.some((i) => i.ID === 'n-api')).toBe(true);
        const connectors = listed.elements.filter((i) => i.Kind === 'connector');
        expect(connectors).toHaveLength(1);

        const layoutRes = await lib.InvokeTool(
            'auto_layout',
            { pageId: 'p-2', direction: 'horizontal', startX: 100, startY: 120, gapX: 50 },
            afterDel,
        );
        expect(layoutRes.success).toBe(true);
        const laidOut = JSON.parse((layoutRes.data as { updatedContent: string }).updatedContent) as {
            pages: Array<{ id: string; items: Array<{ ID: string; X?: number; Y?: number; Kind?: string }> }>;
        };
        const p2Items = laidOut.pages.find((p) => p.id === 'p-2')?.items ?? [];
        const nodesOnly = p2Items.filter((i) => i.Kind !== 'connector');
        expect(nodesOnly[0].X).toBe(100);
        expect(nodesOnly[1].X).toBeGreaterThan(100);
    });

    it('resolves Whiteboard driverClass and presence domain consistently', async () => {
        expect(ResolvePresenceDomain('Whiteboard')).toBe('whiteboard');
        vi.spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType').mockReturnValue({
            ID: 'type-wb',
            Name: 'Whiteboard',
            DriverClass: 'WhiteboardArtifactViewerPlugin',
            ToolLibraryClass: 'WhiteboardToolLibrary',
        } as MJArtifactTypeEntity);

        const mgr = new ArtifactToolManager();
        mgr.Initialize(
            [
                {
                    name: 'System Diagram',
                    typeName: 'Whiteboard',
                    toolLibraryClass: 'WhiteboardToolLibrary',
                    content: JSON.stringify({ version: 1, items: [] }),
                },
            ],
            {},
        );
        const toolRes = await mgr.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'upsert_nodes',
            input: { nodes: [{ id: 'a1', label: 'Ingress' }] },
        });
        expect(toolRes.result.success).toBe(true);
        expect(mgr.ToJSON().artifacts[0].typeName).toBe('Whiteboard');
    });
});
