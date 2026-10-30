/**
 * @fileoverview MemberJunction Diagram Spec types and SVG Data Contract definitions.
 *
 * Covers the four core diagram kinds:
 * - `workflow`: Actor swimlanes (including an optional exceptions lane), tasks, decisions, and error/branch edges
 * - `lifecycle`: State groups (membership, grace period, terminal), states with optional step badges, and transitions
 * - `sequence`: Participant columns, chronological messages (sync, return, conditional/dashed), and phase bands
 * - `dataflow`: Left-to-right processing stages, nodes (services, databases, checks), and data-labeled flows
 *
 * @module @memberjunction/ai-diagrams
 */

export type MJDiagramKind = 'workflow' | 'lifecycle' | 'sequence' | 'dataflow';

export const MJ_DIAGRAM_KINDS: readonly MJDiagramKind[] = ['workflow', 'lifecycle', 'sequence', 'dataflow'];

/** Contract version emitted on the root `<svg data-mj-diagram="1">`. */
export const MJ_DIAGRAM_CONTRACT_VERSION = '1';

export type MJDiagramLaneRole = 'default' | 'exceptions' | 'waiting' | 'terminal';

export interface MJDiagramLane {
    id: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    label: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    sublabel?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    role?: MJDiagramLaneRole; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
}

export type MJDiagramNodeKind =
    | 'start'
    | 'end'
    | 'task'
    | 'decision'
    | 'state'
    | 'waiting'
    | 'success'
    | 'error'
    | 'database'
    | 'external'
    | 'participant';

export interface MJDiagramNode {
    id: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    label: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    sublabel?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Longer explanation shown in the interactive viewer's side details panel and `<desc>`. */
    detail?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Lane, state group, or stage ID this node belongs to. */
    lane?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    kind?: MJDiagramNodeKind; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Optional badge text (e.g. `"01"`, `"02"` on lifecycle states). */
    step?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Optional column hint (`0..N`) when the author wants explicit column alignment. */
    col?: number; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Optional row hint (`0..N`) within a stage or lane. */
    row?: number; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
}

export type MJDiagramEdgeRole = 'default' | 'branch' | 'error' | 'return' | 'emphasis' | 'conditional';

export interface MJDiagramEdge {
    id?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    from: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    to: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    label?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Optional data payload / classification tag for `dataflow` edges (e.g. `"badge ID"`, `"member ID"`). */
    data?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    role?: MJDiagramEdgeRole; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Optional phase ID for `sequence` messages. */
    phase?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
}

/** A horizontal phase band grouping consecutive messages in a `sequence` diagram. */
export interface MJDiagramPhase {
    id: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    label: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** 0-based index of the first message in this phase (inclusive). */
    fromMessage: number; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** 0-based index of the last message in this phase (inclusive). */
    toMessage: number; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
}

export type MJDiagramCardTone = 'accent' | 'success' | 'warning' | 'error' | 'neutral';

export interface MJDiagramCard {
    id: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    title: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Single-line or multi-line summary text. */
    body?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Bullet items (joined if `body` is omitted). */
    items?: string[]; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Node IDs highlighted when the member clicks this summary card. */
    nodes?: string[]; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    tone?: MJDiagramCardTone; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
}

export interface MJDiagramLegendItem {
    role: 'main' | 'default' | 'error' | 'return' | 'conditional'; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    label: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
}

/**
 * Canonical MemberJunction diagram specification after validation and normalization.
 */
export interface MJDiagramSpec {
    kind: MJDiagramKind; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    title: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    subtitle?: string; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Swimlanes (`workflow`), state groups (`lifecycle`), stages (`dataflow`), or participant columns (`sequence`). */
    lanes: MJDiagramLane[]; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Steps (`workflow`), states (`lifecycle`), stage nodes (`dataflow`), or participants (`sequence`). */
    nodes: MJDiagramNode[]; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Edges (`workflow`), transitions (`lifecycle`), data flows (`dataflow`), or ordered messages (`sequence`). */
    edges: MJDiagramEdge[]; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Phase bands for `sequence` diagrams. */
    phases?: MJDiagramPhase[]; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Node IDs along the primary happy path. */
    mainPath?: string[]; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Summary rule cards rendered beneath the diagram and linked to specific nodes. */
    cards?: MJDiagramCard[]; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
    /** Optional custom legend items; sensible defaults are generated per diagram kind if omitted. */
    legend?: MJDiagramLegendItem[]; // case-violation-ok-legacy-back-compat: JSON wire-format schema key
}

/**
 * Actionable validation diagnostic returned so an agent can repair a malformed spec and retry.
 */
export interface MJDiagramDiagnostic {
    code: string; // case-violation-ok-legacy-back-compat: JSON wire-format diagnostic key
    severity: 'error' | 'warning'; // case-violation-ok-legacy-back-compat: JSON wire-format diagnostic key
    /** JSON path to the offending field (e.g. `"edges[2].to"` or `"nodes[1].lane"`). */
    path: string; // case-violation-ok-legacy-back-compat: JSON wire-format diagnostic key
    /** Human and agent readable explanation of what is wrong. */
    message: string; // case-violation-ok-legacy-back-compat: JSON wire-format diagnostic key
    /** Concrete instruction on how to fix the issue. */
    fix: string; // case-violation-ok-legacy-back-compat: JSON wire-format diagnostic key
}

export type MJDiagramValidationResult =
    | {
        valid: true; // case-violation-ok-legacy-back-compat: discriminated union tag
        spec: MJDiagramSpec; // case-violation-ok-legacy-back-compat: JSON wire-format field
        warnings: MJDiagramDiagnostic[]; // case-violation-ok-legacy-back-compat: JSON wire-format field
    }
    | {
        valid: false; // case-violation-ok-legacy-back-compat: discriminated union tag
        diagnostics: MJDiagramDiagnostic[]; // case-violation-ok-legacy-back-compat: JSON wire-format field
    };

export type MJDiagramErrorCode = 'INVALID_INPUT' | 'VALIDATION_FAILED' | 'RENDER_FAILED';

export type MJDiagramRenderResult =
    | {
        Success: true;
        /** Self-contained, themed SVG implementing the MJ Diagram Data Contract v1. */
        Svg: string;
        /** The diagram's title. */
        Title: string;
        /** The normalized diagram kind. */
        Kind: MJDiagramKind;
        /** Any non-fatal warnings discovered during validation. */
        Warnings: MJDiagramDiagnostic[];
    }
    | {
        Success: false;
        ErrorCode: MJDiagramErrorCode;
        Message: string;
        Diagnostics?: MJDiagramDiagnostic[];
    };
