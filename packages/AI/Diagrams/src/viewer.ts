/**
 * @fileoverview Interactive viewer controller for MemberJunction Diagrams (`svg[data-mj-diagram="1"]`).
 *
 * Upgrades a static MJ Diagram SVG into an interactive diagram with:
 * - Click / keyboard selection of nodes, edges, and summary rule cards
 * - Dismissible slide-over inspector drawer with incoming/outgoing step links
 * - Upstream (`Trace back`) and downstream (`Trace forward`) graph traversal
 * - Colors from MemberJunction `--mj-*` design tokens, so light and dark mode follow the host
 *
 * Zero runtime dependencies; safe for both browser and JSDOM environments.
 *
 * @module @memberjunction/ai-diagrams/viewer
 */

export interface DiagramViewerState {
    Selected: string | null;
    SelectedEdge: string | null;
    Highlighted: string[];
    ActiveCard: string | null;
}

export interface DiagramViewerInstance {
    readonly Svg: SVGSVGElement;
    Clear(): void;
    Trace(id: string, dir?: 'up' | 'down' | 'both'): void;
    Select(id: string | null): void;
    SelectEdge(edgeId: string | null): void;
    OnState(fn: (state: DiagramViewerState) => void): () => void;
    /** Removes the viewer's listeners, highlight classes, hit paths and shell, leaving the original SVG. */
    Destroy(): void;
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
/** Fits a static SVG to its host inside MountInteractiveDiagram's shadow root. */
const FRAME_CSS = ':host>svg{display:block;max-width:100%;height:auto;margin:0 auto}';

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
  box-shadow: var(--mj-shadow-lg, 0 10px 28px rgba(0, 0, 0, 0.16));
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
.mjd-panel .mjd-conn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 6px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.mjd-panel .mjd-conn:hover, .mjd-panel .mjd-conn:focus-visible { background: var(--s-bg); }
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

/** Adds the shell CSS once per document, or once per shadow root, since document styles do not reach inside one. */
function ensureStylesInjected(svg: SVGSVGElement): void {
    const doc = svg.ownerDocument;
    const root = svg.getRootNode();
    const target = root.nodeType === root.DOCUMENT_FRAGMENT_NODE ? (root as ShadowRoot) : doc;
    if (!target.getElementById(SHELL_STYLE_ID)) {
        const styleEl = doc.createElement('style');
        styleEl.id = SHELL_STYLE_ID;
        styleEl.textContent = SHELL_CSS;
        (target === doc ? doc.head : target).appendChild(styleEl);
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

function buildShellDom(svg: SVGSVGElement): {
    shell: HTMLDivElement;
    stage: HTMLDivElement;
    panel: HTMLElement;
    live: HTMLDivElement;
} {
    const doc = svg.ownerDocument;
    const shell = doc.createElement('div');
    shell.className = 'mjd-shell';
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
): HTMLButtonElement {
    const row = doc.createElement('button');
    row.type = 'button';
    row.className = 'mjd-conn';
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

type HighlightSet = Set<string> | null;

/** The interactive controller around one rendered `<svg data-mj-diagram="1">`. */
class DiagramViewer implements DiagramViewerInstance {
    private readonly shell: HTMLDivElement;
    private readonly stage: HTMLDivElement;
    private readonly panel: HTMLElement;
    private readonly live: HTMLDivElement;
    private readonly index: IndexedDiagram;
    private readonly events: AbortController;
    private readonly listeners = new Set<(s: DiagramViewerState) => void>();
    private selected: string | null = null;
    private selectedEdge: string | null = null;
    private activeCard: string | null = null;
    private highlighted = new Set<string>();

    constructor(public readonly Svg: SVGSVGElement) {
        // The document's own realm: jsdom and iframes reject a signal from another window.
        this.events = new (Svg.ownerDocument.defaultView ?? globalThis).AbortController();
        ensureStylesInjected(Svg);
        const dom = buildShellDom(Svg);
        this.shell = dom.shell;
        this.stage = dom.stage;
        this.panel = dom.panel;
        this.live = dom.live;
        this.index = indexDiagramElements(Svg);
        this.bindEvents();
    }

    public Clear(): void {
        this.setSelection(null, null, null);
        this.highlight(null, null);
        this.panel.dataset.empty = 'true';
        this.panel.replaceChildren();
    }

    public Select(id: string | null): void {
        if (!id || !this.index.nodes.has(id)) {
            this.Clear();
            return;
        }
        this.setSelection(id, null, null);
        const nodes = new Set<string>([id]);
        const edges = new Set<string>();
        (this.index.adjOut.get(id) || []).forEach((e) => { edges.add(e.id); nodes.add(e.to); });
        (this.index.adjIn.get(id) || []).forEach((e) => { edges.add(e.id); nodes.add(e.from); });
        this.highlight(nodes, edges);
        this.showPanel(buildNodePanelDom(id, this.index.nodes.get(id)!, this.index));
        this.live.textContent = `Selected ${getNodeLabel(this.index, id)}`;
    }

    public SelectEdge(edgeId: string | null): void {
        const edge = edgeId ? this.index.edgeById.get(edgeId) : undefined;
        if (!edge) {
            this.Clear();
            return;
        }
        this.setSelection(null, edge.id, null);
        this.highlight(new Set([edge.from, edge.to]), new Set([edge.id]));
        this.showPanel(buildEdgePanelDom(edge, this.index));
        this.live.textContent = `Selected connection ${edge.label || `${edge.from} to ${edge.to}`}`;
    }

    public Trace(id: string, dir: 'up' | 'down' | 'both' = 'both'): void {
        if (!this.index.nodes.has(id)) return;
        this.setSelection(id, null, null);
        const { nodeSet, edgeSet } = traverseGraph(id, dir, this.index);
        this.highlight(nodeSet, edgeSet);
        this.showPanel(buildNodePanelDom(id, this.index.nodes.get(id)!, this.index));
    }

    public OnState(fn: (state: DiagramViewerState) => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    public Destroy(): void {
        this.listeners.clear();
        this.Clear();
        this.events.abort();
        this.Svg.querySelectorAll('path.mjd-hit').forEach((hit) => hit.remove());
        if (this.shell.parentNode) {
            this.shell.parentNode.insertBefore(this.Svg, this.shell);
            this.shell.remove();
        }
    }

    private selectCard(card: SVGGElement): void {
        const cid = card.dataset.cardId || null;
        if (this.activeCard === cid) {
            this.Clear();
            return;
        }
        this.setSelection(null, null, cid);
        const ids = (card.dataset.cardNodes || '').split(/\s+/).filter((id) => this.index.nodes.has(id));
        const nodes = new Set(ids);
        this.highlight(nodes, new Set(this.index.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)).map((e) => e.id)));
        this.showPanel(buildCardPanelDom(card, ids, this.index));
    }

    private setSelection(node: string | null, edge: string | null, card: string | null): void {
        this.selected = node;
        this.selectedEdge = edge;
        this.activeCard = card;
    }

    private showPanel(content: Node[]): void {
        this.panel.dataset.empty = 'false';
        this.panel.replaceChildren(...content);
    }

    private highlight(nodeSet: HighlightSet, edgeSet: HighlightSet): void {
        const filtered = nodeSet !== null && nodeSet.size > 0;
        this.index.nodes.forEach((el, id) => {
            el.classList.toggle('sel', this.selected === id);
            el.classList.toggle('lit', filtered && nodeSet!.has(id) && this.selected !== id);
            el.classList.toggle('dim', filtered && !nodeSet!.has(id));
        });
        this.index.edges.forEach((e) => {
            const onPath = edgeSet?.has(e.id) ?? false;
            e.el.classList.toggle('sel', this.selectedEdge === e.id);
            e.el.classList.toggle('lit', filtered && onPath);
            e.el.classList.toggle('dim', filtered && !onPath);
        });
        this.index.cards.forEach((c) => c.classList.toggle('sel', this.activeCard === c.dataset.cardId));
        this.highlighted = nodeSet ? new Set(nodeSet) : new Set();
        const snapshot: DiagramViewerState = {
            Selected: this.selected,
            SelectedEdge: this.selectedEdge,
            Highlighted: [...this.highlighted],
            ActiveCard: this.activeCard,
        };
        this.listeners.forEach((fn) => fn(snapshot));
    }

    private bindEvents(): void {
        const signal = this.events.signal;
        const onActivate = (el: Element, act: () => void): void => {
            el.addEventListener('click', (e) => { e.stopPropagation(); act(); }, { signal });
            el.addEventListener('keydown', (e) => {
                const key = (e as KeyboardEvent).key;
                if (key === 'Enter' || key === ' ') { e.preventDefault(); act(); }
            }, { signal });
        };
        this.index.nodes.forEach((el, id) => onActivate(el, () => (this.selected === id ? this.Clear() : this.Select(id))));
        this.index.edges.forEach((edge) =>
            edge.el.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.selectedEdge === edge.id) this.Clear();
                else this.SelectEdge(edge.id);
            }, { signal })
        );
        this.index.cards.forEach((card) => onActivate(card, () => this.selectCard(card)));
        this.stage.addEventListener('click', (e) => {
            const t = e.target as Element;
            if (t === this.stage || t === this.Svg || t.classList?.contains('bg')) this.Clear();
        }, { signal });
        this.shell.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.Clear(); }, { signal });
        this.panel.addEventListener('click', (e) => this.onPanelClick(e), { signal });
    }

    /** One delegated handler for the close button, connection rows and trace buttons. */
    private onPanelClick(e: Event): void {
        const target = (e.target as Element).closest<HTMLElement>('[data-act], [data-jump], [data-trace]');
        if (!target) return;
        if (target.dataset.act === 'close-panel') this.Clear();
        else if (target.dataset.jump) this.Select(target.dataset.jump);
        else if (target.dataset.trace && this.selected) this.Trace(this.selected, target.dataset.trace as 'up' | 'down');
    }
}

