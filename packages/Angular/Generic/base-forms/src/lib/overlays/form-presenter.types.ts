import { BaseEntity, CompositeKey, IMetadataProvider } from '@memberjunction/core';
import { BaseFormComponent } from '../base-form-component';
import { EntityFormConfig } from '../types/entity-form-config';
import { FormOverlayCloseReason } from './base-form-overlay';

/** How a form should be presented by {@link MJFormPresenterService}. */
export type MJFormPresentation = 'dialog' | 'slide-in' | 'window';

/**
 * Options for {@link MJFormPresenterService.Open}. Supply EITHER a pre-loaded
 * `Record`, OR `EntityName` + (`RecordId` / `PrimaryKey`) to load it (omit both
 * keys for a new record).
 */
export interface MJFormPresenterOptions {
  /** Dialog (default), slide-in, or floating non-modal window. */
  Presentation?: MJFormPresentation;

  // ── Record selection ──
  /** Entity name to load (ignored when `Record` is supplied). */
  EntityName?: string;
  /** Single-column ('ID') key convenience. */
  RecordId?: string;
  /** Full composite key (beats `RecordId`). */
  PrimaryKey?: CompositeKey;
  /** Pre-loaded record to bind directly. */
  Record?: BaseEntity;
  /** New-record default values (URL-segment string or object). */
  NewRecordValues?: string | Record<string, unknown>;
  /** Render a single registered form section instead of the full form. */
  SectionName?: string;
  /** Force edit mode (default: new → edit, existing → read). */
  EditMode?: boolean;

  // ── Presentation / config ──
  /** Per-instance form config; defaults to the surface's preset. */
  Config?: EntityFormConfig;
  /** Chrome title; derived from the record when omitted. */
  Title?: string;
  /** Metadata provider for multi-provider apps. */
  Provider?: IMetadataProvider;
  /** Dialog width (px or CSS). */
  Width?: number | string;
  /** Slide-in initial width in px. */
  WidthPx?: number;
  /** Show the Save/Cancel footer. Default: true. */
  ShowFooter?: boolean;
  /** Save button label. */
  SaveButtonText?: string;
  /** Cancel button label. */
  CancelButtonText?: string;
}

/**
 * Handle to a form opened via {@link MJFormPresenterService.Open}.
 * Resolve {@link AfterSaved} / {@link AfterClosed} or imperatively {@link Close}.
 */
export class MJFormRef {
  constructor(
    private readonly _saved: Promise<BaseEntity | null>,
    private readonly _closed: Promise<FormOverlayCloseReason>,
    private readonly _closeFn: () => void,
    private readonly _form: () => BaseFormComponent | null,
  ) {}

  /** Resolves with the saved entity, or `null` if the form was cancelled. */
  AfterSaved(): Promise<BaseEntity | null> { return this._saved; }

  /** Resolves with how the overlay closed ('save' | 'cancel'). */
  AfterClosed(): Promise<FormOverlayCloseReason> { return this._closed; }

  /** Programmatically close the overlay (treated as cancel — reverts edits). */
  Close(): void { this._closeFn(); }

  /** The live form component instance (null before load / after teardown). */
  get Form(): BaseFormComponent | null { return this._form(); }
}
