import { Component, Input } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-score-indicator',
  template: `
    <div class="score-indicator" [class]="getColorClass()">
      @if (showBar) {
        <div class="score-bar-container">
          <div class="score-bar" [style.width.%]="score * 100"></div>
        </div>
      }
      <div class="score-value">
        @if (showIcon) {
          <i [class]="getIcon()"></i>
        }
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
      background: var(--mj-border-default);
      border-radius: 3px;
      overflow: hidden;
    }

    .score-bar {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease, background-color 0.3s ease;
    }

    .score-indicator--excellent .score-bar {
      background: var(--mj-status-success);
    }

    .score-indicator--good .score-bar {
      background: var(--mj-status-success);
    }

    .score-indicator--fair .score-bar {
      background: var(--mj-status-warning);
    }

    .score-indicator--poor .score-bar {
      background: var(--mj-status-warning);
    }

    .score-indicator--fail .score-bar {
      background: var(--mj-status-error);
    }

    .score-value {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
      font-size: 13px;
    }

    .score-indicator--excellent .score-value {
      color: var(--mj-status-success);
    }

    .score-indicator--good .score-value {
      color: var(--mj-status-success);
    }

    .score-indicator--fair .score-value {
      color: var(--mj-status-warning);
    }

    .score-indicator--poor .score-value {
      color: var(--mj-status-warning);
    }

    .score-indicator--fail .score-value {
      color: var(--mj-status-error);
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
  @Input() Score!: number;

  /** @deprecated Use {@link Score}. */
  @Input() set score(value: number) {
    this.Score = value;
  }
  /** @deprecated Use {@link Score}. */
  get score(): number {
    return this.Score;
  } // 0-1.0000
  @Input() ShowBar = true;

  /** @deprecated Use {@link ShowBar}. */
  @Input() set showBar(value: ScoreIndicatorComponent['ShowBar']) {
    this.ShowBar = value;
  }
  /** @deprecated Use {@link ShowBar}. */
  get showBar(): ScoreIndicatorComponent['ShowBar'] {
    return this.ShowBar;
  }
  @Input() ShowIcon = true;

  /** @deprecated Use {@link ShowIcon}. */
  @Input() set showIcon(value: ScoreIndicatorComponent['ShowIcon']) {
    this.ShowIcon = value;
  }
  /** @deprecated Use {@link ShowIcon}. */
  get showIcon(): ScoreIndicatorComponent['ShowIcon'] {
    return this.ShowIcon;
  }
  @Input() Decimals = 4;

  /** @deprecated Use {@link Decimals}. */
  @Input() set decimals(value: ScoreIndicatorComponent['Decimals']) {
    this.Decimals = value;
  }
  /** @deprecated Use {@link Decimals}. */
  get decimals(): ScoreIndicatorComponent['Decimals'] {
    return this.Decimals;
  }

  FormatScore(score: number): string {
    if (score == null) return 'N/A';
    return score.toFixed(this.Decimals);
  }

  /** @deprecated Use {@link FormatScore}. */
  formatScore(score: number): string {
    return this.FormatScore(score);
  }

  GetColorClass(): string {
    if (this.Score >= 0.9) return 'score-indicator--excellent';
    if (this.Score >= 0.8) return 'score-indicator--good';
    if (this.Score >= 0.6) return 'score-indicator--fair';
    if (this.Score >= 0.4) return 'score-indicator--poor';
    return 'score-indicator--fail';
  }

  /** @deprecated Use {@link GetColorClass}. */
  getColorClass(): string {
    return this.GetColorClass();
  }

  GetIcon(): string {
    if (this.Score >= 0.9) return 'fa-solid fa-star';
    if (this.Score >= 0.8) return 'fa-solid fa-check';
    if (this.Score >= 0.6) return 'fa-solid fa-minus';
    if (this.Score >= 0.4) return 'fa-solid fa-exclamation';
    return 'fa-solid fa-times';
  }

  /** @deprecated Use {@link GetIcon}. */
  getIcon(): string {
    return this.GetIcon();
  }
}
