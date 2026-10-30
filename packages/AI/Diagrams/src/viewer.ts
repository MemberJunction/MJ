/**
 * @fileoverview Interactive viewer controller for MemberJunction Diagrams (`svg[data-mj-diagram="1"]`).
 *
 * Upgrades a static MJ Diagram SVG into an interactive diagram with:
 * - Click / keyboard selection of nodes, edges, and summary rule cards
 * - Dismissible slide-over inspector drawer with incoming/outgoing step links
 * - Upstream (`Trace back`) and downstream (`Trace forward`) graph traversal
 * - Light / dark theme synchronization using MemberJunction `--mj-*` design tokens
 *
 * Zero runtime dependencies; safe for both browser and JSDOM environments.
 *
 * @module @memberjunction/ai-diagrams/viewer
 */

export interface DiagramViewerOptions {
    /** Initial theme (`'light'` or `'dark'`). */
    Theme?: 'light' | 'dark';
}

export interface DiagramViewerState {
    Selected: string | null;
    SelectedEdge: string | null;
    Highlighted: string[];
    ActiveCard: string | null;
    Theme: 'light' | 'dark';
}

export interface DiagramViewerInstance {
    readonly Svg: SVGSVGElement;
    Clear(): void;
    Trace(id: string, dir?: 'up' | 'down' | 'both'): void;
    Select(id: string | null): void;
    SelectEdge(edgeId: string | null): void;
    SetTheme(theme: 'light' | 'dark'): void;
    GetTheme(): 'light' | 'dark';
    OnState(fn: (state: DiagramViewerState) => void): () => void;
    Destroy(): void;
    Markup?: string;
}

export interface MountInteractiveDiagramOptions {
    /** Optional HTML/SVG sanitizer callback (e.g. `MarkdownService.sanitizeHtml`). */
    Sanitize?: (rawSvg: string) => string;
    /** Initial theme (`'light'` or `'dark'`). */
    InitialTheme?: 'light' | 'dark';
}

interface EdgeRecord {
    el: SVGGElement;
    id: string;
    from: string;
    to: string;
    role: string;
    main: boolean;
    order: number;
    label: string;
}

interface IndexedDiagram {
    nodes: Map<string, SVGGElement>;
    edges: EdgeRecord[];
    edgeById: Map<string, EdgeRecord>;
    cards: SVGGElement[];
    adjOut: Map<string, EdgeRecord[]>;
    adjIn: Map<string, EdgeRecord[]>;
    laneLabels: Map<string, string>;
}

const SHELL_STYLE_ID = 'mj-diagram-viewer-styles';

