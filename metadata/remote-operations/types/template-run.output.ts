/** Output of `Template.Run`. */
export interface TemplateRunOutput {
    /** The rendered template output. */
    output: string;
    /** Wall-clock render time in milliseconds. */
    executionTimeMs?: number;
}
