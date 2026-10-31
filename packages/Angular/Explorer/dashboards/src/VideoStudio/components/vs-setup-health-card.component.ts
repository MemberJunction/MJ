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
 * - **All OK:** renders a single compact `"Setup OK"` line that expands on click to reveal per-subsystem details.
 * - **Only warnings:** renders a single quiet `"Ready, with N notes"` line (collapsed by default) that expands on click.
 * - **An error:** renders a single status-error line (`"Video Studio can't make videos yet: <title>"`, message, and `"Details"` toggle).
 * - `Action` text and `Details` live under a `"Details for admins"` toggle inside each expanded note.
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
  @Input() Expanded = false;

  @Output() Recheck = new EventEmitter<void>();
  @Output() ExpandedChange = new EventEmitter<boolean>();

  public WarningsExpanded = false;
  public ErrorDetailsExpanded = false;
  private readonly openAdminDetailsKeys = new Set<string>();

  public get Checks(): VideoStudioSetupHealthCheck[] {
    return this.Result?.Checks ?? [];
  }

  public get NonOkChecks(): VideoStudioSetupHealthCheck[] {
    return this.Checks.filter((check) => check.Status !== 'OK');
  }

  public get ErrorChecks(): VideoStudioSetupHealthCheck[] {
    return this.Checks.filter((check) => check.Status === 'Error');
  }

  public get WarningChecks(): VideoStudioSetupHealthCheck[] {
    return this.Checks.filter((check) => check.Status === 'Warning');
  }

  public get HasError(): boolean {
    return Boolean(this.Result && (!this.Result.Healthy || this.ErrorChecks.length > 0));
  }

  public get IsHealthy(): boolean {
    return Boolean(this.Result && !this.HasError);
  }

  public get IsWarningsOnly(): boolean {
    return Boolean(this.IsHealthy && this.WarningChecks.length > 0);
  }

  public get IsAllOk(): boolean {
    return Boolean(this.IsHealthy && this.NonOkChecks.length === 0);
  }

  public get PrimaryErrorCheck(): VideoStudioSetupHealthCheck | null {
    return this.ErrorChecks[0] ?? this.NonOkChecks[0] ?? null;
  }

  public get ErrorHeadline(): string {
    return `Video Studio can't make videos yet: ${this.PrimaryErrorCheck?.Title ?? 'Setup issue'}`;
  }

  public get WarningsSummaryLabel(): string {
    const count = this.WarningChecks.length;
    return `Ready, with ${count} ${count === 1 ? 'note' : 'notes'}`;
  }

  public ToggleExpanded(): void {
    this.Expanded = !this.Expanded;
    this.ExpandedChange.emit(this.Expanded);
  }

  public ToggleWarningsExpanded(): void {
    this.WarningsExpanded = !this.WarningsExpanded;
  }

  public ToggleErrorDetails(): void {
    this.ErrorDetailsExpanded = !this.ErrorDetailsExpanded;
  }

  public HasAdminDetails(check: VideoStudioSetupHealthCheck): boolean {
    return Boolean(check.Action || (check.Details && check.Details.length > 0));
  }

  public IsAdminDetailsOpen(key: string): boolean {
    return this.openAdminDetailsKeys.has(key);
  }

  public ToggleAdminDetails(key: string): void {
    if (this.openAdminDetailsKeys.has(key)) {
      this.openAdminDetailsKeys.delete(key);
    } else {
      this.openAdminDetailsKeys.add(key);
    }
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