const SHELL_CSS = `
.mjd-shell {
  --s-bg: var(--mj-bg-surface, #fbfbfc);
  --s-surface: var(--mj-bg-surface-card, #f3f4f7);
  --s-ink: var(--mj-text-primary, #151821);
  --s-muted: var(--mj-text-muted, #5b6372);
  --s-border: var(--mj-border-default, #d7dce4);
  --s-accent: var(--mj-brand-primary, #0e7090);
  position: relative;
  display: block;
  background: var(--s-bg);
  color: var(--s-ink);
  border: 1px solid var(--s-border);
  border-radius: 10px;
  overflow: hidden;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
}
.mjd-shell[data-theme="dark"] {
  --s-bg: #0d1117;
  --s-surface: #161b22;
  --s-ink: #e6edf3;
  --s-muted: #9198a1;
  --s-border: #30363d;
  --s-accent: #4493f8;
}
.mjd-stage {
  position: relative;
  overflow-x: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 6px;
}
.mjd-stage svg.mjd {
  display: block;
  max-width: 100%;
  height: auto;
  user-select: none;
}
.mjd-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  width: min(320px, calc(100% - 24px));
  background: var(--s-surface);
  border: 1px solid var(--s-border);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  padding: 14px 16px;
  overflow-y: auto;
  z-index: 5;
}
.mjd-panel[data-empty="true"] { display: none; }
.mjd-panel h3 { margin: 0 0 4px; font-size: 15px; padding-right: 26px; }
.mjd-panel .mjd-meta { color: var(--s-muted); font-size: 12px; margin-bottom: 10px; }
.mjd-panel .mjd-desc { line-height: 1.45; margin-bottom: 12px; }
.mjd-panel .mjd-sec {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--s-muted);
  margin: 12px 0 6px;
}
.mjd-panel .mjd-Conn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 5px;
  cursor: pointer;
}
.mjd-panel .mjd-Conn:hover { background: var(--s-bg); }
.mjd-panel .mjd-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.mjd-btn {
  padding: 4px 9px;
  border: 1px solid var(--s-border);
  background: var(--s-bg);
  color: var(--s-ink);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  line-height: 1.2;
}
.mjd-btn:hover { border-color: var(--s-accent); }
.mjd-close {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 2px 7px;
  font-size: 12px;
}
.mjd-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
svg.mjd .node, svg.mjd .card, svg.mjd .edge {
  cursor: pointer;
  transition: opacity .16s ease;
}
svg.mjd .node:focus { outline: none; }
svg.mjd .node:focus-visible > rect:not(.step-pill),
svg.mjd .node:focus-visible > polygon,
svg.mjd .card:focus-visible > rect:first-of-type {
  stroke: var(--accent);
  stroke-width: 3px;
}
svg.mjd .dim { opacity: .2; }
svg.mjd .node.sel > rect:not(.step-pill),
svg.mjd .node.sel > polygon,
svg.mjd .card.sel > rect:first-of-type {
  stroke: var(--accent);
  stroke-width: 3px;
}
svg.mjd .node.lit > rect:not(.step-pill),
svg.mjd .node.lit > polygon {
  stroke: var(--accent);
  stroke-width: 2.4px;
}
svg.mjd .edge.lit path, svg.mjd .edge.sel path {
  stroke: var(--accent);
  stroke-width: 2.75px;
  stroke-dasharray: none;
}
svg.mjd .edge path.mjd-hit {
  stroke: transparent;
  stroke-width: 14px;
  fill: none;
  pointer-events: stroke;
}
`;

function ensureStylesInjected(doc: Document): void {
    if (!doc.getElementById(SHELL_STYLE_ID)) {
        const styleEl = doc.createElement('style');
        styleEl.id = SHELL_STYLE_ID;
        styleEl.textContent = SHELL_CSS;
        doc.head.appendChild(styleEl);
    }
}

function createTextEl<K extends keyof HTMLElementTagNameMap>(
    doc: Document,
    tag: K,
    text: string,
    className?: string
): HTMLElementTagNameMap[K] {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    return el;
}

function createCloseButton(doc: Document): HTMLButtonElement {
    const btn = createTextEl(doc, 'button', '✕', 'mjd-btn mjd-close');
    btn.type = 'button';
    btn.dataset.act = 'close-panel';
    btn.setAttribute('aria-label', 'Close details');
    return btn;
}

function buildShellDom(svg: SVGSVGElement, initialTheme: 'light' | 'dark'): {
    shell: HTMLDivElement;
    stage: HTMLDivElement;
    panel: HTMLElement;
    live: HTMLDivElement;
} {
    const doc = svg.ownerDocument;
    const shell = doc.createElement('div');
    shell.className = 'mjd-shell';
    shell.dataset.theme = initialTheme;
    svg.setAttribute('data-theme', initialTheme);
    svg.parentNode?.insertBefore(shell, svg);

    const stage = doc.createElement('div');
    stage.className = 'mjd-stage';
    stage.appendChild(svg);

    const panel = doc.createElement('aside');
    panel.className = 'mjd-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.dataset.empty = 'true';

    const live = doc.createElement('div');
    live.className = 'mjd-sr';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');

    shell.append(stage, panel, live);
    return { shell, stage, panel, live };
}

function indexDiagramElements(svg: SVGSVGElement): IndexedDiagram {
    const doc = svg.ownerDocument;
    const nodes = new Map<string, SVGGElement>();
    svg.querySelectorAll<SVGGElement>('[data-node-id]').forEach((el) => {
        nodes.set(el.dataset.nodeId!, el);
    });

    const edges: EdgeRecord[] = [];
    const edgeById = new Map<string, EdgeRecord>();
    svg.querySelectorAll<SVGGElement>('[data-edge-id]').forEach((el) => {
        addEdgeHitTarget(doc, el);
        const rec: EdgeRecord = {
            el,
            id: el.dataset.edgeId!,
            from: el.dataset.edgeFrom!,
            to: el.dataset.edgeTo!,
            role: el.dataset.edgeRole || 'default',
            main: el.dataset.mainPath === 'true',
            order: Number(el.dataset.edgeOrder ?? edges.length),
            label: el.querySelector('text')?.textContent?.trim() || '',
        };
        edges.push(rec);
        edgeById.set(rec.id, rec);
    });

    const cards = [...svg.querySelectorAll<SVGGElement>('[data-card-id]')];
    const { adjOut, adjIn } = buildAdjacencyMaps(nodes, edges);
    const laneLabels = indexLaneLabels(svg);
    return { nodes, edges, edgeById, cards, adjOut, adjIn, laneLabels };
}

