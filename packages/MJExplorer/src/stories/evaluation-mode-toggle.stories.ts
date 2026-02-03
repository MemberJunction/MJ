import { Meta, StoryObj, moduleMetadata, applicationConfig } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { Component, Injectable, Input } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

// Mock the EvaluationPreferences interface
interface EvaluationPreferences {
  showExecution: boolean;
  showHuman: boolean;
  showAuto: boolean;
}

// Mock the EvaluationPreferencesService
@Injectable()
class MockEvaluationPreferencesService {
  private prefsSubject = new BehaviorSubject<EvaluationPreferences>({
    showExecution: true,
    showHuman: true,
    showAuto: false
  });

  get preferences$(): Observable<EvaluationPreferences> {
    return this.prefsSubject.asObservable();
  }

  async toggle(key: keyof EvaluationPreferences): Promise<void> {
    const current = this.prefsSubject.value;
    this.prefsSubject.next({
      ...current,
      [key]: !current[key]
    });
  }

  setPreferences(prefs: EvaluationPreferences): void {
    this.prefsSubject.next(prefs);
  }
}

// Create a standalone mock component that replicates the real component's behavior
@Component({
  selector: 'app-evaluation-mode-toggle-mock',
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
      animation: fadeIn 0.2s ease;
    }

    .toggle-hint i {
      font-size: 10px;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateX(-8px); }
      to { opacity: 1; transform: translateX(0); }
    }
  `]
})
class EvaluationModeToggleMockComponent {
  @Input() preferences: EvaluationPreferences = {
    showExecution: true,
    showHuman: true,
    showAuto: false
  };

  showHint = false;

  toggle(key: keyof EvaluationPreferences): void {
    const newValue = !this.preferences[key];
    const updated = { ...this.preferences, [key]: newValue };

    // Check if this would disable all
    if (!updated.showExecution && !updated.showHuman && !updated.showAuto) {
      this.showHint = true;
      setTimeout(() => {
        this.showHint = false;
      }, 2000);
      return;
    }

    this.preferences = updated;
  }
}

const meta: Meta = {
  title: 'Components/EvaluationModeToggle',
  component: EvaluationModeToggleMockComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule],
      declarations: [EvaluationModeToggleMockComponent],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The \`app-evaluation-mode-toggle\` component provides toggle buttons for selecting which evaluation metrics to display.

## Usage

\`\`\`html
<app-evaluation-mode-toggle></app-evaluation-mode-toggle>
\`\`\`

## Module Import

\`\`\`typescript
import { TestingModule } from '@memberjunction/ng-testing';
\`\`\`

## Evaluation Metrics
- **Status**: Execution status (Passed, Failed, Error, Timeout)
- **Human**: Human evaluation ratings (1-10 scale)
- **Auto**: Automated evaluation scores (0-100%)

## Behavior
- At least one metric must always be enabled
- Warning hint appears briefly when attempting to disable all
- Preferences are persisted via EvaluationPreferencesService
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default state
export const Default: Story = {
  render: () => ({
    props: {
      preferences: {
        showExecution: true,
        showHuman: true,
        showAuto: false
      }
    },
    template: `
      <app-evaluation-mode-toggle-mock [preferences]="preferences"></app-evaluation-mode-toggle-mock>
    `,
  }),
};

// All enabled
export const AllEnabled: Story = {
  render: () => ({
    props: {
      preferences: {
        showExecution: true,
        showHuman: true,
        showAuto: true
      }
    },
    template: `
      <app-evaluation-mode-toggle-mock [preferences]="preferences"></app-evaluation-mode-toggle-mock>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'All three evaluation metrics enabled.',
      },
    },
  },
};

