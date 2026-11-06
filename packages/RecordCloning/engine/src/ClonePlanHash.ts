/**
 * @file ClonePlanHash.ts
 * SHA-256 of a clone plan's canonical form. The hash detects a plan that changed between review
 * and Execute (`PLAN_CHANGED`); only the server computes it, and the browser echoes it back.
 */

import { createHash } from 'node:crypto';
import { CanonicalPlanPayload, ClonePlanHashInput } from '@memberjunction/record-cloning-base';

/** Hex SHA-256 of `text`, encoded as UTF-8. */
export function Sha256Hex(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The plan hash: SHA-256 over `CanonicalPlanPayload`, which ignores target keys and masks encrypted values. */
export function ComputeClonePlanHash(plan: ClonePlanHashInput): string {
    return Sha256Hex(CanonicalPlanPayload(plan));
}
