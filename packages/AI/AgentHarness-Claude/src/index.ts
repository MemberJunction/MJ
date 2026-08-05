export * from './ClaudeCodeAdapter.js';

/**
 * Tree-shaking guard — see the note in `@memberjunction/ai-agent-harness`. The adapter registers
 * itself with ClassFactory as a side effect of module load, so a bundler that drops the module
 * leaves `AIAgentHarness.DriverClass = 'ClaudeCodeAdapter'` resolving to nothing at runtime.
 */
export function LoadClaudeCodeHarnessAdapter(): void {
    // Intentionally empty — the import above is the point.
}
