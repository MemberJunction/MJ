/**
 * The pre-call consent gate — the `consent` phase surface.
 *
 * Lifted from the Caliber widget's consent gate and generalized (no assessment copy, no recording policy).
 * It is PURELY DECLARATIVE: the microphone is provably not started because this component never injects,
 * references or reaches the realtime runtime. It renders a plain-language notice and emits the visitor's
 * decision; the host starts the call (and only then the microphone) on `Accepted`.
 *
 * Dialog-button rule: the primary "Begin" action is LEFT, the "Not now" decline is RIGHT.
 */
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { FormatWidgetString, type WidgetStrings } from '../strings';

@Component({
  selector: 'mj-realtime-widget-consent-gate',
  standalone: true,
  imports: [MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './widget-consent-gate.component.html'
})
export class WidgetConsentGateComponent implements AfterViewInit {
  /** The copy to render. */
  @Input() Strings!: WidgetStrings;
  /** The agent's display name. */
  @Input() AgentName = 'Assistant';
  /** DATA, rendered as an `<img>` — not a token. */
  @Input() LogoUrl: string | null = null;
  /** Overrides the greeting heading. */
  @Input() Greeting: string | null = null;

  /** The visitor accepted. */
  @Output() Accepted = new EventEmitter<void>();
  /** The visitor declined — nothing starts. */
  @Output() Declined = new EventEmitter<void>();

  /**
   * The gate's region container. Focusable (never a tab stop) so that when the host mounts this surface,
   * entry focus lands on the region rather than on `<body>` — WITHOUT stealing focus onto a control.
   */
  @ViewChild('consentRegion') private consentRegion?: ElementRef<HTMLElement>;

  public ngAfterViewInit(): void {
    this.consentRegion?.nativeElement.focus();
  }

  public Text(key: keyof WidgetStrings): string {
    return FormatWidgetString(this.Strings[key], this.AgentName);
  }

  public get Heading(): string {
    const greeting = this.Greeting?.trim();
    return greeting && greeting.length > 0 ? greeting : this.Strings.consentGreeting;
  }
}
