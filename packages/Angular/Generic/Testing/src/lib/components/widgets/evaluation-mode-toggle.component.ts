import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { EvaluationPreferencesService } from '../../services/evaluation-preferences.service';
import { EvaluationPreferences } from '../../models/evaluation.types';

/**
 * Toggle component for selecting which evaluation metrics to display.
 * Automatically saves preferences to user settings.
 *
 * Usage:
 * ```html
 * <app-evaluation-mode-toggle></app-evaluation-mode-toggle>
 * ```
 */
@Component({
  selector: 'app-evaluation-mode-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="eval-toggle">
      <span class="toggle-label">Show:</span>
      <div class="toggle-options">
        <button
          class="toggle-btn"
          [class.active]="preferences.showExecution"
          (click)="toggle('showExecution')"
          title="Execution status (Passed, Failed, Error, Timeout, etc.)">
          <i class="fa-solid fa-circle-check"></i>
          <span>Status</span>
        </button>
        <button
          class="toggle-btn"
          [class.active]="preferences.showHuman"
          (click)="toggle('showHuman')"
          title="Human evaluation ratings (1-10 scale)">
          <i class="fa-solid fa-user"></i>
          <span>Human</span>
        </button>
        <button
          class="toggle-btn"
          [class.active]="preferences.showAuto"
          (click)="toggle('showAuto')"
          title="Automated evaluation scores (0-100%)">
          <i class="fa-solid fa-robot"></i>
          <span>Auto</span>
        </button>
      </div>
      <span class="toggle-hint" *ngIf="showHint">
        <i class="fa-solid fa-info-circle"></i>
        At least one must be enabled
      </span>
    </div>
  `,
  styles: [`
    .eval-toggle {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .toggle-label {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }

    .toggle-options {
      display: flex;
      gap: 4px;
      background: #f1f5f9;
      border-radius: 8px;
      padding: 4px;
    }

    .toggle-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #64748b;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .toggle-btn:hover {
      background: #e2e8f0;
      color: #475569;
    }

    .toggle-btn.active {
      background: #3b82f6;
      color: white;
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
    }

    .toggle-btn.active:hover {
      background: #2563eb;
    }

    .toggle-btn i {
      font-size: 11px;
    }

    .toggle-hint {
      font-size: 11px;
      color: #f59e0b;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .toggle-hint i {
      font-size: 10px;
    }

    @media (max-width: 600px) {
      .toggle-btn span {
        display: none;
      }

      .toggle-btn {
        padding: 8px 10px;
      }

      .toggle-btn i {
        font-size: 14px;
      }
    }
  `]
})
export class EvaluationModeToggleComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  preferences: EvaluationPreferences = {
    showExecution: true,
    showHuman: true,
    showAuto: false
  };

  showHint = false;

  constructor(
    private prefsService: EvaluationPreferencesService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.prefsService.preferences$
      .pipe(takeUntil(this.destroy$))
      .subscribe(prefs => {
        this.preferences = prefs;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async toggle(key: keyof EvaluationPreferences): Promise<void> {
    const newValue = !this.preferences[key];

    // Check if this would disable all
    const updated = { ...this.preferences, [key]: newValue };
    if (!updated.showExecution && !updated.showHuman && !updated.showAuto) {
      // Show hint briefly
      this.showHint = true;
      setTimeout(() => {
        this.showHint = false;
        this.cdr.markForCheck();
      }, 2000);
      return;
    }

    await this.prefsService.toggle(key);
  }
}
