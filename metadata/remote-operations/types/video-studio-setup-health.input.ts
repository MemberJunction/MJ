/** Input for `VideoStudio.SetupHealth`. */
export interface VideoStudioSetupHealthInput {
    /** Optional timeout in milliseconds for the render worker health probe (default 10000, clamped to 1000..30000). */
    RenderTimeoutMs?: number;
}
