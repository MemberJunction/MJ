import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TestEngineBase, TestVariableDefinition, TestTypeVariablesSchema, TestVariablesConfig } from '@memberjunction/testing-engine-base';
import { GraphQLTestingClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJTestEntity, MJTestSuiteEntity, MJTestSuiteTestEntity, MJTestTypeEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';

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
              <div class="variables-section">
                <button class="variables-toggle" (click)="showVariablesSection = !showVariablesSection">
                  <i class="fa-solid" [class.fa-chevron-right]="!showVariablesSection" [class.fa-chevron-down]="showVariablesSection"></i>
                  <i class="fa-solid fa-sliders"></i>
                  <span>Test Variables</span>
                  <span class="variables-count-badge">{{ availableVariables.length }}</span>
                </button>

                @if (showVariablesSection) {
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
                }
              </div>
            }

            <!-- Advanced Options for Preselected Suite Mode -->
            @if (runMode === 'suite' && suiteTests.length > 0) {
              <div class="advanced-options-section preselected-advanced">
                <button class="advanced-toggle" (click)="toggleAdvancedOptions()">
                  <i class="fa-solid" [class.fa-chevron-right]="!showAdvancedOptions" [class.fa-chevron-down]="showAdvancedOptions"></i>
                  <span>Advanced Options</span>
                  <span class="test-count-badge">{{ suiteTests.length }} tests</span>
                </button>

                @if (showAdvancedOptions) {
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
                }
              </div>
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
                    <div class="no-items">
                      <i class="fa-solid fa-inbox"></i>
                      <p>No tests found</p>
                    </div>
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
                    <div class="no-items">
                      <i class="fa-solid fa-inbox"></i>
                      <p>No test suites found</p>
                    </div>
                  }
                </div>
              </div>

              <!-- Advanced Options - Progressive Disclosure -->
              @if (selectedSuiteId && suiteTests.length > 0) {
                <div class="advanced-options-section">
                  <button class="advanced-toggle" (click)="toggleAdvancedOptions()">
                    <i class="fa-solid" [class.fa-chevron-right]="!showAdvancedOptions" [class.fa-chevron-down]="showAdvancedOptions"></i>
                    <span>Advanced Options</span>
                    <span class="test-count-badge">{{ suiteTests.length }} tests</span>
                  </button>

                  @if (showAdvancedOptions) {
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
                  }
                </div>
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
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="progress"></div>
              </div>
              <div class="progress-text">{{ progress }}%</div>
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
                    <div class="error-message">
                      <i class="fa-solid fa-exclamation-triangle"></i>
                      <span>{{ result.errorMessage }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- Dialog Actions -->
        <div class="dialog-actions">
          @if (!isRunning && !hasCompleted) {
            <button class="action-btn cancel-btn" (click)="onClose()">Cancel</button>
            <button class="action-btn run-btn"
                    [disabled]="!canRun()"
                    (click)="runTest()">
              <i class="fa-solid fa-play"></i>
              Run {{ runMode === 'test' ? 'Test' : 'Suite' }}
            </button>
          } @else if (hasCompleted) {
            <button class="action-btn cancel-btn" (click)="onClose()">Close</button>
            <button class="action-btn run-btn" (click)="resetDialog()">
              <i class="fa-solid fa-redo"></i>
              Run Another
            </button>
          } @else {
            <button class="action-btn run-btn" [disabled]="true">
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

    .no-items {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--mj-text-disabled);
      padding: 40px;
      text-align: center;
    }

    .no-items i {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.3;
    }

    .no-items p {
      margin: 0;
      font-size: 14px;
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

    .error-message {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px;
      background: color-mix(in srgb, var(--mj-bg-surface) 70%, transparent);
      border-radius: 6px;
      color: var(--mj-status-error);
      font-size: 13px;
      line-height: 1.5;
      word-break: break-word;
    }

    .error-message i {
      font-size: 20px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .error-message span {
      flex: 1;
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
    .advanced-options-section {
      background: var(--mj-bg-surface);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
      overflow: hidden;
    }

    .advanced-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-secondary);
      text-align: left;
      transition: background 0.2s ease;
    }

    .advanced-toggle:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .advanced-toggle i {
      color: var(--mj-text-disabled);
      font-size: 12px;
      transition: transform 0.2s ease;
    }

    .test-count-badge {
      margin-left: auto;
      padding: 2px 8px;
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      color: var(--mj-brand-primary-hover);
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
    }

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

    .preselected-advanced {
      /* No extra margin - handled by dialog-scroll-content gap */
    }

    /* Variables Section Styles */
    .variables-section {
      background: var(--mj-bg-surface);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
      overflow: hidden;
    }

    .variables-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-secondary);
      text-align: left;
      transition: background 0.2s ease;
    }

    .variables-toggle:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .variables-toggle .fa-sliders {
      color: var(--mj-brand-primary);
    }

    .variables-count-badge {
      margin-left: auto;
      padding: 2px 8px;
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      color: var(--mj-brand-primary-hover);
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
    }

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
  `]
})
export class TestRunDialogComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private testingClient!: GraphQLTestingClient;
  private engine!: TestEngineBase;

  // Selection state
  runMode: 'test' | 'suite' = 'test';
  searchText = '';
  selectedTestId: string | null = null;
  selectedSuiteId: string | null = null;
  verbose = true;
  parallel = false;

  // Tags for test/suite runs
  tags: string[] = [];
  newTag = '';

  // Pre-selection mode - when launched from a specific test/suite
  isPreselected = false;
  preselectedName = '';

  // Data
  allTests: MJTestEntity[] = [];
  allSuites: MJTestSuiteEntity[] = [];
  filteredTests: MJTestEntity[] = [];
  filteredSuites: MJTestSuiteEntity[] = [];

  // Selective test execution for suites (progressive disclosure)
  showAdvancedOptions = false;
  suiteTests: SuiteTestItem[] = [];
  useSequenceRange = false;
  sequenceStart: number | null = null;
  sequenceEnd: number | null = null;

  // Variables for parameterized tests
  availableVariables: VariableInput[] = [];
  showVariablesSection = false;

  // Execution state
  isRunning = false;
  hasCompleted = false;
  hasError = false;
  progress = 0;
  executionTitle = '';
  executionStatus = '';
  result: any = null;

  progressSteps = [
    { step: 'loading_test', label: 'Loading Configuration', message: '', active: false, completed: false },
    { step: 'initializing_driver', label: 'Initializing Driver', message: '', active: false, completed: false },
    { step: 'executing_test', label: 'Executing Test', message: '', active: false, completed: false },
    { step: 'evaluating_oracles', label: 'Evaluating Oracles', message: '', active: false, completed: false },
    { step: 'complete', label: 'Complete', message: '', active: false, completed: false }
  ];

  executionLog: Array<{ timestamp: Date; message: string; type: 'info' | 'success' | 'error' }> = [];

  get dialogTitle(): string {
    if (this.isRunning || this.hasCompleted) {
      return 'Test Execution';
    }
    return 'Run Test';
  }

  constructor(
    private dialogRef: DialogRef,
    private cdr: ChangeDetectorRef
  ) {
    // Get GraphQLDataProvider from Metadata.Provider (it's already configured in the Angular app)
    const dataProvider = Metadata.Provider as GraphQLDataProvider;
    this.testingClient = new GraphQLTestingClient(dataProvider);
  }

  async ngOnInit(): Promise<void> {
    // Get engine instance and ensure it's configured
    this.engine = TestEngineBase.Instance;

    // Ensure the engine is configured
    if (!this.engine.Loaded) {
      await this.engine.Config(false);
    }

    // Load tests and suites from cache
    this.allTests = this.engine.Tests.filter(t => t.Status === 'Active');
    this.allSuites = this.engine.TestSuites.filter(s => s.Status === 'Active');

    // Check if we have a pre-selected test or suite
    if (this.selectedTestId) {
      this.isPreselected = true;
      this.runMode = 'test';
      const test = this.allTests.find(t => UUIDsEqual(t.ID, this.selectedTestId));
      this.preselectedName = test ? test.Name : 'Test';
      // Load variables for the selected test
      if (test) {
        this.loadVariablesForTest(test);
      }
    } else if (this.selectedSuiteId) {
      this.isPreselected = true;
      this.runMode = 'suite';
      const suite = this.allSuites.find(s => UUIDsEqual(s.ID, this.selectedSuiteId));
      this.preselectedName = suite ? suite.Name : 'Test Suite';
      // Load suite tests for selective execution
      this.loadSuiteTests(this.selectedSuiteId);
    }

    this.filterItems();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setRunMode(mode: 'test' | 'suite'): void {
    this.runMode = mode;
    this.searchText = '';
    this.selectedTestId = null;
    this.selectedSuiteId = null;
    this.filterItems();
    this.cdr.markForCheck();
  }

  filterItems(): void {
    const search = this.searchText.toLowerCase();

    if (this.runMode === 'test') {
      this.filteredTests = this.allTests.filter(t =>
        t.Name.toLowerCase().includes(search) ||
        (t.Description && t.Description.toLowerCase().includes(search))
      );
    } else {
      this.filteredSuites = this.allSuites.filter(s =>
        s.Name.toLowerCase().includes(search) ||
        (s.Description && s.Description.toLowerCase().includes(search))
      );
    }

    this.cdr.markForCheck();
  }

  clearSearch(): void {
    this.searchText = '';
    this.filterItems();
  }

  IsTestSelected(test: MJTestEntity): boolean {
    return UUIDsEqual(this.selectedTestId, test.ID);
  }

  IsSuiteSelected(suite: MJTestSuiteEntity): boolean {
    return UUIDsEqual(this.selectedSuiteId, suite.ID);
  }

  selectTest(testId: string): void {
    this.selectedTestId = testId;
    // Load variables for the selected test
    const test = this.allTests.find(t => UUIDsEqual(t.ID, testId));
    if (test) {
      this.loadVariablesForTest(test);
    }
    this.cdr.markForCheck();
  }

  selectSuite(suiteId: string): void {
    this.selectedSuiteId = suiteId;
    this.loadSuiteTests(suiteId);
    this.cdr.markForCheck();
  }

  /**
   * Load tests for a selected suite to enable selective execution
   */
  private loadSuiteTests(suiteId: string): void {
    const suiteTestLinks = this.engine.TestSuiteTests.filter(st => UUIDsEqual(st.SuiteID, suiteId));

    // Build list of tests with their sequence numbers
    this.suiteTests = suiteTestLinks
      .map(st => {
        const test = this.allTests.find(t => UUIDsEqual(t.ID, st.TestID));
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
    this.useSequenceRange = false;
    this.sequenceStart = this.suiteTests.length > 0 ? this.suiteTests[0].sequence : null;
    this.sequenceEnd = this.suiteTests.length > 0 ? this.suiteTests[this.suiteTests.length - 1].sequence : null;
  }

  toggleAdvancedOptions(): void {
    this.showAdvancedOptions = !this.showAdvancedOptions;
    this.cdr.markForCheck();
  }

  /**
   * Load available variables for a test based on its TestType's VariablesSchema
   */
  private loadVariablesForTest(test: MJTestEntity): void {
    this.availableVariables = [];
    this.showVariablesSection = false;

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

      this.availableVariables.push({
        definition: varDef,
        value: defaultValue ?? null,
        stringValue: defaultValue != null ? String(defaultValue) : ''
      });
    }

    // Auto-expand variables section if there are required variables
    if (this.availableVariables.some(v => v.definition.required)) {
      this.showVariablesSection = true;
    }
  }

  /**
   * Collect variable values for test execution
   */
  private getVariablesForExecution(): Record<string, unknown> | undefined {
    if (this.availableVariables.length === 0) {
      return undefined;
    }

    const variables: Record<string, unknown> = {};
    let hasValues = false;

    for (const variable of this.availableVariables) {
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

  toggleAllTests(selectAll: boolean): void {
    this.suiteTests.forEach(t => t.selected = selectAll);
    this.cdr.markForCheck();
  }

  toggleTest(testId: string): void {
    const test = this.suiteTests.find(t => t.testId === testId);
    if (test) {
      test.selected = !test.selected;
      this.cdr.markForCheck();
    }
  }

  get selectedTestCount(): number {
    return this.suiteTests.filter(t => t.selected).length;
  }

  get allTestsSelected(): boolean {
    return this.suiteTests.length > 0 && this.suiteTests.every(t => t.selected);
  }

  get someTestsSelected(): boolean {
    const selected = this.selectedTestCount;
    return selected > 0 && selected < this.suiteTests.length;
  }

  get sequenceRangeValid(): boolean {
    if (!this.useSequenceRange) return true;
    if (this.sequenceStart == null || this.sequenceEnd == null) return false;
    return this.sequenceStart <= this.sequenceEnd;
  }

  get testsInSequenceRange(): number {
    if (!this.useSequenceRange || this.sequenceStart == null || this.sequenceEnd == null) {
      return this.suiteTests.length;
    }
    return this.suiteTests.filter(t =>
      t.sequence >= this.sequenceStart! && t.sequence <= this.sequenceEnd!
    ).length;
  }

  /**
   * Get IDs of selected tests for execution
   */
  private getSelectedTestIds(): string[] {
    if (!this.showAdvancedOptions) {
      // If advanced options not shown, run all tests
      return this.suiteTests.map(t => t.testId);
    }
    return this.suiteTests.filter(t => t.selected).map(t => t.testId);
  }

  /**
   * Get sequence range parameters if enabled
   */
  private getSequenceRangeParams(): { start: number | undefined; end: number | undefined } {
    if (!this.showAdvancedOptions || !this.useSequenceRange) {
      return { start: undefined, end: undefined };
    }
    return {
      start: this.sequenceStart ?? undefined,
      end: this.sequenceEnd ?? undefined
    };
  }

  canRun(): boolean {
    return (this.runMode === 'test' && this.selectedTestId != null) ||
           (this.runMode === 'suite' && this.selectedSuiteId != null);
  }

  async runTest(): Promise<void> {
    if (!this.canRun()) return;

    this.isRunning = true;
    this.hasCompleted = false;
    this.hasError = false;
    this.progress = 0;
    this.executionLog = [];
    this.resetProgressSteps();

    if (this.runMode === 'test') {
      const test = this.allTests.find(t => UUIDsEqual(t.ID, this.selectedTestId));
      this.executionTitle = test ? test.Name : 'Running Test...';
      this.executionStatus = 'Running';
      this.addLogEntry(`Starting test: ${test?.Name}`, 'info');
      await this.executeTest();
    } else {
      const suite = this.allSuites.find(s => UUIDsEqual(s.ID, this.selectedSuiteId));
      this.executionTitle = suite ? suite.Name : 'Running Suite...';
      this.executionStatus = 'Running';
      this.addLogEntry(`Starting suite: ${suite?.Name}`, 'info');
      await this.executeSuite();
    }

    this.cdr.markForCheck();
  }

  private async executeTest(): Promise<void> {
    try {
      // Collect variable values for execution
      const variables = this.getVariablesForExecution();

      const result = await this.testingClient.RunTest({
        testId: this.selectedTestId!,
        verbose: this.verbose,
        tags: this.tags.length > 0 ? this.tags : undefined,
        variables,
        onProgress: (progress) => {
          // Update progress percentage (fallback to 0 if not provided)
          this.progress = progress.percentage ?? 0;

          // Update progress steps based on current step
          this.updateProgressStep(progress.currentStep);

          // Add log entry for this progress update
          this.addLogEntry(progress.message, 'info');

          // Trigger change detection
          this.cdr.markForCheck();
        }
      });

      this.result = result;
      this.progress = 100;
      this.hasCompleted = true;
      this.hasError = !result.success;
      this.executionStatus = result.success ? 'Completed' : 'Failed';
      this.completeAllSteps();

      if (result.success) {
        this.addLogEntry('Test completed successfully', 'success');
      } else {
        this.addLogEntry(`Test failed: ${result.errorMessage}`, 'error');
      }

    } catch (error) {
      this.hasCompleted = true;
      this.hasError = true;
      this.executionStatus = 'Error';
      this.result = {
        success: false,
        errorMessage: (error as Error).message
      };
      this.addLogEntry(`Error: ${(error as Error).message}`, 'error');
    } finally {
      this.isRunning = false;
      this.cdr.markForCheck();
    }
  }

  private async executeSuite(): Promise<void> {
    try {
      // Build selective execution parameters
      const selectedTestIds = this.getSelectedTestIds();
      const sequenceParams = this.getSequenceRangeParams();
      // Collect variable values for execution (applies to all tests in suite)
      const variables = this.getVariablesForExecution();

      const result = await this.testingClient.RunTestSuite({
        suiteId: this.selectedSuiteId!,
        verbose: this.verbose,
        parallel: this.parallel,
        tags: this.tags.length > 0 ? this.tags : undefined,
        variables,
        selectedTestIds: selectedTestIds.length < this.suiteTests.length ? selectedTestIds : undefined,
        sequenceStart: sequenceParams.start,
        sequenceEnd: sequenceParams.end,
        onProgress: (progress) => {
          // Update progress percentage (fallback to 0 if not provided)
          this.progress = progress.percentage ?? 0;

          // Update progress steps based on current step
          this.updateProgressStep(progress.currentStep);

          // Add log entry for this progress update
          this.addLogEntry(progress.message, 'info');

          // Trigger change detection
          this.cdr.markForCheck();
        }
      });

      this.result = result;
      this.progress = 100;
      this.hasCompleted = true;
      this.hasError = !result.success;
      this.executionStatus = result.success ? 'Completed' : 'Failed';
      this.completeAllSteps();

      if (result.success) {
        this.addLogEntry('Suite completed successfully', 'success');
      } else {
        this.addLogEntry(`Suite failed: ${result.errorMessage}`, 'error');
      }

    } catch (error) {
      this.hasCompleted = true;
      this.hasError = true;
      this.executionStatus = 'Error';
      this.result = {
        success: false,
        errorMessage: (error as Error).message
      };
      this.addLogEntry(`Error: ${(error as Error).message}`, 'error');
    } finally {
      this.isRunning = false;
      this.cdr.markForCheck();
    }
  }

  private updateProgress(update: ProgressUpdate): void {
    this.progress = update.percentage;

    // Update step states
    const stepIndex = this.progressSteps.findIndex(s => s.step === update.step);
    if (stepIndex >= 0) {
      // Mark previous steps as completed
      for (let i = 0; i < stepIndex; i++) {
        this.progressSteps[i].completed = true;
        this.progressSteps[i].active = false;
      }

      // Mark current step as active
      this.progressSteps[stepIndex].active = true;
      this.progressSteps[stepIndex].message = update.message;
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
    const stepIndex = this.progressSteps.findIndex(s => s.step === mappedStep);

    if (stepIndex >= 0) {
      // Mark previous steps as completed
      for (let i = 0; i < stepIndex; i++) {
        this.progressSteps[i].completed = true;
        this.progressSteps[i].active = false;
      }

      // Mark current step as active
      this.progressSteps[stepIndex].active = true;
      this.progressSteps[stepIndex].completed = false;
    }
  }

  private resetProgressSteps(): void {
    this.progressSteps.forEach(step => {
      step.active = false;
      step.completed = false;
      step.message = '';
    });
  }

  private completeAllSteps(): void {
    this.progressSteps.forEach(step => {
      step.active = false;
      step.completed = true;
    });
  }

  private addLogEntry(message: string, type: 'info' | 'success' | 'error'): void {
    this.executionLog.push({
      timestamp: new Date(),
      message,
      type
    });

    // Keep log manageable
    if (this.executionLog.length > 100) {
      this.executionLog = this.executionLog.slice(-100);
    }
  }

  resetDialog(): void {
    this.isRunning = false;
    this.hasCompleted = false;
    this.hasError = false;
    this.progress = 0;
    this.executionTitle = '';
    this.executionStatus = '';
    this.result = null;
    this.executionLog = [];
    this.selectedTestId = null;
    this.selectedSuiteId = null;
    this.searchText = '';
    this.tags = [];
    this.newTag = '';
    this.resetProgressSteps();
    this.filterItems();
    this.cdr.markForCheck();
  }

  onClose(): void {
    if (!this.isRunning) {
      this.dialogRef.close();
    }
  }

  // Tag management methods
  addTag(): void {
    const tag = this.newTag.trim();
    if (tag && !this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
      this.newTag = '';
      this.cdr.markForCheck();
    }
  }

  removeTag(tag: string): void {
    this.tags = this.tags.filter(t => t !== tag);
    this.cdr.markForCheck();
  }
}
