/**
 * @fileoverview Before/After cancelable event argument classes for the
 * Record Attachments widget.
 *
 * Follows MemberJunction's established Before/After cancelable event pattern:
 * - Action events come in `Before*` / `After*` pairs.
 * - `Before*` event carries an args object extending {@link CancellableAttachmentEventArgs}
 *   with a `Cancel: boolean` property the listener can set to true to halt the operation.
 * - Component checks `if (event.Cancel) return;` before proceeding and emits the
 *   corresponding `After*` only on the successful, non-canceled path.
 *
 * @module @memberjunction/ng-file-storage
 */

import { RecordAttachmentItem } from './record-attachments.types';
import { MJFileEntity } from '@memberjunction/core-entities';

/**
 * Base class for cancelable attachment events. Listeners set `Cancel = true` to
 * halt default behavior; the matching `After*` event will NOT fire.
 */
export class CancellableAttachmentEventArgs {
  /**
   * Set to true to cancel the default action.
   * Default: false
   */
  public Cancel: boolean = false;

  /**
   * Optional reason string for cancellation (for debugging/notifications).
   */
  public CancelReason?: string;
}

// ────────────────────────────────────────────────────────────────────
// Upload Lifecycle
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE selected files are uploaded and linked to the record.
 * Listeners can cancel (e.g., custom file validation, virus check, budget caps).
 */
export class BeforeUploadAttachmentEventArgs extends CancellableAttachmentEventArgs {
  constructor(
    public readonly Files: File[],
    public readonly StorageAccountID?: string,
    public readonly CategoryID?: string
  ) {
    super();
  }
}

/**
 * Fired AFTER files have been uploaded and linked to the record.
 */
export class AfterUploadAttachmentEventArgs {
  constructor(
    public readonly Attachments: RecordAttachmentItem[],
    public readonly UploadedFiles: MJFileEntity[]
  ) {}
}

// ────────────────────────────────────────────────────────────────────
// Delete Lifecycle (Hard delete from storage)
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE an attachment is hard-deleted from storage and the database.
 */
export class BeforeDeleteAttachmentEventArgs extends CancellableAttachmentEventArgs {
  constructor(
    public readonly Attachment: RecordAttachmentItem,
    public readonly HardDelete: boolean = true
  ) {
    super();
  }
}

/**
 * Fired AFTER an attachment has been deleted.
 */
export class AfterDeleteAttachmentEventArgs {
  constructor(
    public readonly Attachment: RecordAttachmentItem,
    public readonly HardDeleted: boolean
  ) {}
}

// ────────────────────────────────────────────────────────────────────
// Unlink Lifecycle (Soft detach from record)
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE an attachment is unlinked from the record (keeping file in storage).
 */
export class BeforeUnlinkAttachmentEventArgs extends CancellableAttachmentEventArgs {
  constructor(public readonly Attachment: RecordAttachmentItem) {
    super();
  }
}

/**
 * Fired AFTER an attachment has been unlinked from the record.
 */
export class AfterUnlinkAttachmentEventArgs {
  constructor(public readonly Attachment: RecordAttachmentItem) {}
}

// ────────────────────────────────────────────────────────────────────
// Download Lifecycle
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE a signed download URL is requested or launched.
 */
export class BeforeDownloadAttachmentEventArgs extends CancellableAttachmentEventArgs {
  constructor(public readonly Attachment: RecordAttachmentItem) {
    super();
  }
}

/**
 * Fired AFTER a download URL has been resolved.
 */
export class AfterDownloadAttachmentEventArgs {
  constructor(
    public readonly Attachment: RecordAttachmentItem,
    public readonly DownloadUrl: string
  ) {}
}

// ────────────────────────────────────────────────────────────────────
// Preview Lifecycle
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE an attachment preview is opened. Listeners can cancel or open a custom previewer.
 */
export class BeforePreviewAttachmentEventArgs extends CancellableAttachmentEventArgs {
  constructor(public readonly Attachment: RecordAttachmentItem) {
    super();
  }
}

/**
 * Fired AFTER an attachment preview is opened.
 */
export class AfterPreviewAttachmentEventArgs {
  constructor(public readonly Attachment: RecordAttachmentItem) {}
}

// ────────────────────────────────────────────────────────────────────
// Replace Lifecycle
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE an existing attachment is replaced with a newly uploaded file.
 */
export class BeforeReplaceAttachmentEventArgs extends CancellableAttachmentEventArgs {
  constructor(
    public readonly Attachment: RecordAttachmentItem,
    public readonly NewFile: File
  ) {
    super();
  }
}

/**
 * Fired AFTER an attachment has been replaced with a new file.
 */
export class AfterReplaceAttachmentEventArgs {
  constructor(
    public readonly OldAttachment: RecordAttachmentItem,
    public readonly NewAttachment: RecordAttachmentItem
  ) {}
}
