/**
 * The event contract of the Predictive Studio L2 widgets that save: a cancelable `Before*` event a host can veto, and
 * an `After*` event with the outcome. The `After*` event is not emitted when the `Before*` event was canceled.
 */
import type { VersionedEntityName } from './versioned-list/lineage-reads';

/** Which binding of a pipeline changes. */
export type BindingKind = 'unit' | 'protocol';

/** Base of the cancelable events: a listener sets `Cancel = true` (and may say why) to stop the action. */
export class CancellablePredictiveStudioEventArgs {
  public Cancel = false;
  public CancelReason?: string;
}

/** Fired before a new version row is saved. Cancel to stop the save. */
export class BeforeVersionSavedEventArgs<TDraft> extends CancellablePredictiveStudioEventArgs {
  constructor(
    public readonly EntityName: VersionedEntityName,
    /** The version number the new row will carry. */
    public readonly Version: number,
    public readonly Draft: TDraft,
  ) {
    super();
  }
}

/** Fired after a save of a new version row was attempted (not fired when the `Before*` event was canceled). */
export class AfterVersionSavedEventArgs {
  constructor(
    public readonly EntityName: VersionedEntityName,
    public readonly Version: number,
    /** The saved row's ID (for version 1, the ID the server gave it); null when the save failed. */
    public readonly ID: string | null,
    public readonly Success: boolean,
    public readonly ErrorMessage: string | null = null,
  ) {}
}

/** Fired before a pipeline is rebound to another unit or protocol version. Cancel to stop the save. */
export class BeforeBindingChangedEventArgs extends CancellablePredictiveStudioEventArgs {
  constructor(
    public readonly PipelineID: string,
    public readonly Which: BindingKind,
    /** The version row the pipeline will be bound to. */
    public readonly VersionID: string,
  ) {
    super();
  }
}

/** Fired after a rebinding save was attempted (not fired when the `Before*` event was canceled). */
export class AfterBindingChangedEventArgs {
  constructor(
    public readonly PipelineID: string,
    public readonly Which: BindingKind,
    public readonly VersionID: string,
    public readonly Success: boolean,
    public readonly ErrorMessage: string | null = null,
  ) {}
}
