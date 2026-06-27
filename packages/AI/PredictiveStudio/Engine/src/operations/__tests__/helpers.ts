/**
 * @module operations/__tests__/helpers
 *
 * Shared test fixtures for the Predictive Studio Remote Operation unit tests — a
 * stub provider / user and a capturing {@link RemoteOpServerContext} so each test can
 * drive a server operation's `ExecuteServer` with NO live DB / sidecar and assert
 * both the mapped output AND the emitted progress.
 */

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { RemoteOpServerContext } from '@memberjunction/core';
import type { RemoteOpProgress } from '@memberjunction/core';

/** A minimal stub provider — the engine seams are mocked, so it is never dereferenced. */
export function stubProvider(): IMetadataProvider {
  return {} as unknown as IMetadataProvider;
}

/** A minimal stub user threaded through delegation for isolation/audit. */
export function stubUser(): UserInfo {
  return { ID: 'test-user', Email: 'test@example.com', Name: 'Test User' } as unknown as UserInfo;
}

/** A capturing server context — records every progress event and exposes the user/provider. */
export class CapturingContext implements RemoteOpServerContext {
  public readonly provider: IMetadataProvider;
  public readonly user: UserInfo;
  public readonly Progress: RemoteOpProgress[] = [];
  public handle?: string;

  constructor(provider: IMetadataProvider = stubProvider(), user: UserInfo = stubUser()) {
    this.provider = provider;
    this.user = user;
  }

  public emitProgress = (progress: RemoteOpProgress): void => {
    this.Progress.push(progress);
  };
}
