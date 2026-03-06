// @memberjunction/computer-use-engine
//
// Provides MJComputerUseEngine (extends ComputerUseEngine) with:
// - AIPromptRunner integration for controller and judge prompts
// - MJ Credentials → AuthMethod resolution
// - MJ Actions wrapped as ComputerUseTool instances
// - Screenshot persistence as AIPromptRunMedia entities
// - ComputerUseAction for standard MJ Action invocation

// ─── Type Exports ──────────────────────────────────────────
export * from './types/mj-params.js';

// ─── Engine Exports ────────────────────────────────────────
export * from './engine/MJComputerUseEngine.js';

// ─── Judge Exports ─────────────────────────────────────────
export * from './judge/MJLLMJudge.js';

// ─── Action Exports ────────────────────────────────────────
export * from './action/ComputerUseAction.js';

// ─── Test Driver Exports ──────────────────────────────────
export * from './test-driver/ComputerUseTestDriver.js';
export * from './test-driver/types.js';

// ─── Utility Exports ──────────────────────────────────────
export * from './utils/judge-frequency-parser.js';

// ─── Tree-Shaking Prevention ───────────────────────────────
// Call this function from the server bootstrap to ensure that
// @RegisterClass decorators execute and classes are available
// in the ClassFactory registry (ComputerUseAction, ComputerUseTestDriver).
export function LoadMJComputerUse(): void {
    // Importing the module causes the @RegisterClass decorators
    // to fire, registering classes with ClassFactory.
    // This function's mere existence as an import target is enough.
}