/**
 * Mounts an interactive diagram controller around a rendered `<svg data-mj-diagram="1">` that is already
 * in the document and already sanitized (for example by `MarkdownService.Parse`).
 */
export function MountDiagramViewer(svg: SVGSVGElement): DiagramViewerInstance {
    return new DiagramViewer(svg);
}

/** The first `<svg>` in the markup, imported into `doc`, or null when there is none. */
function parseFirstSvg(doc: Document, markup: string): SVGSVGElement | null {
    const parserCtor = doc.defaultView?.DOMParser ?? (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!parserCtor) return null;
    const svg = new parserCtor().parseFromString(markup, 'text/html').querySelector<SVGSVGElement>('svg');
    return svg ? doc.importNode(svg, true) : null;
}

/**
 * Shows untrusted SVG markup in `host`: it is run through `sanitize` first (required; use
 * `MarkdownService.SanitizeHtml` in Angular hosts), then mounted interactively when it carries the MJ Diagram
 * contract (`data-mj-diagram="1"`), or shown as a static SVG otherwise. Returns the viewer, or null when the
 * markup is not an MJ diagram.
 *
 * Sanitizing keeps `<style>`, so the SVG is placed in a shadow root, where its CSS cannot select anything on the
 * page, and `host` gets paint containment, so `position: fixed` or `:host` rules cannot draw outside it.
 */
export function MountInteractiveDiagram(
    host: HTMLElement,
    svgMarkup: string,
    sanitize: (rawSvg: string) => string
): DiagramViewerInstance | null {
    const doc = host.ownerDocument;
    const svg = parseFirstSvg(doc, sanitize(svgMarkup));
    const frame = doc.createElement('div');
    const fit = doc.createElement('style');
    fit.textContent = FRAME_CSS;
    frame.attachShadow({ mode: 'open' }).append(fit, ...(svg ? [svg] : []));
    host.style.contain = 'paint';
    host.replaceChildren(frame);
    return svg?.matches('svg[data-mj-diagram="1"], svg.mjd') ? MountDiagramViewer(svg) : null;
}
