/**
 * @module @memberjunction/action-runtime
 * @description Runtime Actions executor — runs Action.Type='Runtime' JS
 * payloads in the shared isolated-vm sandbox, with a (future) permissioned
 * bridge to MJ's capabilities. See plans/runtime-actions.md.
 */

export * from './types';
export * from './RuntimeActionExecutor';
