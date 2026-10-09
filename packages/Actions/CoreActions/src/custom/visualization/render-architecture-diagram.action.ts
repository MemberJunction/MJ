import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { ArchitectureDiagramRenderer, ARCHITECTURE_DIAGRAM_TYPES, type ArchitectureDiagramType } from "@memberjunction/ai-diagrams";
import { SVGUtils } from './shared/svg-utils';
import { CheckDiagramReadability } from './shared/diagram-readability-check';

/** What the caller wants back. */
type DiagramOutput = 'svg' | 'html' | 'both';

const OUTPUTS: readonly DiagramOutput[] = ['svg', 'html', 'both'];

/** Upper bound on a spec, so a runaway generation cannot tie up a render worker. */
const MAX_SPEC_CHARS = 500_000;

/**
 * Renders an architecture, workflow, sequence, data-flow or lifecycle diagram from an archify JSON spec.
 *
 * The model writes a typed spec (nodes with explicit positions and sizes, plus edges); archify validates
 * it against its schemas and layout rules and renders it, in-process, through `@memberjunction/ai-diagrams`.
 * A spec that fails comes back as `VALIDATION_FAILED` with archify's diagnostics (code, subject, evidence,
 * supported fixes) so a Loop agent can repair it and call again; the agent's iteration limits cap that loop.
 *
 * On success it returns a self-contained SVG (as the Message, like Create Mermaid Diagram) for embedding in
 * reports and markdown, and the standalone interactive page as a file output with visibility `Always`, so
 * it surfaces as a normal artifact even from an agent whose own artifacts are `System Only`.
 */
@RegisterClass(BaseAction, "__RenderArchitectureDiagram")
export class RenderArchitectureDiagramAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const input = this.readInput(params);
        if ('Failure' in input) {
            return input.Failure;
        }
        const rendered = await ArchitectureDiagramRenderer.Instance.Render(input.DiagramType, input.Spec);
        if (rendered.Success === false) {
            return {
                Success: false,
                ResultCode: rendered.ErrorCode,
                // archify's diagnostics verbatim: they are what the model repairs against.
                Message: rendered.Failure ? JSON.stringify(rendered.Failure) : rendered.Message,
            };
        }
        if (input.BrowserCheck) {
            const gate = await CheckDiagramReadability(rendered.Html);
            if (gate.Checked && gate.Problems.length > 0) {
                return { Success: false, ResultCode: 'BROWSER_CHECK_FAILED', Message: JSON.stringify({ problems: gate.Problems }) };
            }
        }
        const svg = SVGUtils.SanitizeSVG(rendered.Svg);
        if (input.Output !== 'svg') {
            params.Params.push({ Name: 'FileOutput', Type: 'Output', Value: this.htmlFile(rendered.Html, rendered.Title ?? input.DiagramType) });
        }
        // The SVG is the Message, once (realtime and MCP callers forward only the Message); the page is a file.
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: input.Output === 'html' ? `Rendered the ${input.DiagramType} diagram; the interactive page is attached as a file.` : svg,
        };
    }

    private readInput(params: RunActionParams):
        | { DiagramType: ArchitectureDiagramType; Spec: Record<string, unknown>; Output: DiagramOutput; BrowserCheck: boolean }
        | { Failure: ActionResultSimple } {
        const diagramType = String(this.paramValue(params, 'DiagramType') ?? '').trim().toLowerCase();
        if (!ARCHITECTURE_DIAGRAM_TYPES.includes(diagramType as ArchitectureDiagramType)) {
            return this.invalid(`DiagramType must be one of: ${ARCHITECTURE_DIAGRAM_TYPES.join(', ')}.`);
        }
        const output = String(this.paramValue(params, 'Output') ?? 'both').trim().toLowerCase();
        if (!OUTPUTS.includes(output as DiagramOutput)) {
            return this.invalid(`Output must be one of: ${OUTPUTS.join(', ')}.`);
        }
        const spec = this.readSpec(this.paramValue(params, 'SpecJSON'));
        if (typeof spec === 'string') {
            return this.invalid(spec);
        }
        const browserCheck = String(this.paramValue(params, 'BrowserCheck') ?? '').trim().toLowerCase() === 'true';
        return { DiagramType: diagramType as ArchitectureDiagramType, Spec: spec, Output: output as DiagramOutput, BrowserCheck: browserCheck };
    }

    /** The spec as an object, or why it isn't one. */
    private readSpec(raw: unknown): Record<string, unknown> | string {
        if (raw === null || raw === undefined || raw === '') {
            return 'SpecJSON is required: the archify JSON spec for the diagram.';
        }
        // An object spec is measured too: the skill tells models to pass one, so a string-only cap missed most specs.
        const size = typeof raw === 'string' ? raw.length : (JSON.stringify(raw) ?? '').length;
        if (size > MAX_SPEC_CHARS) {
            return `SpecJSON is ${size} characters; the limit is ${MAX_SPEC_CHARS}. Split the diagram.`;
        }
        let value: unknown = raw;
        if (typeof raw === 'string') {
            try {
                value = JSON.parse(raw);
            } catch (error) {
                return `SpecJSON is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
            }
        }
        return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? value as Record<string, unknown>
            : 'SpecJSON must be a JSON object.';
    }

    private htmlFile(html: string, title: string): { fileName: string; mimeType: string; sizeBytes: number; fileData: string; visibility: 'Always' } {
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'diagram';
        const bytes = Buffer.from(html, 'utf8');
        return { fileName: `${slug}.html`, mimeType: 'text/html', sizeBytes: bytes.length, fileData: bytes.toString('base64'), visibility: 'Always' };
    }

    private paramValue(params: RunActionParams, name: string): unknown {
        return params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase())?.Value;
    }

    private invalid(message: string): { Failure: ActionResultSimple } {
        return { Failure: { Success: false, ResultCode: 'INVALID_INPUT', Message: message } };
    }
}
