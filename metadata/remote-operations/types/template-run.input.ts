/** Input for `Template.Run`. */
export interface TemplateRunInput {
    /** The `MJ: Templates` ID to render. */
    templateID: string;
    /** Data the template may reference during render (the render context). Omit for none. */
    data?: Record<string, unknown>;
}
