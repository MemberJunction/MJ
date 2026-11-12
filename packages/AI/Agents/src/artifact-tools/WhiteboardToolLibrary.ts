import { IndexByUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';

export type ServerWhiteboardItemKind =
    | 'sticky'
    | 'shape'
    | 'ink'
    | 'text'
    | 'image'
    | 'connector'
    | 'highlight'
    | 'markdown'
    | 'html';

export type ServerWhiteboardShapeKind = 'rect' | 'ellipse' | 'diamond';

export interface ServerWhiteboardPoint {
    X: number;
    Y: number;
}

export interface ServerWhiteboardItem {
    ID: string;
    Kind: ServerWhiteboardItemKind;
    Author: 'user' | 'agent';
    Z: number;
    Tag?: string;
    X?: number;
    Y?: number;
    W?: number;
    H?: number;
    Text?: string;
    Label?: string;
    Sub?: string;
    Shape?: ServerWhiteboardShapeKind;
    Tint?: 'amber' | 'amber-light';
    FromItemID?: string | null;
    ToItemID?: string | null;
    FromPoint?: ServerWhiteboardPoint | null;
    ToPoint?: ServerWhiteboardPoint | null;
    Markdown?: string;
    Html?: string;
    Title?: string;
}

export interface ServerWhiteboardPageJSON {
    id: string;
    name: string;
    items: ServerWhiteboardItem[];
    author?: 'user' | 'agent';
}

export interface ServerWhiteboardStateJSON {
    version: 2;
    seq: number;
    idCounter: number;
    zCounter: number;
    pageCounter: number;
    activePageId: string;
    pages: ServerWhiteboardPageJSON[];
}

/**
 * Server-side and agent tool library for `Whiteboard` artifacts (§ 3.4.1 / `O1`), enabling
 * `@mention` agents and server-side workflows to inspect and mutate both standalone Whiteboard
 * artifacts and inline OLE Whiteboards embedded inside MJ Docs, Slides, and Sheets.
 */
@RegisterClass(BaseArtifactToolLibrary, 'WhiteboardToolLibrary')
export class WhiteboardToolLibrary extends BaseArtifactToolLibrary {
    protected override getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'get_board_summary',
                description:
                    'Returns a high-level summary of the whiteboard including active page, page list, item counts by kind (shape, sticky, connector, text, markdown, html), and bounding box.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pageId: { type: 'string', description: 'Optional page ID to summarize (defaults to active page).' }
                    }
                }
            },
            {
                name: 'list_elements',
                description: 'Lists items on the active (or specified) whiteboard page, optionally filtered by `kind`.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        kind: {
                            type: 'string',
                            enum: ['sticky', 'shape', 'text', 'connector', 'markdown', 'html', 'image', 'ink', 'highlight'],
                            description: 'Optional filter by element kind.'
                        },
                        pageId: { type: 'string', description: 'Optional page ID.' }
                    }
                }
            },
            {
                name: 'upsert_nodes',
                description:
                    'Creates or updates one or more shape or text nodes on the whiteboard. Matches existing items by `id` or `label`. Returns `updatedContent` (serialized WhiteboardStateJSON).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        nodes: {
                            type: 'array',
                            description: 'List of nodes to create or update.',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string', description: 'Optional item ID.' },
                                    label: { type: 'string', description: 'Primary node label.' },
                                    sub: { type: 'string', description: 'Optional sub-label.' },
                                    shape: {
                                        type: 'string',
                                        enum: ['rect', 'ellipse', 'diamond'],
                                        description: 'Shape geometry (defaults to "rect").'
                                    },
                                    x: { type: 'number', description: 'X coordinate on canvas.' },
                                    y: { type: 'number', description: 'Y coordinate on canvas.' },
                                    w: { type: 'number', description: 'Width in px (defaults to 180).' },
                                    h: { type: 'number', description: 'Height in px (defaults to 76).' },
                                    tag: { type: 'string', description: 'Optional semantic role tag.' }
                                },
                                required: ['label']
                            }
                        }
                    },
                    required: ['nodes']
                }
            },
            {
                name: 'connect_nodes',
                description:
                    'Creates connectors between pairs of whiteboard items (matched by `fromId`/`toId` or `fromLabel`/`toLabel`). Returns `updatedContent`.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        connections: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    fromId: { type: 'string', description: 'Source item ID.' },
                                    fromLabel: { type: 'string', description: 'Source item label if fromId is omitted.' },
                                    toId: { type: 'string', description: 'Target item ID.' },
                                    toLabel: { type: 'string', description: 'Target item label if toId is omitted.' }
                                }
                            }
                        }
                    },
                    required: ['connections']
                }
            },
            {
                name: 'add_sticky_notes',
                description: 'Adds one or more sticky notes to the active whiteboard page. Returns `updatedContent`.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        notes: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    text: { type: 'string', description: 'Sticky note text.' },
                                    x: { type: 'number', description: 'Optional X coordinate.' },
                                    y: { type: 'number', description: 'Optional Y coordinate.' },
                                    w: { type: 'number', description: 'Optional width in px.' },
                                    tint: { type: 'string', enum: ['amber', 'amber-light'] },
                                    tag: { type: 'string', description: 'Optional role tag.' }
                                },
                                required: ['text']
                            }
                        }
                    },
                    required: ['notes']
                }
            },
            {
                name: 'delete_elements',
                description:
                    'Deletes whiteboard elements by `ids` or `labels`, automatically removing any connectors attached to deleted items. Returns `updatedContent`.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        ids: { type: 'array', items: { type: 'string' }, description: 'Item IDs to delete.' },
                        labels: { type: 'array', items: { type: 'string' }, description: 'Item labels/texts to delete.' }
                    }
                }
            },
            {
                name: 'auto_layout',
                description:
                    'Automatically arranges non-connector elements on the active whiteboard page using a clean grid, horizontal flow, or vertical flow layout. Returns `updatedContent`.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        direction: {
                            type: 'string',
                            enum: ['grid', 'horizontal', 'vertical'],
                            description: 'Layout strategy (defaults to "grid").'
                        },
                        startX: { type: 'number', description: 'Starting X coordinate (defaults to 80).' },
                        startY: { type: 'number', description: 'Starting Y coordinate (defaults to 80).' },
                        gapX: { type: 'number', description: 'Horizontal gap between items (defaults to 64).' },
                        gapY: { type: 'number', description: 'Vertical gap between items (defaults to 56).' }
                    }
                }
            }
        ];
    }

    protected override async invokeSubclassTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        const contentStr = typeof artifactContent === 'string' ? artifactContent : artifactContent.toString('utf-8');
        const state = this.ParseState(contentStr);

        switch (toolName) {
            case 'get_board_summary':
            case 'GetBoardSummary':
                return this.GetBoardSummary(state, input);
            case 'list_elements':
            case 'ListElements':
                return this.ListElements(state, input);
            case 'upsert_nodes':
            case 'UpsertNodes':
                return this.UpsertNodes(state, input);
            case 'connect_nodes':
            case 'ConnectNodes':
                return this.ConnectNodes(state, input);
            case 'add_sticky_notes':
            case 'AddStickyNotes':
                return this.AddStickyNotes(state, input);
            case 'delete_elements':
            case 'DeleteElements':
                return this.DeleteElements(state, input);
            case 'auto_layout':
            case 'AutoLayout':
                return this.AutoLayout(state, input);
            default:
                return { success: false, data: null, errorMessage: `Unknown Whiteboard tool: "${toolName}"` };
        }
    }

    /**
     * Parses either a v2 paged whiteboard JSON string, a v1 flat whiteboard JSON string, or an empty string
     * into a normalized v2 {@link ServerWhiteboardStateJSON}.
     */
    public ParseState(rawJson: string): ServerWhiteboardStateJSON {
        const emptyState = (): ServerWhiteboardStateJSON => ({
            version: 2,
            seq: 1,
            idCounter: 1,
            zCounter: 1,
            pageCounter: 1,
            activePageId: 'page-1',
            pages: [{ id: 'page-1', name: 'Page 1', items: [], author: 'user' }]
        });

        const trimmed = (rawJson ?? '').trim();
        if (!trimmed) {
            return emptyState();
        }

        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            if (!parsed || typeof parsed !== 'object') {
                return emptyState();
            }

            if (parsed.version === 2 && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
                const pages = (parsed.pages as ServerWhiteboardPageJSON[]).map((p, idx) => ({
                    id: typeof p.id === 'string' && p.id ? p.id : `page-${idx + 1}`,
                    name: typeof p.name === 'string' && p.name ? p.name : `Page ${idx + 1}`,
                    items: Array.isArray(p.items) ? [...p.items] : [],
                    author: p.author === 'agent' ? ('agent' as const) : ('user' as const)
                }));
                const activePageId =
                    typeof parsed.activePageId === 'string' && pages.some((p) => p.id === parsed.activePageId)
                        ? parsed.activePageId
                        : pages[0].id;
                return {
                    version: 2,
                    seq: typeof parsed.seq === 'number' ? parsed.seq : 1,
                    idCounter: typeof parsed.idCounter === 'number' ? parsed.idCounter : 10,
                    zCounter: typeof parsed.zCounter === 'number' ? parsed.zCounter : 10,
                    pageCounter: typeof parsed.pageCounter === 'number' ? parsed.pageCounter : pages.length,
                    activePageId,
                    pages
                };
            }

            // Legacy v1 flat format ({ version: 1, items: [...] })
            if (Array.isArray(parsed.items)) {
                const items = parsed.items as ServerWhiteboardItem[];
                return {
                    version: 2,
                    seq: typeof parsed.seq === 'number' ? parsed.seq : 1,
                    idCounter: typeof parsed.idCounter === 'number' ? parsed.idCounter : items.length + 1,
                    zCounter: typeof parsed.zCounter === 'number' ? parsed.zCounter : items.length + 1,
                    pageCounter: 1,
                    activePageId: 'page-1',
                    pages: [{ id: 'page-1', name: 'Page 1', items: [...items], author: 'user' }]
                };
            }
        } catch {
            // Fall through to empty state
        }

        return emptyState();
    }

    private getTargetPage(state: ServerWhiteboardStateJSON, pageId?: unknown): ServerWhiteboardPageJSON {
        if (typeof pageId === 'string' && pageId.trim()) {
            const found = state.pages.find((p) => p.id === pageId.trim());
            if (found) {
                return found;
            }
        }
        return state.pages.find((p) => p.id === state.activePageId) ?? state.pages[0];
    }

    public GetBoardSummary(state: ServerWhiteboardStateJSON, input: Record<string, unknown> = {}): ArtifactToolResult {
        const page = this.getTargetPage(state, input.pageId);
        const byKind: Record<string, number> = {};
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (const item of page.items) {
            byKind[item.Kind] = (byKind[item.Kind] ?? 0) + 1;
            if (typeof item.X === 'number' && typeof item.Y === 'number') {
                const w = item.W ?? 172;
                const h = item.H ?? 96;
                minX = Math.min(minX, item.X);
                minY = Math.min(minY, item.Y);
                maxX = Math.max(maxX, item.X + w);
                maxY = Math.max(maxY, item.Y + h);
            }
        }

        const bounds =
            Number.isFinite(minX) && Number.isFinite(minY)
                ? { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) }
                : { x: 0, y: 0, width: 0, height: 0 };

        return {
            success: true,
            data: {
                activePageId: page.id,
                activePageName: page.name,
                pageCount: state.pages.length,
                pages: state.pages.map((p) => ({ id: p.id, name: p.name, itemCount: p.items.length })),
                totalElements: page.items.length,
                countsByKind: byKind,
                bounds
            }
        };
    }

    public ListElements(state: ServerWhiteboardStateJSON, input: Record<string, unknown> = {}): ArtifactToolResult {
        const page = this.getTargetPage(state, input.pageId);
        const kindFilter = typeof input.kind === 'string' ? input.kind.trim().toLowerCase() : '';
        const elements = kindFilter
            ? page.items.filter((i) => i.Kind.toLowerCase() === kindFilter)
            : page.items;
        return {
            success: true,
            data: {
                pageId: page.id,
                count: elements.length,
                elements
            }
        };
    }

    public UpsertNodes(state: ServerWhiteboardStateJSON, input: Record<string, unknown>): ArtifactToolResult {
        const rawNodes = Array.isArray(input.nodes) ? (input.nodes as Array<Record<string, unknown>>) : [];
        if (rawNodes.length === 0) {
            return { success: false, data: null, errorMessage: 'upsert_nodes requires a non-empty nodes array.' };
        }

        const page = this.getTargetPage(state, input.pageId);
        const upsertedIds: string[] = [];

        const itemsById = IndexByUUID(page.items);
        for (let idx = 0; idx < rawNodes.length; idx++) {
            const node = rawNodes[idx];
            const label = String(node.label ?? '').trim();
            if (!label) {
                continue;
            }
            const requestedId = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : null;
            const existing =
                (requestedId ? itemsById.Get(requestedId) : undefined) ??
                page.items.find(
                    (i) => i.Kind === 'shape' && (i.Label ?? '').trim().toLowerCase() === label.toLowerCase()
                );

            const shapeKind: ServerWhiteboardShapeKind =
                node.shape === 'ellipse' || node.shape === 'diamond' ? node.shape : 'rect';

            if (existing) {
                existing.Label = label;
                if (typeof node.sub === 'string') existing.Sub = node.sub;
                if (node.shape) existing.Shape = shapeKind;
                if (typeof node.x === 'number') existing.X = node.x;
                if (typeof node.y === 'number') existing.Y = node.y;
                if (typeof node.w === 'number') existing.W = node.w;
                if (typeof node.h === 'number') existing.H = node.h;
                if (typeof node.tag === 'string') existing.Tag = node.tag;
                upsertedIds.push(existing.ID);
            } else {
                const newId = requestedId ?? `shape-${++state.idCounter}`;
                const col = idx % 3;
                const row = Math.floor(idx / 3);
                const newItem: ServerWhiteboardItem = {
                    ID: newId,
                    Kind: 'shape',
                    Author: 'agent',
                    Z: ++state.zCounter,
                    Shape: shapeKind,
                    Label: label,
                    Sub: typeof node.sub === 'string' ? node.sub : undefined,
                    X: typeof node.x === 'number' ? node.x : 80 + col * 240,
                    Y: typeof node.y === 'number' ? node.y : 80 + row * 140,
                    W: typeof node.w === 'number' ? node.w : 180,
                    H: typeof node.h === 'number' ? node.h : 76,
                    Tag: typeof node.tag === 'string' ? node.tag : undefined
                };
                page.items.push(newItem);
                upsertedIds.push(newId);
            }
        }

        state.seq++;
        const updatedContent = JSON.stringify(state);
        return {
            success: true,
            data: {
                upsertedIds,
                totalElements: page.items.length,
                updatedContent
            }
        };
    }

    public ConnectNodes(state: ServerWhiteboardStateJSON, input: Record<string, unknown>): ArtifactToolResult {
        const rawConnections = Array.isArray(input.connections)
            ? (input.connections as Array<Record<string, unknown>>)
            : [];
        if (rawConnections.length === 0) {
            return { success: false, data: null, errorMessage: 'connect_nodes requires a non-empty connections array.' };
        }

        const page = this.getTargetPage(state, input.pageId);
        const createdIds: string[] = [];

        const findItem = (id?: unknown, label?: unknown): ServerWhiteboardItem | undefined => {
            if (typeof id === 'string' && id.trim()) {
                return page.items.find((i) => UUIDsEqual(i.ID, id.trim()));
            }
            if (typeof label === 'string' && label.trim()) {
                const lower = label.trim().toLowerCase();
                return page.items.find(
                    (i) =>
                        (i.Label ?? '').trim().toLowerCase() === lower ||
                        (i.Text ?? '').trim().toLowerCase() === lower
                );
            }
            return undefined;
        };

        for (const conn of rawConnections) {
            const fromItem = findItem(conn.fromId, conn.fromLabel);
            const toItem = findItem(conn.toId, conn.toLabel);
            if (!fromItem || !toItem) {
                continue;
            }
            const connectorId = `connector-${++state.idCounter}`;
            page.items.push({
                ID: connectorId,
                Kind: 'connector',
                Author: 'agent',
                Z: ++state.zCounter,
                FromItemID: fromItem.ID,
                ToItemID: toItem.ID
            });
            createdIds.push(connectorId);
        }

        state.seq++;
        const updatedContent = JSON.stringify(state);
        return {
            success: true,
            data: {
                connectorIds: createdIds,
                updatedContent
            }
        };
    }

    public AddStickyNotes(state: ServerWhiteboardStateJSON, input: Record<string, unknown>): ArtifactToolResult {
        const rawNotes = Array.isArray(input.notes) ? (input.notes as Array<Record<string, unknown>>) : [];
        if (rawNotes.length === 0) {
            return { success: false, data: null, errorMessage: 'add_sticky_notes requires a non-empty notes array.' };
        }

        const page = this.getTargetPage(state, input.pageId);
        const createdIds: string[] = [];

        for (let idx = 0; idx < rawNotes.length; idx++) {
            const note = rawNotes[idx];
            const text = String(note.text ?? '').trim();
            if (!text) {
                continue;
            }
            const stickyId = `sticky-${++state.idCounter}`;
            const col = idx % 3;
            const row = Math.floor(idx / 3);
            page.items.push({
                ID: stickyId,
                Kind: 'sticky',
                Author: 'agent',
                Z: ++state.zCounter,
                Text: text,
                X: typeof note.x === 'number' ? note.x : 100 + col * 210,
                Y: typeof note.y === 'number' ? note.y : 260 + row * 140,
                W: typeof note.w === 'number' ? note.w : 172,
                Tint: note.tint === 'amber-light' ? 'amber-light' : 'amber',
                Tag: typeof note.tag === 'string' ? note.tag : undefined
            });
            createdIds.push(stickyId);
        }

        state.seq++;
        const updatedContent = JSON.stringify(state);
        return {
            success: true,
            data: {
                stickyIds: createdIds,
                updatedContent
            }
        };
    }

    public DeleteElements(state: ServerWhiteboardStateJSON, input: Record<string, unknown>): ArtifactToolResult {
        const page = this.getTargetPage(state, input.pageId);
        const idSet = new Set(Array.isArray(input.ids) ? input.ids.map((x) => String(x).trim()) : []);
        const labelSet = new Set(
            Array.isArray(input.labels) ? input.labels.map((x) => String(x).trim().toLowerCase()) : []
        );

        const removedIds = new Set<string>();
        page.items = page.items.filter((item) => {
            const matchById = idSet.has(item.ID);
            const itemLabel = (item.Label ?? item.Text ?? '').trim().toLowerCase();
            const matchByLabel = itemLabel.length > 0 && labelSet.has(itemLabel);
            if (matchById || matchByLabel) {
                removedIds.add(item.ID);
                return false;
            }
            return true;
        });

        // Also remove any connectors dangling off deleted items
        page.items = page.items.filter((item) => {
            if (item.Kind !== 'connector') {
                return true;
            }
            if ((item.FromItemID && removedIds.has(item.FromItemID)) || (item.ToItemID && removedIds.has(item.ToItemID))) {
                removedIds.add(item.ID);
                return false;
            }
            return true;
        });

        state.seq++;
        const updatedContent = JSON.stringify(state);
        return {
            success: true,
            data: {
                deletedIds: Array.from(removedIds),
                remainingCount: page.items.length,
                updatedContent
            }
        };
    }

    public AutoLayout(state: ServerWhiteboardStateJSON, input: Record<string, unknown> = {}): ArtifactToolResult {
        const page = this.getTargetPage(state, input.pageId);
        const direction =
            input.direction === 'horizontal' || input.direction === 'vertical' ? input.direction : 'grid';
        const startX = typeof input.startX === 'number' ? input.startX : 80;
        const startY = typeof input.startY === 'number' ? input.startY : 80;
        const gapX = typeof input.gapX === 'number' ? input.gapX : 64;
        const gapY = typeof input.gapY === 'number' ? input.gapY : 56;

        const boxItems = page.items.filter((i) => i.Kind !== 'connector' && i.Kind !== 'ink');
        const cols =
            direction === 'horizontal'
                ? Math.max(1, boxItems.length)
                : direction === 'vertical'
                  ? 1
                  : Math.max(1, Math.ceil(Math.sqrt(boxItems.length)));

        boxItems.forEach((item, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const w = item.W ?? 180;
            const h = item.H ?? 96;
            item.X = startX + col * (w + gapX);
            item.Y = startY + row * (h + gapY);
        });

        state.seq++;
        const updatedContent = JSON.stringify(state);
        return {
            success: true,
            data: {
                arrangedCount: boxItems.length,
                direction,
                updatedContent
            }
        };
    }
}
