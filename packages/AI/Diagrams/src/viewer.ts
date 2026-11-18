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

import { DIAGRAM_CSS } from './spec.js';

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
    hasOrder: boolean;
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
/**
 * Fits a static (non-MJ) SVG to its host inside MountInteractiveDiagram's shadow root, on a white canvas in both
 * themes, since such SVGs usually assume a light page. MJ diagrams sit inside the shell, so this never matches them.
 */
const FRAME_CSS = ':host>svg{display:block;max-width:100%;height:auto;margin:0 auto;background:var(--mj-color-neutral-0,#fff)}';
/** Diagrams shrink to fit, but not below this scale (13.5px labels stay above 10px); the stage scrolls instead. */
const MIN_SCALE = 0.75;

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
  align-items: flex-start;
  padding: 6px;
}
.mjd-stage svg.mjd {
  display: block;
  flex-shrink: 0;
  max-width: 100%;
  min-width: var(--mjd-min-w, 0);
  height: auto;
  user-select: none;
}
.mjd-shell:has(.mjd-panel[data-empty="false"]) .mjd-stage {
  scroll-padding-right: 366px;
}
.mjd-shell:has(.mjd-panel[data-empty="false"]) .mjd-stage::after {
  content: "";
  flex: 0 0 360px;
  height: 1px;
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
${DIAGRAM_CSS}
svg.mjd .node, svg.mjd .card, svg.mjd .edge {
  cursor: pointer;
  transition: opacity .16s ease;
}
svg.mjd .node:focus, svg.mjd .edge:focus { outline: none; }
svg.mjd .node:focus-visible > rect:not(.step-pill),
svg.mjd .node:focus-visible > polygon,
svg.mjd .edge:focus-visible > path:not(.mjd-hit),
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
svg.mjd .edge.lit path:not(.mjd-hit), svg.mjd .edge.sel path:not(.mjd-hit) {
  stroke: var(--accent);
  stroke-width: 2.75px;
  stroke-dasharray: none;
}
svg.mjd .edge.lit[data-edge-role="error"] path:not(.mjd-hit),
svg.mjd .edge.sel[data-edge-role="error"] path:not(.mjd-hit) {
  stroke: var(--error);
}
svg.mjd .edge path.mjd-hit {
  stroke: transparent;
  stroke-width: 14px;
  fill: none;
  pointer-events: stroke;
}
svg.mjd .flow-layer { pointer-events: none; }
svg.mjd .flow-layer .comet {
  fill: none;
  stroke: var(--accent);
  stroke-width: 7px;
  stroke-linecap: round;
  opacity: .9;
  filter: drop-shadow(0 0 6px var(--accent));
}
svg.mjd .flow-layer .core {
  fill: none;
  stroke: var(--bg);
  stroke-width: 2px;
  stroke-linecap: round;
}
svg.mjd .flow-layer .token {
  fill: var(--accent);
  stroke: var(--bg);
  stroke-width: 2px;
  filter: drop-shadow(0 0 5px var(--accent));
}
svg.mjd .flow-layer .error.comet {
  stroke: var(--error);
  filter: drop-shadow(0 0 5px var(--error));
}
svg.mjd .flow-layer .error.token {
  fill: var(--error);
  filter: drop-shadow(0 0 4px var(--error));
}
svg.mjd .mjv-lit { fill: var(--accent); }
svg.mjd .mjv-lit-error { fill: var(--error); }
svg.mjd .node.arrive > rect:not(.step-pill),
svg.mjd .node.arrive > polygon {
  animation: mjv-arrive .7s ease-out;
}
@keyframes mjv-arrive {
  0% { filter: none; }
  35% { filter: drop-shadow(0 0 10px var(--accent)); }
  100% { filter: none; }
}
`;

/**
 * Adds the shell CSS once per document (or shadow root) and repairs any inline `<style>` inside `svg`
 * whose `--` custom properties or quotes were converted to en-dashes/curly quotes by markdown smartypants.
 */
function ensureStylesInjected(svg: SVGSVGElement): void {
    svg.querySelectorAll('style').forEach((s) => {
        if (s.textContent && /[\u2013\u2014\u2018\u2019\u201C\u201D]/.test(s.textContent)) {
            s.textContent = s.textContent
                .replace(/[\u2013\u2014]/g, '--')
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"');
        }
    });
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
            hasOrder: el.dataset.edgeOrder !== undefined,
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
    const title = card.getAttribute('aria-label') || card.querySelector('.ct')?.textContent || 'Summary rule';
    const body = card.querySelector('desc')?.textContent || '';
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

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEP_MS = 720;
const COMET_LEN = 46;
let viewerMarkerSeq = 0;

interface FlowStep {
    edge: EdgeRecord;
    order: number;
}

interface FlowRun {
    step: FlowStep;
    path: SVGPathElement;
    core: SVGPathElement;
    token: SVGPathElement;
    len: number;
    start: number;
    landed: boolean;
}

function deriveMarkerPrefix(svg: SVGSVGElement): string {
    const root = svg.getRootNode() as Document | ShadowRoot;
    const existing = svg.querySelector('marker[id$="-mk-line"]')?.getAttribute('id');
    const base = existing ? existing.slice(0, -'-mk-line'.length) : 'mjv';
    const candidate = `${base}-mk-lit`;
    if (typeof root.getElementById === 'function' && !root.getElementById(candidate)) {
        return base;
    }
    return `mjv-${++viewerMarkerSeq}`;
}

function ensureLitMarkers(svg: SVGSVGElement, prefix: string): void {
    const doc = svg.ownerDocument;
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = doc.createElementNS(SVG_NS, 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }
    for (const [id, cls] of [[`${prefix}-mk-lit`, 'mjv-lit'], [`${prefix}-mk-lit-error`, 'mjv-lit-error']] as const) {
        if (defs.querySelector(`[id="${id}"]`)) continue;
        const marker = doc.createElementNS(SVG_NS, 'marker');
        marker.setAttribute('id', id);
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerUnits', 'userSpaceOnUse');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '10');
        marker.setAttribute('orient', 'auto-start-reverse');
        const path = doc.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', cls);
        path.setAttribute('d', 'M0 0L10 5L0 10z');
        marker.appendChild(path);
        defs.appendChild(marker);
    }
}

function computeBeats(subset: EdgeRecord[], starts: string[], dir: 'down' | 'up' = 'down'): FlowStep[] {
    if (subset.length === 0) return [];
    if (subset.every((e) => e.hasOrder)) {
        const sorted = [...subset].sort((a, b) => (dir === 'down' ? a.order - b.order : b.order - a.order));
        return sorted.map((edge, idx) => ({ edge, order: idx }));
    }
    const dist = new Map<string, number>(starts.map((id) => [id, 0]));
    const queue = [...starts];
    const steps: FlowStep[] = [];
    while (steps.length < subset.length) {
        if (queue.length === 0) {
            const nextEdge = subset.find((e) => !steps.some((s) => s.edge === e));
            if (!nextEdge) break;
            const seed = dir === 'down' ? nextEdge.from : nextEdge.to;
            const nextBeat = steps.length ? Math.max(...steps.map((s) => s.order)) + 1 : 0;
            dist.set(seed, nextBeat);
            queue.push(seed);
        }
        const cur = queue.shift()!;
        const d = dist.get(cur) ?? 0;
        for (const e of subset) {
            const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
            if (a !== cur || steps.some((s) => s.edge === e)) continue;
            steps.push({ edge: e, order: d });
            if (!dist.has(b)) {
                dist.set(b, d + 1);
                queue.push(b);
            }
        }
    }
    if (dir === 'up') {
        const max = Math.max(0, ...steps.map((s) => s.order));
        steps.forEach((s) => { s.order = max - s.order; });
    }
    return steps;
}

function sourcesOf(subset: EdgeRecord[]): string[] {
    const froms = [...new Set(subset.map((e) => e.from))];
    const roots = froms.filter((id) => !subset.some((e) => e.to === id));
    return roots.length > 0 ? roots : subset.slice(0, 1).map((e) => e.from);
}

function createFlowRun(doc: Document, layer: SVGGElement, step: FlowStep, t0: number): FlowRun | null {
    const orig = step.edge.el.querySelector<SVGPathElement>('path:not(.mjd-hit)');
    if (!orig || typeof orig.getTotalLength !== 'function') return null;
    let len = 0;
    try { len = orig.getTotalLength(); } catch { return null; }
    if (!(len > 0)) return null;

    const isErr = step.edge.role === 'error';
    const path = orig.cloneNode(false) as SVGPathElement;
    path.removeAttribute('marker-end');
    path.removeAttribute('data-mark');
    path.setAttribute('class', isErr ? 'comet error' : 'comet');

    const core = path.cloneNode(false) as SVGPathElement;
    core.setAttribute('class', 'core');

    const token = doc.createElementNS(SVG_NS, 'path');
    token.setAttribute('d', 'M-9 -7.5L8 0L-9 7.5L-4.5 0Z');
    token.setAttribute('class', isErr ? 'token error' : 'token');

    layer.append(path, core, token);
    path.style.strokeDasharray = core.style.strokeDasharray = `${COMET_LEN} ${len + COMET_LEN}`;
    path.style.opacity = core.style.opacity = token.style.opacity = '0';
    return { step, path, core, token, len, start: t0 + step.order * STEP_MS, landed: false };
}

function stepFlowRun(r: FlowRun, now: number, period: number, onArrive: (id: string) => void): void {
    const elapsed = now - r.start;
    const ms = elapsed >= 0 ? elapsed % period : elapsed;
    const t = ms / STEP_MS;
    if (t < 0 || t > 1) {
        r.path.style.opacity = r.core.style.opacity = r.token.style.opacity = '0';
        if (t > 1 && !r.landed) {
            r.landed = true;
            onArrive(r.step.edge.to);
        }
        return;
    }
    if (r.landed) {
        r.landed = false;
        if (r.step.order === 0) onArrive(r.step.edge.from);
    }
    const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(2 - 2 * t, 2) / 2;
    const d = k * r.len;
    const p = r.path.getPointAtLength(d);
    const a = r.path.getPointAtLength(Math.max(0, d - 1));
    const b = r.path.getPointAtLength(Math.min(r.len, d + 1));
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    r.token.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${angle})`);
    r.path.style.strokeDashoffset = r.core.style.strokeDashoffset = String(COMET_LEN - d);
    r.path.style.opacity = r.core.style.opacity = r.token.style.opacity = String(Math.min(1, t * 8, (1 - t) * 8));
}