function addEdgeHitTarget(doc: Document, edgeGroup: SVGGElement): void {
    const pathEl = edgeGroup.querySelector<SVGPathElement>('path');
    if (pathEl && !edgeGroup.querySelector('path.mjd-hit')) {
        const hit = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        hit.setAttribute('d', pathEl.getAttribute('d') || '');
        hit.setAttribute('class', 'mjd-hit');
        edgeGroup.insertBefore(hit, pathEl);
    }
}

function buildAdjacencyMaps(
    nodes: Map<string, SVGGElement>,
    edges: EdgeRecord[]
): { adjOut: Map<string, EdgeRecord[]>; adjIn: Map<string, EdgeRecord[]> } {
    const adjOut = new Map<string, EdgeRecord[]>();
    const adjIn = new Map<string, EdgeRecord[]>();
    nodes.forEach((_, id) => {
        adjOut.set(id, []);
        adjIn.set(id, []);
    });
    edges.forEach((e) => {
        adjOut.get(e.from)?.push(e);
        adjIn.get(e.to)?.push(e);
    });
    return { adjOut, adjIn };
}

function indexLaneLabels(svg: SVGSVGElement): Map<string, string> {
    const laneLabels = new Map<string, string>();
    svg.querySelectorAll<SVGGElement>('[data-lane-id]').forEach((el) => {
        const label = el.querySelector('text')?.textContent?.trim() || el.dataset.laneId!;
        laneLabels.set(el.dataset.laneId!, label);
    });
    return laneLabels;
}

function getNodeLabel(index: IndexedDiagram, id: string): string {
    const el = index.nodes.get(id);
    return el?.dataset.label || el?.querySelector('.lbl')?.textContent || id;
}

function traverseGraph(
    startId: string,
    dir: 'up' | 'down' | 'both',
    index: IndexedDiagram
): { nodeSet: Set<string>; edgeSet: Set<string> } {
    const nodeSet = new Set<string>([startId]);
    const edgeSet = new Set<string>();
    const walk = (adj: Map<string, EdgeRecord[]>, stepKey: 'to' | 'from'): void => {
        const queue = [startId];
        while (queue.length > 0) {
            const cur = queue.shift()!;
            for (const edge of adj.get(cur) || []) {
                edgeSet.add(edge.id);
                const next = edge[stepKey];
                if (!nodeSet.has(next)) {
                    nodeSet.add(next);
                    queue.push(next);
                }
            }
        }
    };
    if (dir === 'down' || dir === 'both') walk(index.adjOut, 'to');
    if (dir === 'up' || dir === 'both') walk(index.adjIn, 'from');
    return { nodeSet, edgeSet };
}

function createConnRow(
    doc: Document,
    targetId: string,
    arrowOrPrefix: string,
    targetLabel: string,
    edgeLabel?: string
): HTMLDivElement {
    const row = doc.createElement('div');
    row.className = 'mjd-Conn';
    row.dataset.jump = targetId;
    row.append(createTextEl(doc, 'span', arrowOrPrefix), createTextEl(doc, 'strong', targetLabel));
    if (edgeLabel) {
        const note = createTextEl(doc, 'span', `· ${edgeLabel}`);
        note.style.color = 'var(--s-muted)';
        row.appendChild(note);
    }
    return row;
}

