/**
 * Options of one template render (`RenderTemplate` / `RenderTemplateSimple`, and the prompt runner that asks for a
 * raw render on a prompt's behalf).
 */
export interface TemplateRenderOptions {
    /**
     * Whether rendered output is HTML-entity escaped (default `true`). Pass `false` when the output is plain text for a
     * model or an email subject line, where `Acme & Co` must not become `Acme &amp; Co`.
     */
    autoescape?: boolean;
}

/**
 * Contains the results of a call to render a template
 */
export class TemplateRenderResult {
    Success: boolean;
    Output: string;
    /**
     * Optional, typically used only for Success=false
     */
    Message?: string;
}