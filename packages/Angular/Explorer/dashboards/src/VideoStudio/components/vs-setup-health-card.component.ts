import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  VideoStudioSetupHealthCheck,
  VideoStudioSetupHealthCheckStatus,
  VideoStudioSetupHealthOutput,
} from '@memberjunction/core-entities';
import { MJRefreshButtonComponent } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

/**
 * Pure standalone view card displaying Video Studio setup health (`VideoStudio.SetupHealth`).
 *
 * - When `Result.Healthy` is true and all checks are `OK`, renders a single compact `"Setup OK"`
 *   line that expands on click to reveal per-subsystem details.
 * - Whenever any check is non-`OK` (`Warning` or `Error`), renders one row per non-`OK` check
 *   with status icon, title, message, remediation action, and optional details.
 */
@Component({
  standalone: true,
  selector: 'vs-setup-health-card, mj-vs-setup-health-card',
  imports: [CommonModule, MJRefreshButtonComponent, SharedGenericModule],
  templateUrl: './vs-setup-health-card.component.html',
  styleUrls: ['./vs-setup-health-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VSSetupHealthCardComponent {
  @Input() Result: VideoStudioSetupHealthOutput | null = null;
  @Input() Loading = false;

  @Output() Recheck = new EventEmitter<void>();

  public Expanded = false;

  public get Checks(): VideoStudioSetupHealthCheck[] {
    return this.Result?.Checks ?? [];
  }

  public get NonOkChecks(): VideoStudioSetupHealthCheck[] {
    return this.Checks.filter((check) => check.Status !== 'OK');
  }

  public get IsHealthy(): boolean {
    return Boolean(this.Result && this.Result.Healthy);
  }

  public ToggleExpanded(): void {
    this.Expanded = !this.Expanded;
  }

  public OnRecheckClick(): void {
    this.Recheck.emit();
  }

  public IconForStatus(status: VideoStudioSetupHealthCheckStatus): string {
    switch (status) {
      case 'OK':
        return 'fa-solid fa-circle-check';
      case 'Warning':
        return 'fa-solid fa-triangle-exclamation';
      case 'Error':
      default:
        return 'fa-solid fa-circle-exclamation';
    }
  }
}
