import { Component, Input } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type {
  CriticRound,
  GateRecord,
  RubricCriterionScore,
  VideoGenerationSpec,
  VideoReviewRecord,
} from '@memberjunction/video-studio-core';

@Component({
  selector: 'mj-video-production-review-tab',
  standalone: false,
  template: `
    <div class="vp-review-tab">
      <!-- Gates Table -->
      <section class="vp-review-section">
        <h3 class="vp-section-title">Quality Gates</h3>
        @if (Gates.length > 0) {
          <div class="vp-table-wrapper">
            <table class="vp-table vp-gates-table">
              <thead>
                <tr>
                  <th>Gate</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                @for (gate of Gates; track gate.Gate) {
                  <tr class="vp-gate-row">
                    <td class="vp-cell-strong">{{ gate.Gate }}</td>
                    <td>
                      <span class="vp-status-badge" [attr.data-status]="gate.Status">{{ gate.Status }}</span>
                    </td>
                    <td>{{ gate.Notes || '—' }}</td>
                    <td class="vp-cell-mono">{{ gate.Timestamp }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="vp-empty-text">No gate results recorded.</p>
        }
      </section>

      <!-- Critic Rounds -->
      <section class="vp-review-section">
        <h3 class="vp-section-title">Critic Rounds</h3>
        @if (Rounds.length > 0) {
          @for (round of Rounds; track round.Round) {
            <div class="vp-round-card">
              <div class="vp-round-header">
                <span class="vp-round-title">Round {{ round.Round }}</span>
                <span class="vp-round-meta">{{ round.Timestamp }}</span>
              </div>
              @if (round.Summary) {
                <p class="vp-round-summary">{{ round.Summary }}</p>
              }
              @if (round.Defects && round.Defects.length > 0) {
                <div class="vp-table-wrapper">
                  <table class="vp-table vp-defects-table">
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>Format</th>
                        <th>Time</th>
                        <th>Beat</th>
                        <th>Criterion</th>
                        <th>Evidence</th>
                        <th>Fix</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (defect of round.Defects; track $index) {
                        <tr class="vp-defect-row">
                          <td>
                            <span class="vp-severity-badge" [attr.data-severity]="defect.Severity">
                              {{ defect.Severity }}
                            </span>
                          </td>
                          <td>{{ defect.Format || '—' }}</td>
                          <td class="vp-cell-mono">
                            {{ defect.Timestamp !== undefined ? defect.Timestamp + 's' : '—' }}
                          </td>
                          <td>{{ defect.Beat || '—' }}</td>
                          <td>{{ defect.Criterion || '—' }}</td>
                          <td>{{ defect.Evidence }}</td>
                          <td>{{ defect.Fix }}</td>
                          <td>{{ defect.Status }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="vp-empty-text">No defects reported in Round {{ round.Round }}.</p>
              }
            </div>
          }
        } @else {
          <p class="vp-empty-text">No critic rounds recorded.</p>
        }
      </section>

      <!-- Rubric Scores -->
      <section class="vp-review-section">
        <h3 class="vp-section-title">Rubric Scores</h3>
        @if (Review?.Scores; as scores) {
          <div class="vp-scores-summary">
            <span class="vp-overall-score">
              Overall Score: <strong>{{ scores.OverallScore }} / {{ scores.MaxScore }}</strong>
            </span>
            <span class="vp-status-badge" [attr.data-status]="scores.Passed ? 'Passed' : 'Failed'">
              {{ scores.Passed ? 'Passed' : 'Failed' }}
            </span>
          </div>
          @if (CriteriaScores.length > 0) {
            <div class="vp-table-wrapper">
              <table class="vp-table vp-scores-table">
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th>Score</th>
                    <th>Result</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of CriteriaScores; track item.Criterion) {
                    <tr class="vp-criterion-row">
                      <td class="vp-cell-strong">{{ item.Criterion }}</td>
                      <td class="vp-cell-mono">{{ item.Score }} / {{ item.MaxScore }}</td>
                      <td>{{ item.Passed ? 'Passed' : 'Failed' }}</td>
                      <td>{{ item.Notes || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        } @else {
          <p class="vp-empty-text">No rubric scores recorded.</p>
        }
      </section>

      <!-- Human Review Notes -->
      @if (Review?.HumanReviewNotes) {
        <section class="vp-review-section">
          <h3 class="vp-section-title">Human Review Notes</h3>
          <div class="vp-human-notes">{{ Review?.HumanReviewNotes }}</div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .vp-review-tab {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 16px;
        color: var(--mj-text-primary);
      }

      .vp-review-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .vp-section-title {
        margin: 0;
        font-size: var(--mj-text-base);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
      }

      .vp-table-wrapper {
        overflow-x: auto;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface);
      }

      .vp-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--mj-text-sm);
      }

      .vp-table th,
      .vp-table td {
        padding: 10px 12px;
        text-align: left;
        border-bottom: 1px solid var(--mj-border-subtle);
        vertical-align: top;
      }

      .vp-table th {
        background: var(--mj-bg-surface-card);
        color: var(--mj-text-secondary);
        font-weight: var(--mj-font-semibold);
      }

      .vp-table tbody tr:last-child td {
        border-bottom: none;
      }

      .vp-cell-mono {
        font-family: var(--mj-font-family-mono);
        white-space: nowrap;
        color: var(--mj-text-secondary);
      }

      .vp-cell-strong {
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-primary);
      }

      .vp-status-badge,
      .vp-severity-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: var(--mj-radius-sm);
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-medium);
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
      }

      .vp-status-badge[data-status='Passed'] {
        background: var(--mj-status-success-bg);
        color: var(--mj-status-success-text);
      }

      .vp-status-badge[data-status='Failed'],
      .vp-status-badge[data-status='Blocked'],
      .vp-severity-badge[data-severity='Blocker'] {
        background: var(--mj-status-error-bg);
        color: var(--mj-status-error-text);
      }

      .vp-status-badge[data-status='Pending'],
      .vp-severity-badge[data-severity='Major'] {
        background: var(--mj-status-warning-bg);
        color: var(--mj-status-warning-text);
      }

      .vp-round-card {
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface-card);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .vp-round-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }

      .vp-round-title {
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
      }

      .vp-round-meta {
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
      }

      .vp-round-summary {
        margin: 0;
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
      }

      .vp-scores-summary {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: var(--mj-text-sm);
      }

      .vp-human-notes {
        padding: 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface-card);
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
        white-space: pre-wrap;
      }

      .vp-empty-text {
        margin: 0;
        font-size: var(--mj-text-sm);
        color: var(--mj-text-muted);
      }
    `,
  ],
})
export class VideoProductionReviewTabComponent extends BaseAngularComponent {
  @Input() Spec: VideoGenerationSpec | null = null;

  public get Review(): VideoReviewRecord | null {
    return this.Spec?.Review ?? null;
  }

  public get Gates(): GateRecord[] {
    return this.Spec?.Review?.Gates ?? [];
  }

  public get Rounds(): CriticRound[] {
    return this.Spec?.Review?.Rounds ?? [];
  }

  public get CriteriaScores(): RubricCriterionScore[] {
    return this.Spec?.Review?.Scores?.Criteria ?? [];
  }
}
