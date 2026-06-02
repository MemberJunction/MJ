import { BaseEntity, CompositeKey, IMetadataProvider } from '@memberjunction/core';
import { BaseFormComponent } from '../base-form-component';
import { EntityFormConfig } from '../types/entity-form-config';
import { FormOverlayCloseReason } from './base-form-overlay';

/** How a form should be presented by {@link MJFormPresenterService}. */
export type MJFormPresentation = 'dialog' | 'slide-in';

/**
 * Options for {@link MJFormPresenterService.open}. Supply EITHER a pre-loaded
 * `record`, OR `entityName` + (`recordId` / `primaryKey`) to load it (omit both
 * keys for a new record).
 */
export interface MJFormPresenterOptions {
  /** Dialog (default) or slide-in. */
  presentation?: MJFormPresentation;

  // ── Record selection ──
  /** Entity name to load (ignored when `record` is supplied). */
  entityName?: string;
  /** Single-column ('ID') key convenience. */
  recordId?: string;
  /** Full composite key (beats `recordId`). */
  primaryKey?: CompositeKey;
  /** Pre-loaded record to bind directly. */
  record?: BaseEntity;
  /** New-record default values (URL-segment string or object). */
  newRecordValues?: string | Record<string, unknown>;
  /** Force edit mode (default: new → edit, existing → read). */
  editMode?: boolean;

  // ── Presentation / config ──
  /** Per-instance form config; defaults to the surface's preset. */
  config?: EntityFormConfig;
  /** Chrome title; derived from the record when omitted. */
  title?: string;
  /** Metadata provider for multi-provider apps. */
  provider?: IMetadataProvider;
  /** Dialog width (px or CSS). */
  width?: number | string;
  /** Slide-in initial width in px. */
  widthPx?: number;
  /** Show the Save/Cancel footer. Default: true. */
  showFooter?: boolean;
  /** Save button label. */
  saveButtonText?: string;
  /** Cancel button label. */
  cancelButtonText?: string;
}

/**
 * Handle to a form opened via {@link MJFormPresenterService.open}.
 * Resolve {@link afterSaved} / {@link afterClosed} or imperatively {@link close}.
 */
export class MJFormRef {
  constructor(
    private readonly _saved: Promise<BaseEntity | null>,
    private readonly _closed: Promise<FormOverlayCloseReason>,
    private readonly _closeFn: () => void,
    private readonly _form: () => BaseFormComponent | null,
  ) {}

  /** Resolves with the saved entity, or `null` if the form was cancelled. */
  afterSaved(): Promise<BaseEntity | null> { return this._saved; }

  /** Resolves with how the overlay closed ('save' | 'cancel'). */
  afterClosed(): Promise<FormOverlayCloseReason> { return this._closed; }

  /** Programmatically close the overlay (treated as cancel — reverts edits). */
  close(): void { this._closeFn(); }

  /** The live form component instance (null before load / after teardown). */
  get form(): BaseFormComponent | null { return this._form(); }
}
