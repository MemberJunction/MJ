import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import {
    RenderDiagram,
    MJ_DIAGRAM_KINDS,
    type MJDiagramKind,
} from "@memberjunction/ai-diagrams";
import { SVGUtils } from './shared/svg-utils';

/** Upper bound on a spec, so a runaway generation cannot tie up a render worker. */
const MAX_SPEC_CHARS = 500_000;

/**
 * Renders an interactive workflow, lifecycle, sequence, or dataflow diagram from an MJ Diagram Spec.
 *
 * The model writes a semantic JSON spec (no pixel coordinates required); `@memberjunction/ai-diagrams`
 * validates it with actionable diagnostics (JSON path, message, closest IDs, and fix suggestion) and
 * computes deterministic layout + self-contained SVG with the MJ Diagram SVG Data Contract (`data-mj-diagram="1"`).
 *
 * On success it returns the self-contained SVG (both as the `SVG` output param and as `Message`, matching
 * `Create Mermaid Diagram` and `Create SVG Diagram`) for interactive rendering in `<mj-markdown>` and
 * `<mj-svg-artifact-viewer>`.
 */
@RegisterClass(BaseAction, "__RenderArchitectureDiagram")
export class RenderArchitectureDiagramAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const input = this.readInput(params);
        if ('Failure' in input) {
            return input.Failure;
        }
        const rendered = RenderDiagram(input.Spec, input.DiagramType);
        if (rendered.Success === false) {
            return {
                Success: false,
                ResultCode: rendered.ErrorCode,
                Message: JSON.stringify({
                    error: rendered.Message,
                    diagnostics: rendered.Diagnostics ?? [],
                }),
            };
        }
        const svg = SVGUtils.SanitizeSVG(rendered.Svg);
        params.Params.push({
            Name: 'SVG',
            Type: 'Output',
            Value: svg,
        });
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: svg,
        };
    }

    private readInput(params: RunActionParams):
        | { DiagramType: MJDiagramKind; Spec: Record<string, unknown> }
        | { Failure: ActionResultSimple } {
        const spec = this.readSpec(this.paramValue(params, 'SpecJSON'));
        if (typeof spec === 'string') {
            return this.invalid(spec);
        }
        const rawDiagramType = String(this.paramValue(params, 'DiagramType') ?? spec.kind ?? spec.diagram_type ?? '').trim().toLowerCase();
        if (!MJ_DIAGRAM_KINDS.includes(rawDiagramType as MJDiagramKind)) {
            return this.invalid(`DiagramType must be one of: ${MJ_DIAGRAM_KINDS.join(', ')}.`);
        }
        return {
            DiagramType: rawDiagramType as MJDiagramKind,
            Spec: spec,
        };
    }

    /** The spec as an object, or why it isn't one. */
    private readSpec(raw: unknown): Record<string, unknown> | string {
        if (raw === null || raw === undefined || raw === '') {
            return 'SpecJSON is required: the MJ Diagram JSON spec for the diagram.';
        }
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

    private paramValue(params: RunActionParams, name: string): unknown {
        return params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase())?.Value;
    }

    private invalid(message: string): { Failure: ActionResultSimple } {
        return {
            Failure: {
                Success: false,
                ResultCode: 'INVALID_INPUT',
                Message: message,
            },
        };
    }
}
