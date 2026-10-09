/**
 * @fileoverview Serves archify's schemas, examples and authoring references one at a time.
 *
 * archify's skill tells a shell agent to read files from its package before writing a spec. An MJ
 * agent has no filesystem, so this hands it the same material on request, which also keeps those
 * ~100 KB out of the skill's always-loaded instructions.
 *
 * @module @memberjunction/ai-diagrams
 */
import fs from 'node:fs';
import { ARCHITECTURE_DIAGRAM_TYPES, type ArchitectureDiagramType } from './ArchitectureDiagramRenderer.js';

export type ArchitectureDiagramReferenceTopic =
    | 'schema'
    | 'example'
    | 'authoring-defaults'
    | 'authoring-contract'
    | 'layout-repair'
    | 'brand-marks';

export const ARCHITECTURE_DIAGRAM_REFERENCE_TOPICS: readonly ArchitectureDiagramReferenceTopic[] =
    ['schema', 'example', 'authoring-defaults', 'authoring-contract', 'layout-repair', 'brand-marks'];

export type ArchitectureDiagramReferenceResult =
    | { Success: true; Content: string }
    | { Success: false; ErrorCode: 'INVALID_INPUT' | 'NOT_FOUND'; Message: string };

const VENDOR_ROOT = new URL('../vendor/archify/', import.meta.url);

/** The reference docs, by topic. */
const REFERENCE_DOCS: Readonly<Record<string, string>> = {
    'authoring-defaults': 'references/authoring-defaults.md',
    'authoring-contract': 'references/authoring-contract.md',
    'layout-repair': 'references/architecture-layout-repair.md',
    'brand-marks': 'references/brand-marks.md',
};

/** The example archify's skill names for each type (its "Type router"). */
const CANONICAL_EXAMPLES: Readonly<Record<ArchitectureDiagramType, string>> = {
    architecture: 'examples/web-app.architecture.json',
    workflow: 'examples/agent-tool-call.workflow.json',
    sequence: 'examples/cache-miss-request.sequence.json',
    dataflow: 'examples/product-analytics.dataflow.json',
    lifecycle: 'examples/deployment-release.lifecycle.json',
};

/**
 * Returns one piece of archify's authoring material.
 *
 * @param topic - `schema` and `example` need `diagramType`; the reference docs don't
 * @param diagramType - the diagram type the schema or example is for
 */
export function GetArchitectureDiagramReference(topic: string, diagramType?: string): ArchitectureDiagramReferenceResult {
    if (!ARCHITECTURE_DIAGRAM_REFERENCE_TOPICS.includes(topic as ArchitectureDiagramReferenceTopic)) {
        return { Success: false, ErrorCode: 'INVALID_INPUT', Message: `Unknown topic "${topic}". Use one of: ${ARCHITECTURE_DIAGRAM_REFERENCE_TOPICS.join(', ')}.` };
    }
    if (topic === 'schema' || topic === 'example') {
        if (!ARCHITECTURE_DIAGRAM_TYPES.includes(diagramType as ArchitectureDiagramType)) {
            return { Success: false, ErrorCode: 'INVALID_INPUT', Message: `Topic "${topic}" needs a DiagramType: one of ${ARCHITECTURE_DIAGRAM_TYPES.join(', ')}.` };
        }
        const type = diagramType as ArchitectureDiagramType;
        return topic === 'schema'
            ? readAll([`schemas/${type}.schema.json`, 'schemas/common.schema.json'])
            : readAll([CANONICAL_EXAMPLES[type]]);
    }
    return readAll([REFERENCE_DOCS[topic]]);
}

function readAll(paths: string[]): ArchitectureDiagramReferenceResult {
    const parts: string[] = [];
    for (const relativePath of paths) {
        const file = new URL(relativePath, VENDOR_ROOT);
        if (!fs.existsSync(file)) {
            return { Success: false, ErrorCode: 'NOT_FOUND', Message: `archify reference ${relativePath} is not in this build.` };
        }
        parts.push(paths.length > 1 ? `// ${relativePath}\n${fs.readFileSync(file, 'utf8')}` : fs.readFileSync(file, 'utf8'));
    }
    return { Success: true, Content: parts.join('\n\n') };
}
