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

function escapeHtml(text: string): string {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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

function renderNodePanelHtml(id: string, el: SVGGElement, index: IndexedDiagram): string {
    const label = getNodeLabel(index, id);
    const kind = el.dataset.nodeKind || 'step';
    const lane = index.laneLabels.get(el.dataset.lane || '') || el.dataset.lane || '';
    const desc = el.querySelector('desc')?.textContent || '';
    const incoming = index.adjIn.get(id) || [];
    const outgoing = index.adjOut.get(id) || [];

    const renderConn = (e: EdgeRecord, targetId: string, arrow: string): string =>
        `<div class="mjd-Conn" data-jump="${escapeHtml(targetId)}"><span>${arrow}</span><strong>${escapeHtml(getNodeLabel(index, targetId))}</strong>${e.label ? `<span style="color:var(--s-muted)">· ${escapeHtml(e.label)}</span>` : ''}</div>`;

    return (
        `<button type="button" class="mjd-btn mjd-close" data-act="close-panel" aria-label="Close details">✕</button>` +
        `<h3>${escapeHtml(label)}</h3>` +
        `<div class="mjd-meta">${escapeHtml(kind)}${lane ? ` · ${escapeHtml(lane)}` : ''}</div>` +
        (desc ? `<div class="mjd-desc">${escapeHtml(desc)}</div>` : '') +
        `<div class="mjd-actions">` +
        `<button type="button" class="mjd-btn" data-trace="up">← Trace back</button>` +
        `<button type="button" class="mjd-btn" data-trace="down">Trace forward →</button>` +
        `</div>` +
        (incoming.length ? `<div class="mjd-sec">From (${incoming.length})</div>${incoming.map((e) => renderConn(e, e.from, '←')).join('')}` : '') +
        (outgoing.length ? `<div class="mjd-sec">To (${outgoing.length})</div>${outgoing.map((e) => renderConn(e, e.to, '→')).join('')}` : '')
    );
}

function renderEdgePanelHtml(edge: EdgeRecord, index: IndexedDiagram): string {
    const fromLabel = getNodeLabel(index, edge.from);
    const toLabel = getNodeLabel(index, edge.to);
    return (
        `<button type="button" class="mjd-btn mjd-close" data-act="close-panel" aria-label="Close details">✕</button>` +
        `<h3>${escapeHtml(edge.label || `${fromLabel} → ${toLabel}`)}</h3>` +
        `<div class="mjd-meta">connection · ${escapeHtml(edge.role)}${edge.main ? ' · main path' : ''}</div>` +
        `<div class="mjd-sec">Endpoints</div>` +
        `<div class="mjd-Conn" data-jump="${escapeHtml(edge.from)}"><span>From:</span><strong>${escapeHtml(fromLabel)}</strong></div>` +
        `<div class="mjd-Conn" data-jump="${escapeHtml(edge.to)}"><span>To:</span><strong>${escapeHtml(toLabel)}</strong></div>`
    );
}

function renderCardPanelHtml(card: SVGGElement, nodeIds: string[], index: IndexedDiagram): string {
    const title = card.querySelector('.ct')?.textContent || card.getAttribute('aria-label') || 'Summary rule';
    const body = [...card.querySelectorAll('.cb')].map((t) => t.textContent).join(' ');
    const stepsHtml = nodeIds
        .map((id) => `<div class="mjd-Conn" data-jump="${escapeHtml(id)}"><span>→</span><strong>${escapeHtml(getNodeLabel(index, id))}</strong></div>`)
        .join('');
    return (
        `<button type="button" class="mjd-btn mjd-close" data-act="close-panel" aria-label="Close details">✕</button>` +
        `<h3>${escapeHtml(title)}</h3>` +
        `<div class="mjd-meta">summary rule · ${nodeIds.length} linked step${nodeIds.length === 1 ? '' : 's'}</div>` +
        (body ? `<div class="mjd-desc">${escapeHtml(body)}</div>` : '') +
        `<div class="mjd-sec">Applies to</div>${stepsHtml}`
    );
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
        panel.innerHTML = '';
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
        panel.innerHTML = renderNodePanelHtml(id, index.nodes.get(id)!, index);
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
        panel.innerHTML = renderEdgePanelHtml(edge, index);
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
        panel.innerHTML = renderCardPanelHtml(card, ids, index);
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
        panel.innerHTML = renderNodePanelHtml(id, index.nodes.get(id)!, index);
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

/**
 * Convenience helper for Angular hosts (`@memberjunction/ng-markdown`, `@memberjunction/ng-artifacts`).
 * Sanitizes raw SVG markup, inserts it into `host`, and upgrades it with `MountDiagramViewer`.
 */
export function MountInteractiveDiagram(
    host: HTMLElement,
    svgMarkup: string,
    options: MountInteractiveDiagramOptions = {}
): DiagramViewerInstance | null {
    const cleanMarkup = options.Sanitize ? options.Sanitize(svgMarkup) : svgMarkup;
    host.innerHTML = cleanMarkup;
    const svg = host.querySelector<SVGSVGElement>('svg[data-mj-diagram="1"], svg.mjd');
    if (!svg) return null;
    const viewer = MountDiagramViewer(svg, {
        Theme: options.InitialTheme,
    });
    viewer.Markup = svgMarkup;
    return viewer;
}
