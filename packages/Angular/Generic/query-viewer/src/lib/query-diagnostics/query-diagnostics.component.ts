import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { QueryDiagnosticLine } from '@memberjunction/core-entities';

/** How serious the listed findings are; it sets the list's colour and icon. */
export type QueryDiagnosticsSeverity = 'error' | 'warning' | 'info';

/**
 * `<mj-query-diagnostics>` — lists findings about a query's SQL: the reasons a save was refused,
 * or the messages of its last metadata extraction. Each finding shows its rule code, its line and
 * column (a button when `LocationsClickable`, so a host can move its editor there), the message,
 * and the fix when there is one.
 *
 * Presentational: findings in, a location click out. Read a refused save's message with
 * `ParseQuerySaveMessage` and an `ExtractionMessage` with `ParseQueryDiagnostics`
 * (`@memberjunction/core-entities`).
 */
@Component({
    standalone: true,
    selector: 'mj-query-diagnostics',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (Diagnostics.length > 0 || Headline) {
      <div class="mj-query-diagnostics" [class]="'mj-query-diagnostics mj-query-diagnostics--' + Severity" [attr.role]="Severity === 'error' ? 'alert' : 'status'">
        @if (Headline) {
          <div class="qd-headline">
            <i class="fa-solid" [class]="IconClass"></i>
            <span>{{ Headline }}</span>
          </div>
        }
        <ul class="qd-list">
          @for (d of Diagnostics; track $index) {
            <li class="qd-item">
              <div class="qd-item-top">
                @if (d.Code) {
                  <code class="qd-code">{{ d.Code }}</code>
                }
                @if (d.Line !== null && d.Column !== null) {
                  @if (LocationsClickable) {
                    <button type="button" class="qd-location qd-location--link" (click)="LocationClick.emit(d)"
                      [attr.aria-label]="'Go to line ' + d.Line + ', column ' + d.Column">
                      Line {{ d.Line }}, column {{ d.Column }}
                    </button>
                  } @else {
                    <span class="qd-location">Line {{ d.Line }}, column {{ d.Column }}</span>
                  }
                }
              </div>
              <div class="qd-message">{{ d.Message }}</div>
              @if (d.FixHint) {
                <div class="qd-fix"><i class="fa-solid fa-lightbulb"></i> {{ d.FixHint }}</div>
              }
            </li>
          }
        </ul>
      </div>
    }
  `,
    styles: [`
    :host { display: block; }
    .mj-query-diagnostics {
      --qd-accent: var(--mj-status-error);
      border: 1px solid color-mix(in srgb, var(--qd-accent) 35%, transparent);
      border-left: 3px solid var(--qd-accent);
      background: color-mix(in srgb, var(--qd-accent) 6%, var(--mj-bg-surface));
      border-radius: var(--mj-radius-md);
      padding: var(--mj-space-3) var(--mj-space-4);
      color: var(--mj-text-primary);
      font-size: var(--mj-text-sm);
    }
    .mj-query-diagnostics--warning { --qd-accent: var(--mj-status-warning); }
    .mj-query-diagnostics--info { --qd-accent: var(--mj-status-info); }
    .qd-headline { display: flex; gap: var(--mj-space-2); align-items: center; font-weight: var(--mj-font-semibold); margin-bottom: var(--mj-space-2); }
    .qd-headline i { color: var(--qd-accent); }
    .qd-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mj-space-2); }
    .qd-item { display: flex; flex-direction: column; gap: var(--mj-space-1); }
    .qd-item + .qd-item { border-top: 1px solid var(--mj-border-subtle); padding-top: var(--mj-space-2); }
    .qd-item-top { display: flex; gap: var(--mj-space-2); align-items: center; flex-wrap: wrap; }
    .qd-code { font-family: var(--mj-font-family-mono); font-size: var(--mj-text-xs); background: var(--mj-bg-surface-sunken); color: var(--mj-text-secondary); border-radius: var(--mj-radius-sm); padding: 0 var(--mj-space-1); }
    .qd-location { font-size: var(--mj-text-xs); color: var(--mj-text-secondary); }
    .qd-location--link { background: none; border: none; padding: 0; cursor: pointer; color: var(--mj-brand-primary); text-decoration: underline; font: inherit; font-size: var(--mj-text-xs); }
    .qd-location--link:focus-visible { outline: 2px solid var(--mj-brand-primary); outline-offset: 2px; }
    .qd-message { line-height: 1.4; }
    .qd-fix { color: var(--mj-text-secondary); line-height: 1.4; }
    .qd-fix i { color: var(--qd-accent); }
  `],
})
export class QueryDiagnosticsComponent {
    /** The findings to list. */
    @Input() Diagnostics: readonly QueryDiagnosticLine[] = [];
    /** A line introducing them, such as `Query "X" was not saved:`. */
    @Input() Headline: string | null = null;
    @Input() Severity: QueryDiagnosticsSeverity = 'error';
    /** Whether a finding's line and column are a button that emits {@link LocationClick}. */
    @Input() LocationsClickable = false;
    /** A finding whose location the user clicked. */
    @Output() LocationClick = new EventEmitter<QueryDiagnosticLine>();

    public get IconClass(): string {
        switch (this.Severity) {
            case 'error': return 'fa-circle-exclamation';
            case 'warning': return 'fa-triangle-exclamation';
            case 'info': return 'fa-circle-info';
        }
    }
}
