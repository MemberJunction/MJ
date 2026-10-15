/**
 * The widget's non-live state scaffold: one component for every phase that is NOT the hosted overlay,
 * driven by a single `@switch`. Lifted from the Caliber widget's status component:
 *   • booting / connecting → the shared `mj-loading` skeleton with a phase-appropriate label — never a raw
 *     spinner;
 *   • ended → a thank-you panel with a primary Start-over action;
 *   • error → `mj-alert` with the message and a primary, actionable Try-again — NEVER a dead end.
 *
 * Focus is homed onto the primary action when an actionable surface appears, so a live → ended / error
 * transition never drops focus onto `<body>`.
 */
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJAlertComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { FormatWidgetString, type WidgetStrings } from '../strings';
import type { WidgetPhase } from '../types';

@Component({
  selector: 'mj-realtime-widget-status',
  standalone: true,
  imports: [SharedGenericModule, MJAlertComponent, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './widget-status.component.html'
})
export class WidgetStatusComponent implements AfterViewInit {
  private phaseValue: WidgetPhase = 'booting';
  private viewReady = false;

  /**
   * The phase to render. A SETTER so a phase change INTO an actionable surface (`ended` / `error`) — e.g. a
   * retry that fails again on the SAME mounted instance — re-homes focus onto its primary action.
   */
  @Input()
  public set Phase(value: WidgetPhase) {
    const changed = value !== this.phaseValue;
    this.phaseValue = value;
    if (changed && this.viewReady) {
      // Defer: let the @switch render the new case's button before we query + focus it.
      setTimeout(() => this.focusPrimaryAction(), 0);
    }
  }
  public get Phase(): WidgetPhase {
    return this.phaseValue;
  }

  @Input() Strings!: WidgetStrings;
  @Input() AgentName = 'Assistant';
  /** Overrides the loading label, the ended sub-message or the error detail. */
  @Input() Message: string | null = null;
  @Input() LogoUrl: string | null = null;

  /** The visitor asked to retry after an error. */
  @Output() Retry = new EventEmitter<void>();
  /** The visitor asked to start over after the call ended. */
  @Output() Restart = new EventEmitter<void>();

  @ViewChild('primaryAction') private primaryAction?: ElementRef<HTMLButtonElement>;

  public ngAfterViewInit(): void {
    this.viewReady = true;
    this.focusPrimaryAction();
  }

  private focusPrimaryAction(): void {
    if (this.phaseValue === 'ended' || this.phaseValue === 'error') {
      this.primaryAction?.nativeElement.focus();
    }
  }

  /** The label shown by the loading skeleton: an explicit message wins, else the phase's default. */
  public get LoadingLabel(): string {
    if (this.Message && this.Message.trim().length > 0) {
      return this.Message;
    }
    return this.Phase === 'connecting' ? this.Strings.connecting : this.Strings.booting;
  }

  public get ErrorMessage(): string {
    return this.Message && this.Message.trim().length > 0 ? this.Message : this.Strings.errorDefault;
  }

  public get EndedMessage(): string {
    return this.Message && this.Message.trim().length > 0 ? this.Message : FormatWidgetString(this.Strings.endedMessage, this.AgentName);
  }
}