/** The interactive controller around one rendered `<svg data-mj-diagram="1">`. */
class DiagramViewer implements DiagramViewerInstance {
    private readonly shell: HTMLDivElement;
    private readonly stage: HTMLDivElement;
    private readonly panel: HTMLElement;
    private readonly live: HTMLDivElement;
    private readonly flowLayer: SVGGElement;
    private readonly index: IndexedDiagram;
    private readonly events: AbortController;
    private readonly markerPrefix: string;
    private readonly listeners = new Set<(s: DiagramViewerState) => void>();
    private selected: string | null = null;
    private selectedEdge: string | null = null;
    private activeCard: string | null = null;
    private highlighted = new Set<string>();
    private raf = 0;

    constructor(public readonly Svg: SVGSVGElement) {
        // The document's own realm: jsdom and iframes reject a signal from another window.
        this.events = new (Svg.ownerDocument.defaultView ?? globalThis).AbortController();
        Svg.classList.add('mjd');
        ensureStylesInjected(Svg);
        this.markerPrefix = deriveMarkerPrefix(Svg);
        ensureLitMarkers(Svg, this.markerPrefix);
        const dom = buildShellDom(Svg);
        this.shell = dom.shell;
        this.stage = dom.stage;
        this.panel = dom.panel;
        this.live = dom.live;
        this.index = indexDiagramElements(Svg);
        this.flowLayer = Svg.ownerDocument.createElementNS(SVG_NS, 'g');
        this.flowLayer.setAttribute('class', 'flow-layer');
        this.flowLayer.setAttribute('aria-hidden', 'true');
        Svg.appendChild(this.flowLayer);
        const viewBoxWidth = Number(Svg.getAttribute('viewBox')?.split(/[\s,]+/)[2]);
        if (viewBoxWidth > 0) this.shell.style.setProperty('--mjd-min-w', `${Math.round(viewBoxWidth * MIN_SCALE)}px`);
        this.bindEvents();
    }