function buildNodePanelDom(id: string, el: SVGGElement, index: IndexedDiagram): Node[] {
    const doc = el.ownerDocument;
    const label = getNodeLabel(index, id);
    const kind = el.dataset.nodeKind || 'step';
    const lane = index.laneLabels.get(el.dataset.lane || '') || el.dataset.lane || '';
    const desc = el.querySelector('desc')?.textContent || '';
    const incoming = index.adjIn.get(id) || [];
    const outgoing = index.adjOut.get(id) || [];

    const actions = doc.createElement('div');
    actions.className = 'mjd-actions';
    const btnUp = createTextEl(doc, 'button', '← Trace back', 'mjd-btn');
    btnUp.type = 'button';
    btnUp.dataset.trace = 'up';
    const btnDown = createTextEl(doc, 'button', 'Trace forward →', 'mjd-btn');
    btnDown.type = 'button';
    btnDown.dataset.trace = 'down';
    actions.append(btnUp, btnDown);

    const nodes: Node[] = [
        createCloseButton(doc),
        createTextEl(doc, 'h3', label),
        createTextEl(doc, 'div', `${kind}${lane ? ` · ${lane}` : ''}`, 'mjd-meta'),
    ];
    if (desc) nodes.push(createTextEl(doc, 'div', desc, 'mjd-desc'));
    nodes.push(actions);
    if (incoming.length) {
        nodes.push(createTextEl(doc, 'div', `From (${incoming.length})`, 'mjd-sec'));
        incoming.forEach((e) => nodes.push(createConnRow(doc, e.from, '←', getNodeLabel(index, e.from), e.label)));
    }
    if (outgoing.length) {
        nodes.push(createTextEl(doc, 'div', `To (${outgoing.length})`, 'mjd-sec'));
        outgoing.forEach((e) => nodes.push(createConnRow(doc, e.to, '→', getNodeLabel(index, e.to), e.label)));
    }
    return nodes;
}

function buildEdgePanelDom(edge: EdgeRecord, index: IndexedDiagram): Node[] {
    const doc = edge.el.ownerDocument;
    const fromLabel = getNodeLabel(index, edge.from);
    const toLabel = getNodeLabel(index, edge.to);
    return [
        createCloseButton(doc),
        createTextEl(doc, 'h3', edge.label || `${fromLabel} → ${toLabel}`),
        createTextEl(doc, 'div', `connection · ${edge.role}${edge.main ? ' · main path' : ''}`, 'mjd-meta'),
        createTextEl(doc, 'div', 'Endpoints', 'mjd-sec'),
        createConnRow(doc, edge.from, 'From:', fromLabel),
        createConnRow(doc, edge.to, 'To:', toLabel),
    ];
}

function buildCardPanelDom(card: SVGGElement, nodeIds: string[], index: IndexedDiagram): Node[] {
    const doc = card.ownerDocument;
    const title = card.querySelector('.ct')?.textContent || card.getAttribute('aria-label') || 'Summary rule';
    const body = [...card.querySelectorAll('.cb')].map((t) => t.textContent).join(' ');
    const nodes: Node[] = [
        createCloseButton(doc),
        createTextEl(doc, 'h3', title),
        createTextEl(doc, 'div', `summary rule · ${nodeIds.length} linked step${nodeIds.length === 1 ? '' : 's'}`, 'mjd-meta'),
    ];
    if (body) nodes.push(createTextEl(doc, 'div', body, 'mjd-desc'));
    nodes.push(createTextEl(doc, 'div', 'Applies to', 'mjd-sec'));
    nodeIds.forEach((id) => nodes.push(createConnRow(doc, id, '→', getNodeLabel(index, id))));
    return nodes;
}

/**
 * Mounts an interactive diagram controller around a rendered `<svg data-mj-diagram="1">` element.
 */
