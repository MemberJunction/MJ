import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { SVGUtils } from './shared/svg-utils';
import { MermaidTheme, MermaidConfig } from './shared/mermaid-types';
import { MermaidRenderer } from './shared/mermaid-renderer';

/**
 * Action that generates SVG diagrams from Mermaid text syntax.
 * Supports flowcharts, sequence diagrams, ER diagrams, class diagrams, state machines,
 * Gantt charts, and more.
 *
 * Mermaid is a text-based diagram generation tool that converts markdown-like
 * syntax into rich visual diagrams. This action renders diagrams server-side as
 * static SVG (no script), suitable for embedding in reports, artifacts, and
 * AI-generated content.
 *
 * Rendering runs in headless Chromium via {@link MermaidRenderer}, because Mermaid
 * measures rendered text to lay diagrams out and cannot run in plain Node. Hosts
 * that use this action need the optional `playwright` peer dependency and a
 * Chromium build; without one the action fails with `BROWSER_UNAVAILABLE` rather
 * than producing a broken diagram.
 *
 * @example
 * ```typescript
 * // Flowchart
 * await runAction({
 *   ActionName: 'Create Mermaid Diagram',
 *   Params: [
 *     { Name: 'Code', Value: `flowchart TD
 *       A[Start] --> B[Process]
 *       B --> C{Decision}
 *       C -->|Yes| D[End]
 *       C -->|No| A` },
 *     { Name: 'Theme', Value: 'default' }
 *   ]
 * });
 *
 * // Sequence Diagram
 * await runAction({
 *   ActionName: 'Create Mermaid Diagram',
 *   Params: [
 *     { Name: 'Code', Value: `sequenceDiagram
 *       Client->>Server: Request
 *       Server->>Database: Query
 *       Database-->>Server: Results
 *       Server-->>Client: Response` },
 *     { Name: 'Theme', Value: 'dark' }
 *   ]
 * });
 *
 * // ER Diagram
 * await runAction({
 *   ActionName: 'Create Mermaid Diagram',
 *   Params: [
 *     { Name: 'Code', Value: `erDiagram
 *       USER ||--o{ ORDER : places
 *       ORDER ||--|{ LINE-ITEM : contains` },
 *     { Name: 'Theme', Value: 'forest' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__CreateMermaidDiagram")
export class CreateMermaidDiagramAction extends BaseAction {

    /**
     * Generates an SVG diagram from Mermaid syntax.
     *
     * @param params - The action parameters containing:
     *   - Code: Raw Mermaid diagram syntax (required)
     *   - Theme: Visual theme ('default' | 'dark' | 'forest' | 'neutral', default: 'default')
     *   - Config: Optional Mermaid configuration JSON for advanced customization
     *
     * @returns A promise resolving to an ActionResultSimple with:
     *   - Success: true if diagram was generated successfully
     *   - ResultCode: "SUCCESS" or error code
     *   - Message: The sanitized SVG string or error message
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract required Code parameter. Default to '' so a missing Code reaches the
            // MISSING_PARAMETERS check below instead of throwing into DIAGRAM_GENERATION_FAILED.
            const code = this.getStringParam(params, 'Code', '');
            if (!code) {
                return {
                    Success: false,
                    Message: "Code parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            // Extract optional Theme parameter
            const theme = this.getStringParam(params, 'Theme', 'default') as MermaidTheme;

            // Validate theme
            const validThemes: MermaidTheme[] = ['default', 'dark', 'forest', 'neutral'];
            if (!validThemes.includes(theme)) {
                return {
                    Success: false,
                    Message: `Invalid theme: ${theme}. Valid themes: ${validThemes.join(', ')}`,
                    ResultCode: "INVALID_THEME"
                };
            }

            // Extract optional Config parameter
            const configParam = this.getParamValue(params, 'Config');
            const config: MermaidConfig = configParam
                ? this.parseJSON<MermaidConfig>(configParam, 'Config')
                : {};

            // Validate code size (prevent DoS)
            if (code.length > 100000) {
                return {
                    Success: false,
                    Message: "Mermaid code too large (max 100KB)",
                    ResultCode: "CODE_TOO_LARGE"
                };
            }

            // Check for suspicious patterns (basic XSS prevention)
            const suspiciousPatterns = [
                /<script/i,
                /javascript:/i,
                /on\w+\s*=/i  // Event handlers
            ];

            for (const pattern of suspiciousPatterns) {
                if (pattern.test(code)) {
                    return {
                        Success: false,
                        Message: 'Invalid Mermaid code: contains suspicious content',
                        ResultCode: 'INVALID_CODE'
                    };
                }
            }

            const rendered = await MermaidRenderer.Instance.Render(code, theme, config);
            if (rendered.Success === false) {
                return {
                    Success: false,
                    ResultCode: rendered.ErrorCode === 'RENDER_FAILED' ? 'DIAGRAM_GENERATION_FAILED' : rendered.ErrorCode,
                    Message: `Failed to generate Mermaid diagram: ${rendered.Message}`
                };
            }

            // Sanitize SVG (XSS prevention) — the source is model output, so never trust the markup.
            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: SVGUtils.sanitizeSVG(rendered.Svg)
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: "DIAGRAM_GENERATION_FAILED",
                Message: `Failed to generate Mermaid diagram: ${errorMessage}`
            };
        }
    }

    /**
     * Helper to get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, paramName: string): string | null {
        const param = params.Params.find(p =>
            p.Name.trim().toLowerCase() === paramName.toLowerCase()
        );
        if (param?.Value && typeof param.Value === 'string') {
            return param?.Value?.trim() || null;
        }
        else {
            return param?.Value || null;
        }
    }

    /**
     * Helper to get string parameter with optional default
     */
    private getStringParam(params: RunActionParams, paramName: string, defaultValue?: string): string {
        const value = this.getParamValue(params, paramName);
        if (value === null) {
            if (defaultValue !== undefined) return defaultValue;
            throw new Error(`Required parameter missing: ${paramName}`);
        }
        return value;
    }

    /**
     * Helper to safely parse JSON that might already be an object
     */
    private parseJSON<T>(value: string | object, paramName: string): T {
        // If it's already an object/array, return it
        if (typeof value === 'object' && value !== null) {
            return value as T;
        }

        // If it's a string, parse it
        if (typeof value === 'string') {
            try {
                return JSON.parse(value) as T;
            } catch (error) {
                throw new Error(
                    `Parameter '${paramName}' contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        // For other types, error
        throw new Error(
            `Parameter '${paramName}' must be a JSON string or object. Received ${typeof value}.`
        );
    }
}