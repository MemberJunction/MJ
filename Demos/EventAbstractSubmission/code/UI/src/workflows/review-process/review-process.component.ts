import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { SubmissionService, AIEvaluation, HumanReview } from '../../services/submission.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export interface ReviewProcessConfig {
  showAIEvaluation: boolean;
  showHumanReviews: boolean;
  interactive: boolean;
  allowNewReview: boolean;
  compact: boolean;
}

/**
 * Review Process Component for displaying AI and human evaluation results
 * Shows comprehensive review information for abstract submissions
 */
@Component({
  selector: 'mj-review-process',
  templateUrl: './review-process.component.html',
  styleUrls: ['./review-process.component.scss']
})
export class ReviewProcessComponent implements OnInit, OnChanges {
  
  Math = Math; // Make Math available to template
  
  @Input() submissionId: string = '';
  @Input() config: ReviewProcessConfig = {
    showAIEvaluation: true,
    showHumanReviews: true,
    interactive: true,
    allowNewReview: false,
    compact: false
  };
  
  public aiEvaluation: AIEvaluation | null = null;
  public humanReviews: HumanReview[] = [];
  public isLoading = true;
  public showNewReviewForm = false;
  
  constructor(
    private submissionService: SubmissionService,
    private sanitizer: DomSanitizer
  ) {}
  
  ngOnInit(): void {
    if (this.submissionId) {
      this.loadReviewData();
    }
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['submissionId'] && this.submissionId) {
      this.loadReviewData();
    }
  }
  
  /**
   * Load review data
   */
  loadReviewData(): void {
    this.isLoading = true;
    
    const requests = [];
    
    if (this.config.showAIEvaluation) {
      requests.push(this.submissionService.getAIEvaluation(this.submissionId));
    }
    
    if (this.config.showHumanReviews) {
      requests.push(this.submissionService.getHumanReviews(this.submissionId));
    }
    
    Promise.all(requests.map(req => req.toPromise()))
      .then(([aiEval, humanReviews]) => {
        if (this.config.showAIEvaluation) {
          this.aiEvaluation = Array.isArray(aiEval) ? null : (aiEval || null);
        }
        if (this.config.showHumanReviews) {
          this.humanReviews = Array.isArray(humanReviews) ? humanReviews : [];
        }
        this.isLoading = false;
      })
      .catch((error) => {
        console.error('Error loading review data:', error);
        this.isLoading = false;
      });
  }
  
  /**
   * Get score color
   */
  public getScoreColor(score: number): string {
    if (score >= 8) return '#4caf50';
    if (score >= 6) return '#ff9800';
    return '#f44336';
  }
  
  /**
   * Get recommendation color
   */
  public getRecommendationColor(recommendation: string): string {
    switch (recommendation) {
      case 'approve':
        return '#4caf50';
      case 'reject':
        return '#f44336';
      case 'request-changes':
        return '#ff9800';
      default:
        return '#9e9e9e';
    }
  }
  
  /**
   * Get recommendation icon
   */
  public getRecommendationIcon(recommendation: string): string {
    switch (recommendation) {
      case 'approve':
        return 'thumb_up';
      case 'reject':
        return 'thumb_down';
      case 'request-changes':
        return 'edit';
      default:
        return 'help_outline';
    }
  }
  
  /**
   * Format date
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
   * Get average human review score
   */
  public getAverageReviewScore(): number {
    if (this.humanReviews.length === 0) return 0;
    const total = this.humanReviews.reduce((sum, review) => sum + review.rating, 0);
    return Math.round((total / this.humanReviews.length) * 10) / 10;
  }
  
  /**
   * Get review consensus
   */
  public getReviewConsensus(): string {
    if (this.humanReviews.length === 0) return 'No reviews';
    
    const recommendations = this.humanReviews.map(r => r.recommendation);
    const approve = recommendations.filter(r => r === 'approve').length;
    const reject = recommendations.filter(r => r === 'reject').length;
    const changes = recommendations.filter(r => r === 'request-changes').length;
    
    if (approve > reject && approve > changes) return 'Approve';
    if (reject > approve && reject > changes) return 'Reject';
    if (changes > approve && changes > reject) return 'Request Changes';
    return 'Mixed';
  }
  
  /**
   * Toggle new review form
   */
  public toggleNewReviewForm(): void {
    this.showNewReviewForm = !this.showNewReviewForm;
  }
  
  /**
   * Sanitize HTML content
   */
  public sanitizeHtml(content: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(content);
  }
  
  /**
   * Get confidence level text
   */
  public getConfidenceLevel(confidence: number): string {
    if (confidence >= 0.9) return 'Very High';
    if (confidence >= 0.7) return 'High';
    if (confidence >= 0.5) return 'Medium';
    return 'Low';
  }
}