export function MountDiagramViewer(svg: SVGSVGElement, options: DiagramViewerOptions = {}): DiagramViewerInstance {
    const doc = svg.ownerDocument;
    ensureStylesInjected(doc);

    const initialTheme: 'light' | 'dark' =
        options.Theme || (svg.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    const { shell, stage, panel, live } = buildShellDom(svg, initialTheme);
    const index = indexDiagramElements(svg);

    const state: {
        selected: string | null;
        selectedEdge: string | null;
        highlighted: Set<string>;
        activeCard: string | null;
    } = { selected: null, selectedEdge: null, highlighted: new Set(), activeCard: null };
    const listeners = new Set<(s: DiagramViewerState) => void>();

    const emitState = (): void => {
        const snapshot: DiagramViewerState = {
            Selected: state.selected,
            SelectedEdge: state.selectedEdge,
            Highlighted: [...state.highlighted],
            ActiveCard: state.activeCard,
            Theme: (shell.dataset.theme as 'light' | 'dark') || 'light',
        };
        listeners.forEach((fn) => fn(snapshot));
    };

    const applyVisualHighlight = (nodeSet: Set<string> | null, edgeSet: Set<string> | null): void => {
        const hasFilter = nodeSet !== null && nodeSet.size > 0;
        index.nodes.forEach((el, id) => {
            el.classList.toggle('sel', state.selected === id);
            el.classList.toggle('lit', Boolean(hasFilter && nodeSet!.has(id) && state.selected !== id));
            el.classList.toggle('dim', Boolean(hasFilter && !nodeSet!.has(id)));
        });
        index.edges.forEach((e) => {
            const onEdge = edgeSet ? edgeSet.has(e.id) : false;
            e.el.classList.toggle('sel', state.selectedEdge === e.id);
            e.el.classList.toggle('lit', Boolean(hasFilter && onEdge));
            e.el.classList.toggle('dim', Boolean(hasFilter && !onEdge));
        });
        index.cards.forEach((c) => c.classList.toggle('sel', state.activeCard === c.dataset.cardId));
        state.highlighted = nodeSet ? new Set(nodeSet) : new Set();
        emitState();
    };

    const bindPanelInteractions = (selectedNodeId: string | null): void => {
        panel.querySelector('[data-act="close-panel"]')?.addEventListener('click', () => clearSelection());
        panel.querySelectorAll<HTMLElement>('[data-jump]').forEach((row) => {
            row.addEventListener('click', () => selectNode(row.dataset.jump || null));
        });
        if (selectedNodeId) {
            panel.querySelectorAll<HTMLButtonElement>('[data-trace]').forEach((btn) => {
                btn.addEventListener('click', () => traceNode(selectedNodeId, btn.dataset.trace as 'up' | 'down'));
            });
        }
    };

    const clearSelection = (): void => {
        state.selected = null;
        state.selectedEdge = null;
        state.activeCard = null;
        applyVisualHighlight(null, null);
        panel.dataset.empty = 'true';
        panel.replaceChildren();
    };

    const selectNode = (id: string | null): void => {
        if (!id || !index.nodes.has(id)) {
            clearSelection();
            return;
        }
        state.selected = id;
        state.selectedEdge = null;
        state.activeCard = null;
        const nSet = new Set<string>([id]);
        const eSet = new Set<string>();
        (index.adjOut.get(id) || []).forEach((e) => { eSet.add(e.id); nSet.add(e.to); });
        (index.adjIn.get(id) || []).forEach((e) => { eSet.add(e.id); nSet.add(e.from); });
        applyVisualHighlight(nSet, eSet);
        panel.dataset.empty = 'false';
        panel.replaceChildren(...buildNodePanelDom(id, index.nodes.get(id)!, index));
        bindPanelInteractions(id);
        live.textContent = `Selected ${getNodeLabel(index, id)}`;
    };

    const selectEdge = (edgeId: string | null): void => {
        const edge = edgeId ? index.edgeById.get(edgeId) : undefined;
        if (!edge) {
            clearSelection();
            return;
        }
        state.selected = null;
        state.selectedEdge = edge.id;
        state.activeCard = null;
        applyVisualHighlight(new Set([edge.from, edge.to]), new Set([edge.id]));
        panel.dataset.empty = 'false';
        panel.replaceChildren(...buildEdgePanelDom(edge, index));
        bindPanelInteractions(null);
        live.textContent = `Selected connection ${edge.label || `${edge.from} to ${edge.to}`}`;
    };

    const selectCard = (card: SVGGElement): void => {
        const cid = card.dataset.cardId || null;
        if (state.activeCard === cid) {
            clearSelection();
            return;
        }
        state.selected = null;
        state.selectedEdge = null;
        state.activeCard = cid;
        const ids = (card.dataset.cardNodes || '').split(/\s+/).filter((id) => index.nodes.has(id));
        const nSet = new Set(ids);
        const eSet = new Set(index.edges.filter((e) => nSet.has(e.from) && nSet.has(e.to)).map((e) => e.id));
        applyVisualHighlight(nSet, eSet);
        panel.dataset.empty = 'false';
        panel.replaceChildren(...buildCardPanelDom(card, ids, index));
        bindPanelInteractions(null);
    };

    const traceNode = (id: string, dir: 'up' | 'down' | 'both' = 'both'): void => {
        if (!index.nodes.has(id)) return;
        state.selected = id;
        state.selectedEdge = null;
        state.activeCard = null;
        const { nodeSet, edgeSet } = traverseGraph(id, dir, index);
        applyVisualHighlight(nodeSet, edgeSet);
        panel.dataset.empty = 'false';
        panel.replaceChildren(...buildNodePanelDom(id, index.nodes.get(id)!, index));
        bindPanelInteractions(id);
    };

    bindSvgEvents({ svg, stage, shell, index, state, selectNode, selectEdge, selectCard, clearSelection });

    return {
        Svg: svg,
        Clear: clearSelection,
        Trace: traceNode,
        Select: selectNode,
        SelectEdge: selectEdge,
        SetTheme: (theme: 'light' | 'dark') => {
            shell.dataset.theme = theme;
            svg.setAttribute('data-theme', theme);
            emitState();
        },
        GetTheme: () => (shell.dataset.theme as 'light' | 'dark') || 'light',
        OnState: (fn) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        Destroy: () => {
            listeners.clear();
            if (shell.parentNode) {
                shell.parentNode.insertBefore(svg, shell);
                shell.remove();
            }
        },
    };
}

function bindSvgEvents(ctx: {
    svg: SVGSVGElement;
    stage: HTMLDivElement;
    shell: HTMLDivElement;
    index: IndexedDiagram;
    state: { selected: string | null; selectedEdge: string | null; activeCard: string | null };
    selectNode: (id: string | null) => void;
    selectEdge: (id: string | null) => void;
    selectCard: (card: SVGGElement) => void;
    clearSelection: () => void;
}): void {
    ctx.index.nodes.forEach((el, id) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (ctx.state.selected === id) ctx.clearSelection();
            else ctx.selectNode(id);
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                ctx.selectNode(id);
            }
        });
    });
    ctx.index.edges.forEach((edge) => {
        edge.el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (ctx.state.selectedEdge === edge.id) ctx.clearSelection();
            else ctx.selectEdge(edge.id);
        });
    });
    ctx.index.cards.forEach((card) => {
        const toggle = (e: Event): void => {
            e.stopPropagation();
            ctx.selectCard(card);
        };
        card.addEventListener('click', toggle);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle(e);
            }
        });
    });
    ctx.stage.addEventListener('click', (e) => {
        if (e.target === ctx.stage || e.target === ctx.svg || (e.target as Element).classList?.contains('bg')) {
            ctx.clearSelection();
        }
    });
    ctx.shell.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') ctx.clearSelection();
    });
}

