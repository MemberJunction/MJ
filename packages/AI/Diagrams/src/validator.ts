/**
 * @fileoverview Validator and normalizer for MemberJunction Diagram Specs.
 *
 * Produces structured, agent-actionable diagnostics (JSON path, explanation, and fix hint
 * with closest-ID suggestions) so an LLM agent can repair a malformed spec on retry.
 *
 * @module @memberjunction/ai-diagrams
 */

import {
    MJ_DIAGRAM_KINDS,
    type MJDiagramCard,
    type MJDiagramCardTone,
    type MJDiagramDiagnostic,
    type MJDiagramEdge,
    type MJDiagramEdgeRole,
    type MJDiagramKind,
    type MJDiagramLane,
    type MJDiagramLaneRole,
    type MJDiagramNode,
    type MJDiagramNodeKind,
    type MJDiagramPhase,
    type MJDiagramValidationResult,
} from './spec.js';

const MAX_NODES = 40;
const MAX_EDGES = 80;
/** Lanes, stages and participants each become a band or column, so they share the node cap. */
const MAX_LANES = MAX_NODES;
/** Summary cards render side by side under the diagram. */
const MAX_CARDS = 8;

const VALID_NODE_KINDS = new Set<MJDiagramNodeKind>([
    'start', 'end', 'task', 'decision', 'state', 'waiting',
    'success', 'error', 'database', 'external', 'participant',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

function editDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}

function suggestId(bad: string, candidates: string[]): string {
    if (!candidates.length) return '';
    let best = candidates[0];
    let bestScore = editDistance(bad, best);
    for (const c of candidates.slice(1)) {
        const d = editDistance(bad, c);
        if (d < bestScore) {
            bestScore = d;
            best = c;
        }
    }
    const hint = bestScore <= Math.max(3, Math.ceil(bad.length / 2)) ? ` Did you mean "${best}"?` : '';
    return `${hint} Valid IDs: ${candidates.map((c) => `"${c}"`).join(', ')}.`;
}

function mapNodeKind(rawKind: unknown, rawType: unknown, diagramKind: MJDiagramKind): MJDiagramNodeKind {
    const k = asString(rawKind || rawType).toLowerCase() as MJDiagramNodeKind;
    if (VALID_NODE_KINDS.has(k)) return k;
    const rawStr = asString(rawKind || rawType).toLowerCase();
    if (rawStr === 'failure' || (rawStr === 'security' && diagramKind === 'workflow')) return 'error';
    if (rawStr === 'security' && diagramKind === 'dataflow') return 'decision';
    if (rawStr === 'active') return 'state';
    if (diagramKind === 'sequence') return 'participant';
    if (diagramKind === 'lifecycle') return 'state';
    return 'task';
}

function mapLaneRole(rawRole: unknown, rawVariant: unknown, id: string): MJDiagramLaneRole {
    const r = asString(rawRole || rawVariant).toLowerCase();
    if (r === 'exceptions' || r === 'exception' || id === 'exceptions') return 'exceptions';
    if (r === 'waiting' || id === 'waiting') return 'waiting';
    if (r === 'terminal' || id === 'terminal') return 'terminal';
    return 'default';
}

function mapEdgeRole(rawRole: unknown, rawVariant: unknown): MJDiagramEdgeRole {
    const r = asString(rawRole || rawVariant).toLowerCase();
    if (r === 'error' || r === 'security' || r === 'failure') return 'error';
    if (r === 'branch') return 'branch';
    if (r === 'return') return 'return';
    if (r === 'emphasis') return 'emphasis';
    if (r === 'conditional' || r === 'dashed') return 'conditional';
    return 'default';
}

function mapCardTone(rawTone: unknown, rawDot: unknown): MJDiagramCardTone {
    const t = asString(rawTone || rawDot).toLowerCase();
    if (t === 'success' || t === 'emerald' || t === 'green') return 'success';
    if (t === 'warning' || t === 'amber' || t === 'yellow') return 'warning';
    if (t === 'error' || t === 'rose' || t === 'red') return 'error';
    if (t === 'neutral' || t === 'slate' || t === 'gray') return 'neutral';
    return 'accent';
}

function slugify(s: string, fallback: string): string {
    const lower = s.toLowerCase();
    const parts: string[] = [];
    let current = '';
    for (let i = 0; i < lower.length; i++) {
        const code = lower.charCodeAt(i);
        const isAlphaNum = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
        if (isAlphaNum) {
            current += lower[i];
        } else if (current.length > 0) {
            parts.push(current);
            current = '';
        }
    }
    if (current.length > 0) {
        parts.push(current);
    }
    return parts.length > 0 ? parts.join('-') : fallback;
}

function pushError(
    diagnostics: MJDiagramDiagnostic[],
    code: string,
    path: string,
    message: string,
    fix: string
): void {
    diagnostics.push({ Code: code, Severity: 'error', Path: path, Message: message, Fix: fix });
}

function parseRawSpecObject(
    rawInput: unknown
): { ok: boolean; raw?: Record<string, unknown>; diagnostic?: MJDiagramDiagnostic } {
    let raw: unknown = rawInput;
    if (typeof rawInput === 'string') {
        try {
            raw = JSON.parse(rawInput);
        } catch (err) {
            return {
                ok: false,
                diagnostic: {
                    Code: 'INVALID_JSON',
                    Severity: 'error',
                    Path: '$',
                    Message: `Spec is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
                    Fix: 'Pass a valid JSON object matching the MJ Diagram Spec schema.',
                },
            };
        }
    }
    if (!isRecord(raw)) {
        return {
            ok: false,
            diagnostic: {
                Code: 'INVALID_ROOT',
                Severity: 'error',
                Path: '$',
                Message: 'Diagram spec must be a JSON object.',
                Fix: 'Provide an object with "kind", "title", "lanes" (or "stages"/"participants"), "nodes" (or "states"), and "edges" (or "transitions"/"flows"/"messages").',
            },
        };
    }
    return { ok: true, raw };
}

function validateSequenceParticipants(
    raw: Record<string, unknown>,
    lanes: MJDiagramLane[],
    laneIds: Set<string>,
    diagnostics: MJDiagramDiagnostic[]
): void {
    const rawParticipants = Array.isArray(raw.participants)
        ? raw.participants
        : Array.isArray(raw.nodes)
          ? raw.nodes
          : Array.isArray(raw.lanes)
            ? raw.lanes
            : null;
    if (!rawParticipants || rawParticipants.length === 0) {
        pushError(
            diagnostics,
            'MISSING_PARTICIPANTS',
            'participants',
            'Sequence diagram requires a non-empty "participants" (or "nodes") array.',
            'Add "participants": [{ "id": "author", "label": "Author", "sublabel": "member" }, ...].'
        );
        return;
    }
    if (rawParticipants.length > MAX_LANES) {
        pushError(diagnostics, 'TOO_MANY_PARTICIPANTS', 'participants', `Diagram has ${rawParticipants.length} participants; maximum allowed is ${MAX_LANES}.`, `Merge minor parties so there are at most ${MAX_LANES} participants.`);
        return;
    }
    rawParticipants.forEach((p, idx) => {
        const path = `participants[${idx}]`;
        if (!isRecord(p)) {
            pushError(diagnostics, 'INVALID_PARTICIPANT', path, `${path} must be an object.`, 'Provide { "id": "...", "label": "..." }.');
            return;
        }
        const id = asString(p.id);
        const label = asString(p.label);
        if (!id) pushError(diagnostics, 'MISSING_PARTICIPANT_ID', `${path}.id`, `${path} is missing "id".`, 'Add a unique string "id" for each participant.');
        else if (laneIds.has(id)) pushError(diagnostics, 'DUPLICATE_PARTICIPANT_ID', `${path}.id`, `Duplicate participant id "${id}".`, 'Give each participant a distinct "id".');
        if (!label) pushError(diagnostics, 'MISSING_PARTICIPANT_LABEL', `${path}.label`, `${path} is missing "label".`, 'Add a human-readable "label" for each participant.');
        if (id && label && !laneIds.has(id)) {
            laneIds.add(id);
            lanes.push({ id, label, sublabel: asString(p.sublabel) || undefined, role: 'default' });
        }
    });
}

function validateNamedLanes(
    raw: Record<string, unknown>,
    kind: MJDiagramKind,
    lanes: MJDiagramLane[],
    laneIds: Set<string>,
    diagnostics: MJDiagramDiagnostic[]
): void {
    const laneKey = Array.isArray(raw.lanes) ? 'lanes' : Array.isArray(raw.groups) ? 'groups' : Array.isArray(raw.stages) ? 'stages' : 'lanes';
    const rawLanes = Array.isArray(raw.lanes) ? raw.lanes : Array.isArray(raw.groups) ? raw.groups : Array.isArray(raw.stages) ? raw.stages : null;
    if (!rawLanes || rawLanes.length === 0) {
        pushError(
            diagnostics,
            'MISSING_LANES',
            laneKey,
            `${kind} diagram requires a non-empty "${laneKey}" array.`,
            kind === 'dataflow'
                ? 'Add "stages": [{ "id": "attend", "label": "Attend" }, ...] (or "lanes").'
                : 'Add "lanes": [{ "id": "member", "label": "Member" }, ...].'
        );
        return;
    }
    if (rawLanes.length > MAX_LANES) {
        pushError(diagnostics, 'TOO_MANY_LANES', laneKey, `Diagram has ${rawLanes.length} ${laneKey}; maximum allowed is ${MAX_LANES}.`, `Combine ${laneKey} so there are at most ${MAX_LANES}.`);
        return;
    }
    rawLanes.forEach((l, idx) => {
        const path = `${laneKey}[${idx}]`;
        if (!isRecord(l)) {
            pushError(diagnostics, 'INVALID_LANE', path, `${path} must be an object.`, 'Provide { "id": "...", "label": "..." }.');
            return;
        }
        const label = asString(l.label);
        const id = asString(l.id) || (kind === 'dataflow' && label ? `stage-${idx}` : '');
        if (!id) pushError(diagnostics, 'MISSING_LANE_ID', `${path}.id`, `${path} is missing "id".`, `Add a unique string "id" to ${path}.`);
        else if (laneIds.has(id)) pushError(diagnostics, 'DUPLICATE_LANE_ID', `${path}.id`, `Duplicate lane id "${id}".`, 'Give every lane/group/stage a unique "id".');
        if (!label) pushError(diagnostics, 'MISSING_LANE_LABEL', `${path}.label`, `${path} is missing "label".`, `Add a non-empty "label" to ${path}.`);
        if (id && label && !laneIds.has(id)) {
            laneIds.add(id);
            lanes.push({ id, label, sublabel: asString(l.sublabel) || undefined, role: mapLaneRole(l.role, l.variant, id) });
        }
    });
}

/** A row/column hint as a whole number in 0..MAX_NODES, or undefined when absent or unusable. */
function layoutHint(v: unknown): number | undefined {
    return typeof v === 'number' && !Number.isNaN(v) ? Math.min(Math.max(Math.trunc(v), 0), MAX_NODES) : undefined;
}

function resolveNodeLaneRef(n: Record<string, unknown>, lanes: MJDiagramLane[]): string {
    let laneRef = asString(n.lane ?? n.group);
    if (!laneRef && n.stage !== undefined && n.stage !== null) {
        if (typeof n.stage === 'number' && lanes[n.stage]) {
            laneRef = lanes[n.stage].id;
        } else {
            const stageStr = asString(n.stage);
            const byLabel = lanes.find((l) => l.id === stageStr || l.label.toLowerCase() === stageStr.toLowerCase());
            laneRef = byLabel ? byLabel.id : stageStr;
        }
    }
    return laneRef;
}

function validateSingleNode(
    n: unknown,
    idx: number,
    nodeKey: string,
    kind: MJDiagramKind,
    lanes: MJDiagramLane[],
    laneIds: Set<string>,
    nodes: MJDiagramNode[],
    nodeIds: Set<string>,
    diagnostics: MJDiagramDiagnostic[]
): void {
    const path = `${nodeKey}[${idx}]`;
    if (!isRecord(n)) {
        pushError(diagnostics, 'INVALID_NODE', path, `${path} must be an object.`, 'Provide { "id": "...", "lane": "...", "label": "..." }.');
        return;
    }
    const id = asString(n.id);
    const label = asString(n.label);
    if (!id) pushError(diagnostics, 'MISSING_NODE_ID', `${path}.id`, `${path} is missing "id".`, 'Add a unique string "id" to each node.');
    else if (nodeIds.has(id)) pushError(diagnostics, 'DUPLICATE_NODE_ID', `${path}.id`, `Duplicate node id "${id}".`, 'Give every node a unique "id".');
    if (!label) pushError(diagnostics, 'MISSING_NODE_LABEL', `${path}.label`, `${path} is missing "label".`, 'Add a short, readable "label" string to each node.');

    const laneRef = resolveNodeLaneRef(n, lanes);
    if (lanes.length > 0) {
        if (!laneRef) {
            pushError(diagnostics, 'MISSING_NODE_LANE', `${path}.lane`, `Node "${id || idx}" does not specify a "lane"${kind === 'dataflow' ? ' (or "stage")' : ''}.`, `Set "lane" to one of: ${lanes.map((l) => `"${l.id}"`).join(', ')}.`);
        } else if (!laneIds.has(laneRef)) {
            pushError(diagnostics, 'UNKNOWN_NODE_LANE', `${path}.lane`, `Node "${id || idx}" references unknown lane "${laneRef}".`, `Change "${laneRef}" to an existing lane id.${suggestId(laneRef, [...laneIds])}`);
        }
    }
    if (id && label && !nodeIds.has(id)) {
        nodeIds.add(id);
        nodes.push({
            id,
            label,
            sublabel: asString(n.sublabel) || undefined,
            detail: asString(n.detail ?? n.description) || undefined,
            lane: laneRef || lanes[0]?.id,
            kind: mapNodeKind(n.kind, n.type, kind),
            step: asString(n.step) || undefined,
            col: layoutHint(n.col),
            row: layoutHint(n.row),
        });
    }
}

function validateDiagramNodes(
    raw: Record<string, unknown>,
    kind: MJDiagramKind,
    lanes: MJDiagramLane[],
    laneIds: Set<string>,
    nodes: MJDiagramNode[],
    nodeIds: Set<string>,
    diagnostics: MJDiagramDiagnostic[]
): void {
    if (kind === 'sequence') {
        for (const l of lanes) {
            nodeIds.add(l.id);
            nodes.push({ id: l.id, label: l.label, sublabel: l.sublabel, lane: l.id, kind: 'participant' });
        }
        return;
    }
    const nodeKey = Array.isArray(raw.nodes) ? 'nodes' : Array.isArray(raw.states) ? 'states' : 'nodes';
    const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : Array.isArray(raw.states) ? raw.states : null;
    if (!rawNodes || rawNodes.length === 0) {
        pushError(diagnostics, 'MISSING_NODES', nodeKey, `${kind} diagram requires a non-empty "${nodeKey}" array.`, `Add "${nodeKey}": [{ "id": "step1", "lane": "${lanes[0]?.id ?? 'main'}", "label": "..." }, ...].`);
        return;
    }
    if (rawNodes.length > MAX_NODES) {
        pushError(diagnostics, 'TOO_MANY_NODES', nodeKey, `Diagram has ${rawNodes.length} nodes; maximum allowed is ${MAX_NODES} so the diagram stays readable.`, `Combine minor steps or split the diagram so it has at most ${MAX_NODES} nodes.`);
        return;
    }
    rawNodes.forEach((n, idx) => validateSingleNode(n, idx, nodeKey, kind, lanes, laneIds, nodes, nodeIds, diagnostics));
}

function validateSingleEdge(
    e: unknown,
    idx: number,
    edgeKey: string,
    nodeIds: Set<string>,
    edgeIds: Set<string>,
    edges: MJDiagramEdge[],
    rawMessageYs: number[],
    diagnostics: MJDiagramDiagnostic[]
): void {
    const path = `${edgeKey}[${idx}]`;
    if (!isRecord(e)) {
        pushError(diagnostics, 'INVALID_EDGE', path, `${path} must be an object.`, 'Provide { "from": "...", "to": "...", "label": "..." }.');
        return;
    }
    const from = asString(e.from);
    const to = asString(e.to);
    if (!from) pushError(diagnostics, 'MISSING_EDGE_FROM', `${path}.from`, `${path} is missing "from".`, `Set "from" to a valid node id.${suggestId('', [...nodeIds])}`);
    else if (nodeIds.size > 0 && !nodeIds.has(from)) pushError(diagnostics, 'UNKNOWN_EDGE_FROM', `${path}.from`, `${path}.from references unknown node "${from}".`, `Change "from" to a defined node id.${suggestId(from, [...nodeIds])}`);
    if (!to) pushError(diagnostics, 'MISSING_EDGE_TO', `${path}.to`, `${path} is missing "to".`, `Set "to" to a valid node id.${suggestId('', [...nodeIds])}`);
    else if (nodeIds.size > 0 && !nodeIds.has(to)) pushError(diagnostics, 'UNKNOWN_EDGE_TO', `${path}.to`, `${path}.to references unknown node "${to}".`, `Change "to" to a defined node id.${suggestId(to, [...nodeIds])}`);

    if (from && from === to) pushError(diagnostics, 'SELF_LOOP_EDGE', path, `${path} goes from "${from}" to itself.`, 'Remove the edge, or describe the repeat in the node\'s "detail" instead.');

    let id = asString(e.id) || `e${idx + 1}`;
    if (edgeIds.has(id)) id = `${id}-${idx + 1}`;
    edgeIds.add(id);
    if (typeof e.y === 'number') rawMessageYs[idx] = e.y;

    if (from && to && from !== to && nodeIds.has(from) && nodeIds.has(to)) {
        edges.push({
            id,
            from,
            to,
            label: asString(e.label) || undefined,
            data: asString(e.data ?? e.classification) || undefined,
            role: mapEdgeRole(e.role, e.variant),
            phase: asString(e.phase) || undefined,
        });
    }
}

function validateDiagramEdges(
    raw: Record<string, unknown>,
    kind: MJDiagramKind,
    nodeIds: Set<string>,
    edges: MJDiagramEdge[],
    rawMessageYs: number[],
    diagnostics: MJDiagramDiagnostic[]
): string {
    const edgeKey = Array.isArray(raw.edges) ? 'edges' : Array.isArray(raw.transitions) ? 'transitions' : Array.isArray(raw.flows) ? 'flows' : Array.isArray(raw.messages) ? 'messages' : 'edges';
    const rawEdges = Array.isArray(raw.edges) ? raw.edges : Array.isArray(raw.transitions) ? raw.transitions : Array.isArray(raw.flows) ? raw.flows : Array.isArray(raw.messages) ? raw.messages : null;
    if (!rawEdges || rawEdges.length === 0) {
        pushError(diagnostics, 'MISSING_EDGES', edgeKey, `${kind} diagram requires a non-empty "${edgeKey}" array.`, `Add "${edgeKey}": [{ "from": "...", "to": "...", "label": "..." }, ...].`);
        return edgeKey;
    }
    if (rawEdges.length > MAX_EDGES) {
        pushError(diagnostics, 'TOO_MANY_EDGES', edgeKey, `Diagram has ${rawEdges.length} edges; maximum allowed is ${MAX_EDGES}.`, `Simplify the diagram so it has at most ${MAX_EDGES} edges.`);
        return edgeKey;
    }
    const edgeIds = new Set<string>();
    rawEdges.forEach((e, idx) => validateSingleEdge(e, idx, edgeKey, nodeIds, edgeIds, edges, rawMessageYs, diagnostics));
    return edgeKey;
}

function validateSequencePhases(
    raw: Record<string, unknown>,
    edges: MJDiagramEdge[],
    rawMessageYs: number[]
): MJDiagramPhase[] | undefined {
    const rawPhases = Array.isArray(raw.phases) ? raw.phases : Array.isArray(raw.segments) ? raw.segments : null;
    if (!rawPhases || rawPhases.length === 0 || edges.length === 0) return undefined;
    const phases: MJDiagramPhase[] = [];
    rawPhases.forEach((p, idx) => {
        if (!isRecord(p)) return;
        const label = asString(p.label);
        if (!label) return;
        const id = asString(p.id) || slugify(label, `phase-${idx + 1}`);
        let fromMsg = typeof p.fromMessage === 'number' ? p.fromMessage : typeof p.fromStep === 'number' ? p.fromStep : -1;
        let toMsg = typeof p.toMessage === 'number' ? p.toMessage : typeof p.toStep === 'number' ? p.toStep : -1;
        if (fromMsg < 0 && typeof p.from === 'number' && typeof p.to === 'number') {
            if (p.to < edges.length && Number.isInteger(p.from) && Number.isInteger(p.to) && rawMessageYs.length === 0) {
                fromMsg = p.from;
                toMsg = p.to;
            } else if (rawMessageYs.length > 0) {
                const matching = rawMessageYs.map((y, mIdx) => (y >= (p.from as number) && y <= (p.to as number) ? mIdx : -1)).filter((mIdx) => mIdx >= 0);
                if (matching.length > 0) {
                    fromMsg = Math.min(...matching);
                    toMsg = Math.max(...matching);
                }
            }
        }
        if (fromMsg >= 0 && toMsg >= fromMsg && fromMsg < edges.length) {
            phases.push({ id, label, fromMessage: Math.max(0, fromMsg), toMessage: Math.min(edges.length - 1, toMsg) });
        }
    });
    return phases;
}

function validateExplicitMainPath(
    rawMainPath: unknown[],
    nodeIds: Set<string>,
    edges: MJDiagramEdge[],
    edgeKey: string,
    diagnostics: MJDiagramDiagnostic[],
    warnings: MJDiagramDiagnostic[]
): string[] {
    const mp: string[] = [];
    rawMainPath.forEach((item, idx) => {
        const nid = asString(item);
        if (!nodeIds.has(nid)) {
            pushError(diagnostics, 'UNKNOWN_MAIN_PATH_NODE', `mainPath[${idx}]`, `mainPath[${idx}] references unknown node "${nid}".`, `Use a defined node id in "mainPath".${suggestId(nid, [...nodeIds])}`);
        } else {
            mp.push(nid);
        }
    });
    for (let i = 0; i < mp.length - 1; i++) {
        const a = mp[i];
        const b = mp[i + 1];
        if (!edges.some((e) => e.from === a && e.to === b)) {
            warnings.push({
                Code: 'DISCONNECTED_MAIN_PATH',
                Severity: 'warning',
                Path: `mainPath[${i + 1}]`,
                Message: `mainPath step "${a}" -> "${b}" has no direct edge in "${edgeKey}".`,
                Fix: `Add an edge from "${a}" to "${b}" or adjust "mainPath" so consecutive nodes are connected.`,
            });
        }
    }
    return mp;
}

function inferDataflowMainPath(edges: MJDiagramEdge[]): string[] | undefined {
    const emphasisEdges = edges.filter((e) => e.role === 'emphasis');
    if (emphasisEdges.length === 0) return undefined;
    const chain = [emphasisEdges[0].from];
    for (const e of emphasisEdges) {
        if (chain[chain.length - 1] === e.from) chain.push(e.to);
    }
    const visited = new Set(chain);
    let head = chain[0];
    while (true) {
        const prev = edges.find((e) => e.to === head && !visited.has(e.from));
        if (!prev) break;
        visited.add(prev.from);
        chain.unshift(prev.from);
        head = prev.from;
    }
    let tail = chain[chain.length - 1];
    while (true) {
        const next = edges.find((e) => e.from === tail && !visited.has(e.to));
        if (!next) break;
        visited.add(next.to);
        chain.push(next.to);
        tail = next.to;
    }
    return chain;
}

function resolveMainPath(
    raw: Record<string, unknown>,
    kind: MJDiagramKind,
    lanes: MJDiagramLane[],
    nodes: MJDiagramNode[],
    nodeIds: Set<string>,
    edges: MJDiagramEdge[],
    edgeKey: string,
    diagnostics: MJDiagramDiagnostic[],
    warnings: MJDiagramDiagnostic[]
): string[] | undefined {
    if (Array.isArray(raw.mainPath) && raw.mainPath.length > 0) {
        return validateExplicitMainPath(raw.mainPath, nodeIds, edges, edgeKey, diagnostics, warnings);
    }
    if (kind === 'lifecycle') {
        const stepped = nodes.filter((n) => n.step).sort((a, b) => String(a.step).localeCompare(String(b.step)));
        if (stepped.length >= 2) return stepped.map((n) => n.id);
        if (lanes[0]) {
            const primary = nodes.filter((n) => n.lane === lanes[0].id).map((n) => n.id);
            if (primary.length >= 2) return primary;
        }
    }
    if (kind === 'dataflow') return inferDataflowMainPath(edges);
    return undefined;
}

function validateSingleCard(
    c: unknown,
    idx: number,
    nodes: MJDiagramNode[],
    nodeIds: Set<string>,
    mainPath: string[] | undefined,
    cards: MJDiagramCard[],
    diagnostics: MJDiagramDiagnostic[]
): void {
    const path = `cards[${idx}]`;
    if (!isRecord(c)) {
        pushError(diagnostics, 'INVALID_CARD', path, `${path} must be an object.`, 'Provide { "id": "...", "title": "...", "body": "...", "nodes": ["..."] }.');
        return;
    }
    const cTitle = asString(c.title);
    if (!cTitle) {
        pushError(diagnostics, 'MISSING_CARD_TITLE', `${path}.title`, `${path} is missing "title".`, 'Add a non-empty "title" to the summary card.');
        return;
    }
    const cId = asString(c.id) || slugify(cTitle, `card-${idx + 1}`);
    const items = Array.isArray(c.items) ? c.items.map((x) => asString(x)).filter(Boolean) : undefined;
    const body = asString(c.body) || (items ? items.join(' · ') : '');

    let cardNodes: string[] = [];
    if (Array.isArray(c.nodes) && c.nodes.length > 0) {
        c.nodes.forEach((nidRaw, nIdx) => {
            const nid = asString(nidRaw);
            if (!nodeIds.has(nid)) pushError(diagnostics, 'UNKNOWN_CARD_NODE', `${path}.nodes[${nIdx}]`, `${path}.nodes[${nIdx}] references unknown node "${nid}".`, `Use a defined node id in card.nodes.${suggestId(nid, [...nodeIds])}`);
            else cardNodes.push(nid);
        });
    } else {
        const text = `${cTitle} ${body}`.toLowerCase();
        const matched = nodes.filter((n) => `${n.label} ${n.sublabel ?? ''}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4).some((w) => text.includes(w))).map((n) => n.id);
        cardNodes = matched.length > 0 ? matched : mainPath ?? nodes.map((n) => n.id);
    }
    cards.push({ id: cId, title: cTitle, body, items, nodes: cardNodes, tone: mapCardTone(c.tone, c.dot) });
}

/**
 * Validates and normalizes an input diagram specification.
 */
export function ValidateDiagramSpec(rawInput: unknown, fallbackKind?: string): MJDiagramValidationResult {
    const parsed = parseRawSpecObject(rawInput);
    if (!parsed.ok || !parsed.raw) return { Valid: false, Diagnostics: [parsed.diagnostic!] };
    const raw = parsed.raw;

    const diagnostics: MJDiagramDiagnostic[] = [];
    const warnings: MJDiagramDiagnostic[] = [];

    const rawKind = asString(raw.kind ?? raw.diagram_type ?? fallbackKind).toLowerCase();
    if (!MJ_DIAGRAM_KINDS.includes(rawKind as MJDiagramKind)) {
        pushError(diagnostics, 'INVALID_KIND', 'kind', rawKind ? `Unknown diagram kind "${rawKind}".` : 'Missing required "kind" field.', `Set "kind" to one of: ${MJ_DIAGRAM_KINDS.map((k) => `"${k}"`).join(', ')}.`);
        return { Valid: false, Diagnostics: diagnostics };
    }
    const kind = rawKind as MJDiagramKind;

    const meta = isRecord(raw.meta) ? raw.meta : {};
    const title = asString(raw.title ?? meta.title);
    if (!title) pushError(diagnostics, 'MISSING_TITLE', 'title', 'Diagram spec is missing a "title".', 'Add a non-empty "title" string at the root of the spec (e.g. "How do I renew my certification?").');
    const subtitle = asString(raw.subtitle ?? meta.subtitle) || undefined;

    const lanes: MJDiagramLane[] = [];
    const laneIds = new Set<string>();
    if (kind === 'sequence') validateSequenceParticipants(raw, lanes, laneIds, diagnostics);
    else validateNamedLanes(raw, kind, lanes, laneIds, diagnostics);

    const nodes: MJDiagramNode[] = [];
    const nodeIds = new Set<string>();
    validateDiagramNodes(raw, kind, lanes, laneIds, nodes, nodeIds, diagnostics);

    const edges: MJDiagramEdge[] = [];
    const rawMessageYs: number[] = [];
    const edgeKey = validateDiagramEdges(raw, kind, nodeIds, edges, rawMessageYs, diagnostics);

    const phases = validateSequencePhases(raw, edges, rawMessageYs);
    const mainPath = resolveMainPath(raw, kind, lanes, nodes, nodeIds, edges, edgeKey, diagnostics, warnings);

    let cards: MJDiagramCard[] | undefined;
    if (Array.isArray(raw.cards) && raw.cards.length > MAX_CARDS) {
        pushError(diagnostics, 'TOO_MANY_CARDS', 'cards', `Diagram has ${raw.cards.length} summary cards; maximum allowed is ${MAX_CARDS}.`, `Keep the ${MAX_CARDS} most important rules as cards.`);
    } else if (Array.isArray(raw.cards) && raw.cards.length > 0) {
        cards = [];
        raw.cards.forEach((c, idx) => validateSingleCard(c, idx, nodes, nodeIds, mainPath, cards!, diagnostics));
    }

    if (diagnostics.length > 0) return { Valid: false, Diagnostics: diagnostics };
    return { Valid: true, Spec: { kind, title, subtitle, lanes, nodes, edges, phases, mainPath, cards }, Warnings: warnings };
}
