import { MJAIAgentRunStepEntity, MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIAgentRunDataHelper } from '../ai-agent-run-data.service';

/** Root-agent icon, resolved by the caller from the run's agent metadata. */
export interface RootIcon { iconClass: string; logoUrl: string | null; }

/**
 * Shared, framework-agnostic flow model for the Agent Run "Flow" visualizations.
 *
 * One adapter (`buildFlowModel`) turns the raw step / sub-run / prompt-run data
 * from {@link AIAgentRunDataHelper} into a normalized {@link FlowNode} tree that
 * every renderer (Flame Cascade, Subway Lines, Constellation, …) consumes.
 *
 * Two clocks are baked into each node:
 *  - **playback time** (`t0`/`t1`, range 0..1): compressed so every step gets
 *    visible airtime regardless of real duration. This is what the scrubber drives.
 *  - **real time** (`r0`/`r1`, seconds): the true cumulative wall-clock, used for
 *    the digital clock readout and the narration rail.
 *
 * True duration is therefore never encoded as literal playback width — renderers
 * surface it through a *visual* channel (heat glow, node size, sweep speed).
 */
export type FlowNodeType =
  | 'agent' | 'subagent' | 'prompt' | 'action' | 'decision' | 'loop' | 'validation' | 'other';

export interface FlowNode {
  /** Stable index within the flattened model (renderer scratch keys off this). */
  id: number;
  name: string;
  type: FlowNodeType;
  status: string;
  model: string | null;
  /** Real duration in seconds (container nodes = sum of children). */
  realDur: number;
  /** Normalized playback window [0..1]. */
  t0: number;
  t1: number;
  tmid: number;
  /** Real cumulative wall-clock window in seconds. */
  r0: number;
  r1: number;
  depth: number;
  /** Relative heat tier 0..3 (3 = among the longest steps in this run). */
  heat: 0 | 1 | 2 | 3;
  parent: FlowNode | null;
  children: FlowNode[];
  /** Underlying step entity (null for the synthetic root). Enables click-through. */
  raw: MJAIAgentRunStepEntity | null;
  /** Font Awesome class (e.g. 'fa-brain'); sub-agents resolve their agent's icon. */
  iconClass: string;
  /** Agent logo image URL when available (sub-agents / root), else null. */
  logoUrl: string | null;
}

export interface FlowModel {
  root: FlowNode;
  nodes: FlowNode[];
  leaves: FlowNode[];
  total: number;
  maxDepth: number;
  maxLeafDur: number;
}

/** Categorical data-visualization palette (per CLAUDE.md, chart colors may be literal). */
export const FLOW_COLORS: Record<FlowNodeType, string> = {
  agent: '#11a8e6', subagent: '#f59e0b', prompt: '#3b82f6', action: '#22c55e',
  decision: '#ef4444', loop: '#a855f7', validation: '#14b8a6', other: '#94a3b8'
};

export const FLOW_EMOJI: Record<FlowNodeType, string> = {
  agent: '🤖', subagent: '🤖', prompt: '💬', action: '⚙️',
  decision: '🔀', loop: '🔁', validation: '✓', other: '•'
};

/** Font Awesome icon per type — mirrors the Timeline's step icons. */
export const FLOW_ICON: Record<FlowNodeType, string> = {
  agent: 'fa-robot', subagent: 'fa-robot', prompt: 'fa-brain', action: 'fa-wrench',
  decision: 'fa-code-branch', loop: 'fa-repeat', validation: 'fa-square-check', other: 'fa-circle'
};

export const FLOW_LABEL: Record<FlowNodeType, string> = {
  agent: 'Agent run', subagent: 'Sub-agent', prompt: 'Prompt', action: 'Action',
  decision: 'Decision', loop: 'Loop', validation: 'Validation', other: 'Step'
};

function flowType(stepType: string | null | undefined): FlowNodeType {
  switch (stepType) {
    case 'Prompt': return 'prompt';
    case 'Actions':
    case 'Tool': return 'action';
    case 'Sub-Agent': return 'subagent';
    case 'Decision': return 'decision';
    case 'ForEach':
    case 'While': return 'loop';
    case 'Validation': return 'validation';
    default: return 'other';
  }
}

/** Compression curve: longer steps still get more airtime, but sub-linearly. */
function comp(d: number): number { return Math.pow(Math.max(d, 0.001), 0.55); }

