/**
 * Maps an agent's declared native control tools onto the decision vocabulary the eval scores.
 *
 * Typed by the shape it reads rather than by the agent package's binding type, so it stays
 * importable without the agent runtime.
 */
import type { ControlToolRole } from '../eval/decision';

/**
 * Builds the tool-name → decision-role map for an agent's control tools.
 *
 * Action bindings and kinds with no decision role are left out; the eval maps Actions by name
 * separately.
 *
 * @param bindings The agent's native tool bindings, keyed by declared tool name
 * @returns The control tools' roles, keyed by tool name
 */
export function ControlToolMapFor(
    bindings: Iterable<readonly [string, { kind: string; agent?: { Name?: string | null } }]>
): Record<string, ControlToolRole> {
    const map: Record<string, ControlToolRole> = {};
    for (const [toolName, binding] of bindings) {
        switch (binding.kind) {
            case 'subAgent': map[toolName] = { kind: 'subAgent', name: binding.agent?.Name ?? toolName }; break;
            case 'payloadChange': map[toolName] = { kind: 'payloadChange' }; break;
            case 'askUser': map[toolName] = { kind: 'chat' }; break;
            case 'complete': map[toolName] = { kind: 'taskComplete' }; break;
            default: break;
        }
    }
    return map;
}
