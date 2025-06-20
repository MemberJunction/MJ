import { Component, OnInit, OnDestroy } from '@angular/core';
import { SystemValidationService, SystemValidationIssue } from '../services/system-validation.service';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'mj-system-validation-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="issues.length > 0" class="system-validation-wrapper">
      <!-- Dark overlay for serious errors -->
      <div *ngIf="hasErrors" class="system-validation-overlay"></div>
      
      <div class="system-validation-container">
        <div *ngFor="let issue of issues" 
             class="system-validation-banner" 
             [ngClass]="'system-validation-' + issue.severity">
          <div class="banner-content">
            <div class="banner-icon">
              <span *ngIf="issue.severity === 'error'" class="severity-icon severity-error">❌</span>
              <span *ngIf="issue.severity === 'warning'" class="severity-icon severity-warning">⚠️</span>
              <span *ngIf="issue.severity === 'info'" class="severity-icon severity-info">ℹ️</span>
            </div>
            <div class="banner-message">
              <h3>{{ issue.message }}</h3>
              <p *ngIf="issue.details">{{ issue.details }}</p>
              <p *ngIf="issue.help" class="help-text">{{ issue.help }}</p>
            </div>
            <div class="banner-close">
              <button *ngIf="issue.severity !== 'error'" (click)="dismissIssue(issue.id)" aria-label="Dismiss" class="dismiss-button">
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .system-validation-wrapper {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      pointer-events: none;
    }
    
    .system-validation-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 10001;
      pointer-events: auto;
    }
    
    .system-validation-container {
      position: fixed;
      top: 60px;
      left: 0;
      right: 0;
      z-index: 10002;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
      max-height: 80vh;
      overflow-y: auto;
      pointer-events: auto;
    }

    .system-validation-banner {
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      padding: 16px;
      animation: slide-down 0.3s ease-out;
    }

    .system-validation-error {
      background-color: #ffebee;
      border-left: 4px solid #f44336;
    }

    .system-validation-warning {
      background-color: #fff8e1;
      border-left: 4px solid #ff9800;
    }

    .system-validation-info {
      background-color: #e3f2fd;
      border-left: 4px solid #2196f3;
    }

    .banner-content {
      display: flex;
      align-items: flex-start;
    }

    .banner-icon {
      margin-right: 16px;
      font-size: 24px;
    }

    .severity-icon {
      font-size: 18px;
    }

    .severity-error {
      color: #f44336;
    }

    .severity-warning {
      color: #ff9800;
    }

    .severity-info {
      color: #2196f3;
    }

    .banner-message {
      flex: 1;
    }

    .banner-message h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .banner-message p {
      margin: 4px 0 0 0;
      font-size: 14px;
    }

    .help-text {
      font-style: italic;
    }

    .dismiss-button {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 16px;
      color: #666;
      padding: 4px;
    }

    .dismiss-button:hover {
      color: #333;
    }

    @keyframes slide-down {
      0% {
        transform: translateY(-20px);
        opacity: 0;
      }
      100% {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `]
})
export class SystemValidationBannerComponent implements OnInit, OnDestroy {
  issues: SystemValidationIssue[] = [];
  hasErrors = false;
  private subscription: Subscription | undefined;

  constructor(private validationService: SystemValidationService) { }

  ngOnInit() {
    this.subscription = this.validationService.validationIssues$.subscribe(issues => {
      this.issues = issues;
      
      // Check if there are any error-level issues
      this.hasErrors = issues.some(issue => issue.severity === 'error');
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  dismissIssue(id: string) {
    this.validationService.removeIssue(id);
  }
}