function durationSeconds(start: Date | null | undefined, end: Date | null | undefined): number {
  if (!start) return 0.1;
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.max(0.05, (e - s) / 1000);
}

/** Resolve a step's icon: sub-agents use their agent's logo/icon, else the type icon. */
function stepIcon(step: MJAIAgentRunStepEntity, type: FlowNodeType): { iconClass: string; logoUrl: string | null } {
  if (step.StepType === 'Sub-Agent' && step.TargetID) {
    const agent = AIEngineBase.Instance.Agents.find(a => UUIDsEqual(a.ID, step.TargetID!));
    if (agent?.LogoURL) return { iconClass: 'fa-robot', logoUrl: agent.LogoURL };
    if (agent?.IconClass) return { iconClass: agent.IconClass, logoUrl: null };
  }
  return { iconClass: FLOW_ICON[type], logoUrl: null };
}

function makeStepNode(step: MJAIAgentRunStepEntity, promptRuns: MJAIPromptRunEntity[]): FlowNode {
  const type = flowType(step.StepType);
  let model: string | null = null;
  if (type === 'prompt' && step.TargetLogID) {
    const pr = promptRuns.find(p => UUIDsEqual(p.ID, step.TargetLogID!));
    model = pr?.Model ?? null;
  }
  const icon = stepIcon(step, type);
  return {
    id: -1, name: step.StepName || `Step ${step.StepNumber}`, type, status: step.Status,
    model, realDur: durationSeconds(step.StartedAt, step.CompletedAt),
    t0: 0, t1: 0, tmid: 0, r0: 0, r1: 0, depth: 0, heat: 0,
    parent: null, children: [], raw: step, iconClass: icon.iconClass, logoUrl: icon.logoUrl
  };
}

/**
 * Recursively attach a level of steps to `parent`, nesting both loop bodies
 * (`ParentID`) and sub-agent runs (`Sub-Agent` step → its own run's steps).
 */
async function attachStepTree(
  parent: FlowNode,
  steps: MJAIAgentRunStepEntity[],
  promptRuns: MJAIPromptRunEntity[],
  helper: AIAgentRunDataHelper
): Promise<void> {
  const byId = new Map<string, FlowNode>();
  steps.forEach(s => byId.set(s.ID, makeStepNode(s, promptRuns)));

  // Nest loop bodies via ParentID; everything else hangs off `parent`.
  for (const s of steps) {
    const node = byId.get(s.ID)!;
    if (s.ParentID && byId.has(s.ParentID)) {
      const par = byId.get(s.ParentID)!;
      node.parent = par; par.children.push(node);
    } else {
      node.parent = parent; parent.children.push(node);
    }
  }

  // Recurse into sub-agent steps (their child steps need a separate load).
  for (const s of steps) {
    if (s.StepType === 'Sub-Agent' && s.TargetLogID) {
      const node = byId.get(s.ID)!;
      try {
        const sub = await helper.loadSubAgentData(s.TargetLogID);
        if (sub.steps?.length) {
          await attachStepTree(node, sub.steps, sub.promptRuns, helper);
        }
      } catch {
        // Sub-agent load failed — leave it as a leaf with its own timing.
      }
    }
  }
}

function calcDur(n: FlowNode): number {
  if (n.children.length) n.realDur = n.children.reduce((s, c) => s + calcDur(c), 0);
  return n.realDur;
}

function assignT(n: FlowNode, t0: number, t1: number): void {
  n.t0 = t0; n.t1 = t1; n.tmid = (t0 + t1) / 2;
  if (n.children.length) {
    const tot = n.children.reduce((s, c) => s + comp(c.realDur), 0) || 1;
    let cur = t0;
    for (const c of n.children) {
      const w = (t1 - t0) * comp(c.realDur) / tot;
      assignT(c, cur, cur + w); cur += w;
    }
  }
}

function assignReal(n: FlowNode, r0: number): number {
  n.r0 = r0;
  if (n.children.length) {
    let cur = r0;
    for (const c of n.children) { assignReal(c, cur); cur = c.r1; }
    n.r1 = cur;
  } else {
    n.r1 = r0 + n.realDur;
  }
  return n.r1;
}

function flatten(n: FlowNode, depth: number, out: FlowNode[]): void {
  n.depth = depth; n.id = out.length; out.push(n);
  n.children.forEach(c => flatten(c, depth + 1, out));
}

