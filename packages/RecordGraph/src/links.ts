import type { CompositeKey } from '@memberjunction/core';

export type LinkKind = 'hard' | 'soft';

/**
 * Resolves the value to write into a foreign key / pointer column when linking to a target record.
 *
 * - 'hard' (or isSoftLink=false): returns the target record's primary key value (for single-column PKs, GetValueByIndex(0)).
 * - 'soft' (or isSoftLink=true): returns the canonical prefixed polymorphic encoding produced by `CompositeKey.ToRecordID()`.
 *
 * @param kindOrIsSoft 'hard' | 'soft' string or boolean (true = soft, false = hard)
 * @param targetKey The target record's CompositeKey
 */
export function ResolveLinkValue(kindOrIsSoft: LinkKind | boolean, targetKey: CompositeKey): unknown {
    const isSoft = typeof kindOrIsSoft === 'boolean' ? kindOrIsSoft : kindOrIsSoft === 'soft';
    return isSoft ? targetKey.ToRecordID() : targetKey.GetValueByIndex(0);
}