    public Clear(): void {
        this.setSelection(null, null, null);
        this.highlight(null, null);
        this.panel.dataset.empty = 'true';
        this.panel.replaceChildren();
        this.stopFlow();
    }

    public Select(id: string | null): void {
        if (!id || !this.index.nodes.has(id)) {
            this.Clear();
            return;
        }
        this.setSelection(id, null, null);
        const nodes = new Set<string>([id]);
        const edges = new Set<string>();
        const inc = this.index.adjIn.get(id) || [];
        const out = this.index.adjOut.get(id) || [];
        out.forEach((e) => { edges.add(e.id); nodes.add(e.to); });
        inc.forEach((e) => { edges.add(e.id); nodes.add(e.from); });
        this.highlight(nodes, edges);
        const nodeEl = this.index.nodes.get(id)!;
        this.showPanel(buildNodePanelDom(id, nodeEl, this.index));
        nodeEl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        this.playFlow([
            ...inc.map((edge) => ({ edge, order: 0 })),
            ...out.map((edge) => ({ edge, order: inc.length > 0 ? 1 : 0 })),
        ]);
        this.live.textContent = `Selected ${getNodeLabel(this.index, id)}`;
    }

    public SelectEdge(edgeId: string | null): void {
        const edge = edgeId ? this.index.edgeById.get(edgeId) : undefined;
        if (!edge) {
            this.Clear();
            return;
        }
        this.setRovingEdge(edge.el);
        this.setSelection(null, edge.id, null);
        this.highlight(new Set([edge.from, edge.to]), new Set([edge.id]));
        this.showPanel(buildEdgePanelDom(edge, this.index));
        edge.el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        this.playFlow([{ edge, order: 0 }]);
        this.live.textContent = `Selected connection ${edge.label || `${getNodeLabel(this.index, edge.from)} to ${getNodeLabel(this.index, edge.to)}`}`;
    }