function heatTier(d: number, maxLeaf: number): 0 | 1 | 2 | 3 {
  const r = d / (maxLeaf || 1);
  return r >= 0.66 ? 3 : r >= 0.33 ? 2 : r >= 0.12 ? 1 : 0;
}

/**
 * Build the full normalized flow model for an agent run. Eagerly walks the whole
 * sub-agent tree (via the helper's cached `loadSubAgentData`) so the zoomed-out
 * view shows the entire run at once.
 */
export async function buildFlowModel(
  rootName: string,
  rootStatus: string,
  rootIcon: RootIcon,
  helper: AIAgentRunDataHelper
): Promise<FlowModel> {
  const { steps, promptRuns } = helper.getCurrentData();

  const root: FlowNode = {
    id: -1, name: rootName || 'Agent run', type: 'agent', status: rootStatus,
    model: null, realDur: 0, t0: 0, t1: 1, tmid: 0.5, r0: 0, r1: 0, depth: 0, heat: 0,
    parent: null, children: [], raw: null,
    iconClass: rootIcon.iconClass || 'fa-robot', logoUrl: rootIcon.logoUrl
  };

  if (steps.length) {
    await attachStepTree(root, steps, promptRuns, helper);
  }

  calcDur(root);
  assignT(root, 0, 1);
  assignReal(root, 0);

  const nodes: FlowNode[] = [];
  flatten(root, 0, nodes);
  nodes.forEach(n => { n.tmid = (n.t0 + n.t1) / 2; });

  const leaves = nodes.filter(n => n.children.length === 0).sort((a, b) => a.t0 - b.t0);
  const maxLeafDur = Math.max(0.001, ...leaves.map(n => n.realDur));
  nodes.forEach(n => { n.heat = heatTier(n.realDur, maxLeafDur); });

  return {
    root, nodes, leaves, total: root.realDur,
    maxDepth: Math.max(0, ...nodes.map(n => n.depth)), maxLeafDur
  };
}

/* ----------------------------- shared lookups ----------------------------- */

export function activeLeaf(model: FlowModel, p: number): FlowNode {
  const L = model.leaves;
  if (!L.length) return model.root;
  if (p <= 0) return L[0];
  if (p >= 1) return L[L.length - 1];
  return L.find(l => p >= l.t0 && p < l.t1) ?? L[L.length - 1];
}

export function ancestors(n: FlowNode): FlowNode[] {
  const out: FlowNode[] = []; let c: FlowNode | null = n;
  while (c) { out.unshift(c); c = c.parent; }
  return out;
}

export function agentOf(n: FlowNode): FlowNode {
  let c = n.parent;
  while (c) { if (c.type === 'agent' || c.type === 'subagent') return c; c = c.parent; }
  return n;
}

/** "Execute Sub-Agent: Query Strategist" → "Query Strategist". */
export function agentShortName(a: FlowNode): string {
  const i = a.name.indexOf(': ');
  return i >= 0 ? a.name.slice(i + 2) : a.name;
}

/**
 * Label with the owning agent's prefix stripped — child step names tend to be
 * "Query Strategist: Execute Agent Prompt"; on a view that already shows which
 * agent/line a node belongs to, the prefix is pure noise that causes overlap.
 */
export function displayName(n: FlowNode): string {
  const a = agentOf(n);
  if (a && a !== n) {
    const short = agentShortName(a);
    if (short && n.name.startsWith(short + ':')) return n.name.slice(short.length + 1).trim();
  }
  return n.name;
}

/**
 * Aggressively abbreviated label for tight surfaces (subway stations, flame bars,
 * stars). Strips the agent prefix, then collapses the verbose MJ step phrasing:
 *   "Execute Sub-Agent: Query Strategist" → "Query Strategist Sub-Agent"
 *   "Execute Agent Prompt"                → "Prompt"
 *   "Execute Action: Search Query Catalog"→ "Search Query Catalog"
 *   "Agent Validation"                    → "Validation"
 */
export function shortLabel(n: FlowNode): string {
  if (n.type === 'subagent') return `${agentShortName(n)} Sub-Agent`;
  let s = displayName(n);
  s = s.replace(/^Execute Action:\s*/i, '').replace(/^Execute Sub-Agent:\s*/i, '');
  if (/^Execute Agent Prompt$/i.test(s)) s = 'Prompt';
  else if (/^Agent Validation$/i.test(s)) s = 'Validation';
  else if (/^Data Source Preloading$/i.test(s)) s = 'Data Preload';
  return s;
}

export function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
