import { NormalizeUUID } from '@memberjunction/global';

/**
 * The '/' picker's narrowing rule, as a pure function so it can be tested against the real code:
 * the skills to offer are the user's RUNNABLE set intersected with the target agent's ACCEPTED set
 * (`AIEngineBase.GetSkillsForAgent(agent)` — `AcceptsSkills` + `MJ: AI Agent Skills` grants).
 * Intersection only: the agent's set can remove a skill the user could run, never add one the user
 * could not. Order follows `runnable`. UUIDs are compared case-insensitively.
 */
export function IntersectAcceptedSkills<T extends { ID: string }>(runnable: T[], accepted: ReadonlyArray<{ ID: string }>): T[] {
  const acceptedIDs = new Set(accepted.map(sk => NormalizeUUID(sk.ID)));
  return runnable.filter(sk => acceptedIDs.has(NormalizeUUID(sk.ID)));
}
