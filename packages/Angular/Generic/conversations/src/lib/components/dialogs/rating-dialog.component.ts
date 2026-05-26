import { Component, Input } from '@angular/core';

@Component({
  standalone: false,
  selector: 'mj-rating-dialog',
  template: `
    <div class="rating-dialog">
      @if (message) {
        <p class="dialog-message">{{ message }}</p>
      }

      <div
        class="rating-scale"
        role="radiogroup"
        aria-label="Rating from 1 to 10"
        (mouseleave)="onScaleMouseLeave()">
        @for (n of scale; track n) {
          <button
            type="button"
            class="rating-pip"
            [class.filled]="isFilled(n)"
            [class.selected]="selectedRating === n"
            [attr.data-band]="bandFor(n)"
            [attr.aria-checked]="selectedRating === n"
            role="radio"
            (click)="selectRating(n)"
            (mouseenter)="hoveredRating = n"
            (focus)="hoveredRating = n"
            (blur)="onPipBlur()">
            {{ n }}
          </button>
        }
      </div>

      <div class="rating-meta">
        <span class="legend-edge">1 — Worst</span>
        <span class="selected-caption" [attr.data-band]="effectiveBand">
          @if (effectiveRating !== null) {
            <strong>{{ effectiveRating }}/10</strong>
            <span class="dot">·</span>
            <span>{{ getDescriptor(effectiveRating) }}</span>
          } @else {
            <span class="muted">Pick a number</span>
          }
        </span>
        <span class="legend-edge legend-right">10 — Best</span>
      </div>

      <div class="field">
        <div class="field-header">
          <label class="field-label" for="rating-comments">Tell us more</label>
          <span class="field-hint">Optional</span>
        </div>
        <textarea
          id="rating-comments"
          [(ngModel)]="comments"
          class="comment-textarea"
          placeholder="What was good or bad about this response?"
          rows="4"
          maxlength="2000">
        </textarea>
      </div>

      <div class="consent-note" [class.requires-consent]="requireConsent">
        <i class="fa-solid fa-shield-halved"></i>
        <div class="consent-body">
          <p class="consent-text">
            By submitting, you authorize the <strong>Integrations</strong> and
            <strong>Developer</strong> teams to view this conversation and the
            rated component so they can improve agent quality.
          </p>
          @if (requireConsent) {
            <label class="consent-checkbox">
              <input
                type="checkbox"
                [(ngModel)]="consentChecked"
                aria-label="I understand and accept the access authorization above" />
              <span>I understand and accept this.</span>
            </label>
            @if (!consentChecked) {
              <p class="consent-warning">Required to submit your feedback.</p>
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      --rd-text-primary: var(--mj-text-primary, #18181b);
      --rd-text-secondary: var(--mj-text-secondary, #52525b);
      --rd-text-muted: var(--mj-text-muted, #71717a);
      --rd-text-disabled: var(--mj-text-disabled, #a1a1aa);
      --rd-surface: var(--mj-bg-surface, #ffffff);
      --rd-border: var(--mj-border-default, #e4e4e7);
      --rd-border-strong: var(--mj-border-strong, #d4d4d8);
      --rd-brand: var(--mj-brand-primary, #6366f1);
      --rd-on-brand: var(--mj-text-on-brand, #ffffff);

      --rd-low: var(--mj-status-error, #ef4444);
      --rd-mid: var(--mj-status-warning, #f59e0b);
      --rd-high: var(--mj-status-success, #10b981);
    }

    .rating-dialog {
      box-sizing: border-box;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 4px 20px 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    }
    .rating-dialog * { box-sizing: border-box; }

    .dialog-message {
      margin: 0;
      color: var(--rd-text-secondary);
      font-size: 14px;
      line-height: 1.5;
    }

    /* ─── Pill row ─── */
    .rating-scale {
      display: grid;
      grid-template-columns: repeat(10, minmax(0, 1fr));
      gap: 6px;
      width: 100%;
    }
    .rating-pip {
      appearance: none;
      -webkit-appearance: none;
      width: 100%;
      min-width: 0;
      height: 40px;
      padding: 0;
      background: var(--rd-surface);
      border: 1px solid var(--rd-border);
      border-radius: 8px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--rd-text-secondary);
      cursor: pointer;
      transition: transform 100ms ease, background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
      font-variant-numeric: tabular-nums;
    }
    .rating-pip:hover {
      border-color: var(--rd-border-strong);
      color: var(--rd-text-primary);
    }
    .rating-pip:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--rd-brand) 25%, transparent);
    }
    .rating-pip.filled[data-band="low"]  { background: var(--rd-low);  border-color: var(--rd-low);  color: var(--rd-on-brand); }
    .rating-pip.filled[data-band="mid"]  { background: var(--rd-mid);  border-color: var(--rd-mid);  color: var(--rd-on-brand); }
    .rating-pip.filled[data-band="high"] { background: var(--rd-high); border-color: var(--rd-high); color: var(--rd-on-brand); }
    .rating-pip.selected { transform: translateY(-1px); }

    /* ─── Meta row: edge legend + center caption ─── */
    .rating-meta {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 8px;
      padding: 0 2px;
      margin-top: -2px;
      font-size: 11px;
      color: var(--rd-text-disabled);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .legend-edge { font-weight: 500; }
    .legend-right { text-align: right; }

    .selected-caption {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      text-transform: none;
      letter-spacing: 0;
      color: var(--rd-text-secondary);
      font-variant-numeric: tabular-nums;
    }
    .selected-caption strong { font-weight: 700; font-size: 13px; }
    .selected-caption .dot { color: var(--rd-text-disabled); }
    .selected-caption .muted { color: var(--rd-text-disabled); font-weight: 500; }
    .selected-caption[data-band="low"]  { color: var(--rd-low); }
    .selected-caption[data-band="mid"]  { color: var(--rd-mid); }
    .selected-caption[data-band="high"] { color: var(--rd-high); }

    /* ─── Comment field ─── */
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .field-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .field-label {
      font-weight: 600;
      font-size: 13px;
      color: var(--rd-text-primary);
    }
    .field-hint {
      font-size: 11px;
      color: var(--rd-text-disabled);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .comment-textarea {
      width: 100%;
      min-height: 88px;
      padding: 10px 12px;
      border: 1px solid var(--rd-border);
      border-radius: 8px;
      background: var(--rd-surface);
      color: var(--rd-text-primary);
      font-family: inherit;
      font-size: 13.5px;
      line-height: 1.5;
      resize: vertical;
      transition: border-color 140ms ease, box-shadow 140ms ease;
    }
    .comment-textarea::placeholder { color: var(--rd-text-disabled); }
    .comment-textarea:hover { border-color: var(--rd-border-strong); }
    .comment-textarea:focus {
      outline: none;
      border-color: var(--rd-brand);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--rd-brand) 18%, transparent);
    }

    /* ─── Consent note ─── */
    .consent-note {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 14px;
      background: color-mix(in srgb, var(--rd-brand) 6%, var(--rd-surface));
      border: 1px solid color-mix(in srgb, var(--rd-brand) 22%, var(--rd-border));
      border-radius: 8px;
    }
    .consent-note > i {
      color: var(--rd-brand);
      font-size: 14px;
      margin-top: 2px;
      flex-shrink: 0;
    }
    .consent-body { flex: 1; min-width: 0; }
    .consent-text {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--rd-text-secondary);
    }
    .consent-text strong { color: var(--rd-text-primary); font-weight: 600; }
    .consent-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      font-size: 12.5px;
      color: var(--rd-text-primary);
      font-weight: 500;
      cursor: pointer;
      user-select: none;
    }
    .consent-checkbox input {
      width: 15px;
      height: 15px;
      cursor: pointer;
      accent-color: var(--rd-brand);
    }
    .consent-warning {
      margin: 6px 0 0 23px;
      font-size: 11px;
      color: var(--rd-low);
      font-weight: 500;
    }
  `]
})
export class RatingDialogComponent {
  @Input() message: string = '';
  @Input() initialRating: number | null = null;
  @Input() initialComments: string = '';