// Single enabled
export const SingleEnabled: Story = {
  render: () => ({
    template: `
      <div class="story-container story-column">
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Status Only</div>
          <app-evaluation-mode-toggle-mock [preferences]="{ showExecution: true, showHuman: false, showAuto: false }"></app-evaluation-mode-toggle-mock>
        </div>
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Human Only</div>
          <app-evaluation-mode-toggle-mock [preferences]="{ showExecution: false, showHuman: true, showAuto: false }"></app-evaluation-mode-toggle-mock>
        </div>
        <div>
          <div class="story-caption-sm" style="margin-bottom: 8px;">Auto Only</div>
          <app-evaluation-mode-toggle-mock [preferences]="{ showExecution: false, showHuman: false, showAuto: true }"></app-evaluation-mode-toggle-mock>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Different configurations with only one metric enabled.',
      },
    },
  },
};

// In header context
export const InHeaderContext: Story = {
  render: () => ({
    props: {
      preferences: {
        showExecution: true,
        showHuman: true,
        showAuto: false
      }
    },
    template: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        width: 600px;
      ">
        <div style="font-size: 16px; font-weight: 600; color: #1f2937;">
          Test Results Dashboard
        </div>
        <app-evaluation-mode-toggle-mock [preferences]="preferences"></app-evaluation-mode-toggle-mock>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Toggle component used in a page header for filtering test results.',
      },
    },
  },
};

// In filter panel
export const InFilterPanel: Story = {
  render: () => ({
    props: {
      preferences: {
        showExecution: true,
        showHuman: false,
        showAuto: true
      }
    },
    template: `
      <div style="
        padding: 16px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        width: 320px;
      ">
        <div style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 16px;">
          <i class="fa-solid fa-filter" style="margin-right: 8px;"></i>
          Display Filters
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">Evaluation Metrics</div>
          <app-evaluation-mode-toggle-mock [preferences]="preferences"></app-evaluation-mode-toggle-mock>
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 16px;">
          <div style="font-size: 12px; color: #6b7280;">Additional filters would appear here</div>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Toggle component used within a filter panel.',
      },
    },
  },
};

// Interactive demo
export const InteractiveDemo: Story = {
  render: () => ({
    props: {
      preferences: {
        showExecution: true,
        showHuman: true,
        showAuto: false
      }
    },
    template: `
      <div style="padding: 20px;">
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #1f2937;">Interactive Demo</h3>
          <p style="margin: 0; font-size: 14px; color: #6b7280;">
            Click the buttons to toggle metrics. Try disabling all to see the warning hint!
          </p>
        </div>

        <div style="
          padding: 20px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        ">
          <app-evaluation-mode-toggle-mock [preferences]="preferences"></app-evaluation-mode-toggle-mock>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Interactive demo - click buttons to see the toggle behavior. Try disabling all three to see the warning.',
      },
    },
  },
};

// Button anatomy
export const ButtonAnatomy: Story = {
  render: () => ({
    template: `
      <div class="story-container">
        <table class="story-table story-width-lg">
          <thead>
            <tr>
              <th>Button</th>
              <th>Icon</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <button style="
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 12px;
                  border: none;
                  border-radius: 6px;
                  background: #3b82f6;
                  color: white;
                  font-size: 12px;
                  font-weight: 500;
                  cursor: pointer;
                ">
                  <i class="fa-solid fa-circle-check"></i>
                  <span>Status</span>
                </button>
              </td>
              <td><i class="fa-solid fa-circle-check story-text-info"></i></td>
              <td>Execution status: Passed, Failed, Error, Timeout</td>
            </tr>
            <tr>
              <td>
                <button style="
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 12px;
                  border: none;
                  border-radius: 6px;
                  background: #3b82f6;
                  color: white;
                  font-size: 12px;
                  font-weight: 500;
                  cursor: pointer;
                ">
                  <i class="fa-solid fa-user"></i>
                  <span>Human</span>
                </button>
              </td>
              <td><i class="fa-solid fa-user story-text-info"></i></td>
              <td>Human evaluation ratings on a 1-10 scale</td>
            </tr>
            <tr>
              <td>
                <button style="
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  padding: 6px 12px;
                  border: none;
                  border-radius: 6px;
                  background: #3b82f6;
                  color: white;
                  font-size: 12px;
                  font-weight: 500;
                  cursor: pointer;
                ">
                  <i class="fa-solid fa-robot"></i>
                  <span>Auto</span>
                </button>
              </td>
              <td><i class="fa-solid fa-robot story-text-info"></i></td>
              <td>Automated evaluation scores (0-100%)</td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Reference showing each button with its icon and description.',
      },
    },
  },
};
