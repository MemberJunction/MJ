import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TestEngineBase, TestVariableDefinition, TestTypeVariablesSchema, TestVariablesConfig } from '@memberjunction/testing-engine-base';
import { GraphQLTestingClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJTestEntity, MJTestSuiteEntity, MJTestSuiteTestEntity, MJTestTypeEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { TestingExecutionService, TestExecutionResult } from '../services/testing-execution.service';

interface SuiteTestItem {
  testId: string;
  testName: string;
  sequence: number;
  selected: boolean;
}

interface VariableInput {
  definition: TestVariableDefinition;
  value: string | number | Date | boolean | null;
  stringValue: string; // For input binding (converted on submit)
}

interface ProgressUpdate {
  step: string;
  percentage: number;
  message: string;
  testName?: string;
  driverType?: string;
}

@Component({
  standalone: false,
  selector: 'app-test-run-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
      <div class="test-run-dialog">
        @if (!isRunning && !hasCompleted) {
          <!-- Pre-selected Mode - Compact Header -->
          @if (isPreselected) {
            <div class="dialog-scroll-content">
            <div class="preselected-header">
              <div class="preselected-info">
                <div class="preselected-icon">
                  <i class="fa-solid" [class.fa-flask]="runMode === 'test'" [class.fa-layer-group]="runMode === 'suite'"></i>
                </div>
                <div class="preselected-content">
                  <div class="preselected-label">{{ runMode === 'test' ? 'Test' : 'Test Suite' }}</div>
                  <div class="preselected-name">{{ preselectedName }}</div>
                </div>
              </div>
              <div class="options-compact">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="verbose" />
                  <span>Verbose</span>
                </label>
                @if (runMode === 'suite') {
                  <label class="checkbox-label">
                    <input type="checkbox" [(ngModel)]="parallel" />
                    <span>Parallel</span>
                  </label>
                }
              </div>
            </div>

            <!-- Tags Section for Preselected Mode -->
            <div class="tags-section">
              <div class="tags-header">
                <i class="fa-solid fa-tags"></i>
                <span>Run Tags</span>
                <span class="tags-hint">(optional)</span>
              </div>
              <div class="tags-container">
                <div class="tags-chips">
                  @for (tag of tags; track tag) {
                    <span class="tag-chip">
                      {{ tag }}
                      <button class="tag-remove" (click)="removeTag(tag)">
                        <i class="fa-solid fa-times"></i>
                      </button>
                    </span>
                  }
                </div>
                <div class="tag-input-row">
                  <input
                    type="text"
                    [(ngModel)]="newTag"
                    placeholder="Add tag (e.g., opus-4.5, v2.1.0)"
                    (keyup.enter)="addTag()"
                    class="tag-input"
                  />
                  <button class="tag-add-btn" (click)="addTag()" [disabled]="!newTag.trim()">
                    <i class="fa-solid fa-plus"></i>
                  </button>
                </div>
              </div>
            </div>

            <!-- Variables Section for Preselected Mode -->
            @if (availableVariables.length > 0) {
              <mj-accordion-panel Size="sm" [FlushBody]="true" [(Expanded)]="showVariablesSection">
                <ng-template mjAccordionTitle>
                  <i class="fa-solid fa-sliders"></i>
                  <span>Test Variables</span>
                  <span class="mj-accordion-badge mj-accordion-badge--right">{{ availableVariables.length }}</span>
                </ng-template>
                <ng-template mjAccordionBody>
                  <div class="variables-content">
                    @for (variable of availableVariables; track variable.definition.name) {
                      <div class="variable-row">
                        <div class="variable-info">
                          <label class="variable-label">{{ variable.definition.displayName }}</label>
                          @if (variable.definition.description) {
                            <span class="variable-description">{{ variable.definition.description }}</span>
                          }
                        </div>
                        <div class="variable-input">
                          @if (variable.definition.valueSource === 'static' && variable.definition.possibleValues) {
                            <select [(ngModel)]="variable.stringValue" class="variable-select">
                              <option value="">-- Select --</option>
                              @for (option of variable.definition.possibleValues; track option.value) {
                                <option [value]="option.value">{{ option.label || option.value }}</option>
                              }
                            </select>
                          } @else if (variable.definition.dataType === 'boolean') {
                            <select [(ngModel)]="variable.stringValue" class="variable-select">
                              <option value="">-- Select --</option>
                              <option value="true">Yes</option>
                              <option value="false">No</option>
                            </select>
                          } @else if (variable.definition.dataType === 'number') {
                            <input
                              type="number"
                              [(ngModel)]="variable.stringValue"
                              class="variable-input-field"
                              [placeholder]="variable.definition.defaultValue?.toString() || 'Enter value'"
                              [step]="variable.definition.name.toLowerCase().includes('temperature') ? 0.1 : 1"
                            />
                          } @else {
                            <input
                              type="text"
                              [(ngModel)]="variable.stringValue"
                              class="variable-input-field"
                              [placeholder]="variable.definition.defaultValue?.toString() || 'Enter value'"
                            />
                          }
                        </div>
                      </div>
                    }
                  </div>
                </ng-template>
              </mj-accordion-panel>
            }

            <!-- Advanced Options for Preselected Suite Mode -->
            @if (runMode === 'suite' && suiteTests.length > 0) {
              <mj-accordion-panel Size="sm" [FlushBody]="true" [Expanded]="showAdvancedOptions" (ExpandedChange)="onAdvancedOptionsExpandedChange($event)">
                <ng-template mjAccordionTitle>
                  <span>Advanced Options</span>
                  <span class="mj-accordion-badge mj-accordion-badge--right">{{ suiteTests.length }} tests</span>
                </ng-template>
                <ng-template mjAccordionBody>
                  <div class="advanced-content">
                    <!-- Selection Mode Tabs -->
                    <div class="selection-mode-tabs">
                      <button
                        class="selection-tab"
                        [class.active]="!useSequenceRange"
                        (click)="useSequenceRange = false"
                      >
                        <i class="fa-solid fa-check-square"></i>
                        Select Tests
                      </button>
                      <button
                        class="selection-tab"
                        [class.active]="useSequenceRange"
                        (click)="useSequenceRange = true"
                      >
                        <i class="fa-solid fa-arrows-left-right"></i>
                        Sequence Range
                      </button>
                    </div>

                    <!-- Select Individual Tests Mode -->
                    @if (!useSequenceRange) {
                      <div class="test-selection-panel">
                        <div class="selection-header">
                          <label class="checkbox-label select-all">
                            <input
                              type="checkbox"
                              [checked]="allTestsSelected"
                              [indeterminate]="someTestsSelected"
                              (change)="toggleAllTests($any($event.target).checked)"
                            />
                            <span>Select All</span>
                          </label>
                          <span class="selection-count">{{ selectedTestCount }} of {{ suiteTests.length }} selected</span>
                        </div>
                        <div class="test-list">
                          @for (test of suiteTests; track test.testId) {
                            <label class="test-item" [class.selected]="test.selected">
                              <input
                                type="checkbox"
                                [checked]="test.selected"
                                (change)="toggleTest(test.testId)"
                              />
                              <span class="test-sequence">#{{ test.sequence }}</span>
                              <span class="test-name">{{ test.testName }}</span>
                            </label>
                          }
                        </div>
                      </div>
                    }

                    <!-- Sequence Range Mode -->
                    @if (useSequenceRange) {
                      <div class="sequence-range-panel">
                        <div class="range-inputs">
                          <div class="range-field">
                            <label>Start at sequence</label>
                            <input
                              type="number"
                              [(ngModel)]="sequenceStart"
                              [min]="1"
                              [max]="suiteTests.length"
                              class="sequence-input"
                            />
                          </div>
                          <div class="range-separator">
                            <i class="fa-solid fa-arrow-right"></i>
                          </div>
                          <div class="range-field">
                            <label>End at sequence</label>
                            <input
                              type="number"
                              [(ngModel)]="sequenceEnd"
                              [min]="1"
                              [max]="suiteTests.length"
                              class="sequence-input"
                            />
                          </div>
                        </div>
                        @if (sequenceRangeValid) {
                          <div class="range-summary">
                            Will run {{ testsInSequenceRange }} test(s) from sequence {{ sequenceStart }} to {{ sequenceEnd }}
                          </div>
                        } @else {
                          <div class="range-error">
                            <i class="fa-solid fa-exclamation-triangle"></i>
                            Invalid range: start must be less than or equal to end
                          </div>
                        }
                      </div>
                    }
                  </div>
                </ng-template>
              </mj-accordion-panel>
            }
            </div>
          }

          <!-- Selection Mode - Full UI -->
          @if (!isPreselected) {
            <div class="selection-mode">
              <div class="mode-tabs">
                <button
                  class="mode-tab"
                  [class.active]="runMode === 'test'"
                  (click)="setRunMode('test')"
                >
                  <i class="fa-solid fa-flask"></i>
                  <span>Single Test</span>
                </button>
                <button
                  class="mode-tab"
                  [class.active]="runMode === 'suite'"
                  (click)="setRunMode('suite')"
                >
                  <i class="fa-solid fa-layer-group"></i>
                  <span>Test Suite</span>
                </button>
              </div>

            @if (runMode === 'test') {
              <div class="selection-panel">
                <div class="search-box">
                  <i class="fa-solid fa-search"></i>
                  <input
                    type="text"
                    [(ngModel)]="searchText"
                    (input)="filterItems()"
                    placeholder="Search tests..."
                  />
                  @if (searchText) {
                    <button class="clear-btn" (click)="clearSearch()">
                      <i class="fa-solid fa-times"></i>
                    </button>
                  }
                </div>

                <div class="items-list">
                  @for (test of filteredTests; track test.ID) {
                    <div
                      class="item"
                      [class.selected]="IsTestSelected(test)"
                      (click)="selectTest(test.ID)"
                    >
                      <div class="item-icon">
                        <i class="fa-solid fa-flask"></i>
                      </div>
                      <div class="item-content">
                        <div class="item-name">{{ test.Name }}</div>
                        <div class="item-meta">{{ test.Type }} • {{ test.Description || 'No description' }}</div>
                      </div>
                      @if (IsTestSelected(test)) {
                        <div class="item-check">
                          <i class="fa-solid fa-check-circle"></i>
                        </div>
                      }
                    </div>
                  }
                  @empty {
                    <mj-empty-state Icon="fa-solid fa-inbox" Title="No tests found" Size="compact" />
                  }
                </div>
              </div>
            }

            @if (runMode === 'suite') {
              <div class="selection-panel">
                <div class="search-box">
                  <i class="fa-solid fa-search"></i>
                  <input
                    type="text"
                    [(ngModel)]="searchText"
                    (input)="filterItems()"
                    placeholder="Search test suites..."
                  />
                  @if (searchText) {
                    <button class="clear-btn" (click)="clearSearch()">
                      <i class="fa-solid fa-times"></i>
                    </button>
                  }
                </div>

                <div class="items-list">
                  @for (suite of filteredSuites; track suite.ID) {
                    <div
                      class="item"
                      [class.selected]="IsSuiteSelected(suite)"
                      (click)="selectSuite(suite.ID)"
                    >
                      <div class="item-icon suite">
                        <i class="fa-solid fa-layer-group"></i>
                      </div>
                      <div class="item-content">
                        <div class="item-name">{{ suite.Name }}</div>
                        <div class="item-meta">{{ suite.Description || 'No description' }}</div>
                      </div>
                      @if (IsSuiteSelected(suite)) {
                        <div class="item-check">
                          <i class="fa-solid fa-check-circle"></i>
                        </div>
                      }
                    </div>
                  }
                  @empty {
                    <mj-empty-state Icon="fa-solid fa-inbox" Title="No test suites found" Size="compact" />
                  }
                </div>
              </div>

              <!-- Advanced Options - Progressive Disclosure -->
              @if (selectedSuiteId && suiteTests.length > 0) {
                <mj-accordion-panel Size="sm" [FlushBody]="true" [Expanded]="showAdvancedOptions" (ExpandedChange)="onAdvancedOptionsExpandedChange($event)">
                  <ng-template mjAccordionTitle>
                    <span>Advanced Options</span>
                    <span class="mj-accordion-badge mj-accordion-badge--right">{{ suiteTests.length }} tests</span>
                  </ng-template>
                  <ng-template mjAccordionBody>
                    <div class="advanced-content">
                      <!-- Selection Mode Tabs -->
                      <div class="selection-mode-tabs">
                        <button
                          class="selection-tab"
                          [class.active]="!useSequenceRange"
                          (click)="useSequenceRange = false"
                        >
                          <i class="fa-solid fa-check-square"></i>
                          Select Tests
                        </button>
                        <button
                          class="selection-tab"
                          [class.active]="useSequenceRange"
                          (click)="useSequenceRange = true"
                        >
                          <i class="fa-solid fa-arrows-left-right"></i>
                          Sequence Range
                        </button>
                      </div>

                      <!-- Select Individual Tests Mode -->
                      @if (!useSequenceRange) {
                        <div class="test-selection-panel">
                          <div class="selection-header">
                            <label class="checkbox-label select-all">
                              <input
                                type="checkbox"
                                [checked]="allTestsSelected"
                                [indeterminate]="someTestsSelected"
                                (change)="toggleAllTests($any($event.target).checked)"
                              />
                              <span>Select All</span>
                            </label>
                            <span class="selection-count">{{ selectedTestCount }} of {{ suiteTests.length }} selected</span>
                          </div>
                          <div class="test-list">
                            @for (test of suiteTests; track test.testId) {
                              <label class="test-item" [class.selected]="test.selected">
                                <input
                                  type="checkbox"
                                  [checked]="test.selected"
                                  (change)="toggleTest(test.testId)"
                                />
                                <span class="test-sequence">#{{ test.sequence }}</span>
                                <span class="test-name">{{ test.testName }}</span>
                              </label>
                            }
                          </div>
                        </div>
                      }

                      <!-- Sequence Range Mode -->
                      @if (useSequenceRange) {
                        <div class="sequence-range-panel">
                          <div class="range-inputs">
                            <div class="range-field">
                              <label>Start at sequence</label>
                              <input
                                type="number"
                                [(ngModel)]="sequenceStart"
                                [min]="1"
                                [max]="suiteTests.length"
                                class="sequence-input"
                              />
                            </div>
                            <div class="range-separator">
                              <i class="fa-solid fa-arrow-right"></i>
                            </div>
                            <div class="range-field">
                              <label>End at sequence</label>
                              <input
                                type="number"
                                [(ngModel)]="sequenceEnd"
                                [min]="1"
                                [max]="suiteTests.length"
                                class="sequence-input"
                              />
                            </div>
                          </div>
                          @if (sequenceRangeValid) {
                            <div class="range-summary">
                              Will run {{ testsInSequenceRange }} test(s) from sequence {{ sequenceStart }} to {{ sequenceEnd }}
                            </div>
                          } @else {
                            <div class="range-error">
                              <i class="fa-solid fa-exclamation-triangle"></i>
                              Invalid range: start must be less than or equal to end
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </ng-template>
                </mj-accordion-panel>
              }
            }

              <div class="options-panel">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="verbose" />
                  <span>Verbose logging</span>
                </label>
                @if (runMode === 'suite') {
                  <label class="checkbox-label">
                    <input type="checkbox" [(ngModel)]="parallel" />
                    <span>Run tests in parallel</span>
                  </label>
                }
              </div>

              <!-- Tags Section for Selection Mode -->
              <div class="tags-section selection-mode-tags">
                <div class="tags-header">
                  <i class="fa-solid fa-tags"></i>
                  <span>Run Tags</span>
                  <span class="tags-hint">(optional)</span>
                </div>
                <div class="tags-container">
                  <div class="tags-chips">
                    @for (tag of tags; track tag) {
                      <span class="tag-chip">
                        {{ tag }}
                        <button class="tag-remove" (click)="removeTag(tag)">
                          <i class="fa-solid fa-times"></i>
                        </button>
                      </span>
                    }
                  </div>
                  <div class="tag-input-row">
                    <input
                      type="text"
                      [(ngModel)]="newTag"
                      placeholder="Add tag (e.g., opus-4.5, v2.1.0)"
                      (keyup.enter)="addTag()"
                      class="tag-input"
                    />
                    <button class="tag-add-btn" (click)="addTag()" [disabled]="!newTag.trim()">
                      <i class="fa-solid fa-plus"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          }
        }

        @if (isRunning || hasCompleted) {
          <!-- Execution Mode -->
          <div class="execution-mode">
            <div class="execution-header">
              <div class="execution-title">
                <i class="fa-solid" [class.fa-spinner]="isRunning" [class.fa-spin]="isRunning" [class.fa-check-circle]="hasCompleted && !hasError" [class.fa-exclamation-circle]="hasCompleted && hasError"></i>
                <span>{{ executionTitle }}</span>
              </div>
              <div class="execution-status" [class.running]="isRunning" [class.success]="hasCompleted && !hasError" [class.error]="hasCompleted && hasError">
                {{ executionStatus }}
              </div>
            </div>

            <div class="progress-container">
              <div class="progress-bar" [class.indeterminate]="progress < 0">
                @if (progress >= 0) {
                  <div class="progress-fill" [style.width.%]="progress"></div>
                }
              </div>
              @if (progress >= 0) {
                <div class="progress-text">{{ progress }}%</div>
              }
            </div>

            <div class="progress-steps">
              @for (step of progressSteps; track step.step) {
                <div class="step" [class.active]="step.active" [class.completed]="step.completed">
                  <div class="step-icon">
                    @if (step.completed) {
                      <i class="fa-solid fa-check"></i>
                    } @else if (step.active) {
                      <i class="fa-solid fa-spinner fa-spin"></i>
                    } @else {
                      <i class="fa-solid fa-circle"></i>
                    }
                  </div>
                  <div class="step-content">
                    <div class="step-label">{{ step.label }}</div>
                    @if (step.message) {
                      <div class="step-message">{{ step.message }}</div>
                    }
                  </div>
                </div>
              }
            </div>

            @if (isRunning && PanelMode) {
              <mj-alert Variant="info" class="test-run-alert-pos">Tests run on the server. You can close this panel &mdash; your test will keep running. Check the dashboard for updates.</mj-alert>
            }

            @if (executionLog.length > 0) {
              <div class="execution-log">
                <div class="log-header">
                  <i class="fa-solid fa-terminal"></i>
                  <span>Execution Log</span>
                </div>
                <div class="log-content">
                  @for (entry of executionLog; track $index) {
                    <div class="log-entry" [class]="entry.type">
                      <span class="log-time">{{ entry.timestamp | date:'HH:mm:ss' }}</span>
                      <span class="log-message">{{ entry.message }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            @if (hasCompleted && result) {
              <div class="result-summary" [class.success]="!hasError" [class.error]="hasError">
                <div class="result-header">
                  <i class="fa-solid" [class.fa-check-circle]="!hasError" [class.fa-exclamation-circle]="hasError"></i>
                  <span>{{ hasError ? 'Execution Failed' : 'Execution Completed' }}</span>
                </div>
                <div class="result-details">
                  @if (!hasError) {
                    <div class="result-item">
                      <span class="result-label">Status:</span>
                      <span class="result-value">{{ result.result?.status || 'Unknown' }}</span>
                    </div>
                    <div class="result-item">
                      <span class="result-label">Score:</span>
                      <span class="result-value">{{ (result.result?.score || 0) | number:'1.4-4' }}</span>
                    </div>
                    <div class="result-item">
                      <span class="result-label">Duration:</span>
                      <span class="result-value">{{ result.executionTimeMs }}ms</span>
                    </div>
                    @if (result.result?.totalCost) {
                      <div class="result-item">
                        <span class="result-label">Cost:</span>
                        <span class="result-value">\${{ result.result.totalCost | number:'1.6-6' }}</span>
                      </div>
                    }
                  } @else {
                    <mj-alert Variant="error" class="test-run-result-alert-pos">{{ failureMessage }}</mj-alert>
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- Dialog Actions -->
        <div class="dialog-actions">
          @if (!isRunning && !hasCompleted) {
            <button mjButton (click)="onClose()">Cancel</button>
            <button mjButton variant="primary"
                    [disabled]="!canRun()"
                    (click)="runTest()">
              <i class="fa-solid fa-play"></i>
              Run {{ runMode === 'test' ? 'Test' : 'Suite' }}
            </button>
          } @else if (hasCompleted) {
            <button mjButton (click)="onClose()">Close</button>
            <button mjButton variant="primary" (click)="resetDialog()">
              <i class="fa-solid fa-redo"></i>
              Run Another
            </button>
          } @else {
            @if (PanelMode) {
              <button mjButton (click)="onClose()">Close</button>
            }
            <button mjButton variant="primary" [disabled]="true">
              <i class="fa-solid fa-spinner fa-spin"></i>
              Running...
            </button>
          }
        </div>
      </div>
  `,
  styles: [`
    .test-run-dialog {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-surface-card);
      overflow: hidden;
    }

    .dialog-scroll-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 20px;
      background: var(--mj-bg-surface);
      border-top: 1px solid var(--mj-border-default);
      margin-top: auto;
    }

    .action-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cancel-btn {
      background: var(--mj-bg-surface-card);
      color: var(--mj-text-secondary);
    }

    .cancel-btn:hover {
      background: var(--mj-border-default);
    }

    .run-btn {
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
    }

    .run-btn:hover:not(:disabled) {
      background: var(--mj-brand-primary-hover);
    }

    .run-btn:disabled {
      background: var(--mj-border-strong);
      cursor: not-allowed;
      opacity: 0.6;
    }

    /* Preselected Mode - Compact Header */
    .preselected-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      background: var(--mj-bg-surface);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
    }

    .preselected-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }

    .preselected-icon {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      background: var(--mj-brand-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--mj-text-inverse);
      font-size: 16px;
      flex-shrink: 0;
    }

    .preselected-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .preselected-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--mj-text-disabled);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .preselected-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .options-compact {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    /* Selection Mode */
    .selection-mode {
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
      overflow: hidden;
      padding: 20px;
    }

    .mode-tabs {
      display: flex;
      gap: 8px;
      background: var(--mj-bg-surface);
      padding: 8px;
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
      flex-shrink: 0;
    }

    .mode-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 20px;
      border: none;
      background: transparent;
      color: var(--mj-text-secondary);
      font-size: 14px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .mode-tab:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
      color: var(--mj-brand-primary);
    }

    .mode-tab.active {
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
    }

    .mode-tab i {
      font-size: 16px;
    }

    .selection-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: var(--mj-bg-surface);
      border-radius: 8px;
      padding: 16px;
      box-shadow: var(--mj-shadow-sm);
      overflow: hidden;
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--mj-bg-surface-sunken);
      border: 2px solid var(--mj-border-default);
      border-radius: 6px;
      transition: border-color 0.2s ease;
    }

    .search-box:focus-within {
      border-color: var(--mj-brand-primary);
    }

    .search-box i {
      color: var(--mj-text-disabled);
      font-size: 14px;
    }

    .search-box input {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      font-size: 14px;
      color: var(--mj-text-primary);
    }

    .search-box input::placeholder {
      color: var(--mj-text-disabled);
    }

    .clear-btn {
      padding: 4px 8px;
      border: none;
      background: transparent;
      color: var(--mj-text-disabled);
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s ease;
    }

    .clear-btn:hover {
      background: var(--mj-bg-overlay);
      color: var(--mj-text-secondary);
    }

    .items-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 0;
    }

    .item {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 16px;
      background: var(--mj-bg-surface-card);
      border: 2px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      min-width: 0;
      max-width: 100%;
    }

    .item:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      border-color: color-mix(in srgb, var(--mj-brand-primary) 40%, transparent);
    }

    .item.selected {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      border-color: var(--mj-brand-primary);
    }

    .item-icon {
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      border-radius: 8px;
      font-size: 18px;
      flex-shrink: 0;
    }

    .item-icon.suite {
      background: var(--mj-brand-primary);
    }

    .item-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .item-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--mj-text-primary);
      line-height: 1.3;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .item-meta {
      font-size: 13px;
      color: var(--mj-text-secondary);
      line-height: 1.4;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: normal;
    }

    .item-check {
      color: var(--mj-brand-primary);
      font-size: 20px;
    }

    .items-list mj-empty-state {
      flex: 1;
    }

    .options-panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      background: var(--mj-bg-surface);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }

    .checkbox-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .checkbox-label span {
      font-size: 14px;
      color: var(--mj-text-primary);
    }

    /* Execution Mode */
    .execution-mode {
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
      overflow: hidden;
      padding: 20px;
    }

    .execution-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: var(--mj-bg-surface);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
    }

    .execution-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 16px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .execution-title i {
      font-size: 20px;
      color: var(--mj-brand-primary);
    }

    .execution-title i.fa-check-circle {
      color: var(--mj-status-success);
    }

    .execution-title i.fa-exclamation-circle {
      color: var(--mj-status-error);
    }

    .execution-status {
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .execution-status.running {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
    }

    .execution-status.success {
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      color: var(--mj-status-success);
    }

    .execution-status.error {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      color: var(--mj-status-error);
    }

    .progress-container {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: var(--mj-bg-surface);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
    }

    .progress-bar {
      flex: 1;
      height: 8px;
      background: var(--mj-border-default);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--mj-brand-primary);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .progress-bar.indeterminate {
      background: linear-gradient(90deg, var(--mj-border-default) 25%, var(--mj-brand-primary) 50%, var(--mj-border-default) 75%);
      background-size: 200% 100%;
      animation: indeterminate-progress 1.5s ease-in-out infinite;
    }

    @keyframes indeterminate-progress {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .progress-text {
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-brand-primary);
      min-width: 45px;
      text-align: right;
    }

    .progress-steps {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      background: var(--mj-bg-surface);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
      max-height: 150px;
      overflow-y: auto;
      flex-shrink: 0;
    }

    .step {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 8px;
      border-radius: 6px;
      transition: all 0.2s ease;
    }

    .step.active {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
    }

    .step.completed {
      opacity: 0.6;
    }

    .step-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--mj-text-disabled);
      font-size: 12px;
    }

    .step.active .step-icon {
      color: var(--mj-brand-primary);
    }

    .step.completed .step-icon {
      color: var(--mj-status-success);
    }

    .step-content {
      flex: 1;
      min-width: 0;
    }

    .step-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--mj-text-primary);
      margin-bottom: 2px;
    }

    .step-message {
      font-size: 12px;
      color: var(--mj-text-secondary);
    }

    .test-run-alert-pos {
      margin-bottom: 12px;
    }

    .execution-log {
      display: flex;
      flex-direction: column;
      background: #1e1e1e;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: var(--mj-shadow-sm);
      flex: 1;
      min-height: 0;
    }

    .log-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #2d2d2d;
      color: #e0e0e0;
      font-size: 13px;
      font-weight: 600;
      border-bottom: 1px solid #3d3d3d;
    }

    .log-header i {
      color: var(--mj-status-success);
    }

    .log-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.5;
      min-height: 0;
    }

    .log-entry {
      display: flex;
      gap: 12px;
      margin-bottom: 4px;
      color: #d4d4d4;
    }

    .log-entry.error {
      color: var(--mj-status-error);
    }

    .log-entry.success {
      color: var(--mj-status-success);
    }

    .log-entry.info {
      color: var(--mj-brand-primary);
    }

    .log-time {
      color: #888;
      min-width: 60px;
    }

    .log-message {
      flex: 1;
    }

    .result-summary {
      padding: 16px;
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
    }

    .result-summary.success {
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      border: 2px solid var(--mj-status-success);
    }

    .result-summary.error {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      border: 2px solid var(--mj-status-error);
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .result-summary.success .result-header {
      color: var(--mj-status-success);
    }

    .result-summary.error .result-header {
      color: var(--mj-status-error);
    }

    .result-header i {
      font-size: 24px;
    }

    .result-details {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .result-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      background: color-mix(in srgb, var(--mj-bg-surface) 50%, transparent);
      border-radius: 4px;
    }

    .result-label {
      font-weight: 600;
      color: var(--mj-text-secondary);
      font-size: 13px;
    }

    .result-value {
      font-weight: 600;
      color: var(--mj-text-primary);
      font-size: 13px;
    }

    .test-run-result-alert-pos {
      margin: 0;
    }

    /* Tags Section Styles */
    .tags-section {
      padding: 10px 12px;
      background: var(--mj-bg-surface);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
    }

    .tags-section.selection-mode-tags {
      box-shadow: var(--mj-shadow-sm);
    }

    .tags-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-primary);
    }

    .tags-header i {
      color: var(--mj-brand-primary);
    }

    .tags-hint {
      color: var(--mj-text-disabled);
      font-weight: 400;
      font-size: 12px;
    }

    .tags-container {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .tags-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 20px;
    }

    .tag-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      color: var(--mj-brand-primary-hover);
      border-radius: 16px;
      font-size: 13px;
      font-weight: 500;
    }

    .tag-remove {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      background: var(--mj-bg-overlay);
      color: var(--mj-brand-primary-hover);
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .tag-remove:hover {
      background: color-mix(in srgb, var(--mj-status-error) 20%, transparent);
      color: var(--mj-status-error);
    }

    .tag-remove i {
      font-size: 10px;
    }

    .tag-input-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .tag-input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      font-size: 12px;
      outline: none;
      transition: border-color 0.2s ease;
    }

    .tag-input:focus {
      border-color: var(--mj-brand-primary);
    }

    .tag-input::placeholder {
      color: var(--mj-text-disabled);
    }

    .tag-add-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .tag-add-btn:hover:not(:disabled) {
      background: var(--mj-brand-primary-hover);
    }

    .tag-add-btn:disabled {
      background: var(--mj-border-strong);
      cursor: not-allowed;
    }

    .tag-add-btn i {
      font-size: 14px;
    }

    /* Advanced Options - Progressive Disclosure */
    /* .advanced-options-section / .advanced-toggle chrome is now owned by <mj-accordion-panel>.
       The former .test-count-badge count pill was replaced by the standard
       .mj-accordion-badge--right. */

    .advanced-content {
      padding: 0 12px 12px 12px;
      border-top: 1px solid var(--mj-border-default);
    }

    .selection-mode-tabs {
      display: flex;
      gap: 6px;
      padding: 8px 0;
    }

    .selection-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface);
      color: var(--mj-text-secondary);
      font-size: 12px;
      font-weight: 500;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .selection-tab:hover {
      border-color: color-mix(in srgb, var(--mj-brand-primary) 40%, transparent);
      color: var(--mj-brand-primary);
    }

    .selection-tab.active {
      border-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      color: var(--mj-brand-primary-hover);
    }

    .selection-tab i {
      font-size: 14px;
    }

    /* Test Selection Panel */
    .test-selection-panel {
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      overflow: hidden;
    }

    .selection-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .select-all {
      font-weight: 500;
      font-size: 12px;
    }

    .selection-count {
      font-size: 11px;
      color: var(--mj-text-secondary);
    }

    .test-list {
      max-height: 150px;
      overflow-y: auto;
    }

    .test-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      cursor: pointer;
      transition: background 0.2s ease;
      border-bottom: 1px solid var(--mj-bg-surface-sunken);
    }

    .test-item:last-child {
      border-bottom: none;
    }

    .test-item:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .test-item.selected {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
    }

    .test-item input[type="checkbox"] {
      width: 14px;
      height: 14px;
      cursor: pointer;
    }

    .test-sequence {
      font-size: 11px;
      font-weight: 600;
      color: var(--mj-text-disabled);
      min-width: 24px;
    }

    .test-name {
      flex: 1;
      font-size: 12px;
      color: var(--mj-text-primary);
    }

    /* Sequence Range Panel */
    .sequence-range-panel {
      padding: 10px;
      background: var(--mj-bg-surface-card);
      border-radius: 4px;
    }

    .range-inputs {
      display: flex;
      align-items: flex-end;
      gap: 12px;
    }

    .range-field {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .range-field label {
      font-size: 11px;
      font-weight: 500;
      color: var(--mj-text-secondary);
    }

    .sequence-input {
      padding: 8px 10px;
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      font-size: 13px;
      text-align: center;
      outline: none;
      transition: border-color 0.2s ease;
    }

    .sequence-input:focus {
      border-color: var(--mj-brand-primary);
    }

    .range-separator {
      padding-bottom: 8px;
      color: var(--mj-text-disabled);
    }

    .range-summary {
      margin-top: 8px;
      padding: 8px;
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      color: var(--mj-status-success);
      border-radius: 4px;
      font-size: 12px;
      text-align: center;
    }

    .range-error {
      margin-top: 8px;
      padding: 8px;
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      color: var(--mj-status-error);
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .range-error i {
      font-size: 12px;
    }

    /* .variables-section / .variables-toggle chrome is now owned by <mj-accordion-panel>.
       The former .variables-count-badge count pill was replaced by the standard
       .mj-accordion-badge--right. */

    .variables-content {
      padding: 0 12px 12px 12px;
      border-top: 1px solid var(--mj-border-default);
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 12px;
    }

    .variable-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .variable-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .variable-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .variable-description {
      font-size: 11px;
      color: var(--mj-text-secondary);
      line-height: 1.3;
    }

    .variable-input {
      width: 100%;
    }

    .variable-select,
    .variable-input-field {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s ease;
      background: var(--mj-bg-surface);
    }

    .variable-select:focus,
    .variable-input-field:focus {
      border-color: var(--mj-brand-primary);
    }

    .variable-input-field::placeholder {
      color: var(--mj-text-disabled);
    }

    /* ===== Responsive ===== */
    @media (max-width: 768px) {
      .preselected-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }

      .options-compact {
        width: 100%;
        justify-content: flex-start;
      }

      .dialog-actions {
        padding: 12px 16px;
      }

      .action-btn {
        flex: 1;
        justify-content: center;
        min-height: 44px;
      }

      .mode-tabs {
        flex-direction: column;
      }

      .mode-tab {
        width: 100%;
        justify-content: center;
      }

      .selection-mode {
        padding: 10px;
      }

      .selection-panel {
        padding: 10px;
      }

      .execution-mode {
        padding: 10px;
      }

      .result-details {
        grid-template-columns: 1fr;
      }

      .progress-steps {
        gap: 6px;
      }

      .step-content {
        min-width: 0;
      }

      .step-label {
        font-size: 12px;
      }

      .range-inputs {
        flex-direction: column;
        gap: 8px;
      }

      .range-separator {
        transform: rotate(90deg);
        align-self: center;
      }

      .variable-row {
        flex-direction: column;
        gap: 4px;
      }

      .variable-input {
        width: 100%;
      }

      .variable-select,
      .variable-input-field {
        width: 100%;
      }
    }

    @media (max-width: 480px) {
      .dialog-scroll-content {
        padding: 8px;
      }

      .dialog-actions {
        padding: 10px 12px;
        gap: 8px;
      }

      .tags-container {
        gap: 6px;
      }

      .tag-input-row {
        flex-direction: column;
        gap: 6px;
      }

      .tag-add-btn {
        align-self: flex-start;
      }

      .execution-log .log-content {
        font-size: 11px;
      }

      .log-time {
        display: none;
      }
    }
  `]
})
export class TestRunDialogComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private testingClient!: GraphQLTestingClient;
  private engine!: TestEngineBase;

  // Selection state
  @Input() RunMode: 'test' | 'suite' | 'monitor' = 'test';

  /** @deprecated Use {@link RunMode}. */
  @Input() set runMode(value: 'test' | 'suite' | 'monitor') {
    this.RunMode = value;
  }
  /** @deprecated Use {@link RunMode}. */
  get runMode(): 'test' | 'suite' | 'monitor' {
    return this.RunMode;
  }
  SearchText = '';

  /** @deprecated Use {@link SearchText}. */
  get searchText() {
    return this.SearchText;
  }
  /** @deprecated Use {@link SearchText}. */
  set searchText(value) {
    this.SearchText = value;
  }
  @Input() SelectedTestId: string | null = null;

  /** @deprecated Use {@link SelectedTestId}. */
  @Input() set selectedTestId(value: string | null) {
    this.SelectedTestId = value;
  }
  /** @deprecated Use {@link SelectedTestId}. */
  get selectedTestId(): string | null {
    return this.SelectedTestId;
  }
  @Input() SelectedSuiteId: string | null = null;

  /** @deprecated Use {@link SelectedSuiteId}. */
  @Input() set selectedSuiteId(value: string | null) {
    this.SelectedSuiteId = value;
  }
  /** @deprecated Use {@link SelectedSuiteId}. */
  get selectedSuiteId(): string | null {
    return this.SelectedSuiteId;
  }
  verbose = true;
  Parallel = false;

  /** @deprecated Use {@link Parallel}. */
  get parallel() {
    return this.Parallel;
  }
  /** @deprecated Use {@link Parallel}. */
  set parallel(value) {
    this.Parallel = value;
  }

  // Tags for test/suite runs
  tags: string[] = [];
  NewTag = '';

  /** @deprecated Use {@link NewTag}. */
  get newTag() {
    return this.NewTag;
  }
  /** @deprecated Use {@link NewTag}. */
  set newTag(value) {
    this.NewTag = value;
  }

  // Pre-selection mode - when launched from a specific test/suite
  IsPreselected = false;

  /** @deprecated Use {@link IsPreselected}. */
  get isPreselected() {
    return this.IsPreselected;
  }
  /** @deprecated Use {@link IsPreselected}. */
  set isPreselected(value) {
    this.IsPreselected = value;
  }
  PreselectedName = '';

  /** @deprecated Use {@link PreselectedName}. */
  get preselectedName() {
    return this.PreselectedName;
  }
  /** @deprecated Use {@link PreselectedName}. */
  set preselectedName(value) {
    this.PreselectedName = value;
  }

  // Data
  AllTests: MJTestEntity[] = [];

  /** @deprecated Use {@link AllTests}. */
  get allTests(): MJTestEntity[] {
    return this.AllTests;
  }
  /** @deprecated Use {@link AllTests}. */
  set allTests(value: MJTestEntity[]) {
    this.AllTests = value;
  }
  AllSuites: MJTestSuiteEntity[] = [];

  /** @deprecated Use {@link AllSuites}. */
  get allSuites(): MJTestSuiteEntity[] {
    return this.AllSuites;
  }
  /** @deprecated Use {@link AllSuites}. */
  set allSuites(value: MJTestSuiteEntity[]) {
    this.AllSuites = value;
  }
  FilteredTests: MJTestEntity[] = [];

  /** @deprecated Use {@link FilteredTests}. */
  get filteredTests(): MJTestEntity[] {
    return this.FilteredTests;
  }
  /** @deprecated Use {@link FilteredTests}. */
  set filteredTests(value: MJTestEntity[]) {
    this.FilteredTests = value;
  }
  FilteredSuites: MJTestSuiteEntity[] = [];

  /** @deprecated Use {@link FilteredSuites}. */
  get filteredSuites(): MJTestSuiteEntity[] {
    return this.FilteredSuites;
  }
  /** @deprecated Use {@link FilteredSuites}. */
  set filteredSuites(value: MJTestSuiteEntity[]) {
    this.FilteredSuites = value;
  }

  // Selective test execution for suites (progressive disclosure)
  ShowAdvancedOptions = false;

  /** @deprecated Use {@link ShowAdvancedOptions}. */
  get showAdvancedOptions() {
    return this.ShowAdvancedOptions;
  }
  /** @deprecated Use {@link ShowAdvancedOptions}. */
  set showAdvancedOptions(value) {
    this.ShowAdvancedOptions = value;
  }
  SuiteTests: SuiteTestItem[] = [];

  /** @deprecated Use {@link SuiteTests}. */
  get suiteTests(): SuiteTestItem[] {
    return this.SuiteTests;
  }
  /** @deprecated Use {@link SuiteTests}. */
  set suiteTests(value: SuiteTestItem[]) {
    this.SuiteTests = value;
  }
  UseSequenceRange = false;

  /** @deprecated Use {@link UseSequenceRange}. */
  get useSequenceRange() {
    return this.UseSequenceRange;
  }
  /** @deprecated Use {@link UseSequenceRange}. */
  set useSequenceRange(value) {
    this.UseSequenceRange = value;
  }
  SequenceStart: number | null = null;

  /** @deprecated Use {@link SequenceStart}. */
  get sequenceStart(): number | null {
    return this.SequenceStart;
  }
  /** @deprecated Use {@link SequenceStart}. */
  set sequenceStart(value: number | null) {
    this.SequenceStart = value;
  }
  SequenceEnd: number | null = null;

  /** @deprecated Use {@link SequenceEnd}. */
  get sequenceEnd(): number | null {
    return this.SequenceEnd;
  }
  /** @deprecated Use {@link SequenceEnd}. */
  set sequenceEnd(value: number | null) {
    this.SequenceEnd = value;
  }

  // Variables for parameterized tests
  AvailableVariables: VariableInput[] = [];

  /** @deprecated Use {@link AvailableVariables}. */
  get availableVariables(): VariableInput[] {
    return this.AvailableVariables;
  }
  /** @deprecated Use {@link AvailableVariables}. */
  set availableVariables(value: VariableInput[]) {
    this.AvailableVariables = value;
  }
  ShowVariablesSection = false;

  /** @deprecated Use {@link ShowVariablesSection}. */
  get showVariablesSection() {
    return this.ShowVariablesSection;
  }
  /** @deprecated Use {@link ShowVariablesSection}. */
  set showVariablesSection(value) {
    this.ShowVariablesSection = value;
  }

  // Execution state
  IsRunning = false;

  /** @deprecated Use {@link IsRunning}. */
  get isRunning() {
    return this.IsRunning;
  }
  /** @deprecated Use {@link IsRunning}. */
  set isRunning(value) {
    this.IsRunning = value;
  }
  HasCompleted = false;

  /** @deprecated Use {@link HasCompleted}. */
  get hasCompleted() {
    return this.HasCompleted;
  }
  /** @deprecated Use {@link HasCompleted}. */
  set hasCompleted(value) {
    this.HasCompleted = value;
  }
  HasError = false;

  /** @deprecated Use {@link HasError}. */
  get hasError() {
    return this.HasError;
  }
  /** @deprecated Use {@link HasError}. */
  set hasError(value) {
    this.HasError = value;
  }
  Progress = 0;

  /** @deprecated Use {@link Progress}. */
  get progress() {
    return this.Progress;
  }
  /** @deprecated Use {@link Progress}. */
  set progress(value) {
    this.Progress = value;
  }
  ExecutionTitle = '';

  /** @deprecated Use {@link ExecutionTitle}. */
  get executionTitle() {
    return this.ExecutionTitle;
  }
  /** @deprecated Use {@link ExecutionTitle}. */
  set executionTitle(value) {
    this.ExecutionTitle = value;
  }
  ExecutionStatus = '';

  /** @deprecated Use {@link ExecutionStatus}. */
  get executionStatus() {
    return this.ExecutionStatus;
  }
  /** @deprecated Use {@link ExecutionStatus}. */
  set executionStatus(value) {
    this.ExecutionStatus = value;
  }
  Result: any = null;

  /** @deprecated Use {@link Result}. */
  get result(): any {
    return this.Result;
  }
  /** @deprecated Use {@link Result}. */
  set result(value: any) {
    this.Result = value;
  }

  ProgressSteps = [
    { step: 'loading_test', label: 'Loading Configuration', message: '', active: false, completed: false },
    { step: 'initializing_driver', label: 'Initializing Driver', message: '', active: false, completed: false },
    { step: 'executing_test', label: 'Executing Test', message: '', active: false, completed: false },
    { step: 'evaluating_oracles', label: 'Evaluating Oracles', message: '', active: false, completed: false },
    { step: 'complete', label: 'Complete', message: '', active: false, completed: false }
  ];

  /** @deprecated Use {@link ProgressSteps}. */
  get progressSteps() {
    return this.ProgressSteps;
  }
  /** @deprecated Use {@link ProgressSteps}. */
  set progressSteps(value) {
    this.ProgressSteps = value;
  }

  ExecutionLog: Array<{ timestamp: Date; message: string; type: 'info' | 'success' | 'error' }> = [];

  /** @deprecated Use {@link ExecutionLog}. */
  get executionLog(): Array<{ timestamp: Date; message: string; type: 'info' | 'success' | 'error' }> {
    return this.ExecutionLog;
  }
  /** @deprecated Use {@link ExecutionLog}. */
  set executionLog(value: Array<{ timestamp: Date; message: string; type: 'info' | 'success' | 'error' }>) {
    this.ExecutionLog = value;
  }

  /**
   * User-facing text for the "Execution Failed" banner. The suite path returns
   * success + result only (no top-level errorMessage — see RunTestResolver.executeSuite),
   * so fall back to a summary synthesized from the suite result counts + the first
   * failed/errored test, then a generic note. The banner must never render empty when
   * hasError is true.
   */
  get FailureMessage(): string {
    const top = this.Result?.errorMessage as string | undefined;
    if (top) {
      return top;
    }
    const detail = this.Result?.result;
    if (detail) {
      // Suite path: result is a TestSuiteRunResult with per-test entries. Count anything
      // that isn't a pass/skip — the engine's `failedTests` counts only 'Failed', not
      // 'Error'/'Timeout', so we derive the count from the per-test statuses directly.
      const tests: Array<{ testName?: string; status?: string; errorMessage?: string }> =
        Array.isArray(detail.testResults) ? detail.testResults : [];
      if (tests.length > 0) {
        const notPassed = tests.filter(t => t.status && t.status !== 'Passed' && t.status !== 'Skipped');
        const denom = typeof detail.totalTests === 'number' ? detail.totalTests : tests.length;
        const summary = `${notPassed.length} of ${denom} test${denom === 1 ? '' : 's'} did not pass.`;
        const firstWithMsg = notPassed.find(t => t.errorMessage);
        if (firstWithMsg?.errorMessage) {
          const who = firstWithMsg.testName ? `${firstWithMsg.testName}: ` : '';
          return `${summary} ${who}${firstWithMsg.errorMessage}`;
        }
        return `${summary} See the execution log above for per-test details.`;
      }
      // Single-test path: result is a TestRunResult carrying its own errorMessage.
      const single = detail.errorMessage as string | undefined;
      if (single) {
        return single;
      }
    }
    return 'Execution failed — see the execution log above for details.';
  }

  /** @deprecated Use {@link FailureMessage}. */
  get failureMessage(): string {
    return this.FailureMessage;
  }

  get DialogTitle(): string {
    if (this.IsRunning || this.HasCompleted) {
      return 'Test Execution';
    }
    return 'Run Test';
  }

  /** @deprecated Use {@link DialogTitle}. */
  get dialogTitle(): string {
    return this.DialogTitle;
  }

  @Input() PanelMode = false;
  @Output() PanelClose = new EventEmitter<void>();

  constructor(
    private cdr: ChangeDetectorRef,
    private executionService: TestingExecutionService
  ) { super(); }

  async ngOnInit(): Promise<void> {
    // Initialize the GraphQL testing client using the active provider (multi-provider safe).
    const dataProvider = this.ProviderToUse as unknown as GraphQLDataProvider;
    this.testingClient = new GraphQLTestingClient(dataProvider);
    // Get engine instance and ensure it's configured
    this.engine = TestEngineBase.Instance;

    // Ensure the engine is configured
    if (!this.engine.Loaded) {
      await this.engine.Config(false);
    }

    // Load tests and suites from cache
    this.AllTests = this.engine.Tests.filter(t => t.Status === 'Active');
    this.AllSuites = this.engine.TestSuites.filter(s => s.Status === 'Active');

    // Monitor mode: show running state for a test executing on the server
    if (this.RunMode === 'monitor' && this.SelectedTestId) {
      // Try to reconnect to an active run tracked by the execution service
      if (this.reconnectToActiveRun(this.SelectedTestId)) {
        this.cdr.markForCheck();
        return;
      }

      // No active run in the execution service (started externally or from a previous session).
      // Show a server-monitoring view.
      const test = this.AllTests.find(t => UUIDsEqual(t.ID, this.SelectedTestId));
      this.enterServerMonitoringMode(test?.Name ?? 'Test');
      this.cdr.markForCheck();
      return;
    }

    // Check if we have a pre-selected test or suite
    if (this.SelectedTestId) {
      // Check if this test has an active run we can reconnect to
      if (this.reconnectToActiveRun(this.SelectedTestId)) {
        this.cdr.markForCheck();
        return;
      }

      this.IsPreselected = true;
      this.RunMode = 'test';
      const test = this.AllTests.find(t => UUIDsEqual(t.ID, this.SelectedTestId));
      this.PreselectedName = test ? test.Name : 'Test';
      // Load variables for the selected test
      if (test) {
        this.loadVariablesForTest(test);
      }
    } else if (this.SelectedSuiteId) {
      // Check if this suite has an active run we can reconnect to
      if (this.reconnectToActiveRun(this.SelectedSuiteId)) {
        this.cdr.markForCheck();
        return;
      }

      this.IsPreselected = true;
      this.RunMode = 'suite';
      const suite = this.AllSuites.find(s => UUIDsEqual(s.ID, this.SelectedSuiteId));
      this.PreselectedName = suite ? suite.Name : 'Test Suite';
      // Load suite tests for selective execution
      this.loadSuiteTests(this.SelectedSuiteId);
    }

    this.FilterItems();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  SetRunMode(mode: 'test' | 'suite'): void {
    this.RunMode = mode;
    this.SearchText = '';
    this.SelectedTestId = null;
    this.SelectedSuiteId = null;
    this.FilterItems();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SetRunMode}. */
  setRunMode(mode: 'test' | 'suite'): void {
    return this.SetRunMode(mode);
  }

  FilterItems(): void {
    const search = this.SearchText.toLowerCase();

    if (this.RunMode === 'test') {
      this.FilteredTests = this.AllTests.filter(t =>
        t.Name.toLowerCase().includes(search) ||
        (t.Description && t.Description.toLowerCase().includes(search))
      );
    } else {
      this.FilteredSuites = this.AllSuites.filter(s =>
        s.Name.toLowerCase().includes(search) ||
        (s.Description && s.Description.toLowerCase().includes(search))
      );
    }

    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link FilterItems}. */
  filterItems(): void {
    return this.FilterItems();
  }

  ClearSearch(): void {
    this.SearchText = '';
    this.FilterItems();
  }

  /** @deprecated Use {@link ClearSearch}. */
  clearSearch(): void {
    return this.ClearSearch();
  }

  IsTestSelected(test: MJTestEntity): boolean {
    return UUIDsEqual(this.SelectedTestId, test.ID);
  }

  IsSuiteSelected(suite: MJTestSuiteEntity): boolean {
    return UUIDsEqual(this.SelectedSuiteId, suite.ID);
  }

  SelectTest(testId: string): void {
    this.SelectedTestId = testId;
    // Load variables for the selected test
    const test = this.AllTests.find(t => UUIDsEqual(t.ID, testId));
    if (test) {
      this.loadVariablesForTest(test);
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SelectTest}. */
  selectTest(testId: string): void {
    return this.SelectTest(testId);
  }

  SelectSuite(suiteId: string): void {
    this.SelectedSuiteId = suiteId;
    this.loadSuiteTests(suiteId);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SelectSuite}. */
  selectSuite(suiteId: string): void {
    return this.SelectSuite(suiteId);
  }

  /**
   * Load tests for a selected suite to enable selective execution
   */
  private loadSuiteTests(suiteId: string): void {
    const suiteTestLinks = this.engine.TestSuiteTests.filter(st => UUIDsEqual(st.SuiteID, suiteId));

    // Build list of tests with their sequence numbers
    this.SuiteTests = suiteTestLinks
      .map(st => {
        const test = this.AllTests.find(t => UUIDsEqual(t.ID, st.TestID));
        if (!test) return null;
        return {
          testId: st.TestID,
          testName: test.Name,
          sequence: st.Sequence,
          selected: true // All selected by default
        };
      })
      .filter((item): item is SuiteTestItem => item !== null)
      .sort((a, b) => a.sequence - b.sequence);

    // Reset sequence range
    this.UseSequenceRange = false;
    this.SequenceStart = this.SuiteTests.length > 0 ? this.SuiteTests[0].sequence : null;
    this.SequenceEnd = this.SuiteTests.length > 0 ? this.SuiteTests[this.SuiteTests.length - 1].sequence : null;
  }

  OnAdvancedOptionsExpandedChange(expanded: boolean): void {
    this.ShowAdvancedOptions = expanded;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link OnAdvancedOptionsExpandedChange}. */
  onAdvancedOptionsExpandedChange(expanded: boolean): void {
    return this.OnAdvancedOptionsExpandedChange(expanded);
  }

  /**
   * Load available variables for a test based on its TestType's VariablesSchema
   */
  private loadVariablesForTest(test: MJTestEntity): void {
    this.AvailableVariables = [];
    this.ShowVariablesSection = false;

    // Get the TestType to access VariablesSchema
    const testType = this.engine.TestTypes.find(tt => UUIDsEqual(tt.ID, test.TypeID));
    if (!testType) {
      return;
    }

    // Parse the type's VariablesSchema
    const variablesSchemaJson = (testType as MJTestTypeEntity & { VariablesSchema?: string }).VariablesSchema;
    if (!variablesSchemaJson) {
      return;
    }

    const typeSchema = SafeJSONParse(variablesSchemaJson) as TestTypeVariablesSchema | null;
    if (!typeSchema || !typeSchema.variables || typeSchema.variables.length === 0) {
      return;
    }

    // Parse the test's Variables config to check which are exposed
    const testVariablesJson = (test as MJTestEntity & { Variables?: string }).Variables;
    const testConfig = testVariablesJson ? SafeJSONParse(testVariablesJson) as TestVariablesConfig | null : null;

    // Build the available variables list
    for (const varDef of typeSchema.variables) {
      // Check if test explicitly hides this variable
      const testOverride = testConfig?.variables?.[varDef.name];
      if (testOverride?.exposed === false) {
        continue; // Variable not exposed by this test
      }

      // Determine the default value to show
      const defaultValue = testOverride?.defaultValue ?? varDef.defaultValue;

      this.AvailableVariables.push({
        definition: varDef,
        value: defaultValue ?? null,
        stringValue: defaultValue != null ? String(defaultValue) : ''
      });
    }

    // Auto-expand variables section if there are required variables
    if (this.AvailableVariables.some(v => v.definition.required)) {
      this.ShowVariablesSection = true;
    }
  }

  /**
   * Collect variable values for test execution
   */
  private getVariablesForExecution(): Record<string, unknown> | undefined {
    if (this.AvailableVariables.length === 0) {
      return undefined;
    }

    const variables: Record<string, unknown> = {};
    let hasValues = false;

    for (const variable of this.AvailableVariables) {
      if (variable.stringValue !== '' && variable.stringValue != null) {
        hasValues = true;
        // Convert string value to appropriate type
        switch (variable.definition.dataType) {
          case 'number':
            variables[variable.definition.name] = parseFloat(variable.stringValue);
            break;
          case 'boolean':
            variables[variable.definition.name] = variable.stringValue.toLowerCase() === 'true';
            break;
          default:
            variables[variable.definition.name] = variable.stringValue;
        }
      }
    }

    return hasValues ? variables : undefined;
  }

  ToggleAllTests(selectAll: boolean): void {
    this.SuiteTests.forEach(t => t.selected = selectAll);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleAllTests}. */
  toggleAllTests(selectAll: boolean): void {
    return this.ToggleAllTests(selectAll);
  }

  ToggleTest(testId: string): void {
    const test = this.SuiteTests.find(t => t.testId === testId);
    if (test) {
      test.selected = !test.selected;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link ToggleTest}. */
  toggleTest(testId: string): void {
    return this.ToggleTest(testId);
  }

  get SelectedTestCount(): number {
    return this.SuiteTests.filter(t => t.selected).length;
  }

  /** @deprecated Use {@link SelectedTestCount}. */
  get selectedTestCount(): number {
    return this.SelectedTestCount;
  }

  get AllTestsSelected(): boolean {
    return this.SuiteTests.length > 0 && this.SuiteTests.every(t => t.selected);
  }

  /** @deprecated Use {@link AllTestsSelected}. */
  get allTestsSelected(): boolean {
    return this.AllTestsSelected;
  }

  get SomeTestsSelected(): boolean {
    const selected = this.SelectedTestCount;
    return selected > 0 && selected < this.SuiteTests.length;
  }

  /** @deprecated Use {@link SomeTestsSelected}. */
  get someTestsSelected(): boolean {
    return this.SomeTestsSelected;
  }

  get SequenceRangeValid(): boolean {
    if (!this.UseSequenceRange) return true;
    if (this.SequenceStart == null || this.SequenceEnd == null) return false;
    return this.SequenceStart <= this.SequenceEnd;
  }

  /** @deprecated Use {@link SequenceRangeValid}. */
  get sequenceRangeValid(): boolean {
    return this.SequenceRangeValid;
  }

  get TestsInSequenceRange(): number {
    if (!this.UseSequenceRange || this.SequenceStart == null || this.SequenceEnd == null) {
      return this.SuiteTests.length;
    }
    return this.SuiteTests.filter(t =>
      t.sequence >= this.SequenceStart! && t.sequence <= this.SequenceEnd!
    ).length;
  }

  /** @deprecated Use {@link TestsInSequenceRange}. */
  get testsInSequenceRange(): number {
    return this.TestsInSequenceRange;
  }

  /**
   * Get IDs of selected tests for execution
   */
  private getSelectedTestIds(): string[] {
    if (!this.ShowAdvancedOptions) {
      // If advanced options not shown, run all tests
      return this.SuiteTests.map(t => t.testId);
    }
    return this.SuiteTests.filter(t => t.selected).map(t => t.testId);
  }

  /**
   * Get sequence range parameters if enabled
   */
  private getSequenceRangeParams(): { start: number | undefined; end: number | undefined } {
    if (!this.ShowAdvancedOptions || !this.UseSequenceRange) {
      return { start: undefined, end: undefined };
    }
    return {
      start: this.SequenceStart ?? undefined,
      end: this.SequenceEnd ?? undefined
    };
  }

  CanRun(): boolean {
    return (this.RunMode === 'test' && this.SelectedTestId != null) ||
           (this.RunMode === 'suite' && this.SelectedSuiteId != null);
  }

  /** @deprecated Use {@link CanRun}. */
  canRun(): boolean {
    return this.CanRun();
  }

  async RunTest(): Promise<void> {
    if (!this.CanRun()) return;

    this.IsRunning = true;
    this.HasCompleted = false;
    this.HasError = false;
    this.Progress = 0;
    this.ExecutionLog = [];
    this.resetProgressSteps();

    if (this.RunMode === 'test') {
      const test = this.AllTests.find(t => UUIDsEqual(t.ID, this.SelectedTestId));
      this.ExecutionTitle = test ? test.Name : 'Running Test...';
      this.ExecutionStatus = 'Running';
      // Register with execution service so other components can reconnect
      this.executionService.RegisterRun(this.SelectedTestId!, this.ExecutionTitle);
      this.addLogEntry(`Starting test: ${test?.Name}`, 'info');
      await this.executeTest();
    } else {
      const suite = this.AllSuites.find(s => UUIDsEqual(s.ID, this.SelectedSuiteId));
      this.ExecutionTitle = suite ? suite.Name : 'Running Suite...';
      this.ExecutionStatus = 'Running';
      // Register with execution service so other components can reconnect
      this.executionService.RegisterRun(this.SelectedSuiteId!, this.ExecutionTitle);
      this.addLogEntry(`Starting suite: ${suite?.Name}`, 'info');
      await this.executeSuite();
    }

    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link RunTest}. */
  async runTest(): Promise<void> {
    return this.RunTest();
  }

  private async executeTest(): Promise<void> {
    const testId = this.SelectedTestId!;
    try {
      // Collect variable values for execution
      const variables = this.getVariablesForExecution();

      const result = await this.testingClient.RunTest({
        testId,
        verbose: this.verbose,
        tags: this.tags.length > 0 ? this.tags : undefined,
        variables,
        onProgress: (progress) => {
          // Update progress percentage (fallback to 0 if not provided)
          this.Progress = progress.percentage ?? 0;

          // Update progress steps based on current step
          this.updateProgressStep(progress.currentStep);

          // Add log entry for this progress update
          this.addLogEntry(progress.message, 'info');

          // Push to execution service for cross-component visibility
          this.executionService.UpdateRunProgress(testId, this.Progress, progress.currentStep, progress.message);

          // Trigger change detection
          this.cdr.markForCheck();
        }
      });

      this.Result = result;
      this.Progress = 100;
      this.HasCompleted = true;
      this.HasError = !result.success;
      this.ExecutionStatus = result.success ? 'Completed' : 'Failed';
      this.completeAllSteps();

      // Map RunTestResult to TestExecutionResult for the execution service
      const execResult: TestExecutionResult = {
        success: result.success,
        errorMessage: result.errorMessage,
        executionTimeMs: result.executionTimeMs ?? 0,
        result: result.result ? result.result as TestExecutionResult['result'] : undefined
      };

      if (result.success) {
        this.addLogEntry('Test completed successfully', 'success');
        this.executionService.CompleteRun(testId, 'completed', execResult);
      } else {
        this.addLogEntry(`Test failed: ${result.errorMessage}`, 'error');
        this.executionService.CompleteRun(testId, 'failed', execResult);
      }

    } catch (error) {
      this.HasCompleted = true;
      this.HasError = true;
      this.ExecutionStatus = 'Error';
      this.Result = {
        success: false,
        errorMessage: (error as Error).message
      };
      this.addLogEntry(`Error: ${(error as Error).message}`, 'error');
      this.executionService.CompleteRun(testId, 'failed', this.Result);
    } finally {
      this.IsRunning = false;
      this.cdr.markForCheck();
    }
  }

  private async executeSuite(): Promise<void> {
    const suiteId = this.SelectedSuiteId!;
    try {
      // Build selective execution parameters
      const selectedTestIds = this.getSelectedTestIds();
      const sequenceParams = this.getSequenceRangeParams();
      // Collect variable values for execution (applies to all tests in suite)
      const variables = this.getVariablesForExecution();

      const result = await this.testingClient.RunTestSuite({
        suiteId,
        verbose: this.verbose,
        parallel: this.Parallel,
        tags: this.tags.length > 0 ? this.tags : undefined,
        variables,
        selectedTestIds: selectedTestIds.length < this.SuiteTests.length ? selectedTestIds : undefined,
        sequenceStart: sequenceParams.start,
        sequenceEnd: sequenceParams.end,
        onProgress: (progress) => {
          // Update progress percentage (fallback to 0 if not provided)
          this.Progress = progress.percentage ?? 0;

          // Update progress steps based on current step
          this.updateProgressStep(progress.currentStep);

          // Add log entry for this progress update
          this.addLogEntry(progress.message, 'info');

          // Push to execution service for cross-component visibility
          this.executionService.UpdateRunProgress(suiteId, this.Progress, progress.currentStep, progress.message);

          // Trigger change detection
          this.cdr.markForCheck();
        }
      });

      this.Result = result;
      this.Progress = 100;
      this.HasCompleted = true;
      this.HasError = !result.success;
      this.ExecutionStatus = result.success ? 'Completed' : 'Failed';
      this.completeAllSteps();

      // Map RunTestResult to TestExecutionResult for the execution service
      const execResult: TestExecutionResult = {
        success: result.success,
        errorMessage: result.errorMessage,
        executionTimeMs: result.executionTimeMs ?? 0,
        result: result.result ? result.result as TestExecutionResult['result'] : undefined
      };

      if (result.success) {
        this.addLogEntry('Suite completed successfully', 'success');
        this.executionService.CompleteRun(suiteId, 'completed', execResult);
      } else {
        this.addLogEntry(`Suite failed: ${this.FailureMessage}`, 'error');
        this.executionService.CompleteRun(suiteId, 'failed', execResult);
      }

    } catch (error) {
      this.HasCompleted = true;
      this.HasError = true;
      this.ExecutionStatus = 'Error';
      this.Result = {
        success: false,
        errorMessage: (error as Error).message
      };
      this.addLogEntry(`Error: ${(error as Error).message}`, 'error');
      this.executionService.CompleteRun(suiteId, 'failed', {
        success: false,
        errorMessage: (error as Error).message,
        executionTimeMs: 0
      });
    } finally {
      this.IsRunning = false;
      this.cdr.markForCheck();
    }
  }

  private updateProgress(update: ProgressUpdate): void {
    this.Progress = update.percentage;

    // Update step states
    const stepIndex = this.ProgressSteps.findIndex(s => s.step === update.step);
    if (stepIndex >= 0) {
      // Mark previous steps as completed
      for (let i = 0; i < stepIndex; i++) {
        this.ProgressSteps[i].completed = true;
        this.ProgressSteps[i].active = false;
      }

      // Mark current step as active
      this.ProgressSteps[stepIndex].active = true;
      this.ProgressSteps[stepIndex].message = update.message;
    }

    this.addLogEntry(update.message, 'info');
    this.cdr.markForCheck();
  }

  private updateProgressStep(currentStep: string): void {
    // Map test engine steps to our UI steps
    const stepMapping: Record<string, string> = {
      'loading_test': 'loading_test',
      'initializing': 'initializing_driver',
      'executing': 'executing_test',
      'evaluating': 'evaluating_oracles',
      'complete': 'complete'
    };

    const mappedStep = stepMapping[currentStep] || currentStep;
    const stepIndex = this.ProgressSteps.findIndex(s => s.step === mappedStep);

    if (stepIndex >= 0) {
      // Mark previous steps as completed
      for (let i = 0; i < stepIndex; i++) {
        this.ProgressSteps[i].completed = true;
        this.ProgressSteps[i].active = false;
      }

      // Mark current step as active
      this.ProgressSteps[stepIndex].active = true;
      this.ProgressSteps[stepIndex].completed = false;
    }
  }

  /**
   * Enter a monitoring view for a test that's running on the server but wasn't
   * started from this client session (no active run in the execution service).
   */
  private enterServerMonitoringMode(testName: string): void {
    this.IsRunning = true;
    this.HasCompleted = false;
    this.HasError = false;
    this.Progress = -1; // indeterminate
    this.ExecutionTitle = testName;
    this.ExecutionStatus = 'Running on server';
    this.ExecutionLog = [];
    this.addLogEntry('This test is running on the server. Detailed progress is not available for externally started runs.', 'info');
    this.addLogEntry('Close this panel and check the dashboard for results when the test completes.', 'info');
  }

  private resetProgressSteps(): void {
    this.ProgressSteps.forEach(step => {
      step.active = false;
      step.completed = false;
      step.message = '';
    });
  }

  private completeAllSteps(): void {
    this.ProgressSteps.forEach(step => {
      step.active = false;
      step.completed = true;
    });
  }

  private addLogEntry(message: string, type: 'info' | 'success' | 'error'): void {
    this.ExecutionLog.push({
      timestamp: new Date(),
      message,
      type
    });

    // Keep log manageable
    if (this.ExecutionLog.length > 100) {
      this.ExecutionLog = this.ExecutionLog.slice(-100);
    }

    // Push to execution service for cross-component visibility
    const runId = this.SelectedTestId ?? this.SelectedSuiteId;
    if (runId && this.IsRunning) {
      this.executionService.AddRunLog(runId, message, type);
    }
  }

  /**
   * Check if there's an active run for this test/suite in the execution service.
   * If so, restore the running UI state and subscribe to live updates.
   */
  private reconnectToActiveRun(id: string): boolean {
    const activeRun = this.executionService.GetActiveRun(id);
    if (!activeRun || activeRun.Status !== 'running') {
      return false;
    }

    // Restore execution UI state from the active run
    this.IsRunning = true;
    this.HasCompleted = false;
    this.HasError = false;
    this.Progress = activeRun.Progress;
    this.ExecutionTitle = activeRun.TestName;
    this.ExecutionStatus = 'Running';
    this.ExecutionLog = activeRun.LogEntries.map(e => ({
      timestamp: e.timestamp,
      message: e.message,
      type: e.type
    }));
    this.updateProgressStep(activeRun.CurrentStep);

    // Subscribe to live updates from the execution service
    this.executionService.ActiveRuns$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(runs => {
      const run = runs.find(r => r.TestId === id);
      if (!run) return;

      this.Progress = run.Progress;
      this.updateProgressStep(run.CurrentStep);

      // Sync log entries from the service
      this.ExecutionLog = run.LogEntries.map(e => ({
        timestamp: e.timestamp,
        message: e.message,
        type: e.type
      }));

      if (run.Status === 'completed' || run.Status === 'failed') {
        this.IsRunning = false;
        this.HasCompleted = true;
        this.HasError = run.Status === 'failed';
        this.ExecutionStatus = run.Status === 'completed' ? 'Completed' : 'Failed';
        this.Result = run.Result ?? null;
        this.completeAllSteps();
      }

      this.cdr.markForCheck();
    });

    return true;
  }

  ResetDialog(): void {
    this.IsRunning = false;
    this.HasCompleted = false;
    this.HasError = false;
    this.Progress = 0;
    this.ExecutionTitle = '';
    this.ExecutionStatus = '';
    this.Result = null;
    this.ExecutionLog = [];
    this.SelectedTestId = null;
    this.SelectedSuiteId = null;
    this.SearchText = '';
    this.tags = [];
    this.NewTag = '';
    this.resetProgressSteps();
    this.FilterItems();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ResetDialog}. */
  resetDialog(): void {
    return this.ResetDialog();
  }

  OnClose(): void {
    this.PanelClose.emit();
  }

  /** @deprecated Use {@link OnClose}. */
  onClose(): void {
    return this.OnClose();
  }

  // Tag management methods
  AddTag(): void {
    const tag = this.NewTag.trim();
    if (tag && !this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
      this.NewTag = '';
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link AddTag}. */
  addTag(): void {
    return this.AddTag();
  }

  RemoveTag(tag: string): void {
    this.tags = this.tags.filter(t => t !== tag);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link RemoveTag}. */
  removeTag(tag: string): void {
    return this.RemoveTag(tag);
  }
}
