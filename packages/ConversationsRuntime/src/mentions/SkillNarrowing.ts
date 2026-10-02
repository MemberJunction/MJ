import { NormalizeUUID } from '@memberjunction/global';

/**
 * The `/` picker's narrowing rule: the skills to offer are the user's RUNNABLE set intersected
 * with the target agent's ACCEPTED set (`AIEngineBase.GetSkillsForAgent(agent)` — `AcceptsSkills`
 * plus its `MJ: AI Agent Skills` grants).
 *
 * Intersection only. The agent's set can remove a skill the user could run; it can never add one
 * the user could not — the permission filter is upstream and this must not widen it. Order follows
 * `runnable`, and UUIDs compare case-insensitively because casing differs by platform.
 *
 * Pure by design so it can be tested directly rather than through a picker.
 */
export function IntersectAcceptedSkills<T extends { ID: string }>(
    runnable: T[],
    accepted: ReadonlyArray<{ ID: string }>,
): T[] {
    const acceptedIDs = new Set(accepted.map((sk) => NormalizeUUID(sk.ID)));
    return runnable.filter((sk) => acceptedIDs.has(NormalizeUUID(sk.ID)));
}
