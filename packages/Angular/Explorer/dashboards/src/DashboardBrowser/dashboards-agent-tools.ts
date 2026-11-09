/**
 * @fileoverview Agent tool parts for the Categories page of the Dashboards app: the tool shape and
 * the id-or-name lookup its handlers use. Handlers never throw; a bad parameter returns a failure
 * result the agent can act on.
 *
 * 🔒 SAFETY BOUNDARY: the Categories page gives the AI agent ONLY read-only / navigational tools, as
 * the Library does. Mutating operations — create / delete / save / share / move a dashboard or a
 * category — are intentionally NOT exposed; the user performs them from the UI. Do NOT add a
 * mutating tool builder here without revisiting this boundary (the page's agent section lists its
 * tools).
 */
import { UUIDsEqual } from '@memberjunction/global';
import { BoundNameList, type AgentToolResult } from '../shared/agent-tool-validation';

/** An agent client tool, in the shape `NavigationService.SetAgentClientTools` takes. */
export interface DashboardsAgentClientTool {
  Name: string;
  Description: string;
  ParameterSchema: Record<string, unknown>;
  Handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/** The item an agent named, or the failure result to return to the agent. */
export type AgentLookup<T> =
  | { ok: true; value: T }  // case-violation-ok-legacy-back-compat: matches the { ok, value } / { ok, result } result of ValidateStringParam (agent-tool-validation.ts)
  | { ok: false; result: AgentToolResult };  // case-violation-ok-legacy-back-compat: matches the { ok, value } / { ok, result } result of ValidateStringParam (agent-tool-validation.ts)

/**
 * Finds the item an agent named: an exact ID match first, then an exact name match that ignores
 * case. `kind` names the item in messages, for example "dashboard". When nothing matches, the
 * failure lists up to 25 available names.
 */
export function ResolveByIdOrName<T extends { ID: string; Name: string }>(items: readonly T[], raw: unknown, kind: string): AgentLookup<T> {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    return { ok: false, result: { Success: false, ErrorMessage: `A ${kind} ID or name is required.` } };
  }
  const lowered = value.toLowerCase();
  const match = items.find(i => UUIDsEqual(i.ID, value)) ?? items.find(i => (i.Name ?? '').toLowerCase() === lowered);
  if (match) {
    return { ok: true, value: match };
  }
  const available = BoundNameList(items.map(i => i.Name)).join(', ') || '(none)';
  return { ok: false, result: { Success: false, ErrorMessage: `No ${kind} named or identified by "${value}". Available: ${available}.` } };
}
