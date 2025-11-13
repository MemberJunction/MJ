import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TestEngineBase } from '@memberjunction/testing-engine-base';
import { GraphQLTestingClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { TestEntity, TestSuiteEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';

interface ProgressUpdate {
  step: string;
  percentage: number;
  message: string;
  testName?: string;
  driverType?: string;
}

@Component({
  selector: 'app-test-run-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
      <div class="test-run-dialog">
        @if (!isRunning && !hasCompleted) {
          <!-- Selection Mode -->
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
                      [class.selected]="selectedTestId === test.ID"
                      (click)="selectTest(test.ID)"
                    >
                      <div class="item-icon">
                        <i class="fa-solid fa-flask"></i>
                      </div>
                      <div class="item-content">
                        <div class="item-name">{{ test.Name }}</div>
                        <div class="item-meta">{{ test.Type }} • {{ test.Description || 'No description' }}</div>
                      </div>
                      @if (selectedTestId === test.ID) {
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
                      [class.selected]="selectedSuiteId === suite.ID"
                      (click)="selectSuite(suite.ID)"
                    >
                      <div class="item-icon suite">
                        <i class="fa-solid fa-layer-group"></i>
                      </div>
                      <div class="item-content">
                        <div class="item-name">{{ suite.Name }}</div>
                        <div class="item-meta">{{ suite.Description || 'No description' }}</div>
                      </div>
                      @if (selectedSuiteId === suite.ID) {
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
          </div>
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
      background: #f8f9fa;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 20px;
      background: white;
      border-top: 1px solid #e0e0e0;
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
      background: #f5f5f5;
      color: #666;
    }

    .cancel-btn:hover {
      background: #e0e0e0;
    }

    .run-btn {
      background: #2196f3;
      color: white;
    }

    .run-btn:hover:not(:disabled) {
      background: #1976d2;
    }

    .run-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
      opacity: 0.6;
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
      background: white;
      padding: 8px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
      color: #666;
      font-size: 14px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .mode-tab:hover {
      background: rgba(33, 150, 243, 0.1);
      color: #2196f3;
    }

    .mode-tab.active {
      background: #2196f3;
      color: white;
    }

    .mode-tab i {
      font-size: 16px;
    }

    .selection-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: #f5f7fa;
      border: 2px solid #e0e4e8;
      border-radius: 6px;
      transition: border-color 0.2s ease;
    }

    .search-box:focus-within {
      border-color: #2196f3;
    }

    .search-box i {
      color: #999;
      font-size: 14px;
    }

    .search-box input {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      font-size: 14px;
      color: #333;
    }

    .search-box input::placeholder {
      color: #999;
    }

    .clear-btn {
      padding: 4px 8px;
      border: none;
      background: transparent;
      color: #999;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s ease;
    }

    .clear-btn:hover {
      background: rgba(0,0,0,0.05);
      color: #666;
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
      background: #f8f9fa;
      border: 2px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      min-width: 0;
      max-width: 100%;
    }

    .item:hover {
      background: #e3f2fd;
      border-color: #90caf9;
    }

    .item.selected {
      background: #e3f2fd;
      border-color: #2196f3;
    }

    .item-icon {
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #2196f3;
      color: white;
      border-radius: 8px;
      font-size: 18px;
      flex-shrink: 0;
    }

    .item-icon.suite {
      background: #9c27b0;
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
      color: #333;
      line-height: 1.3;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .item-meta {
      font-size: 13px;
      color: #666;
      line-height: 1.4;
      word-wrap: break-word;
      overflow-wrap: break-word;
      white-space: normal;
    }

    .item-check {
      color: #2196f3;
      font-size: 20px;
    }

    .no-items {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #999;
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
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
      color: #333;
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
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .execution-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .execution-title i {
      font-size: 20px;
      color: #2196f3;
    }

    .execution-title i.fa-check-circle {
      color: #4caf50;
    }

    .execution-title i.fa-exclamation-circle {
      color: #f44336;
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
      background: #e3f2fd;
      color: #2196f3;
    }

    .execution-status.success {
      background: #e8f5e9;
      color: #4caf50;
    }

    .execution-status.error {
      background: #ffebee;
      color: #f44336;
    }

    .progress-container {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .progress-bar {
      flex: 1;
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #2196f3, #21cbf3);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 14px;
      font-weight: 600;
      color: #2196f3;
      min-width: 45px;
      text-align: right;
    }

    .progress-steps {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
      background: #e3f2fd;
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
      color: #999;
      font-size: 12px;
    }

    .step.active .step-icon {
      color: #2196f3;
    }

    .step.completed .step-icon {
      color: #4caf50;
    }

    .step-content {
      flex: 1;
      min-width: 0;
    }

    .step-label {
      font-size: 13px;
      font-weight: 600;
      color: #333;
      margin-bottom: 2px;
    }

    .step-message {
      font-size: 12px;
      color: #666;
    }

    .execution-log {
      display: flex;
      flex-direction: column;
      background: #1e1e1e;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      flex: 1;
      min-height: 0;
    }

    .log-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #2d2d2d;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      border-bottom: 1px solid #3d3d3d;
    }

    .log-header i {
      color: #4caf50;
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
      color: #e0e0e0;
    }

    .log-entry.error {
      color: #f44336;
    }

    .log-entry.success {
      color: #4caf50;
    }

    .log-entry.info {
      color: #2196f3;
    }

    .log-time {
      color: #999;
      min-width: 60px;
    }

    .log-message {
      flex: 1;
    }

    .result-summary {
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .result-summary.success {
      background: #e8f5e9;
      border: 2px solid #4caf50;
    }

    .result-summary.error {
      background: #ffebee;
      border: 2px solid #f44336;
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
      color: #2e7d32;
    }

    .result-summary.error .result-header {
      color: #c62828;
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
      background: rgba(255,255,255,0.5);
      border-radius: 4px;
    }

    .result-label {
      font-weight: 600;
      color: #666;
      font-size: 13px;
    }

    .result-value {
      font-weight: 600;
      color: #333;
      font-size: 13px;
    }

    .error-message {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px;
      background: rgba(255,255,255,0.7);
      border-radius: 6px;
      color: #c62828;
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

  // Data
  allTests: TestEntity[] = [];
  allSuites: TestSuiteEntity[] = [];
  filteredTests: TestEntity[] = [];
  filteredSuites: TestSuiteEntity[] = [];

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

  selectTest(testId: string): void {
    this.selectedTestId = testId;
    this.cdr.markForCheck();
  }

  selectSuite(suiteId: string): void {
    this.selectedSuiteId = suiteId;
    this.cdr.markForCheck();
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
      const test = this.allTests.find(t => t.ID === this.selectedTestId);
      this.executionTitle = test ? test.Name : 'Running Test...';
      this.executionStatus = 'Running';
      this.addLogEntry(`Starting test: ${test?.Name}`, 'info');
      await this.executeTest();
    } else {
      const suite = this.allSuites.find(s => s.ID === this.selectedSuiteId);
      this.executionTitle = suite ? suite.Name : 'Running Suite...';
      this.executionStatus = 'Running';
      this.addLogEntry(`Starting suite: ${suite?.Name}`, 'info');
      await this.executeSuite();
    }

    this.cdr.markForCheck();
  }

  private async executeTest(): Promise<void> {
    try {
      const result = await this.testingClient.RunTest({
        testId: this.selectedTestId!,
        verbose: this.verbose,
        onProgress: (progress) => {
          // Update progress percentage
          this.progress = progress.percentage;

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
      const result = await this.testingClient.RunTestSuite({
        suiteId: this.selectedSuiteId!,
        verbose: this.verbose,
        parallel: this.parallel,
        onProgress: (progress) => {
          // Update progress percentage
          this.progress = progress.percentage;

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
    this.resetProgressSteps();
    this.filterItems();
    this.cdr.markForCheck();
  }

  onClose(): void {
    if (!this.isRunning) {
      this.dialogRef.close();
    }
  }
}