    public Trace(id: string, dir: 'up' | 'down' | 'both' = 'both'): void {
        if (!this.index.nodes.has(id)) return;
        this.setSelection(id, null, null);
        const { nodeSet, edgeSet } = traverseGraph(id, dir, this.index);
        this.highlight(nodeSet, edgeSet);
        this.showPanel(buildNodePanelDom(id, this.index.nodes.get(id)!, this.index));
        const subset = this.index.edges.filter((e) => edgeSet.has(e.id));
        const starts = dir === 'both' ? sourcesOf(subset) : [id];
        this.playFlow(computeBeats(subset, starts, dir === 'up' ? 'up' : 'down'));
    }

    public OnState(fn: (state: DiagramViewerState) => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    public Destroy(): void {
        this.listeners.clear();
        this.stopFlow();
        this.setSelection(null, null, null);
        this.highlight(null, null);
        this.events.abort();
        this.flowLayer.remove();
        this.Svg.querySelectorAll(`[id="${this.markerPrefix}-mk-lit"], [id="${this.markerPrefix}-mk-lit-error"]`).forEach((m) => m.remove());
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
        const subset = this.index.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
        this.highlight(nodes, new Set(subset.map((e) => e.id)));
        this.showPanel(buildCardPanelDom(card, ids, this.index));
        this.playFlow(computeBeats(subset, sourcesOf(subset), 'down'));
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

    private stopFlow(): void {
        const win = this.Svg.ownerDocument.defaultView ?? globalThis;
        if (this.raf && typeof win.cancelAnimationFrame === 'function') {
            win.cancelAnimationFrame(this.raf);
        }
        this.raf = 0;
        this.flowLayer.replaceChildren();
        this.index.nodes.forEach((n) => n.classList.remove('arrive'));
    }

    private arriveNode(id: string): void {
        const n = this.index.nodes.get(id);
        if (!n) return;
        n.classList.remove('arrive');
        void n.getBoundingClientRect();
        n.classList.add('arrive');
    }

    private playFlow(steps: FlowStep[]): void {
        this.stopFlow();
        const win = this.Svg.ownerDocument.defaultView ?? globalThis;
        if (!steps.length || typeof win.requestAnimationFrame !== 'function') return;
        if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

        const doc = this.Svg.ownerDocument;
        const t0 = (win.performance?.now() ?? Date.now()) + 120;
        const runs = steps
            .map((s) => createFlowRun(doc, this.flowLayer, s, t0))
            .filter((r): r is FlowRun => r !== null);
        if (!runs.length) return;

        const beats = Math.max(...steps.map((s) => s.order)) + 1;
        const period = beats * STEP_MS + 1100;
        const tick = (now: number): void => {
            for (const r of runs) {
                stepFlowRun(r, now, period, (id) => this.arriveNode(id));
            }
            this.raf = win.requestAnimationFrame(tick);
        };
        this.raf = win.requestAnimationFrame(tick);
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
            const isSel = this.selectedEdge === e.id;
            const isLit = filtered && onPath;
            e.el.classList.toggle('sel', isSel);
            e.el.classList.toggle('lit', isLit);
            e.el.classList.toggle('dim', filtered && !onPath);
            const p = e.el.querySelector<SVGPathElement>('path:not(.mjd-hit)');
            if (p) {
                if (isSel || isLit) {
                    if (!p.dataset.mark) p.dataset.mark = p.getAttribute('marker-end') ?? '';
                    p.setAttribute('marker-end', `url(#${this.markerPrefix}-mk-lit${e.role === 'error' ? '-error' : ''})`);
                } else if (p.dataset.mark !== undefined) {
                    p.setAttribute('marker-end', p.dataset.mark);
                    delete p.dataset.mark;
                }
            }
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

    private setRovingEdge(activeEl: SVGGElement): void {
        this.index.edges.forEach((e) => e.el.setAttribute('tabindex', e.el === activeEl ? '0' : '-1'));
    }

    private bindEvents(): void {
        const signal = this.events.signal;
        if (this.index.edges.length > 0) this.setRovingEdge(this.index.edges[0].el);
        const onActivate = (el: Element, act: () => void): void => {
            el.addEventListener('click', (e) => { e.stopPropagation(); act(); }, { signal });
            el.addEventListener('keydown', (e) => {
                const key = (e as KeyboardEvent).key;
                if (key === 'Enter' || key === ' ') { e.preventDefault(); act(); }
            }, { signal });
        };
        this.index.nodes.forEach((el, id) => onActivate(el, () => (this.selected === id ? this.Clear() : this.Select(id))));
        this.index.edges.forEach((edge, idx) => {
            onActivate(edge.el, () => (this.selectedEdge === edge.id ? this.Clear() : this.SelectEdge(edge.id)));
            edge.el.addEventListener('keydown', (e) => {
                const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                if (!delta) return;
                e.preventDefault();
                const next = this.index.edges[(idx + delta + this.index.edges.length) % this.index.edges.length];
                this.setRovingEdge(next.el);
                next.el.focus();
            }, { signal });
        });
        this.index.cards.forEach((card) => onActivate(card, () => this.selectCard(card)));
        this.stage.addEventListener('click', (e) => {
            const t = e.target as Element;
            if (t === this.stage || t === this.Svg || t.classList?.contains('bg')) this.Clear();
        }, { signal });
        this.shell.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); }, { signal });
        this.panel.addEventListener('click', (e) => this.onPanelClick(e), { signal });
    }

    /** One delegated handler for the close button, connection rows and trace buttons. */
    private onPanelClick(e: Event): void {
        const target = (e.target as Element).closest<HTMLElement>('[data-act], [data-jump], [data-trace]');
        if (!target) return;
        if (target.dataset.act === 'close-panel') return this.close();
        if (target.dataset.jump) {
            this.Select(target.dataset.jump);
        } else if (target.dataset.trace && this.selected) {
            this.Trace(this.selected, target.dataset.trace as 'up' | 'down');
        }
        // The clicked button was replaced by the new panel content; keep keyboard focus in the panel.
        const heading = this.panel.querySelector<HTMLElement>('h3');
        if (heading) {
            heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
        }
    }

    /** Clears, then puts focus back on what the panel was about, so keyboard users keep their place. */
    private close(): void {
        const edge = this.selectedEdge ? this.index.edgeById.get(this.selectedEdge) : undefined;
        const origin = this.index.nodes.get(this.selected ?? '') ?? edge?.el ?? this.index.cards.find((c) => c.dataset.cardId === this.activeCard);
        this.Clear();
        origin?.focus({ preventScroll: true });
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
