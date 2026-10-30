/**
 * @fileoverview High-level rendering entry point and agent reference guide for MemberJunction Diagrams.
 *
 * `RenderDiagram` combines `ValidateDiagramSpec` and `RenderDiagramSvg`.
 *
 * @module @memberjunction/ai-diagrams
 */

import {
    MJ_DIAGRAM_KINDS,
    type MJDiagramKind,
    type MJDiagramRenderResult,
} from './spec.js';
import { ValidateDiagramSpec } from './validator.js';
import { RenderDiagramSvg } from './renderer.js';

/**
 * Validates and renders an MJ Diagram Spec into a self-contained `<svg data-mj-diagram="1">`.
 * Each render gets a random marker-ID prefix so several diagrams can share one page.
 */
export function RenderDiagram(rawSpec: unknown, fallbackKind?: string): MJDiagramRenderResult {
    const validation = ValidateDiagramSpec(rawSpec, fallbackKind);
    if (validation.Valid === false) {
        return {
            Success: false,
            ErrorCode: validation.Diagnostics.some((d) => d.Code === 'INVALID_KIND' || d.Code === 'INVALID_ROOT' || d.Code === 'INVALID_JSON')
                ? 'INVALID_INPUT'
                : 'VALIDATION_FAILED',
            Message: validation.Diagnostics.map((d) => `[${d.Code}] ${d.Path}: ${d.Message} Fix: ${d.Fix}`).join('\n'),
            Diagnostics: validation.Diagnostics,
        };
    }
    try {
        const spec = validation.Spec;
        return {
            Success: true,
            Svg: RenderDiagramSvg(spec, `mjd-${crypto.randomUUID().slice(0, 8)}`),
            Title: spec.title,
            Kind: spec.kind,
            Warnings: validation.Warnings,
        };
    } catch (err) {
        return {
            Success: false,
            ErrorCode: 'RENDER_FAILED',
            Message: err instanceof Error ? err.message : String(err),
        };
    }
}

const REFERENCE_GUIDES: Record<MJDiagramKind, string> = {
    workflow: `# MJ Workflow Diagram Spec (\`kind: "workflow"\`)

Use a **workflow** diagram when explaining a process with steps owned by different actors (swimlanes) and branch or exception paths.

## Required Fields
- \`kind\`: \`"workflow"\`
- \`title\`: Question or process title
- \`lanes\`: \`[{ "id": "member", "label": "Member" }, { "id": "staff", "label": "Staff" }, { "id": "exceptions", "label": "Exceptions", "role": "exceptions" }]\`
- \`nodes\`: \`[{ "id": "submit", "lane": "member", "kind": "start" | "task" | "decision" | "end" | "error", "label": "Short title", "sublabel": "2-4 word context", "detail": "1-2 sentence explanation for the side panel" }]\`
- \`edges\`: \`[{ "from": "submit", "to": "review", "label": "optional condition", "role": "default" | "branch" | "error" }]\`
- \`mainPath\`: Ordered array of node IDs along the happy path (e.g. \`["log", "submit", "review", "issue"]\`)
- \`cards\` (optional): \`[{ "id": "deadline", "title": "Rule title", "body": "Rule explanation", "nodes": ["submit"] }]\``,

    lifecycle: `# MJ Lifecycle Diagram Spec (\`kind: "lifecycle"\`)

Use a **lifecycle** diagram when explaining status transitions (e.g. active, renewal due, grace period, lapsed, reinstated).

## Required Fields
- \`kind\`: \`"lifecycle"\`
- \`title\`: Lifecycle title
- \`lanes\` (or \`groups\`): \`[{ "id": "main", "label": "Membership" }, { "id": "waiting", "label": "Grace period", "role": "waiting" }, { "id": "terminal", "label": "After lapsing", "role": "terminal" }]\`
- \`nodes\` (or \`states\`): \`[{ "id": "active", "lane": "main", "kind": "start" | "state" | "waiting" | "success" | "error", "label": "Active", "sublabel": "dues paid", "step": "01", "detail": "..." }]\`
- \`edges\` (or \`transitions\`): \`[{ "from": "active", "to": "due", "label": "Nov 1", "role": "default" | "error" }]\`
- \`mainPath\`: Ordered array of state IDs on the normal renewal path`,

    sequence: `# MJ Sequence Diagram Spec (\`kind: "sequence"\`)

Use a **sequence** diagram when three or more parties hand work back and forth over time.

## Required Fields
- \`kind\`: \`"sequence"\`
- \`title\`: Sequence title
- \`participants\`: \`[{ "id": "author", "label": "Author", "sublabel": "member" }, ...]\`
- \`phases\` (optional): \`[{ "id": "submit", "label": "Submit", "fromMessage": 0, "toMessage": 2 }]\`
- \`messages\` (or \`edges\`): \`[{ "from": "author", "to": "portal", "label": "submit abstract by Mar 15", "role": "emphasis" | "default" | "return" | "conditional" }]\`
- \`cards\` (optional): Summary rule cards`,

    dataflow: `# MJ Data Flow Diagram Spec (\`kind: "dataflow"\`)

Use a **dataflow** diagram when showing how data moves left-to-right across stages (from capture to verification, storage, and downstream use).

## Required Fields
- \`kind\`: \`"dataflow"\`
- \`title\`: Data flow title
- \`stages\` (or \`lanes\`): \`[{ "id": "attend", "label": "Attend" }, { "id": "capture", "label": "Capture" }, ...]\`
- \`nodes\`: \`[{ "id": "scan", "lane": "attend", "kind": "task" | "database" | "decision" | "external", "label": "Badge scan", "sublabel": "session door", "detail": "..." }]\`
- \`flows\` (or \`edges\`): \`[{ "from": "scan", "to": "log", "label": "scan in and out", "data": "badge ID", "role": "default" | "emphasis" | "error" }]\``,
};

export type DiagramReferenceResult =
    | {
        Success: true;
        Content: string;
    }
    | {
        Success: false;
        ErrorCode: 'NOT_FOUND' | 'INVALID_INPUT';
        Message: string;
    };

/**
 * Returns the MJ Diagram Spec reference guide for one or all diagram kinds (`workflow`, `lifecycle`, `sequence`, `dataflow`).
 */
export function GetDiagramReference(diagramKind?: string): DiagramReferenceResult {
    const normalized = diagramKind?.trim().toLowerCase();
    if (!normalized || normalized === 'all') {
        const all = MJ_DIAGRAM_KINDS.map((k) => REFERENCE_GUIDES[k]).join('\n\n---\n\n');
        return { Success: true, Content: all };
    }
    if (!MJ_DIAGRAM_KINDS.includes(normalized as MJDiagramKind)) {
        return {
            Success: false,
            ErrorCode: 'NOT_FOUND',
            Message: `Unknown diagram kind "${normalized}". Valid kinds: ${MJ_DIAGRAM_KINDS.join(', ')}.`,
        };
    }
    return {
        Success: true,
        Content: REFERENCE_GUIDES[normalized as MJDiagramKind],
    };
}
