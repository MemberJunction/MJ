import { Component, ChangeDetectorRef, EventEmitter, Input, Output, SecurityContext, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ConvertDocxToHtml, FetchArrayBuffer, type MammothModuleShim } from './office-preview.logic';

/**
 * Renders a Word document (.docx) inline: fetches the bytes from `Url` (or takes them from `ArrayBuffer`), converts
 * them to HTML with mammoth and shows the sanitized result. Explorer's one Word renderer: the artifact viewer wraps it
 * with its toolbar, and the Files form shows it in its preview pane.
 *
 * `Loaded` fires with the raw HTML once the document is shown; `Failed` fires with the reason when it cannot be.
 */
@Component({
  standalone: false,
  selector: 'mj-docx-preview',
  template: `
    <div class="docx-preview">
      @if (IsLoading) {
        <div class="docx-preview__state">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading document…</span>
        </div>
      } @else if (ErrorMessage) {
        <div class="docx-preview__state docx-preview__state--error">
          <i class="fas fa-exclamation-triangle"></i>
          <span>{{ ErrorMessage }}</span>
        </div>
      } @else {
        <div class="docx-preview__content" [innerHTML]="SafeHtml"></div>
      }
    </div>
  `,
  styles: [
    `
      .docx-preview {
        height: 100%;
        min-height: 0;
        overflow: auto;
        background: var(--mj-bg-surface);
      }

      .docx-preview__state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        height: 100%;
        min-height: 160px;
        color: var(--mj-text-muted);
        font-size: 14px;
      }

      .docx-preview__state--error {
        color: var(--mj-status-error-text);
      }

      .docx-preview__content {
        padding: 32px 48px;
        max-width: 900px;
        margin: 0 auto;
        color: var(--mj-text-primary);
        font-size: 14px;
        line-height: 1.7;
      }

      /* Normalize what mammoth produces */
      .docx-preview__content :is(h1, h2, h3, h4, h5, h6) {
        color: var(--mj-text-primary);
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }

      .docx-preview__content table {
        border-collapse: collapse;
        width: 100%;
        margin: 1em 0;
      }

      .docx-preview__content :is(td, th) {
        border: 1px solid var(--mj-border-default);
        padding: 6px 10px;
      }

      .docx-preview__content th {
        background: var(--mj-bg-surface-card);
        font-weight: 600;
      }

      .docx-preview__content a {
        color: var(--mj-text-link);
      }

      .docx-preview__content img {
        max-width: 100%;
        height: auto;
      }
    `,
  ],
})
export class DocxPreviewComponent {
  /** Where to fetch the document's bytes. Ignored when `ArrayBuffer` is set. */
  @Input()
  public set Url(value: string | null) {
    this._url = value;
    void this.load();
  }
  public get Url(): string | null {
    return this._url;
  }
  private _url: string | null = null;
  /** The document's bytes, when the caller already has them. */
  @Input()
  public set ArrayBuffer(value: ArrayBuffer | null) {
    this._arrayBuffer = value;
    void this.load();
  }
  public get ArrayBuffer(): ArrayBuffer | null {
    return this._arrayBuffer;
  }
  private _arrayBuffer: ArrayBuffer | null = null;

  /** The raw HTML mammoth produced, once the document is shown. */
  @Output() Loaded = new EventEmitter<string>();
  /** Why the document could not be shown. */
  @Output() Failed = new EventEmitter<string>();

  public IsLoading = true;
  public ErrorMessage = '';
  public SafeHtml: SafeHtml = '';
  /** The HTML as mammoth produced it, before sanitizing: what a print window renders. */
  public RawHtml = '';

  private loadToken = 0;

  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);


  private async load(): Promise<void> {
    const token = ++this.loadToken;
    this.IsLoading = true;
    this.ErrorMessage = '';
    this.cdr.markForCheck();
    try {
      const bytes = this.ArrayBuffer ?? (this.Url ? await FetchArrayBuffer(this.Url) : null);
      if (!bytes) {
        // Neither input holds anything yet: the setter that fires first lands here. Wait for the other, do not error.
        if (this._url === null && this._arrayBuffer === null) return;
        this.showError('No document to show.');
        return;
      }
      const mammoth = (await import('mammoth')) as unknown as MammothModuleShim;
      const html = await ConvertDocxToHtml(bytes, mammoth);
      if (token !== this.loadToken) return; // a newer input won
      this.RawHtml = html;
      this.SafeHtml = this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
      this.IsLoading = false;
      this.cdr.markForCheck();
      this.Loaded.emit(html);
    } catch (err) {
      if (token !== this.loadToken) return;
      this.showError(`Could not load document: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private showError(message: string): void {
    this.IsLoading = false;
    this.ErrorMessage = message;
    this.cdr.markForCheck();
    this.Failed.emit(message);
  }
}
