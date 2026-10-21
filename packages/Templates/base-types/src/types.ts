import type { UserInfo } from '@memberjunction/core';

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
    /**
     * The user this render runs as. Template extensions (an AI prompt, an embedded template) act for this user. When
     * unset, a render nested inside another render inherits the outer render's user, and a top-level render uses the
     * engine's context user at the moment of the call. Server code rendering on behalf of a user should always pass it,
     * because the engine is shared by every request in the process.
     */
    ContextUser?: UserInfo;
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