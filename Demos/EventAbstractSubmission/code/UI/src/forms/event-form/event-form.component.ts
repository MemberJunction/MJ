import { Component, ChangeDetectorRef, ElementRef, OnInit } from '@angular/core';
import { EventEntity, SubmissionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { ActivatedRoute, Router } from '@angular/router';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';

@Component({
  selector: 'mj-event-form',
  templateUrl: './event-form.component.html',
  styleUrls: ['../shared/form-styles.css', './event-form.component.css']
})
@RegisterClass(BaseFormComponent, 'Events')
export class EventFormComponent extends BaseFormComponent implements OnInit {
  public record!: EventEntity;

  // Submissions data
  public submissions: SubmissionEntity[] = [];
  public loadingSubmissions = false;

  // Status options (from entity metadata)
  public statusOptions: string[] = [
    'Planning', 'Open for Submissions', 'Submissions Closed',
    'Review in Progress', 'Completed', 'Cancelled'
  ];

  // Collapsible section state
  public sectionsExpanded = {
    basicInfo: true,
    dates: true,
    details: true,
    submissions: true,
    metadata: false
  };

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    router: Router,
    route: ActivatedRoute,
    cdr: ChangeDetectorRef
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }

  override async ngOnInit() {
    await super.ngOnInit();
    if (this.record?.ID) {
      await this.loadSubmissions();
    }
  }

  private async loadSubmissions(): Promise<void> {
    if (!this.record?.ID) return;

    this.loadingSubmissions = true;
    try {
      const rv = new RunView();
      const md = new Metadata();
      const result = await rv.RunView<SubmissionEntity>({
        EntityName: 'Submissions',
        ExtraFilter: `EventID='${this.record.ID}'`,
        OrderBy: 'SubmittedAt DESC',
        ResultType: 'entity_object'
      }, md.CurrentUser);

      if (result.Success && result.Results) {
        this.submissions = result.Results;
      }
    } catch (error) {
      console.error('Error loading submissions:', error);
      this.sharedService.CreateSimpleNotification('Error loading submissions', 'error', 3000);
    } finally {
      this.loadingSubmissions = false;
      this.cdr.detectChanges();
    }
  }

  public get isRecordReady(): boolean {
    return !!this.record;
  }

  public get submissionsStats() {
    const total = this.submissions.length;
    const accepted = this.submissions.filter(s => s.Status === 'Accepted').length;
    const rejected = this.submissions.filter(s => s.Status === 'Rejected').length;
    const underReview = this.submissions.filter(s => s.Status === 'Under Review').length;
    const passedInitial = this.submissions.filter(s => s.Status === 'Passed Initial').length;

    return { total, accepted, rejected, underReview, passedInitial };
  }

  public get statusBadgeClass(): string {
    const status = this.record.Status;
    if (!status) return 'badge-default';

    const statusMap: { [key: string]: string } = {
      'Planning': 'badge-info',
      'Open for Submissions': 'badge-success',
      'Submissions Closed': 'badge-warning',
      'Review in Progress': 'badge-warning',
      'Completed': 'badge-secondary',
      'Cancelled': 'badge-danger'
    };

    return statusMap[status] || 'badge-default';
  }

  public onStartDateChange(value: string | null): void {
    if (value) {
      this.record.StartDate = new Date(value);
    }
  }

  public onEndDateChange(value: string | null): void {
    if (value) {
      this.record.EndDate = new Date(value);
    }
  }

  public onSubmissionDeadlineChange(value: string | null): void {
    if (value) {
      this.record.SubmissionDeadline = new Date(value);
    }
  }

  public toggleSection(section: keyof typeof this.sectionsExpanded): void {
    this.sectionsExpanded[section] = !this.sectionsExpanded[section];
  }

  public getSubmissionStatusClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      'New': 'badge-info',
      'Analyzing': 'badge-warning',
      'Passed Initial': 'badge-success',
      'Failed Initial': 'badge-danger',
      'Under Review': 'badge-warning',
      'Accepted': 'badge-success',
      'Rejected': 'badge-danger',
      'Waitlisted': 'badge-secondary',
      'Resubmitted': 'badge-info'
    };
    return statusMap[status] || 'badge-default';
  }

  public openSubmissionRecord(submissionId: string): void {
    if (submissionId) {
      this.sharedService.OpenEntityRecord('Submissions', CompositeKey.FromID(submissionId));
    }
  }

  public goToDashboard(): void {
    this.router.navigate(['app', 'Events']);
  }
}

export function LoadEventFormComponent() {
  // Tree-shaking prevention
}