function parseSafeSvgElement(doc: Document, markup: string): SVGSVGElement | null {
    const parserCtor = doc.defaultView?.DOMParser ?? (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!parserCtor) return null;
    const parsedDoc = new parserCtor().parseFromString(markup, 'text/html');
    const svg = parsedDoc.querySelector<SVGSVGElement>('svg[data-mj-diagram="1"], svg.mjd');
    if (!svg) return null;
    svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((el) => el.remove());
    svg.querySelectorAll('*').forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
            if (attr.name.toLowerCase().startsWith('on')) {
                el.removeAttribute(attr.name);
            }
        }
    });
    return doc.importNode(svg, true);
}

/**
 * Convenience helper for Angular hosts (`@memberjunction/ng-markdown`, `@memberjunction/ng-artifacts`).
 * Sanitizes raw SVG markup, parses the `<svg>` via DOMParser, and upgrades it with `MountDiagramViewer`.
 */
export function MountInteractiveDiagram(
    host: HTMLElement,
    svgMarkup: string,
    options: MountInteractiveDiagramOptions = {}
): DiagramViewerInstance | null {
    const cleanMarkup = options.Sanitize ? options.Sanitize(svgMarkup) : svgMarkup;
    const svg = parseSafeSvgElement(host.ownerDocument, cleanMarkup);
    if (!svg) {
        host.replaceChildren();
        return null;
    }
    host.replaceChildren(svg);
    const viewer = MountDiagramViewer(svg, {
        Theme: options.InitialTheme,
    });
    viewer.Markup = svgMarkup;
    return viewer;
}
