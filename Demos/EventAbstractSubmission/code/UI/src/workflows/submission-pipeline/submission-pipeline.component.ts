import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { SubmissionService, SubmissionWorkflow, WorkflowStage } from '../../services/submission.service';

export interface PipelineConfig {
  showDetails?: boolean;
  interactive?: boolean;
  compact?: boolean;
}

/**
 * Submission Pipeline Component for visualizing abstract submission workflow
 * Shows the complete journey from draft to final decision
 */
@Component({
  selector: 'mj-submission-pipeline',
  templateUrl: './submission-pipeline.component.html',
  styleUrls: ['./submission-pipeline.component.scss']
})
export class SubmissionPipelineComponent implements OnInit, OnChanges {
  
  @Input() submissionId: string = '';
  @Input() config: PipelineConfig = {
    showDetails: true,
    interactive: true,
    compact: false
  };
  
  public workflow: SubmissionWorkflow | null = null;
  public isLoading = true;
  public selectedStage: WorkflowStage | null = null;
  
  constructor(
    private submissionService: SubmissionService
  ) {}
  
  ngOnInit(): void {
    if (this.submissionId) {
      this.loadWorkflow();
    }
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['submissionId'] && this.submissionId) {
      this.loadWorkflow();
    }
  }
  
  /**
   * Load workflow data
   */
  loadWorkflow(): void {
    this.isLoading = true;
    
    this.submissionService.getSubmissionWorkflow(this.submissionId)
      .subscribe({
        next: (workflow) => {
          this.workflow = workflow;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading workflow:', error);
          this.isLoading = false;
        }
      });
  }
  
  /**
   * Select a stage to view details
   */
  public selectStage(stage: WorkflowStage): void {
    if (this.config.interactive) {
      this.selectedStage = this.selectedStage?.id === stage.id ? null : stage;
    }
  }
  
  /**
   * Get stage color based on status
   */
  public getStageColor(stage: WorkflowStage): string {
    switch (stage.status) {
      case 'completed':
        return '#4caf50';
      case 'in-progress':
        return '#ff9800';
      case 'pending':
        return '#9e9e9e';
      case 'skipped':
        return '#f44336';
      default:
        return '#9e9e9e';
    }
  }
  
  /**
   * Get stage icon
   */
  public getStageIcon(stage: WorkflowStage): string {
    switch (stage.id) {
      case 'draft':
        return 'edit';
      case 'submission':
        return 'send';
      case 'ai-evaluation':
        return 'smart_toy';
      case 'human-review':
        return 'rate_review';
      case 'decision':
        return 'gavel';
      case 'speaker-confirmation':
        return 'person_check';
      default:
        return 'help_outline';
    }
  }
  
  /**
   * Check if stage is active
   */
  public isStageActive(stage: WorkflowStage): boolean {
    return stage.status === 'in-progress';
  }
  
  /**
   * Check if stage is completed
   */
  public isStageCompleted(stage: WorkflowStage): boolean {
    return stage.status === 'completed';
  }
  
  /**
   * Get stage progress percentage
   */
  public getStageProgress(): number {
    if (!this.workflow) return 0;
    const completedStages = this.workflow.stages.filter(s => s.status === 'completed').length;
    return Math.round((completedStages / this.workflow.stages.length) * 100);
  }
  
  /**
   * Format completion date
   */
  public formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  /**
   * Get status text for display
   */
  public getStatusText(status: string): string {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in-progress':
        return 'In Progress';
      case 'pending':
        return 'Pending';
      case 'skipped':
        return 'Skipped';
      default:
        return 'Unknown';
    }
  }
}
