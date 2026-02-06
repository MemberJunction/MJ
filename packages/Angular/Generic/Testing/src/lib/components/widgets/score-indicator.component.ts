import { Component, Input } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-score-indicator',
  template: `
    <div class="score-indicator" [class]="getColorClass()">
      <div class="score-bar-container" *ngIf="showBar">
        <div class="score-bar" [style.width.%]="score * 100"></div>
      </div>
      <div class="score-value">
        <i [class]="getIcon()" *ngIf="showIcon"></i>
        <span class="score-text">{{ formatScore(score) }}</span>
      </div>
    </div>
  `,
  styles: [`
    .score-indicator {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .score-bar-container {
      width: 60px;
      height: 6px;
      background: #e0e0e0;
      border-radius: 3px;
      overflow: hidden;
    }

    .score-bar {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease, background-color 0.3s ease;
    }

    .score-indicator--excellent .score-bar {
      background: linear-gradient(90deg, #4caf50, #66bb6a);
    }

    .score-indicator--good .score-bar {
      background: linear-gradient(90deg, #8bc34a, #9ccc65);
    }

    .score-indicator--fair .score-bar {
      background: linear-gradient(90deg, #ffc107, #ffca28);
    }

    .score-indicator--poor .score-bar {
      background: linear-gradient(90deg, #ff9800, #ffa726);
    }

    .score-indicator--fail .score-bar {
      background: linear-gradient(90deg, #f44336, #e57373);
    }

    .score-value {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
      font-size: 13px;
    }

    .score-indicator--excellent .score-value {
      color: #4caf50;
    }

    .score-indicator--good .score-value {
      color: #8bc34a;
    }

    .score-indicator--fair .score-value {
      color: #ffc107;
    }

    .score-indicator--poor .score-value {
      color: #ff9800;
    }

    .score-indicator--fail .score-value {
      color: #f44336;
    }

    .score-value i {
      font-size: 11px;
    }

    .score-text {
      font-family: 'Courier New', monospace;
      letter-spacing: 0.5px;
    }

    @media (max-width: 768px) {
      .score-bar-container {
        width: 40px;
      }

      .score-value {
        font-size: 12px;
      }
    }
  `]
})
export class ScoreIndicatorComponent {
  @Input() score!: number; // 0-1.0000
  @Input() showBar = true;
  @Input() showIcon = true;
  @Input() decimals = 4;

  formatScore(score: number): string {
    if (score == null) return 'N/A';
    return score.toFixed(this.decimals);
  }

  getColorClass(): string {
    if (this.score >= 0.9) return 'score-indicator--excellent';
    if (this.score >= 0.8) return 'score-indicator--good';
    if (this.score >= 0.6) return 'score-indicator--fair';
    if (this.score >= 0.4) return 'score-indicator--poor';
    return 'score-indicator--fail';
  }

  getIcon(): string {
    if (this.score >= 0.9) return 'fa-solid fa-star';
    if (this.score >= 0.8) return 'fa-solid fa-check';
    if (this.score >= 0.6) return 'fa-solid fa-minus';
    if (this.score >= 0.4) return 'fa-solid fa-exclamation';
    return 'fa-solid fa-times';
  }
}
