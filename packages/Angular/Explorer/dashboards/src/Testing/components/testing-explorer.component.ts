import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  ViewContainerRef
} from '@angular/core';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { RunView, CompositeKey, Metadata } from '@memberjunction/core';
import { TestEntity, TestSuiteEntity, TestSuiteTestEntity, TestTypeEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { TestingDialogService } from '@memberjunction/ng-testing';
import { TestEngineBase } from '@memberjunction/testing-engine-base';
import { TestingInstrumentationService } from '../services/testing-instrumentation.service';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface SuiteCardData {
  ID: string;
  Name: string;
  Description: string;
  Status: string;
  TestCount: number;
  PassRate: number;
  AvgScore: number;
  AvgDuration: number; // ms
  LastRunDate: Date | null;
  Tags: string[];
  Tests: SuiteTestItem[]; // first 4-5 for preview
  TotalTestsInSuite: number;
}

interface SuiteTestItem {
  TestID: string;
  TestName: string;
  LastStatus: string;
  LastScore: number;
}

interface TestCardData {
  ID: string;
  Name: string;
  Description: string;
  Status: string;
  TypeName: string;
  SuiteName: string;
  LastRunStatus: string;
  LastScore: number;
  TotalRuns: number;
  PassRate: number;
  EstDuration: number; // seconds
  EstCost: number;
  LastRunDate: Date | null;
  Tags: string[];
  UpdatedAt: Date;
}

interface SidebarSelection {
  Type: 'all' | 'standalone' | 'suite' | 'testType';
  ID: string | null;
}

interface SuiteTreeNode {
  ID: string;
  Name: string;
  ParentID: string | null;
  TestCount: number;
  Children: SuiteTreeNode[];
  Expanded: boolean;
}

type DisplayMode = 'all' | 'suites' | 'tests';
type ViewMode = 'card' | 'list';
type SortField = 'name' | 'updated' | 'status';
type SortDirection = 'asc' | 'desc';

/** Simple result type for test run stats queries */
interface TestRunStatRow {
  ID: string;
  TestID: string;
  Status: string;
  Score: number;
  CostUSD: number;
  StartedAt: string | Date;
  CompletedAt: string | Date | null;
}

@Component({
  selector: 'app-testing-explorer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (IsLoading) {
      <div class="explorer-loading">
        <mj-loading text="Loading test explorer..."></mj-loading>
      </div>
    } @else {
      <div class="explorer-layout">
        <!-- Left Sidebar -->
        <aside class="sidebar" [class.collapsed]="IsSidebarCollapsed">
          <div class="sidebar-header">
            <h3>Explorer</h3>
            <button class="sidebar-toggle" (click)="ToggleSidebar()">
              <i class="fa-solid" [class.fa-chevron-left]="!IsSidebarCollapsed" [class.fa-chevron-right]="IsSidebarCollapsed"></i>
            </button>
          </div>

          @if (!IsSidebarCollapsed) {
            <div class="sidebar-content">
              <!-- Browse Section -->
              <div class="sidebar-section">
                <div class="sidebar-section-title">Browse</div>
                <div
                  class="sidebar-item"
                  [class.active]="SelectedSidebar.Type === 'all'"
                  (click)="SelectSidebarItem({ Type: 'all', ID: null })"
                >
                  <i class="fa-solid fa-layer-group"></i>
                  <span>All Items</span>
                  <span class="sidebar-count">{{ TotalItemCount }}</span>
                </div>
                <div
                  class="sidebar-item"
                  [class.active]="SelectedSidebar.Type === 'standalone'"
                  (click)="SelectSidebarItem({ Type: 'standalone', ID: null })"
                >
                  <i class="fa-solid fa-vial"></i>
                  <span>Standalone Tests</span>
                  <span class="sidebar-count">{{ StandaloneTestCount }}</span>
                </div>
              </div>

              <!-- Test Suites Section -->
              <div class="sidebar-section">
                <div class="sidebar-section-title">Test Suites</div>
                @for (node of FilteredSuiteTree; track node.ID) {
                  <ng-container
                    *ngTemplateOutlet="suiteTreeTpl; context: { node: node, depth: 0 }"
                  ></ng-container>
                }
                @if (FilteredSuiteTree.length === 0) {
                  <div class="sidebar-empty">No suites found</div>
                }
              </div>

              <!-- Test Types Section -->
              <div class="sidebar-section">
                <div class="sidebar-section-title">Test Types</div>
                @for (tt of FilteredTestTypes; track tt.ID) {
                  <div
                    class="sidebar-item"
                    [class.active]="SelectedSidebar.Type === 'testType' && SelectedSidebar.ID === tt.ID"
                    (click)="SelectSidebarItem({ Type: 'testType', ID: tt.ID })"
                  >
                    <i class="fa-solid fa-tag"></i>
                    <span>{{ tt.Name }}</span>
                    <span class="sidebar-count">{{ GetTestCountForType(tt.ID) }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </aside>

        <!-- Main Content -->
        <main class="main-content">
          <!-- Toolbar -->
          <div class="toolbar">
            <div class="toolbar-left">
              <div class="toolbar-search-box">
                <i class="fa-solid fa-search"></i>
                <input
                  type="text"
                  placeholder="Search tests and suites..."
                  [value]="SearchTerm"
                  (input)="OnSearchInput($event)"
                />
                @if (SearchTerm) {
                  <button class="clear-search" (click)="ClearSearch()">
                    <i class="fa-solid fa-times"></i>
                  </button>
                }
              </div>
              <div class="status-chips">
                @for (status of StatusOptions; track status) {
                  <button
                    class="chip"
                    [class.active]="IsStatusActive(status)"
                    [attr.data-status]="status.toLowerCase()"
                    (click)="ToggleStatus(status)"
                  >
                    {{ status }}
                  </button>
                }
              </div>
            </div>
            <div class="toolbar-right">
              <span class="result-count">{{ FilteredResultCount }} results</span>
              <div class="view-toggle">
                <button
                  class="view-btn"
                  [class.active]="ViewMode === 'card'"
                  (click)="SetViewMode('card')"
                  title="Card View"
                >
                  <i class="fa-solid fa-grip"></i>
                </button>
                <button
                  class="view-btn"
                  [class.active]="ViewMode === 'list'"
                  (click)="SetViewMode('list')"
                  title="List View"
                >
                  <i class="fa-solid fa-list"></i>
                </button>
              </div>
              <button class="btn btn-secondary" (click)="OnNewSuite()">
                <i class="fa-solid fa-folder-plus"></i>
                New Suite
              </button>
              <button class="btn btn-primary" (click)="OnNewTest()">
                <i class="fa-solid fa-plus"></i>
                New Test
              </button>
            </div>
          </div>

          <!-- Toggle Bar -->
          <div class="toggle-bar">
            <div class="toggle-group">
              <button
                class="toggle-btn"
                [class.active]="DisplayMode === 'all'"
                (click)="SetDisplayMode('all')"
              >All</button>
              <button
                class="toggle-btn"
                [class.active]="DisplayMode === 'suites'"
                (click)="SetDisplayMode('suites')"
              >Suites Only</button>
              <button
                class="toggle-btn"
                [class.active]="DisplayMode === 'tests'"
                (click)="SetDisplayMode('tests')"
              >Tests Only</button>
            </div>
            <div class="sort-indicator">
              <button class="sort-btn" (click)="ToggleSortDirection()">
                <i class="fa-solid fa-arrow-down-short-wide"></i>
                {{ SortFieldLabel }}
                <i class="fa-solid" [class.fa-arrow-up]="SortDirection === 'asc'" [class.fa-arrow-down]="SortDirection === 'desc'"></i>
              </button>
            </div>
          </div>

          <!-- Content Area -->
          <div class="content-area">
            <!-- Suites Section -->
            @if (DisplayMode === 'all' || DisplayMode === 'suites') {
              @if (FilteredSuites.length > 0) {
                <div class="content-section">
                  <h3 class="section-title">
                    <i class="fa-solid fa-folder"></i>
                    Test Suites
                    <span class="section-count">{{ FilteredSuites.length }}</span>
                  </h3>
                  <div class="card-grid">
                    @for (suite of FilteredSuites; track suite.ID) {
                      <div class="suite-card">
                        <div class="card-header">
                          <div class="card-title-row">
                            <i class="fa-solid fa-folder-open card-icon suite-icon"></i>
                            <span class="card-name" [innerHTML]="suite.Name | highlightSearch:SearchTerm"></span>
                            <span class="status-badge" [attr.data-status]="suite.Status.toLowerCase()">{{ suite.Status }}</span>
                          </div>
                          <div class="card-subtitle">
                            {{ suite.TestCount }} tests
                            @if (suite.LastRunDate) {
                              <span class="dot-sep"></span>
                              Last run {{ FormatRelativeTime(suite.LastRunDate) }}
                            }
                          </div>
                          @if (suite.Description) {
                            <p class="card-description" [innerHTML]="suite.Description | highlightSearch:SearchTerm"></p>
                          }
                        </div>

                        <div class="card-stats">
                          <div class="stat">
                            <span class="stat-label">Pass Rate</span>
                            <span class="stat-value" [class]="GetScoreClass(suite.PassRate / 100)">{{ FormatPercent(suite.PassRate) }}</span>
                          </div>
                          <div class="stat">
                            <span class="stat-label">Tests</span>
                            <span class="stat-value">{{ suite.TestCount }}</span>
                          </div>
                          <div class="stat">
                            <span class="stat-label">Avg Score</span>
                            <span class="stat-value" [class]="GetScoreClass(suite.AvgScore)">{{ (suite.AvgScore * 100).toFixed(0) }}%</span>
                          </div>
                          <div class="stat">
                            <span class="stat-label">Avg Duration</span>
                            <span class="stat-value">{{ FormatDuration(suite.AvgDuration) }}</span>
                          </div>
                        </div>

                        @if (suite.Tests.length > 0) {
                          <div class="card-tests-preview">
                            @for (t of suite.Tests; track t.TestID; let i = $index) {
                              @if (i < 4) {
                                <div class="preview-test-row">
                                  <span class="preview-dot" [attr.data-status]="t.LastStatus.toLowerCase()"></span>
                                  <span class="preview-test-name">{{ t.TestName }}</span>
                                  <span class="preview-score" [class]="GetScoreClass(t.LastScore)">{{ (t.LastScore * 100).toFixed(0) }}%</span>
                                  <span class="preview-bar">
                                    <span class="preview-bar-fill" [style.width.%]="t.LastScore * 100" [class]="GetScoreClass(t.LastScore) + '-bg'"></span>
                                  </span>
                                  <span class="preview-status" [attr.data-status]="t.LastStatus.toLowerCase()">{{ t.LastStatus }}</span>
                                </div>
                              }
                            }
                            @if (suite.TotalTestsInSuite > 4) {
                              <div class="preview-more">+{{ suite.TotalTestsInSuite - 4 }} more tests</div>
                            }
                          </div>
                        }

                        <div class="card-actions">
                          <button class="btn btn-sm btn-primary" (click)="RunSuite(suite.ID)">
                            <i class="fa-solid fa-play"></i> Run Suite
                          </button>
                          <button class="btn btn-sm btn-secondary" (click)="ViewSuiteResults(suite.ID)">
                            <i class="fa-solid fa-chart-bar"></i> Results
                          </button>
                          <button class="btn btn-sm btn-secondary" (click)="EditItem('MJ: Test Suites', suite.ID)">
                            <i class="fa-solid fa-pen"></i> Edit
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            }

            <!-- Tests Section -->
            @if (DisplayMode === 'all' || DisplayMode === 'tests') {
              @if (FilteredTests.length > 0) {
                <div class="content-section">
                  <h3 class="section-title">
                    <i class="fa-solid fa-vial"></i>
                    Tests
                    <span class="section-count">{{ FilteredTests.length }}</span>
                  </h3>
                  <div class="card-grid">
                    @for (test of FilteredTests; track test.ID) {
                      <div class="test-card">
                        <div class="card-header">
                          <div class="card-title-row">
                            <i class="fa-solid fa-vial card-icon test-icon"></i>
                            <span class="card-name" [innerHTML]="test.Name | highlightSearch:SearchTerm"></span>
                            <span class="status-badge" [attr.data-status]="test.Status.toLowerCase()">{{ test.Status }}</span>
                          </div>
                          <div class="card-subtitle">
                            {{ test.TypeName }}
                            @if (test.SuiteName) {
                              <span class="dot-sep"></span>
                              {{ test.SuiteName }}
                            }
                          </div>
                          @if (test.Description) {
                            <p class="card-description" [innerHTML]="test.Description | highlightSearch:SearchTerm"></p>
                          }
                          <div class="card-meta-row">
                            @if (test.TypeName) {
                              <span class="meta-item"><i class="fa-solid fa-robot"></i> {{ test.TypeName }}</span>
                            }
                            @if (test.EstDuration > 0) {
                              <span class="meta-item"><i class="fa-solid fa-clock"></i> ~{{ FormatDurationSeconds(test.EstDuration) }}</span>
                            }
                            @if (test.EstCost > 0) {
                              <span class="meta-item"><i class="fa-solid fa-dollar-sign"></i> {{ FormatCost(test.EstCost) }}</span>
                            }
                            <span class="meta-item"><i class="fa-solid fa-calendar"></i> {{ FormatRelativeTime(test.UpdatedAt) }}</span>
                          </div>
                          @if (test.Tags.length > 0) {
                            <div class="card-tags">
                              @for (tag of test.Tags; track tag; let i = $index) {
                                @if (i < 4) {
                                  <span class="tag">{{ tag }}</span>
                                }
                              }
                              @if (test.Tags.length > 4) {
                                <span class="tag tag-more">+{{ test.Tags.length - 4 }}</span>
                              }
                            </div>
                          }
                        </div>

                        <div class="card-stats">
                          <div class="stat">
                            <span class="stat-label">Last Status</span>
                            <span class="stat-value status-text" [attr.data-status]="test.LastRunStatus.toLowerCase()">{{ test.LastRunStatus || 'N/A' }}</span>
                          </div>
                          <div class="stat">
                            <span class="stat-label">Score</span>
                            <span class="stat-value" [class]="GetScoreClass(test.LastScore)">{{ test.LastScore > 0 ? (test.LastScore * 100).toFixed(0) + '%' : 'N/A' }}</span>
                          </div>
                          <div class="stat">
                            <span class="stat-label">Total Runs</span>
                            <span class="stat-value">{{ test.TotalRuns }}</span>
                          </div>
                          <div class="stat">
                            <span class="stat-label">Pass Rate</span>
                            <span class="stat-value" [class]="GetScoreClass(test.PassRate / 100)">{{ test.TotalRuns > 0 ? FormatPercent(test.PassRate) : 'N/A' }}</span>
                          </div>
                        </div>

                        <div class="card-actions">
                          <button class="btn btn-sm btn-primary" (click)="RunTest(test.ID)">
                            <i class="fa-solid fa-play"></i> Run
                          </button>
                          <button class="btn btn-sm btn-secondary" (click)="ViewTestHistory(test.ID)">
                            <i class="fa-solid fa-history"></i> History
                          </button>
                          <button class="btn btn-sm btn-secondary" (click)="EditItem('MJ: Tests', test.ID)">
                            <i class="fa-solid fa-pen"></i> Edit
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            }

            <!-- Empty State -->
            @if (FilteredSuites.length === 0 && FilteredTests.length === 0) {
              <div class="empty-state">
                <i class="fa-solid fa-inbox"></i>
                <p>No tests or suites found</p>
                <span class="empty-hint">Try adjusting your search or filters.</span>
              </div>
            }
          </div>
        </main>
      </div>
    }

    <!-- Template for recursive suite tree rendering -->
    <ng-template #suiteTreeTpl let-node="node" let-depth="depth">
      <div
        class="sidebar-item suite-tree-item"
        [style.paddingLeft.px]="16 + depth * 14"
        [class.active]="SelectedSidebar.Type === 'suite' && SelectedSidebar.ID === node.ID"
        (click)="SelectSidebarItem({ Type: 'suite', ID: node.ID })"
      >
        @if (node.Children.length > 0) {
          <button class="tree-toggle" (click)="ToggleSuiteExpand(node, $event)">
            <i class="fa-solid" [class.fa-chevron-right]="!node.Expanded" [class.fa-chevron-down]="node.Expanded"></i>
          </button>
        }
        <i class="fa-solid fa-folder"></i>
        <span class="tree-name">{{ node.Name }}</span>
        <span class="sidebar-count">{{ node.TestCount }}</span>
      </div>
      @if (node.Expanded && node.Children.length > 0) {
        @for (child of node.Children; track child.ID) {
          <ng-container
            *ngTemplateOutlet="suiteTreeTpl; context: { node: child, depth: depth + 1 }"
          ></ng-container>
        }
      }
    </ng-template>

    <!-- Slideout Backdrop -->
    @if (SlideoutOpen) {
      <div class="slideout-backdrop" (click)="CloseSlideout()"></div>
    }

    <!-- Slideout Panel -->
    <div class="slideout-panel" [class.open]="SlideoutOpen" [style.width.px]="SlideoutWidth">
      <div class="slideout-resize-handle" (mousedown)="OnResizeStart($event)"></div>

      @if (SlideoutOpen) {
        <div class="slideout-container">
          <!-- Slideout Header -->
          <div class="slideout-header">
            <div class="slideout-title-row">
              <i class="fa-solid fa-plus-circle slideout-title-icon"></i>
              <span class="slideout-title-text">
                Create {{ SlideoutCreateType === 'test' ? 'Test' : 'Test Suite' }}
              </span>
            </div>
            <button class="slideout-close-btn" (click)="CloseSlideout()">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Type Toggle -->
          <div class="slideout-type-toggle">
            <button
              class="type-toggle-btn"
              [class.active]="SlideoutCreateType === 'test'"
              (click)="SetSlideoutCreateType('test')"
            >
              <i class="fa-solid fa-vial"></i> Test
            </button>
            <button
              class="type-toggle-btn"
              [class.active]="SlideoutCreateType === 'suite'"
              (click)="SetSlideoutCreateType('suite')"
            >
              <i class="fa-solid fa-folder"></i> Suite
            </button>
          </div>

          <!-- Error Banner -->
          @if (FormErrorMessage) {
            <div class="slideout-error">
              <i class="fa-solid fa-circle-exclamation"></i>
              <span>{{ FormErrorMessage }}</span>
            </div>
          }

          <!-- Slideout Body -->
          <div class="slideout-body">
            <div class="form-section">
              <div class="form-section-title">General</div>

              <div class="form-group">
                <label class="form-label">Name <span class="form-required">*</span></label>
                <input
                  class="form-input"
                  type="text"
                  [(ngModel)]="FormName"
                  [placeholder]="SlideoutCreateType === 'test' ? 'e.g., Agent Response Quality Test' : 'e.g., Core Agent Test Suite'"
                />
              </div>

              <div class="form-group">
                <label class="form-label">Description</label>
                <textarea
                  class="form-textarea"
                  [(ngModel)]="FormDescription"
                  rows="3"
                  [placeholder]="SlideoutCreateType === 'test' ? 'What does this test evaluate?' : 'What does this suite contain?'"
                ></textarea>
              </div>

              <div class="form-row">
                @if (SlideoutCreateType === 'test') {
                  <div class="form-group">
                    <label class="form-label">Test Type <span class="form-required">*</span></label>
                    <select class="form-input" [(ngModel)]="FormTypeID">
                      <option value="" disabled>Select type...</option>
                      @for (tt of AllTestTypes; track tt.ID) {
                        <option [value]="tt.ID">{{ tt.Name }}</option>
                      }
                    </select>
                  </div>
                }
                @if (SlideoutCreateType === 'suite') {
                  <div class="form-group">
                    <label class="form-label">Parent Suite</label>
                    <select class="form-input" [(ngModel)]="FormParentSuiteID">
                      <option value="">None (top-level)</option>
                      @for (s of AllSuites; track s.ID) {
                        <option [value]="s.ID">{{ s.Name }}</option>
                      }
                    </select>
                  </div>
                }
                <div class="form-group">
                  <label class="form-label">Status</label>
                  <select class="form-input" [(ngModel)]="FormStatus">
                    @for (status of FormStatusOptions; track status) {
                      <option [value]="status">{{ status }}</option>
                    }
                  </select>
                </div>
              </div>
            </div>

            @if (SlideoutCreateType === 'test') {
              <div class="form-section">
                <div class="form-section-title">Estimates</div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Duration (seconds)</label>
                    <input
                      class="form-input"
                      type="number"
                      [(ngModel)]="FormEstDuration"
                      min="0"
                      placeholder="0"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Cost (USD)</label>
                    <input
                      class="form-input"
                      type="number"
                      [(ngModel)]="FormEstCost"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            }

            <div class="form-section">
              <div class="form-section-title">Tags</div>
              <div class="form-group">
                <input
                  class="form-input"
                  type="text"
                  [(ngModel)]="FormTags"
                  placeholder="Comma-separated tags, e.g., agent, quality, v2"
                />
                <span class="form-hint">Separate multiple tags with commas</span>
              </div>
            </div>
          </div>

          <!-- Slideout Footer -->
          <div class="slideout-footer">
            <button class="btn btn-secondary" (click)="CloseSlideout()">Cancel</button>
            <button class="btn btn-primary" (click)="SaveForm()" [disabled]="!IsFormValid || IsSaving">
              @if (IsSaving) {
                <i class="fa-solid fa-spinner fa-spin"></i>
              } @else {
                <i class="fa-solid fa-check"></i>
              }
              Create {{ SlideoutCreateType === 'test' ? 'Test' : 'Suite' }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    /* ==========================================
       Testing Explorer Component
       ========================================== */

    :host {
      display: block;
      height: 100%;
      width: 100%;
    }

    /* Loading */
    .explorer-loading {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      min-height: 400px;
      background: #f5f6fa;
    }

    /* Layout */
    .explorer-layout {
      display: flex;
      height: 100%;
      background: #f5f6fa;
      overflow: hidden;
    }

    /* ==========================================
       Sidebar
       ========================================== */
    .sidebar {
      width: 280px;
      min-width: 280px;
      background: #fff;
      border-right: 1px solid #e8ecef;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: width 0.2s ease, min-width 0.2s ease;
    }

    .sidebar.collapsed {
      width: 48px;
      min-width: 48px;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid #e8ecef;
    }

    .sidebar-header h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #2d3436;
    }

    .sidebar.collapsed .sidebar-header h3 {
      display: none;
    }

    .sidebar-toggle {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid #e8ecef;
      border-radius: 6px;
      color: #636e72;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.15s ease;
    }

    .sidebar-toggle:hover {
      background: #f5f6fa;
      color: #2d3436;
    }

    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .sidebar-section {
      margin-bottom: 8px;
    }

    .sidebar-section-title {
      padding: 8px 16px 4px;
      font-size: 10px;
      font-weight: 700;
      color: #b2bec3;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .sidebar-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      font-size: 13px;
      color: #636e72;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      overflow: hidden;
    }

    .sidebar-item:hover {
      background: #f5f6fa;
      color: #2d3436;
    }

    .sidebar-item.active {
      background: #e0f2f1;
      color: #00897b;
      font-weight: 600;
    }

    .sidebar-item i {
      font-size: 12px;
      width: 16px;
      text-align: center;
      flex-shrink: 0;
    }

    .sidebar-item span:not(.sidebar-count) {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sidebar-count {
      font-size: 11px;
      color: #b2bec3;
      font-weight: 500;
      flex-shrink: 0;
    }

    .sidebar-item.active .sidebar-count {
      color: #00897b;
    }

    .sidebar-empty {
      padding: 8px 16px;
      font-size: 12px;
      color: #b2bec3;
      font-style: italic;
    }

    /* Tree nodes */
    .suite-tree-item {
      gap: 6px;
    }

    .tree-toggle {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: #b2bec3;
      cursor: pointer;
      font-size: 9px;
      flex-shrink: 0;
      border-radius: 4px;
      padding: 0;
    }

    .tree-toggle:hover {
      background: #e8ecef;
      color: #636e72;
    }

    .tree-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ==========================================
       Main Content
       ========================================== */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 16px 24px;
      background: #fff;
      border-bottom: 1px solid #e8ecef;
      flex-shrink: 0;
    }

    .toolbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .toolbar-search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: #f5f6fa;
      border: 1px solid #e8ecef;
      border-radius: 6px;
      min-width: 240px;
      max-width: 360px;
      flex: 1;
      transition: border-color 0.2s ease;
    }

    .toolbar-search-box:focus-within {
      border-color: #00897b;
      background: #fff;
    }

    .toolbar-search-box i {
      color: #b2bec3;
      font-size: 13px;
    }

    .toolbar-search-box input {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      font-size: 13px;
      color: #2d3436;
    }

    .toolbar-search-box input::placeholder {
      color: #b2bec3;
    }

    .clear-search {
      border: none;
      background: transparent;
      color: #b2bec3;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
    }

    .clear-search:hover {
      color: #636e72;
      background: #e8ecef;
    }

    .status-chips {
      display: flex;
      gap: 6px;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      padding: 6px 14px;
      background: #f5f6fa;
      border: 1px solid transparent;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 600;
      color: #636e72;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .chip:hover {
      background: #e8ecef;
    }

    .chip.active {
      color: #fff;
    }

    .chip.active[data-status="active"] {
      background: #2e7d32;
      border-color: #2e7d32;
    }

    .chip.active[data-status="pending"] {
      background: #e65100;
      border-color: #e65100;
    }

    .chip.active[data-status="disabled"] {
      background: #636e72;
      border-color: #636e72;
    }

    .toolbar-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .result-count {
      font-size: 12px;
      color: #b2bec3;
      font-weight: 500;
      white-space: nowrap;
    }

    .view-toggle {
      display: flex;
      border: 1px solid #e8ecef;
      border-radius: 6px;
      overflow: hidden;
    }

    .view-btn {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      border: none;
      color: #b2bec3;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
    }

    .view-btn:not(:last-child) {
      border-right: 1px solid #e8ecef;
    }

    .view-btn:hover {
      background: #f5f6fa;
      color: #636e72;
    }

    .view-btn.active {
      background: #00897b;
      color: #fff;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .btn-primary {
      background: #00897b;
      color: #fff;
    }

    .btn-primary:hover {
      background: #00796b;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 137, 123, 0.3);
    }

    .btn-secondary {
      background: #fff;
      color: #636e72;
      border: 1px solid #e8ecef;
    }

    .btn-secondary:hover {
      background: #f5f6fa;
    }

    .btn-sm {
      padding: 6px 12px;
      font-size: 12px;
    }

    /* Toggle Bar */
    .toggle-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 24px;
      background: #fafafa;
      border-bottom: 1px solid #e8ecef;
      flex-shrink: 0;
    }

    .toggle-group {
      display: flex;
      border: 1px solid #e8ecef;
      border-radius: 6px;
      overflow: hidden;
    }

    .toggle-btn {
      padding: 6px 16px;
      background: #fff;
      border: none;
      font-size: 12px;
      font-weight: 600;
      color: #636e72;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .toggle-btn:not(:last-child) {
      border-right: 1px solid #e8ecef;
    }

    .toggle-btn.active {
      background: #00897b;
      color: #fff;
    }

    .toggle-btn:hover:not(.active) {
      background: #f5f6fa;
    }

    .sort-indicator {
      display: flex;
      align-items: center;
    }

    .sort-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: transparent;
      border: 1px solid #e8ecef;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      color: #636e72;
      cursor: pointer;
    }

    .sort-btn:hover {
      background: #f5f6fa;
    }

    .sort-btn i {
      font-size: 11px;
    }

    /* Content Area */
    .content-area {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    .content-section {
      margin-bottom: 32px;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 700;
      color: #2d3436;
    }

    .section-title i {
      color: #00897b;
      font-size: 14px;
    }

    .section-count {
      font-size: 12px;
      font-weight: 600;
      color: #b2bec3;
      background: #f5f6fa;
      padding: 2px 8px;
      border-radius: 10px;
    }

    /* Card Grid */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 16px;
    }

    /* Suite Card */
    .suite-card,
    .test-card {
      background: #fff;
      border: 1px solid #e8ecef;
      border-radius: 10px;
      overflow: hidden;
      transition: all 0.2s ease;
    }

    .suite-card:hover,
    .test-card:hover {
      border-color: #b2dfdb;
      box-shadow: 0 4px 16px rgba(0, 137, 123, 0.1);
    }

    .card-header {
      padding: 16px 16px 12px;
    }

    .card-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .card-icon {
      font-size: 14px;
      flex-shrink: 0;
    }

    .suite-icon {
      color: #00897b;
    }

    .test-icon {
      color: #6366f1;
    }

    .card-name {
      flex: 1;
      font-size: 14px;
      font-weight: 700;
      color: #2d3436;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }

    .status-badge[data-status="active"] {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .status-badge[data-status="pending"] {
      background: #fff3e0;
      color: #e65100;
    }

    .status-badge[data-status="disabled"] {
      background: #f5f6fa;
      color: #636e72;
    }

    .card-subtitle {
      font-size: 12px;
      color: #636e72;
      margin-bottom: 6px;
    }

    .dot-sep {
      display: inline-block;
      width: 3px;
      height: 3px;
      background: #b2bec3;
      border-radius: 50%;
      vertical-align: middle;
      margin: 0 6px;
    }

    .card-description {
      margin: 0;
      font-size: 12px;
      color: #636e72;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 8px;
    }

    .meta-item {
      font-size: 11px;
      color: #636e72;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .meta-item i {
      font-size: 10px;
      color: #b2bec3;
    }

    .card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }

    .tag {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      background: #f5f6fa;
      color: #636e72;
      border-radius: 4px;
    }

    .tag-more {
      background: #e8ecef;
      color: #b2bec3;
    }

    /* Card Stats */
    .card-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: #e8ecef;
      border-top: 1px solid #e8ecef;
    }

    .stat {
      background: #fafafa;
      padding: 10px 12px;
      text-align: center;
    }

    .stat-label {
      display: block;
      font-size: 10px;
      font-weight: 600;
      color: #b2bec3;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }

    .stat-value {
      font-size: 14px;
      font-weight: 700;
      color: #2d3436;
    }

    .stat-value.good { color: #2e7d32; }
    .stat-value.warn { color: #e65100; }
    .stat-value.bad { color: #c62828; }

    .status-text[data-status="passed"] { color: #2e7d32; }
    .status-text[data-status="failed"] { color: #c62828; }
    .status-text[data-status="error"] { color: #e65100; }
    .status-text[data-status="running"] { color: #1565c0; }
    .status-text[data-status="pending"] { color: #e65100; }
    .status-text[data-status="skipped"] { color: #636e72; }

    /* Suite Tests Preview */
    .card-tests-preview {
      padding: 10px 16px;
      border-top: 1px solid #e8ecef;
    }

    .preview-test-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 12px;
    }

    .preview-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .preview-dot[data-status="passed"] { background: #2e7d32; }
    .preview-dot[data-status="failed"] { background: #c62828; }
    .preview-dot[data-status="error"] { background: #e65100; }
    .preview-dot[data-status="running"] { background: #1565c0; }
    .preview-dot[data-status=""] { background: #b2bec3; }

    .preview-test-name {
      flex: 1;
      color: #2d3436;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .preview-score {
      font-weight: 600;
      font-size: 11px;
      min-width: 32px;
      text-align: right;
    }

    .preview-score.good { color: #2e7d32; }
    .preview-score.warn { color: #e65100; }
    .preview-score.bad { color: #c62828; }

    .preview-bar {
      width: 48px;
      height: 4px;
      background: #e8ecef;
      border-radius: 2px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .preview-bar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .good-bg { background: #2e7d32; }
    .warn-bg { background: #e65100; }
    .bad-bg { background: #c62828; }

    .preview-status {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      min-width: 44px;
      text-align: right;
    }

    .preview-status[data-status="passed"] { color: #2e7d32; }
    .preview-status[data-status="failed"] { color: #c62828; }
    .preview-status[data-status="error"] { color: #e65100; }
    .preview-status[data-status=""] { color: #b2bec3; }

    .preview-more {
      padding: 4px 0 0;
      font-size: 11px;
      color: #b2bec3;
      font-style: italic;
    }

    /* Card Actions */
    .card-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #e8ecef;
      background: #fafafa;
    }

    /* Empty State */
    .empty-state {
      padding: 80px 40px;
      text-align: center;
    }

    .empty-state i {
      font-size: 48px;
      color: #b2bec3;
      margin-bottom: 16px;
    }

    .empty-state p {
      font-size: 16px;
      color: #636e72;
      margin: 0 0 8px 0;
    }

    .empty-hint {
      font-size: 13px;
      color: #b2bec3;
    }

    /* ==========================================
       Slideout Panel
       ========================================== */
    .slideout-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 999;
      animation: fadeInBackdrop 0.2s ease;
    }

    @keyframes fadeInBackdrop {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .slideout-panel {
      position: fixed;
      top: 0;
      right: -100%;
      height: 100vh;
      background: #fff;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .slideout-panel.open {
      right: 0;
    }

    .slideout-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 5px;
      height: 100%;
      cursor: col-resize;
      background: transparent;
      z-index: 10;
      transition: background 0.2s;
    }

    .slideout-resize-handle:hover {
      background: rgba(0, 137, 123, 0.3);
    }

    .slideout-resize-handle:active {
      background: rgba(0, 137, 123, 0.5);
    }

    .slideout-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .slideout-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      border-bottom: 1px solid #e8ecef;
      flex-shrink: 0;
    }

    .slideout-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .slideout-title-icon {
      font-size: 18px;
      color: #00897b;
    }

    .slideout-title-text {
      font-size: 18px;
      font-weight: 700;
      color: #2d3436;
    }

    .slideout-close-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid #e8ecef;
      border-radius: 6px;
      color: #636e72;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.15s ease;
    }

    .slideout-close-btn:hover {
      background: #f5f6fa;
      color: #2d3436;
      border-color: #ccc;
    }

    /* Type Toggle */
    .slideout-type-toggle {
      display: flex;
      gap: 0;
      padding: 16px 24px;
      border-bottom: 1px solid #e8ecef;
      flex-shrink: 0;
    }

    .type-toggle-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 16px;
      background: #f5f6fa;
      border: 1px solid #e8ecef;
      font-size: 13px;
      font-weight: 600;
      color: #636e72;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .type-toggle-btn:first-child {
      border-radius: 8px 0 0 8px;
      border-right: none;
    }

    .type-toggle-btn:last-child {
      border-radius: 0 8px 8px 0;
    }

    .type-toggle-btn.active {
      background: #00897b;
      border-color: #00897b;
      color: #fff;
    }

    .type-toggle-btn:hover:not(.active) {
      background: #e8ecef;
    }

    /* Error Banner */
    .slideout-error {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 16px 24px 0;
      padding: 12px 16px;
      background: #fff5f5;
      border: 1px solid #fed7d7;
      border-radius: 8px;
      color: #c53030;
      font-size: 13px;
      flex-shrink: 0;
    }

    .slideout-error i {
      font-size: 14px;
      flex-shrink: 0;
    }

    /* Slideout Body */
    .slideout-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px 24px;
    }

    .form-section {
      margin-bottom: 24px;
    }

    .form-section-title {
      font-size: 12px;
      font-weight: 700;
      color: #b2bec3;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 14px;
      padding-bottom: 8px;
      border-bottom: 1px solid #f0f0f0;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #2d3436;
      margin-bottom: 6px;
    }

    .form-required {
      color: #e53e3e;
    }

    .form-input,
    .form-textarea {
      width: 100%;
      padding: 10px 14px;
      background: #fff;
      border: 1px solid #e8ecef;
      border-radius: 8px;
      font-size: 13px;
      color: #2d3436;
      transition: border-color 0.2s ease;
      outline: none;
      box-sizing: border-box;
      font-family: inherit;
    }

    .form-input:focus,
    .form-textarea:focus {
      border-color: #00897b;
      box-shadow: 0 0 0 3px rgba(0, 137, 123, 0.1);
    }

    .form-input::placeholder,
    .form-textarea::placeholder {
      color: #b2bec3;
    }

    .form-textarea {
      resize: vertical;
      min-height: 80px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .form-hint {
      display: block;
      font-size: 11px;
      color: #b2bec3;
      margin-top: 4px;
    }

    /* Slideout Footer */
    .slideout-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 24px;
      border-top: 1px solid #e8ecef;
      background: #fafafa;
      flex-shrink: 0;
    }

    .slideout-footer .btn {
      min-width: 100px;
      justify-content: center;
    }

    .slideout-footer .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    /* Search Highlight */
    ::ng-deep mark.search-highlight {
      background: #fff9c4;
      color: inherit;
      padding: 1px 2px;
      border-radius: 2px;
      font-weight: 700;
    }

    /* ==========================================
       Responsive
       ========================================== */
    @media (max-width: 1200px) {
      .card-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 900px) {
      .sidebar {
        display: none;
      }

      .toolbar {
        flex-direction: column;
        align-items: stretch;
      }

      .toolbar-left, .toolbar-right {
        flex-wrap: wrap;
        justify-content: center;
      }
    }

    @media (max-width: 600px) {
      .content-area {
        padding: 16px;
      }

      .card-stats {
        grid-template-columns: repeat(2, 1fr);
      }

      .slideout-panel {
        width: 100% !important;
      }

      .slideout-resize-handle {
        display: none;
      }

      .form-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class TestingExplorerComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  // Raw cached data
  private allTests: TestEntity[] = [];
  AllSuites: TestSuiteEntity[] = [];
  private allSuiteTests: TestSuiteTestEntity[] = [];
  AllTestTypes: TestTypeEntity[] = [];
  private testRunStats: TestRunStatRow[] = [];

  // Computed card data
  private suiteCards: SuiteCardData[] = [];
  private testCards: TestCardData[] = [];

  // State subjects
  private _searchTerm$ = new BehaviorSubject<string>('');
  private _statusFilters$ = new BehaviorSubject<Set<string>>(new Set());
  private _viewMode$ = new BehaviorSubject<ViewMode>('card');
  private _displayMode$ = new BehaviorSubject<DisplayMode>('all');
  private _selectedSidebar$ = new BehaviorSubject<SidebarSelection>({ Type: 'all', ID: null });
  private _sortField$ = new BehaviorSubject<SortField>('name');
  private _sortDirection$ = new BehaviorSubject<SortDirection>('asc');

  // Template-bound state
  IsLoading = true;
  IsSidebarCollapsed = false;
  SearchTerm = '';
  StatusFilters = new Set<string>();
  ViewMode: ViewMode = 'card';
  DisplayMode: DisplayMode = 'all';
  SelectedSidebar: SidebarSelection = { Type: 'all', ID: null };
  SortField: SortField = 'name';
  SortDirection: SortDirection = 'asc';

  // Filtered results
  FilteredSuites: SuiteCardData[] = [];
  FilteredTests: TestCardData[] = [];
  FilteredSuiteTree: SuiteTreeNode[] = [];
  FilteredTestTypes: TestTypeEntity[] = [];

  // Counts
  TotalItemCount = 0;
  StandaloneTestCount = 0;
  FilteredResultCount = 0;

  readonly StatusOptions: string[] = ['Active', 'Pending', 'Disabled'];
  readonly FormStatusOptions: string[] = ['Active', 'Pending', 'Disabled'];

  // Settings keys
  private static readonly PANEL_WIDTH_KEY = 'Testing.ExplorerPanelWidth';
  private static readonly SEARCH_STATE_KEY = 'Testing.ExplorerSearchState';
  private settingsPersistSubject = new Subject<void>();
  private settingsLoaded = false;

  // Slideout state
  SlideoutOpen = false;
  SlideoutCreateType: 'test' | 'suite' = 'test';
  SlideoutWidth = 560;
  IsSaving = false;
  FormErrorMessage = '';

  // Resize state
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  // Form fields
  FormName = '';
  FormDescription = '';
  FormTypeID = '';
  FormStatus: 'Active' | 'Pending' | 'Disabled' = 'Active';
  FormParentSuiteID = '';
  FormEstDuration = 0;
  FormEstCost = 0;
  FormTags = '';

  get IsFormValid(): boolean {
    if (!this.FormName.trim()) return false;
    if (this.SlideoutCreateType === 'test' && !this.FormTypeID) return false;
    return true;
  }

  get SortFieldLabel(): string {
    switch (this.SortField) {
      case 'name': return 'Name';
      case 'updated': return 'Updated';
      case 'status': return 'Status';
      default: return 'Name';
    }
  }

  constructor(
    private cdr: ChangeDetectorRef,
    private viewContainerRef: ViewContainerRef,
    private testingDialogService: TestingDialogService,
    public instrumentationService: TestingInstrumentationService
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async ngOnInit(): Promise<void> {
    this.loadUserSettings();
    this.setupSettingsPersistence();
    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      await TestEngineBase.Instance.Config(false);
      await this.LoadData();
    } catch (err) {
      console.error('TestingExplorerComponent: Failed to load data', err);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }

    this.subscribeToStateChanges();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
    UserInfoEngine.Instance.FlushPendingSettings();
  }

  // ---------------------------------------------------------------------------
  // Public Methods
  // ---------------------------------------------------------------------------

  async LoadData(): Promise<void> {
    this.loadCachedMetadata();
    await this.loadTestRunStats();
    this.buildSuiteCards();
    this.buildTestCards();
    this.buildSuiteTree();
    this.computeCounts();
    this.applyFilters();
  }

  SelectSidebarItem(selection: SidebarSelection): void {
    this._selectedSidebar$.next(selection);
  }

  ToggleStatus(status: string): void {
    const current = new Set(this._statusFilters$.value);
    if (current.has(status)) {
      current.delete(status);
    } else {
      current.add(status);
    }
    this._statusFilters$.next(current);
  }

  IsStatusActive(status: string): boolean {
    return this.StatusFilters.has(status);
  }

  SetDisplayMode(mode: DisplayMode): void {
    this._displayMode$.next(mode);
  }

  SetViewMode(mode: ViewMode): void {
    this._viewMode$.next(mode);
  }

  OnSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this._searchTerm$.next(input.value);
  }

  ClearSearch(): void {
    this._searchTerm$.next('');
  }

  ToggleSidebar(): void {
    this.IsSidebarCollapsed = !this.IsSidebarCollapsed;
    this.cdr.markForCheck();
  }

  ToggleSuiteExpand(node: SuiteTreeNode, event: MouseEvent): void {
    event.stopPropagation();
    node.Expanded = !node.Expanded;
    this.cdr.markForCheck();
  }

  ToggleSortDirection(): void {
    const newDir = this.SortDirection === 'asc' ? 'desc' : 'asc';
    this._sortDirection$.next(newDir);
  }

  RunTest(testId: string): void {
    this.testingDialogService.OpenTestDialog(testId, this.viewContainerRef);
  }

  RunSuite(suiteId: string): void {
    this.testingDialogService.OpenSuiteDialog(suiteId, this.viewContainerRef);
  }

  EditItem(entityName: string, id: string): void {
    SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(id));
  }

  ViewTestHistory(testId: string): void {
    SharedService.Instance.OpenEntityRecord('MJ: Tests', CompositeKey.FromID(testId));
  }

  ViewSuiteResults(suiteId: string): void {
    SharedService.Instance.OpenEntityRecord('MJ: Test Suites', CompositeKey.FromID(suiteId));
  }

  OnNewTest(): void {
    this.OpenSlideout('test');
  }

  OnNewSuite(): void {
    this.OpenSlideout('suite');
  }

  OpenSlideout(type: 'test' | 'suite'): void {
    this.SlideoutCreateType = type;
    this.resetForm();
    this.SlideoutOpen = true;
    this.cdr.markForCheck();
  }

  CloseSlideout(): void {
    this.SlideoutOpen = false;
    this.FormErrorMessage = '';
    this.cdr.markForCheck();
  }

  SetSlideoutCreateType(type: 'test' | 'suite'): void {
    this.SlideoutCreateType = type;
    this.resetForm();
    this.cdr.markForCheck();
  }

  async SaveForm(): Promise<void> {
    if (!this.IsFormValid || this.IsSaving) return;

    this.IsSaving = true;
    this.FormErrorMessage = '';
    this.cdr.markForCheck();

    try {
      if (this.SlideoutCreateType === 'test') {
        await this.saveNewTest();
      } else {
        await this.saveNewSuite();
      }
      this.CloseSlideout();
      await TestEngineBase.Instance.Config(true);
      await this.LoadData();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred while saving.';
      this.FormErrorMessage = message;
      console.error('TestingExplorerComponent: Save failed', err);
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  // ── Resize ──────────────────────────────────────────
  OnResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.SlideoutWidth;
    document.addEventListener('mousemove', this.onResizeMove);
    document.addEventListener('mouseup', this.onResizeEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private onResizeMove = (event: MouseEvent): void => {
    const delta = this.resizeStartX - event.clientX;
    this.SlideoutWidth = Math.max(400, Math.min(900, this.resizeStartWidth + delta));
    this.cdr.detectChanges();
  };

  private onResizeEnd = (): void => {
    document.removeEventListener('mousemove', this.onResizeMove);
    document.removeEventListener('mouseup', this.onResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    UserInfoEngine.Instance.SetSettingDebounced(
      TestingExplorerComponent.PANEL_WIDTH_KEY,
      String(this.SlideoutWidth)
    );
  };

  GetTestCountForType(typeId: string): number {
    return this.allTests.filter(t => t.TypeID === typeId).length;
  }

  // ---------------------------------------------------------------------------
  // Formatting Helpers
  // ---------------------------------------------------------------------------

  FormatDuration(ms: number): string {
    if (ms <= 0) return '0s';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  FormatDurationSeconds(seconds: number): string {
    if (seconds <= 0) return '0s';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  FormatRelativeTime(date: Date | null): string {
    if (!date) return 'Never';
    const d = date instanceof Date ? date : new Date(date);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  FormatPercent(value: number): string {
    return `${Math.round(value)}%`;
  }

  FormatCost(cost: number): string {
    if (cost < 0.01) return '$0.00';
    return `$${cost.toFixed(2)}`;
  }

  GetScoreClass(score: number): string {
    if (score >= 0.7) return 'good';
    if (score >= 0.4) return 'warn';
    return 'bad';
  }

  GetStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'passed': return 'status-passed';
      case 'failed': return 'status-failed';
      case 'error': return 'status-error';
      case 'running': return 'status-running';
      default: return 'status-default';
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Data Loading
  // ---------------------------------------------------------------------------

  private loadCachedMetadata(): void {
    const engine = TestEngineBase.Instance;
    this.allTests = engine.Tests;
    this.AllSuites = engine.TestSuites;
    this.allSuiteTests = engine.TestSuiteTests;
    this.AllTestTypes = engine.TestTypes;
  }

  private async loadTestRunStats(): Promise<void> {
    const rv = new RunView();
    const result = await rv.RunView<TestRunStatRow>({
      EntityName: 'MJ: Test Runs',
      Fields: ['ID', 'TestID', 'Status', 'Score', 'CostUSD', 'StartedAt', 'CompletedAt'],
      OrderBy: 'StartedAt DESC',
      MaxRows: 5000,
      ResultType: 'simple'
    });

    this.testRunStats = result.Success ? (result.Results || []) : [];
  }

  // ---------------------------------------------------------------------------
  // Private: Build Card Data
  // ---------------------------------------------------------------------------

  private buildSuiteCards(): void {
    this.suiteCards = this.AllSuites.map(suite => this.buildSingleSuiteCard(suite));
  }

  private buildSingleSuiteCard(suite: TestSuiteEntity): SuiteCardData {
    const suiteTestLinks = this.allSuiteTests.filter(st => st.SuiteID === suite.ID);
    const testIds = new Set(suiteTestLinks.map(st => st.TestID));
    const runsForSuite = this.testRunStats.filter(r => testIds.has(r.TestID));

    const passedRuns = runsForSuite.filter(r => r.Status === 'Passed');
    const passRate = runsForSuite.length > 0 ? (passedRuns.length / runsForSuite.length) * 100 : 0;
    const avgScore = runsForSuite.length > 0
      ? runsForSuite.reduce((s, r) => s + (r.Score || 0), 0) / runsForSuite.length
      : 0;
    const avgDuration = this.computeAvgDuration(runsForSuite);
    const lastRunDate = this.findLastRunDate(runsForSuite);
    const previewTests = this.buildSuiteTestPreviews(suiteTestLinks);

    return {
      ID: suite.ID,
      Name: suite.Name,
      Description: suite.Description || '',
      Status: suite.Status,
      TestCount: testIds.size,
      PassRate: passRate,
      AvgScore: avgScore,
      AvgDuration: avgDuration,
      LastRunDate: lastRunDate,
      Tags: this.parseTags(suite.Tags),
      Tests: previewTests,
      TotalTestsInSuite: testIds.size
    };
  }

  private buildSuiteTestPreviews(suiteTestLinks: TestSuiteTestEntity[]): SuiteTestItem[] {
    return suiteTestLinks
      .sort((a, b) => a.Sequence - b.Sequence)
      .slice(0, 5)
      .map(st => {
        const test = this.allTests.find(t => t.ID === st.TestID);
        const lastRun = this.findLastRunForTest(st.TestID);
        return {
          TestID: st.TestID,
          TestName: test?.Name || st.Test || 'Unknown',
          LastStatus: lastRun?.Status || '',
          LastScore: lastRun?.Score || 0
        };
      });
  }

  private buildTestCards(): void {
    this.testCards = this.allTests.map(test => this.buildSingleTestCard(test));
  }

  private buildSingleTestCard(test: TestEntity): TestCardData {
    const runsForTest = this.testRunStats.filter(r => r.TestID === test.ID);
    const lastRun = runsForTest.length > 0 ? runsForTest[0] : null; // already sorted DESC
    const passedRuns = runsForTest.filter(r => r.Status === 'Passed');
    const passRate = runsForTest.length > 0 ? (passedRuns.length / runsForTest.length) * 100 : 0;

    const typeName = this.AllTestTypes.find(t => t.ID === test.TypeID)?.Name || '';
    const suiteName = this.findSuiteNameForTest(test.ID);

    return {
      ID: test.ID,
      Name: test.Name,
      Description: test.Description || '',
      Status: test.Status,
      TypeName: typeName,
      SuiteName: suiteName,
      LastRunStatus: lastRun?.Status || '',
      LastScore: lastRun?.Score || 0,
      TotalRuns: runsForTest.length,
      PassRate: passRate,
      EstDuration: test.EstimatedDurationSeconds || 0,
      EstCost: test.EstimatedCostUSD || 0,
      LastRunDate: lastRun ? this.toDate(lastRun.StartedAt) : null,
      Tags: this.parseTags(test.Tags),
      UpdatedAt: test.__mj_UpdatedAt
    };
  }

  // ---------------------------------------------------------------------------
  // Private: Build Suite Tree
  // ---------------------------------------------------------------------------

  private buildSuiteTree(): void {
    const filteredSuites = this.AllSuites;

    const nodeMap = new Map<string, SuiteTreeNode>();

    for (const suite of filteredSuites) {
      nodeMap.set(suite.ID, {
        ID: suite.ID,
        Name: suite.Name,
        ParentID: suite.ParentID,
        TestCount: this.allSuiteTests.filter(st => st.SuiteID === suite.ID).length,
        Children: [],
        Expanded: false
      });
    }

    const roots: SuiteTreeNode[] = [];
    nodeMap.forEach(node => {
      if (node.ParentID && nodeMap.has(node.ParentID)) {
        nodeMap.get(node.ParentID)!.Children.push(node);
      } else {
        roots.push(node);
      }
    });

    this.FilteredSuiteTree = roots;
    this.filterTestTypes();
  }

  private filterTestTypes(): void {
    this.FilteredTestTypes = this.AllTestTypes;
  }

  // ---------------------------------------------------------------------------
  // Private: Filtering & Sorting
  // ---------------------------------------------------------------------------

  private subscribeToStateChanges(): void {
    combineLatest([
      this._searchTerm$,
      this._statusFilters$,
      this._displayMode$,
      this._selectedSidebar$,
      this._sortField$,
      this._sortDirection$,
      this._viewMode$
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([searchTerm, statusFilters, displayMode, selectedSidebar, sortField, sortDirection, viewMode]) => {
      this.SearchTerm = searchTerm;
      this.StatusFilters = statusFilters;
      this.DisplayMode = displayMode;
      this.SelectedSidebar = selectedSidebar;
      this.SortField = sortField;
      this.SortDirection = sortDirection;
      this.ViewMode = viewMode;
      this.applyFilters();
      this.settingsPersistSubject.next();
      this.cdr.markForCheck();
    });
  }

  private applyFilters(): void {
    this.FilteredSuites = this.filterSuiteCards();
    this.FilteredTests = this.filterTestCards();
    this.FilteredResultCount = this.FilteredSuites.length + this.FilteredTests.length;
  }

  private filterSuiteCards(): SuiteCardData[] {
    let result = [...this.suiteCards];
    result = this.applySidebarFilterToSuites(result);
    result = this.applySearchFilterToSuites(result);
    result = this.applyStatusFilterToSuites(result);
    result = this.sortSuiteCards(result);
    return result;
  }

  private filterTestCards(): TestCardData[] {
    let result = [...this.testCards];
    result = this.applySidebarFilterToTests(result);
    result = this.applySearchFilterToTests(result);
    result = this.applyStatusFilterToTests(result);
    result = this.sortTestCards(result);
    return result;
  }

  private applySidebarFilterToSuites(suites: SuiteCardData[]): SuiteCardData[] {
    const sel = this.SelectedSidebar;
    switch (sel.Type) {
      case 'suite':
        return suites.filter(s => s.ID === sel.ID);
      case 'standalone':
        return []; // standalone = tests only
      case 'testType':
        return []; // test types apply to tests only
      default:
        return suites;
    }
  }

  private applySidebarFilterToTests(tests: TestCardData[]): TestCardData[] {
    const sel = this.SelectedSidebar;
    switch (sel.Type) {
      case 'suite': {
        const testIds = new Set(
          this.allSuiteTests.filter(st => st.SuiteID === sel.ID).map(st => st.TestID)
        );
        return tests.filter(t => testIds.has(t.ID));
      }
      case 'standalone': {
        const testIdsInSuites = new Set(this.allSuiteTests.map(st => st.TestID));
        return tests.filter(t => !testIdsInSuites.has(t.ID));
      }
      case 'testType':
        return tests.filter(t => {
          const testEntity = this.allTests.find(te => te.ID === t.ID);
          return testEntity?.TypeID === sel.ID;
        });
      default:
        return tests;
    }
  }

  private applySearchFilterToSuites(suites: SuiteCardData[]): SuiteCardData[] {
    const term = this.SearchTerm.toLowerCase().trim();
    if (!term) return suites;
    return suites.filter(s =>
      s.Name.toLowerCase().includes(term) ||
      s.Description.toLowerCase().includes(term)
    );
  }

  private applySearchFilterToTests(tests: TestCardData[]): TestCardData[] {
    const term = this.SearchTerm.toLowerCase().trim();
    if (!term) return tests;
    return tests.filter(t =>
      t.Name.toLowerCase().includes(term) ||
      t.Description.toLowerCase().includes(term)
    );
  }

  private applyStatusFilterToSuites(suites: SuiteCardData[]): SuiteCardData[] {
    if (this.StatusFilters.size === 0) return suites;
    return suites.filter(s => this.StatusFilters.has(s.Status));
  }

  private applyStatusFilterToTests(tests: TestCardData[]): TestCardData[] {
    if (this.StatusFilters.size === 0) return tests;
    return tests.filter(t => this.StatusFilters.has(t.Status));
  }

  private sortSuiteCards(suites: SuiteCardData[]): SuiteCardData[] {
    const dir = this.SortDirection === 'asc' ? 1 : -1;
    return suites.sort((a, b) => this.compareBySortField(a.Name, a.Status, a.LastRunDate, b.Name, b.Status, b.LastRunDate, dir));
  }

  private sortTestCards(tests: TestCardData[]): TestCardData[] {
    const dir = this.SortDirection === 'asc' ? 1 : -1;
    return tests.sort((a, b) => this.compareBySortField(a.Name, a.Status, a.UpdatedAt, b.Name, b.Status, b.UpdatedAt, dir));
  }

  private compareBySortField(
    aName: string, aStatus: string, aDate: Date | null,
    bName: string, bStatus: string, bDate: Date | null,
    dir: number
  ): number {
    switch (this.SortField) {
      case 'name':
        return aName.localeCompare(bName) * dir;
      case 'status':
        return aStatus.localeCompare(bStatus) * dir;
      case 'updated': {
        const aTime = aDate ? new Date(aDate).getTime() : 0;
        const bTime = bDate ? new Date(bDate).getTime() : 0;
        return (aTime - bTime) * dir;
      }
      default:
        return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Helpers
  // ---------------------------------------------------------------------------

  private computeCounts(): void {
    const testIdsInSuites = new Set(this.allSuiteTests.map(st => st.TestID));
    this.StandaloneTestCount = this.allTests.filter(t => !testIdsInSuites.has(t.ID)).length;
    this.TotalItemCount = this.allTests.length + this.AllSuites.length;
  }

  private computeAvgDuration(runs: TestRunStatRow[]): number {
    const completed = runs.filter(r => r.CompletedAt != null && r.StartedAt != null);
    if (completed.length === 0) return 0;

    const totalMs = completed.reduce((sum, r) => {
      const start = this.toDate(r.StartedAt).getTime();
      const end = this.toDate(r.CompletedAt!).getTime();
      return sum + (end - start);
    }, 0);

    return totalMs / completed.length;
  }

  private findLastRunDate(runs: TestRunStatRow[]): Date | null {
    if (runs.length === 0) return null;
    return this.toDate(runs[0].StartedAt);
  }

  private findLastRunForTest(testId: string): TestRunStatRow | null {
    return this.testRunStats.find(r => r.TestID === testId) || null;
  }

  private findSuiteNameForTest(testId: string): string {
    const suiteTest = this.allSuiteTests.find(st => st.TestID === testId);
    if (!suiteTest) return '';
    const suite = this.AllSuites.find(s => s.ID === suiteTest.SuiteID);
    return suite?.Name || suiteTest.Suite || '';
  }

  private parseTags(tagsJson: string | null): string[] {
    if (!tagsJson) return [];
    try {
      const parsed = JSON.parse(tagsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private toDate(value: string | Date | null): Date {
    if (!value) return new Date(0);
    return value instanceof Date ? value : new Date(value);
  }

  // ---------------------------------------------------------------------------
  // Private: User Settings
  // ---------------------------------------------------------------------------

  private loadUserSettings(): void {
    try {
      const widthStr = UserInfoEngine.Instance.GetSetting(TestingExplorerComponent.PANEL_WIDTH_KEY);
      if (widthStr) {
        const width = parseInt(widthStr, 10);
        if (!isNaN(width) && width >= 400 && width <= 900) {
          this.SlideoutWidth = width;
        }
      }
      const stateStr = UserInfoEngine.Instance.GetSetting(TestingExplorerComponent.SEARCH_STATE_KEY);
      if (stateStr) {
        const state = JSON.parse(stateStr) as Record<string, string>;
        if (state.searchTerm) {
          this.SearchTerm = state.searchTerm;
          this._searchTerm$.next(state.searchTerm);
        }
      }
    } catch (error) {
      console.warn('[TestingExplorer] Failed to load user settings:', error);
    } finally {
      this.settingsLoaded = true;
    }
  }

  private setupSettingsPersistence(): void {
    this.settingsPersistSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.persistSearchState();
    });
  }

  private persistSearchState(): void {
    if (!this.settingsLoaded) return;
    try {
      const state = { searchTerm: this.SearchTerm };
      UserInfoEngine.Instance.SetSettingDebounced(
        TestingExplorerComponent.SEARCH_STATE_KEY,
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn('[TestingExplorer] Failed to persist search state:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Form Management
  // ---------------------------------------------------------------------------

  private resetForm(): void {
    this.FormName = '';
    this.FormDescription = '';
    this.FormTypeID = this.AllTestTypes.length > 0 ? this.AllTestTypes[0].ID : '';
    this.FormStatus = 'Active';
    this.FormParentSuiteID = '';
    this.FormEstDuration = 0;
    this.FormEstCost = 0;
    this.FormTags = '';
    this.FormErrorMessage = '';
  }

  private async saveNewTest(): Promise<void> {
    const md = new Metadata();
    const test = await md.GetEntityObject<TestEntity>('MJ: Tests');
    test.NewRecord();
    test.Name = this.FormName.trim();
    test.Description = this.FormDescription.trim() || null;
    test.TypeID = this.FormTypeID;
    test.Status = this.FormStatus;
    if (this.FormEstDuration > 0) test.EstimatedDurationSeconds = this.FormEstDuration;
    if (this.FormEstCost > 0) test.EstimatedCostUSD = this.FormEstCost;
    if (this.FormTags.trim()) {
      const tags = this.FormTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      test.Tags = JSON.stringify(tags);
    }
    const saved = await test.Save();
    if (!saved) throw new Error('Failed to save test. Please check your input and try again.');
  }

  private async saveNewSuite(): Promise<void> {
    const md = new Metadata();
    const suite = await md.GetEntityObject<TestSuiteEntity>('MJ: Test Suites');
    suite.NewRecord();
    suite.Name = this.FormName.trim();
    suite.Description = this.FormDescription.trim() || null;
    suite.Status = this.FormStatus;
    if (this.FormParentSuiteID) suite.ParentID = this.FormParentSuiteID;
    if (this.FormTags.trim()) {
      const tags = this.FormTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
      suite.Tags = JSON.stringify(tags);
    }
    const saved = await suite.Save();
    if (!saved) throw new Error('Failed to save test suite. Please check your input and try again.');
  }
}
