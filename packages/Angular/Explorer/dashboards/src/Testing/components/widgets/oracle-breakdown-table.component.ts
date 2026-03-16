import { Component, Input } from '@angular/core';

export interface OracleResult {
  name: string;
  status: 'Passed' | 'Failed' | 'Skipped' | 'Error';
  score: number;
  cost: number;
  duration: number; // milliseconds
  errorMessage?: string;
  details?: any;
}

@Component({
  standalone: false,
  selector: 'app-oracle-breakdown-table',
  template: `
    <div class="oracle-breakdown">
      <div class="breakdown-header">
        <h4>
          <i class="fa-solid fa-balance-scale"></i>
          Oracle Results
        </h4>
        @if (results && results.length > 0) {
          <div class="aggregate-score">
            <span class="label">Aggregate:</span>
            <app-score-indicator [score]="getAggregateScore()" [showBar]="false"></app-score-indicator>
          </div>
        }
      </div>
    
      <div class="breakdown-content">
        @if (results && results.length > 0) {
          <div class="oracle-table">
            <div class="table-header">
              <div class="header-cell">Oracle</div>
              <div class="header-cell">Status</div>
              <div class="header-cell">Score</div>
              <div class="header-cell">Cost</div>
              <div class="header-cell">Duration</div>
            </div>
    
            @for (oracle of results; track oracle.name) {
              <div class="table-row" [class.has-error]="oracle.errorMessage">
                <div class="table-cell">
                  <div class="oracle-name">
                    @if (oracle.status === 'Passed') {
                      <i class="fa-solid fa-check-circle oracle-icon"></i>
                    }
                    @if (oracle.status === 'Failed') {
                      <i class="fa-solid fa-times-circle oracle-icon"></i>
                    }
                    @if (oracle.status === 'Error') {
                      <i class="fa-solid fa-exclamation-triangle oracle-icon"></i>
                    }
                    @if (oracle.status === 'Skipped') {
                      <i class="fa-solid fa-forward oracle-icon"></i>
                    }
                    <span>{{ oracle.name }}</span>
                  </div>
                </div>
                <div class="table-cell">
                  <app-test-status-badge [status]="oracle.status" [showIcon]="false"></app-test-status-badge>
                </div>
                <div class="table-cell">
                  <app-score-indicator [score]="oracle.score" [showBar]="true"></app-score-indicator>
                </div>
                <div class="table-cell">
                  <app-cost-display [cost]="oracle.cost" [showIcon]="true" [decimals]="6"></app-cost-display>
                </div>
                <div class="table-cell">
                  {{ formatDuration(oracle.duration) }}
                </div>
              </div>
    
              @if (oracle.errorMessage) {
                <div class="error-row">
                  <div class="error-message">
                    <i class="fa-solid fa-exclamation-circle"></i>
                    {{ oracle.errorMessage }}
                  </div>
                </div>
              }
            }
          </div>
    
          <div class="breakdown-summary">
            <div class="summary-item">
              <span class="summary-label">Total Cost:</span>
              <app-cost-display [cost]="getTotalCost()" [showIcon]="true"></app-cost-display>
            </div>
            <div class="summary-item">
              <span class="summary-label">Total Duration:</span>
              <span class="summary-value">{{ formatDuration(getTotalDuration()) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Oracles Run:</span>
              <span class="summary-value">{{ results.length }}</span>
            </div>
          </div>
        } @else {
          <div class="no-results">
            <i class="fa-solid fa-inbox"></i>
            <p>No oracle results available</p>
          </div>
        }
      </div>
    </div>
    `,
  styles: [`
    .oracle-breakdown {
      background: var(--mj-bg-surface);
      border-radius: 8px;
      overflow: hidden;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .breakdown-header {
      padding: 16px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .breakdown-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .breakdown-header h4 i {
      color: var(--mj-brand-primary);
    }

    .aggregate-score {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

    .aggregate-score .label {
      color: var(--mj-text-secondary);
      font-weight: 500;
    }

    .breakdown-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .oracle-table {
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      overflow: hidden;
    }

    .table-header {
      display: grid;
      grid-template-columns: 2fr 120px 150px 120px 100px;
      gap: 12px;
      padding: 12px 16px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
      font-size: 11px;
      font-weight: 600;
      color: var(--mj-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .table-row {
      display: grid;
      grid-template-columns: 2fr 120px 150px 120px 100px;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--mj-border-default);
      align-items: center;
      transition: background 0.2s ease;
    }

    .table-row:hover {
      background: var(--mj-bg-surface-card);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .table-row.has-error {
      border-left: 3px solid var(--mj-status-error);
    }

    .table-cell {
      font-size: 12px;
      color: var(--mj-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .oracle-name {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }

    .oracle-icon {
      font-size: 11px;
    }

    .oracle-icon.fa-check-circle {
      color: var(--mj-status-success);
    }

    .oracle-icon.fa-times-circle {
      color: var(--mj-status-error);
    }

    .oracle-icon.fa-exclamation-triangle {
      color: var(--mj-status-warning);
    }

    .oracle-icon.fa-forward {
      color: var(--mj-text-disabled);
    }

    .error-row {
      padding: 8px 16px;
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      border-bottom: 1px solid var(--mj-border-default);
      border-left: 3px solid var(--mj-status-warning);
    }

    .error-message {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 11px;
      color: var(--mj-status-warning);
      font-family: monospace;
      line-height: 1.4;
    }

    .error-message i {
      flex-shrink: 0;
      margin-top: 2px;
    }

    .breakdown-summary {
      margin-top: 16px;
      padding: 16px;
      background: var(--mj-bg-surface-card);
      border-radius: 6px;
      display: flex;
      justify-content: space-around;
      gap: 16px;
    }

    .summary-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: center;
    }

    .summary-label {
      font-size: 10px;
      color: var(--mj-text-secondary);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .summary-value {
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .no-results {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--mj-text-disabled);
      gap: 12px;
    }

    .no-results i {
      font-size: 36px;
      color: var(--mj-border-default);
    }

    .no-results p {
      margin: 0;
      font-size: 13px;
    }

    @media (max-width: 768px) {
      .table-header,
      .table-row {
        grid-template-columns: 1fr;
        gap: 8px;
      }

      .table-cell {
        display: block;
      }

      .breakdown-summary {
        flex-direction: column;
        gap: 12px;
      }
    }
  `]
})
export class OracleBreakdownTableComponent {
  @Input() results: OracleResult[] = [];

  formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  getAggregateScore(): number {
    if (!this.results || this.results.length === 0) return 0;
    const total = this.results.reduce((sum, r) => sum + r.score, 0);
    return total / this.results.length;
  }

  getTotalCost(): number {
    if (!this.results || this.results.length === 0) return 0;
    return this.results.reduce((sum, r) => sum + r.cost, 0);
  }

  getTotalDuration(): number {
    if (!this.results || this.results.length === 0) return 0;
    return this.results.reduce((sum, r) => sum + r.duration, 0);
  }
}