  /** When true, the user must check the consent box before submitting. */
  @Input() requireConsent: boolean = false;

  readonly scale: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  selectedRating: number | null = null;
  hoveredRating: number | null = null;
  comments: string = '';
  consentChecked: boolean = false;

  ngOnInit(): void {
    this.selectedRating = this.initialRating;
    this.comments = this.initialComments ?? '';
  }

  get effectiveRating(): number | null {
    return this.hoveredRating ?? this.selectedRating;
  }

  get effectiveBand(): string | null {
    const r = this.effectiveRating;
    return r === null ? null : this.bandFor(r);
  }

  bandFor(n: number): 'low' | 'mid' | 'high' {
    if (n <= 3) return 'low';
    if (n <= 7) return 'mid';
    return 'high';
  }

  isFilled(n: number): boolean {
    const r = this.effectiveRating;
    return r !== null && r >= n;
  }

  selectRating(n: number): void {
    this.selectedRating = n;
  }

  onScaleMouseLeave(): void {
    this.hoveredRating = null;
  }

  onPipBlur(): void {
    this.hoveredRating = null;
  }

  getDescriptor(n: number): string {
    if (n <= 2) return 'Very Poor';
    if (n <= 4) return 'Needs Improvement';
    if (n <= 6) return 'Okay';
    if (n <= 8) return 'Good';
    return 'Excellent';
  }

  getRating(): number | null {
    return this.selectedRating;
  }

  getComments(): string {
    return (this.comments ?? '').trim();
  }

  /** True if the consent requirement is met (not required, or required and checked). */
  isConsentValid(): boolean {
    return !this.requireConsent || this.consentChecked;
  }

  /** True only when the user *just* acknowledged consent in this dialog session. */
  wasConsentNewlyAcknowledged(): boolean {
    return this.requireConsent && this.consentChecked;
  }
}
