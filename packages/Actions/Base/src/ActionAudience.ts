import type { UserInfo } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";

/**
 * The people, besides the caller, who will see what an action returns — set on
 * {@link RunActionParams.Audience} by an agent run that has an audience (`ExecuteAgentParams.Audience`).
 *
 * The same shape as `SearchParams.Audience` in `@memberjunction/search-engine`, declared here because this
 * package does not depend on that one: an action that searches can pass it straight through.
 */
export interface ActionRunAudience {
   /**
    * Readers besides the caller, as hydrated `UserInfo` objects (each with a non-empty `ID` and a
    * `UserRoles` array). Listing the caller, or a reader twice, is harmless: the engine normalizes the
    * list before the action runs (see {@link ActionAudienceReaders}).
    */
   Readers: UserInfo[];
}

/**
 * The result code `ActionEngineServer.RunAction` returns, without running the action, when the run has an
 * audience that adds a reader and the action has not declared it can honour one (`BaseAction.SupportsAudience`),
 * or is a runtime-defined or deferred action. An agent treats it as fatal: the action is locked out for the run.
 */
export const AUDIENCE_UNSUPPORTED_RESULT_CODE = 'AUDIENCE_UNSUPPORTED';

/**
 * The readers an audience adds beyond the caller: one per distinct `ID` (case-insensitive), the caller's own
 * left out. `[]` when there is no audience or it adds nobody; `null` when it is malformed (`Readers` not an
 * array, a reader that is not an object or has no `ID`), which callers treat as adding a reader, so a malformed
 * audience never runs as if there were none.
 *
 * Takes `unknown`: hosts assemble the audience at runtime.
 */
export function ActionAudienceReaders(audience: unknown, contextUser: UserInfo | undefined): UserInfo[] | null {
   if (audience === undefined) return [];
   const readers = audience !== null && typeof audience === 'object' && 'Readers' in audience ? audience.Readers : undefined;
   if (!Array.isArray(readers)) return null;
   const distinct: UserInfo[] = [];
   for (const reader of readers as unknown[]) {
      if (!isIdentifiedReader(reader)) return null;
      const known = UUIDsEqual(reader.ID, contextUser?.ID) || distinct.some(r => UUIDsEqual(r.ID, reader.ID));
      if (!known) distinct.push(reader);
   }
   return distinct;
}

/**
 * Whether an audience adds a reader beyond the caller — the condition under which an action that cannot honour
 * an audience is refused. A malformed audience counts as adding one (fails closed).
 */
export function ActionAudienceAddsReader(audience: unknown, contextUser: UserInfo | undefined): boolean {
   const readers = ActionAudienceReaders(audience, contextUser);
   return readers === null || readers.length > 0;
}

/** A reader object with a non-blank `ID`. Role hydration is the search engine's to validate. */
function isIdentifiedReader(reader: unknown): reader is UserInfo {
   if (reader === null || typeof reader !== 'object' || !('ID' in reader)) return false;
   return typeof reader.ID === 'string' && reader.ID.trim().length > 0;
}
