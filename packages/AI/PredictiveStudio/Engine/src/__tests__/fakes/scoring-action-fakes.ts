import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';

import type { ScoringActionSync } from '../../registry/gate-context';

/** One call the lifecycle gate made to its scoring-Action seam. */
export interface ScoringActionCall {
  readonly Method: keyof ScoringActionSync;
  readonly ModelID: string;
}

/**
 * A {@link ScoringActionSync} that records each call (method and model) and touches no Action metadata. `FailNext`
 * makes the next call throw that message once, the way a failed read surfaces through the generator; `DisableRefused`
 * makes every `DisableForModel` report false, the way a refused Action save does.
 */
export class RecordingScoringActions implements ScoringActionSync {
  public readonly Log: ScoringActionCall[] = [];
  /** True: every `DisableForModel` reports that the Action's save was refused (false). */
  public DisableRefused: boolean;
  private failNext: string | null;

  constructor(options: { readonly FailNext?: string; readonly DisableRefused?: boolean } = {}) {
    this.failNext = options.FailNext || null;
    this.DisableRefused = options.DisableRefused === true;
  }

  /** The method names called, in order. */
  public get Calls(): ReadonlyArray<keyof ScoringActionSync> {
    return this.Log.map((c) => c.Method);
  }

  public async GenerateForModel(model: MJMLModelEntity, _contextUser: UserInfo, _provider: IMetadataProvider): Promise<void> {
    this.record('GenerateForModel', model);
  }

  public async DisableForModel(model: MJMLModelEntity, _contextUser: UserInfo, _provider: IMetadataProvider): Promise<boolean> {
    this.record('DisableForModel', model);
    return !this.DisableRefused;
  }

  private record(method: keyof ScoringActionSync, model: MJMLModelEntity): void {
    this.Log.push({ Method: method, ModelID: model.ID });
    const failure = this.failNext;
    if (failure !== null) {
      this.failNext = null;
      throw new Error(failure);
    }
  }
}
