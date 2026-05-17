import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

import { ListOperations } from './ListOperations';
import type { ListSource, ResolvedRecordSet } from './types';

/**
 * `AudienceSource` is the same discriminated union as `ListSource` — same
 * `kind` discriminator, same payload shape — but named after its primary
 * downstream consumer (the Communications module). Defining it as a type
 * alias lets the Angular picker, the SendToAudience helper, and any
 * future audience-aware feature share one vocabulary with the list
 * operations stack without forcing them to import a "list" type.
 *
 * The plan reserves a `'union'` kind for composing multiple audiences
 * into one shipping list at send time. That is intentionally deferred —
 * V1 ships with `list | view | adhoc` only, matching `ListSource`. When
 * we add `'union'` we extend both types together so the operations and
 * audience surfaces stay in lockstep.
 */
export type AudienceSource = ListSource;

/**
 * Friendly-named entry point for resolving an `AudienceSource` to a
 * `ResolvedRecordSet`. Thin re-export over `ListOperations.ResolveSource`
 * — semantically identical, but callers reading audience-related code
 * don't need to know about the list-operations machinery underneath.
 *
 * Stateless on purpose; rebuild per call. Multi-provider safe: pass the
 * provider through and the underlying `ListOperations` will scope to it.
 */
export class AudienceResolver {
  private readonly contextUser: UserInfo;
  private readonly provider: IMetadataProvider | undefined;

  constructor(contextUser: UserInfo, provider?: IMetadataProvider) {
    this.contextUser = contextUser;
    this.provider = provider;
  }

  /**
   * Resolve an `AudienceSource` to the record IDs it represents +
   * the entity those IDs belong to. Never mutates.
   */
  public async Resolve(source: AudienceSource): Promise<ResolvedRecordSet> {
    const ops = new ListOperations(this.contextUser, this.provider);
    return ops.ResolveSource(source);
  }
}
