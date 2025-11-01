import { Component, ChangeDetectorRef, ElementRef, OnInit } from '@angular/core';
import { SubmissionEntity, EventEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { ActivatedRoute, Router } from '@angular/router';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';

@Component({
  selector: 'mj-submission-form',
  templateUrl: './submission-form.component.html',
  styleUrls: ['../shared/form-styles.css', './submission-form.component.css']
})
@RegisterClass(BaseFormComponent, 'Submissions')
export class SubmissionFormComponent extends BaseFormComponent implements OnInit {
  public record!: SubmissionEntity;

  // Form data
  public events: EventEntity[] = [];
  public loadingEvents = false;

  // Status options (from entity metadata)
  public statusOptions: string[] = [
    'New', 'Analyzing', 'Passed Initial', 'Failed Initial',
    'Under Review', 'Accepted', 'Rejected', 'Waitlisted', 'Resubmitted'
  ];

  // Session format options (from entity metadata)
  public sessionFormatOptions: string[] = [
    'Workshop', 'Keynote', 'Panel', 'Lightning Talk',
    'Tutorial', 'Presentation', 'Roundtable', 'Other'
  ];

  // Target audience level options (from entity metadata)
  public audienceLevelOptions: string[] = [
    'Beginner', 'Intermediate', 'Advanced', 'All Levels'
  ];

  // Final decision options
  public finalDecisionOptions: string[] = [
    'Accepted', 'Rejected', 'Waitlisted'
  ];

  // Collapsible section state
  public sectionsExpanded = {
    basicInfo: true,     // Basic info expanded by default
    aiEvaluation: true,  // AI section expanded by default
    content: true,
    materials: false,
    reviewDecision: false,
    metadata: false      // Metadata collapsed by default
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
    await this.loadEvents();
  }

  private async loadEvents(): Promise<void> {
    this.loadingEvents = true;
    try {
      const rv = new RunView();
      const md = new Metadata();
      const result = await rv.RunView<EventEntity>({
        EntityName: 'Events',
        OrderBy: 'StartDate DESC',
        ResultType: 'entity_object'
      }, md.CurrentUser);

      if (result.Success && result.Results) {
        this.events = result.Results;
      }
    } catch (error) {
      console.error('Error loading events:', error);
      this.sharedService.CreateSimpleNotification('Error loading events', 'error', 3000);
    } finally {
      this.loadingEvents = false;
      this.cdr.detectChanges();
    }
  }

  public get isRecordReady(): boolean {
    return !!(this.record && !this.loadingEvents);
  }

  public get eventName(): string {
    if (!this.record.EventID) return 'Submission';
    const event = this.events.find(e => e.ID === this.record.EventID);
    return event ? event.Name : 'Submission';
  }

  public get showAIEvaluation(): boolean {
    // Check if ANY AI evaluation data exists
    return !!(
      this.record.AIEvaluationScore != null ||
      this.record.AIEvaluationReasoning ||
      this.record.SubmissionSummary ||
      this.record.PassedInitialScreening != null ||
      this.record.KeyTopics ||
      this.record.FailureReasons
    );
  }

  public get showFinalDecision(): boolean {
    return !!(this.record.FinalDecision || this.record.FinalDecisionDate);
  }

  public get aiScoreClass(): string {
    const score = this.record.AIEvaluationScore;
    if (score == null) return '';
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-fair';
    return 'score-poor';
  }

  public get statusBadgeClass(): string {
    const status = this.record.Status;
    if (!status) return 'badge-default';

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

  public getEventName(eventId: string): string {
    const event = this.events.find(e => e.ID === eventId);
    return event ? event.Name : 'Unknown Event';
  }

  public onDecisionDateChange(value: string | null): void {
    this.record.FinalDecisionDate = value ? new Date(value) : null;
  }

  public parseJsonArray(jsonString: string | null): string[] {
    if (!jsonString) return [];
    try {
      const parsed = JSON.parse(jsonString);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public toggleSection(section: keyof typeof this.sectionsExpanded): void {
    this.sectionsExpanded[section] = !this.sectionsExpanded[section];
  }

  public openEventRecord(): void {
    if (this.record.EventID) {
      this.sharedService.OpenEntityRecord('Events', CompositeKey.FromID(this.record.EventID));
    }
  }
}

export function LoadSubmissionFormComponent() {
  // Tree-shaking prevention
}
