import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { AudienceSource, ResolvedRecordSet } from '@memberjunction/lists-base';

import { ListOperations } from './ListOperations';

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
