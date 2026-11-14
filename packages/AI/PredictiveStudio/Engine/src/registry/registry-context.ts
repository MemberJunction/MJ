/**
 * @module registry/registry-context
 *
 * What every model-registry, gate and scoring call runs under: the request's user and the provider it runs on.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

/** The request's user and the provider (hence the connection and any open transaction) the call runs on. */
export interface RegistryContext {
  readonly ContextUser: UserInfo;
  readonly Provider: IMetadataProvider;
}
