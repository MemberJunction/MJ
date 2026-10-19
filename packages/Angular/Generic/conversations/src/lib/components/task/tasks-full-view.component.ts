import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

import { UserInfo, RunView } from '@memberjunction/core';
import { MJTaskEntity, MJTaskDependencyEntity } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { Subscription } from 'rxjs';

/**
 * Normalized status filter categories in the AI Agent Workflows & Tasks Command Center.
 */
export type WorkflowStatusFilter = 'all' | 'active' | 'completed' | 'failed';

/**
 * Primary display modes for the AI Agent Workflows & Tasks Command Center.
 */
export type WorkflowCommandCenterViewMode = 'workflows' | 'timeline';

/**
 * Enriched representation of an individual step within a workflow group,
 * including timing offsets for the second-resolution execution waterfall.
 */
export interface EnrichedWorkflowStep {
  Task: MJTaskEntity;
  StepNumber: number;
  AgentName: string | null;
  AgentID: string | null;
  AgentRunID: string | null;
  Instructions: string;
  Output: string | null;
  IsErrorOutput: boolean;
  OutputPreview: string;
  DurationText: string;
  DurationMs: number;
  /** Offset percentage (0-92) from the workflow's start timestamp */
  TimelineOffsetPercent: number;
  /** Bar width percentage (8-100) relative to the workflow's total duration */
  TimelineWidthPercent: number;
  StartOffsetLabel: string;
  DependsOnNames: string[];
  DependsOnTaskIds: string[];
}

/**
 * Hierarchy-aware workflow group combining a parent orchestration container task
 * (or standalone task) with its ordered specialist agent execution steps.
 */
export interface WorkflowGroupViewModel {
  RootTaskId: string;
  ParentTask: MJTaskEntity;
  Title: string;
  SummaryInstruction: string;
  Status: MJTaskEntity['Status'];
  NormalizedCategory: 'active' | 'completed' | 'failed';
  PercentComplete: number;
  TotalSteps: number;
  CompletedSteps: number;
  ActiveSteps: number;
  FailedSteps: number;
  Steps: EnrichedWorkflowStep[];
  AgentPipeline: Array<{ id: string; name: string }>;
  StartedAt: Date | null;
  CompletedAt: Date | null;
  DurationText: string;
  DurationMs: number;
  RelativeTimeText: string;
  ConversationDetailID: string | null;
  IsMultiStep: boolean;
}

/**
 * Summary KPI metrics displayed in the top command-center ribbon.
 */
export interface WorkflowCommandCenterKPIs {
  TotalWorkflows: number;
  TotalSteps: number;
  ActiveWorkflows: number;
  CompletedSteps: number;
  SuccessRatePercent: number;
  AvgExecutionTimeText: string;
}

/**
 * AI Agent Workflows & Tasks Command Center (`mj-tasks-full-view`).
 *
 * Provides a hierarchy-aware, real-time command center for monitoring and inspecting
 * multi-agent task graphs and durable background agent executions launched from conversations.
 */
@Component({
  selector: 'mj-tasks-full-view',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="tasks-command-center">
      <!-- Top Command Center Header -->
      <header class="cc-header">
        <div class="cc-header-left">
          <div class="cc-title-icon">
            <i class="fa-solid fa-diagram-project"></i>
          </div>
          <div class="cc-title-block">
            <div class="cc-title-row">
              <h1 class="cc-title">AI Agent Workflows &amp; Tasks</h1>
              @if (Kpis.ActiveWorkflows > 0) {
                <span class="cc-live-pill">
                  <span class="cc-live-dot"></span>
                  {{ Kpis.ActiveWorkflows }} Running Live
                </span>
              }
            </div>
            <p class="cc-subtitle">
              Real-time multi-agent task orchestration, step dependencies &amp; execution telemetry
            </p>
          </div>
        </div>

        <div class="cc-header-actions">
          <!-- View Mode Switcher -->
          <div class="cc-view-switcher" role="tablist" aria-label="View Mode">
            <button
              type="button"
              class="cc-view-btn"
              [class.active]="CommandViewMode === 'workflows'"
              (click)="SetCommandViewMode('workflows')">
              <i class="fa-solid fa-layer-group"></i>
              <span>Workflow Cards</span>
            </button>
            <button
              type="button"
              class="cc-view-btn"
              [class.active]="CommandViewMode === 'timeline'"
              (click)="SetCommandViewMode('timeline')">
              <i class="fa-solid fa-bars-staggered"></i>
              <span>Execution Timeline &amp; DAG</span>
            </button>
          </div>

          <button
            type="button"
            class="cc-refresh-btn"
            [disabled]="isLoading"
            (click)="LoadTasks()"
            title="Refresh workflows and tasks">
            <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="isLoading"></i>
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <!-- KPI Metric Ribbon -->
      <section class="cc-kpi-ribbon" aria-label="Workflow Metrics">
        <div class="cc-kpi-card">
          <div class="cc-kpi-icon kpi-brand">
            <i class="fa-solid fa-sitemap"></i>
          </div>
          <div class="cc-kpi-body">
            <span class="cc-kpi-label">Total Workflows</span>
            <div class="cc-kpi-value-row">
              <span class="cc-kpi-value">{{ Kpis.TotalWorkflows }}</span>
              <span class="cc-kpi-sub">{{ Kpis.TotalSteps }} total steps</span>
            </div>
          </div>
        </div>

        <div class="cc-kpi-card" [class.kpi-card-active]="Kpis.ActiveWorkflows > 0">
          <div class="cc-kpi-icon kpi-active">
            <i class="fa-solid fa-bolt"></i>
          </div>
          <div class="cc-kpi-body">
            <span class="cc-kpi-label">Active / Running</span>
            <div class="cc-kpi-value-row">
              <span class="cc-kpi-value">{{ Kpis.ActiveWorkflows }}</span>
              <span class="cc-kpi-sub">{{ Kpis.ActiveWorkflows > 0 ? 'Streaming live updates' : 'All queues idle' }}</span>
            </div>
          </div>
        </div>

        <div class="cc-kpi-card">
          <div class="cc-kpi-icon kpi-success">
            <i class="fa-solid fa-circle-check"></i>
          </div>
          <div class="cc-kpi-body">
            <span class="cc-kpi-label">Completed Steps</span>
            <div class="cc-kpi-value-row">
              <span class="cc-kpi-value">{{ Kpis.CompletedSteps }}</span>
              <span class="cc-kpi-sub">of {{ Kpis.TotalSteps }} steps</span>
            </div>
          </div>
        </div>

        <div class="cc-kpi-card">
          <div class="cc-kpi-icon kpi-rate">
            <i class="fa-solid fa-chart-line"></i>
          </div>
          <div class="cc-kpi-body">
            <span class="cc-kpi-label">Success Rate</span>
            <div class="cc-kpi-value-row">
              <span class="cc-kpi-value">{{ Kpis.SuccessRatePercent }}%</span>
              <span class="cc-kpi-sub">terminal reliability</span>
            </div>
          </div>
        </div>

        <div class="cc-kpi-card">
          <div class="cc-kpi-icon kpi-time">
            <i class="fa-solid fa-stopwatch"></i>
          </div>
          <div class="cc-kpi-body">
            <span class="cc-kpi-label">Avg Execution Time</span>
            <div class="cc-kpi-value-row">
              <span class="cc-kpi-value">{{ Kpis.AvgExecutionTimeText }}</span>
              <span class="cc-kpi-sub">per completed workflow</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Filter & Search Bar -->
      <section class="cc-filter-bar">
        <div class="cc-search-box">
          <i class="fa-solid fa-magnifying-glass cc-search-icon"></i>
          <input
            type="text"
            class="cc-search-input"
            placeholder="Search workflows, step names, specialist agents, or outputs..."
            [(ngModel)]="SearchQuery"
            (ngModelChange)="OnFilterCriteriaChanged()" />
          @if (SearchQuery) {
            <button type="button" class="cc-search-clear" (click)="ClearSearch()" title="Clear search">
              <i class="fa-solid fa-xmark"></i>
            </button>
          }
        </div>

        <div class="cc-status-pills" role="group" aria-label="Filter by status">
          <button
            type="button"
            class="cc-filter-pill"
            [class.active]="StatusFilter === 'all'"
            (click)="SetStatusFilter('all')">
            <span>All</span>
            <span class="cc-pill-count">{{ WorkflowGroups.length }}</span>
          </button>
          <button
            type="button"
            class="cc-filter-pill pill-active"
            [class.active]="StatusFilter === 'active'"
            (click)="SetStatusFilter('active')">
            <span class="cc-status-dot dot-active"></span>
            <span>Active</span>
            <span class="cc-pill-count">{{ CountByCategory('active') }}</span>
          </button>
          <button
            type="button"
            class="cc-filter-pill pill-completed"
            [class.active]="StatusFilter === 'completed'"
            (click)="SetStatusFilter('completed')">
            <span class="cc-status-dot dot-completed"></span>
            <span>Completed</span>
            <span class="cc-pill-count">{{ CountByCategory('completed') }}</span>
          </button>
          <button
            type="button"
            class="cc-filter-pill pill-failed"
            [class.active]="StatusFilter === 'failed'"
            (click)="SetStatusFilter('failed')">
            <span class="cc-status-dot dot-failed"></span>
            <span>Failed</span>
            <span class="cc-pill-count">{{ CountByCategory('failed') }}</span>
          </button>
        </div>

        @if (AvailableAgents.length > 0) {
          <div class="cc-agent-filter">
            <i class="fa-solid fa-robot cc-agent-filter-icon"></i>
            <select
              class="cc-agent-select"
              [ngModel]="SelectedAgentFilter"
              (ngModelChange)="SetAgentFilter($event)"
              aria-label="Filter by specialist agent">
              <option value="all">All Specialist Agents ({{ AvailableAgents.length }})</option>
              @for (ag of AvailableAgents; track ag.id) {
                <option [value]="ag.id">{{ ag.name }} ({{ ag.count }})</option>
              }
            </select>
          </div>
        }
      </section>

      <!-- Main Body: Content List + Slide-Over Inspector Drawer -->
      <div class="cc-workspace-body" [class.drawer-open]="!!InspectedGroup">
        <div class="cc-main-scroll">
          @if (isLoading && WorkflowGroups.length === 0) {
            <div class="cc-empty-state">
              <div class="cc-empty-icon">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
              </div>
              <h3>Loading AI Agent Workflows...</h3>
              <p>Fetching orchestrated task graphs, specialist agent steps, and execution telemetry.</p>
            </div>
          } @else if (FilteredWorkflowGroups.length === 0) {
            <div class="cc-empty-state">
              <div class="cc-empty-icon">
                <i class="fa-solid fa-diagram-project"></i>
              </div>
              @if (WorkflowGroups.length === 0) {
                <h3>No Agent Workflows Recorded Yet</h3>
                <p>When Sage or other orchestrator agents launch multi-step task graphs in Chat, their live progress, specialist delegations, and outputs will appear here.</p>
              } @else {
                <h3>No Workflows Match Your Filters</h3>
                <p>Try clearing your search query or switching the status / specialist agent filter.</p>
                <button type="button" class="cc-reset-filters-btn" (click)="ResetAllFilters()">
                  <i class="fa-solid fa-rotate-left"></i>
                  <span>Reset Filters</span>
                </button>
              }
            </div>
          } @else if (CommandViewMode === 'workflows') {
            <!-- VIEW MODE 1: HIERARCHY-AWARE WORKFLOW CARDS -->
            <div class="cc-workflow-grid">
              @for (group of FilteredWorkflowGroups; track group.RootTaskId) {
                <article
                  class="cc-workflow-card"
                  [class.card-active]="group.NormalizedCategory === 'active'"
                  [class.card-completed]="group.NormalizedCategory === 'completed'"
                  [class.card-failed]="group.NormalizedCategory === 'failed'"
                  [class.card-selected]="IsGroupInspected(group)"
                  (click)="InspectWorkflowGroup(group)">

                  <!-- Workflow Card Header -->
                  <div class="cc-wf-header">
                    <div class="cc-wf-header-left">
                      <div class="cc-wf-status-icon" [attr.data-status]="group.NormalizedCategory">
                        @if (group.NormalizedCategory === 'completed') {
                          <i class="fa-solid fa-check"></i>
                        } @else if (group.NormalizedCategory === 'active') {
                          <i class="fa-solid fa-circle-notch fa-spin"></i>
                        } @else {
                          <i class="fa-solid fa-triangle-exclamation"></i>
                        }
                      </div>

                      <div class="cc-wf-title-group">
                        <div class="cc-wf-title-line">
                          <h3 class="cc-wf-title">{{ group.Title }}</h3>
                          <span class="cc-wf-step-count-badge">
                            {{ group.TotalSteps }} {{ group.TotalSteps === 1 ? 'Step' : 'Steps' }}
                          </span>
                          <span class="cc-wf-status-badge" [attr.data-status]="group.NormalizedCategory">
                            {{ group.Status }}
                          </span>
                        </div>

                        <!-- Agent Pipeline Chips -->
                        @if (group.AgentPipeline.length > 0) {
                          <div class="cc-wf-agent-pipeline">
                            @for (ag of group.AgentPipeline; track ag.id; let isLast = $last) {
                              <button
                                type="button"
                                class="cc-agent-chip"
                                (click)="OnAgentChipClicked($event, ag.id)"
                                title="Inspect {{ ag.name }}">
                                <i class="fa-solid fa-robot"></i>
                                <span>{{ ag.name }}</span>
                              </button>
                              @if (!isLast) {
                                <i class="fa-solid fa-arrow-right cc-pipeline-arrow"></i>
                              }
                            }
                          </div>
                        }
                      </div>
                    </div>

                    <div class="cc-wf-header-right">
                      @if (group.DurationText) {
                        <span class="cc-wf-duration" title="Total workflow execution duration">
                          <i class="fa-regular fa-clock"></i>
                          {{ group.DurationText }}
                        </span>
                      }
                      <span class="cc-wf-timestamp">{{ group.RelativeTimeText }}</span>
                      <button
                        type="button"
                        class="cc-wf-inspect-btn"
                        (click)="InspectWorkflowGroup(group, undefined, $event)"
                        title="Open Workflow Inspector">
                        <span>Inspect</span>
                        <i class="fa-solid fa-chevron-right"></i>
                      </button>
                    </div>
                  </div>

                  <!-- Progress Bar -->
                  <div class="cc-wf-progress-row">
                    <div class="cc-wf-progress-track">
                      <div
                        class="cc-wf-progress-fill"
                        [attr.data-status]="group.NormalizedCategory"
                        [style.width.%]="group.PercentComplete">
                      </div>
                    </div>
                    <span class="cc-wf-progress-label">
                      {{ group.CompletedSteps }} of {{ group.TotalSteps }} completed &middot; {{ group.PercentComplete }}%
                    </span>
                  </div>

                  <!-- Step Pipeline List inside Card -->
                  <div class="cc-wf-steps-list">
                    @for (step of group.Steps; track step.Task.ID) {
                      <div
                        class="cc-step-row"
                        [class.step-selected]="IsStepInspected(step.Task)"
                        [attr.data-status]="GetStepCategory(step.Task.Status)"
                        (click)="InspectWorkflowGroup(group, step, $event)">

                        <div class="cc-step-index" [attr.data-status]="GetStepCategory(step.Task.Status)">
                          @if (step.Task.Status === 'Complete') {
                            <i class="fa-solid fa-check"></i>
                          } @else if (step.Task.Status === 'In Progress') {
                            <i class="fa-solid fa-spinner fa-spin"></i>
                          } @else if (step.Task.Status === 'Failed' || step.Task.Status === 'Cancelled') {
                            <i class="fa-solid fa-xmark"></i>
                          } @else {
                            <span>{{ step.StepNumber }}</span>
                          }
                        </div>

                        <div class="cc-step-main">
                          <div class="cc-step-top-line">
                            <span class="cc-step-name">{{ step.Task.Name }}</span>

                            @if (step.AgentName) {
                              <span class="cc-step-agent-tag">
                                <i class="fa-solid fa-robot"></i>
                                {{ step.AgentName }}
                              </span>
                            }

                            @if (step.DependsOnNames.length > 0) {
                              <span class="cc-step-dep-tag" title="Waits for: {{ step.DependsOnNames.join(', ') }}">
                                <i class="fa-solid fa-link"></i>
                                After {{ step.DependsOnNames.join(', ') }}
                              </span>
                            }
                          </div>

                          @if (step.OutputPreview) {
                            <p class="cc-step-preview" [class.preview-error]="step.IsErrorOutput">
                              {{ step.OutputPreview }}
                            </p>
                          }
                        </div>

                        <div class="cc-step-right">
                          @if (step.DurationText) {
                            <span class="cc-step-duration">{{ step.DurationText }}</span>
                          }
                          <span class="cc-step-status-pill" [attr.data-status]="GetStepCategory(step.Task.Status)">
                            {{ step.Task.Status }}
                          </span>
                          @if (step.AgentRunID) {
                            <button
                              type="button"
                              class="cc-step-run-btn"
                              (click)="OnOpenAgentRunClicked($event, step.AgentRunID)"
                              title="Open AI Agent Run Telemetry">
                              <i class="fa-solid fa-arrow-up-right-from-square"></i>
                            </button>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </article>
              }
            </div>
          } @else {
            <!-- VIEW MODE 2: EXECUTION TIMELINE & DEPENDENCY DAG WATERFALL -->
            <div class="cc-timeline-list">
              @for (group of FilteredWorkflowGroups; track group.RootTaskId) {
                <section
                  class="cc-timeline-card"
                  [class.card-selected]="IsGroupInspected(group)">
                  <div class="cc-timeline-card-header" (click)="InspectWorkflowGroup(group)">
                    <div class="cc-timeline-title-wrap">
                      <span class="cc-wf-status-badge" [attr.data-status]="group.NormalizedCategory">
                        {{ group.Status }}
                      </span>
                      <h3 class="cc-wf-title">{{ group.Title }}</h3>
                      <span class="cc-wf-step-count-badge">{{ group.TotalSteps }} Steps</span>
                    </div>
                    <div class="cc-timeline-meta">
                      @if (group.DurationText) {
                        <span class="cc-wf-duration">
                          <i class="fa-solid fa-stopwatch"></i>
                          Total: {{ group.DurationText }}
                        </span>
                      }
                      <span class="cc-wf-timestamp">{{ group.RelativeTimeText }}</span>
                    </div>
                  </div>

                  <div class="cc-waterfall-table">
                    <div class="cc-waterfall-head">
                      <div class="cc-wf-col-step">Workflow Step &amp; Dependencies</div>
                      <div class="cc-wf-col-agent">Specialist Agent</div>
                      <div class="cc-wf-col-bars">
                        <span>Execution Waterfall (0s &rarr; {{ group.DurationText || 'Live' }})</span>
                      </div>
                    </div>

                    @for (step of group.Steps; track step.Task.ID) {
                      <div
                        class="cc-waterfall-row"
                        [class.step-selected]="IsStepInspected(step.Task)"
                        (click)="InspectWorkflowGroup(group, step, $event)">
                        <div class="cc-wf-col-step">
                          <span class="cc-step-index" [attr.data-status]="GetStepCategory(step.Task.Status)">
                            {{ step.StepNumber }}
                          </span>
                          <div class="cc-waterfall-step-text">
                            <span class="cc-step-name">{{ step.Task.Name }}</span>
                            @if (step.DependsOnNames.length > 0) {
                              <span class="cc-waterfall-dep">
                                <i class="fa-solid fa-turn-up fa-rotate-90"></i>
                                Depends on: {{ step.DependsOnNames.join(', ') }}
                              </span>
                            }
                          </div>
                        </div>

                        <div class="cc-wf-col-agent">
                          @if (step.AgentName) {
                            <span class="cc-step-agent-tag">
                              <i class="fa-solid fa-robot"></i>
                              {{ step.AgentName }}
                            </span>
                          } @else {
                            <span class="cc-text-muted">Orchestrator</span>
                          }
                        </div>

                        <div class="cc-wf-col-bars">
                          <div class="cc-waterfall-track">
                            <div
                              class="cc-waterfall-bar"
                              [attr.data-status]="GetStepCategory(step.Task.Status)"
                              [style.left.%]="step.TimelineOffsetPercent"
                              [style.width.%]="step.TimelineWidthPercent">
                              <span class="cc-waterfall-bar-label">
                                {{ step.StartOffsetLabel }} &middot; {{ step.DurationText || step.Task.Status }}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                </section>
              }
            </div>
          }
        </div>

        <!-- SLIDE-OVER WORKFLOW & STEP INSPECTOR DRAWER -->
        @if (InspectedGroup) {
          <aside class="cc-inspector-drawer" aria-label="Workflow and Step Inspector">
            <div class="cc-drawer-header">
              <div class="cc-drawer-header-top">
                <span class="cc-drawer-eyebrow">
                  <i class="fa-solid fa-microscope"></i>
                  {{ InspectedStep ? 'Step ' + InspectedStep.StepNumber + ' of ' + InspectedGroup.TotalSteps : 'Workflow Overview' }}
                </span>
                <button
                  type="button"
                  class="cc-drawer-close"
                  (click)="BackToTaskList()"
                  title="Close Inspector">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              <h2 class="cc-drawer-title">
                {{ InspectedStep ? InspectedStep.Task.Name : InspectedGroup.Title }}
              </h2>

              <!-- Step Switcher Pills inside Drawer -->
              @if (InspectedGroup.Steps.length > 1) {
                <div class="cc-drawer-step-tabs">
                  @for (s of InspectedGroup.Steps; track s.Task.ID) {
                    <button
                      type="button"
                      class="cc-drawer-step-tab"
                      [class.active]="InspectedStep?.Task?.ID === s.Task.ID"
                      (click)="SelectInspectorStep(s)">
                      <span class="cc-tab-num">{{ s.StepNumber }}</span>
                      <span class="cc-tab-label">{{ s.Task.Name }}</span>
                    </button>
                  }
                </div>
              }
            </div>

            <div class="cc-drawer-content">
              @if (InspectedStep; as activeStep) {
                <!-- Status + Progress + Duration Summary -->
                <div class="cc-drawer-metrics-grid">
                  <div class="cc-drawer-metric-box">
                    <span class="cc-drawer-metric-label">Status</span>
                    <span class="cc-wf-status-badge" [attr.data-status]="GetStepCategory(activeStep.Task.Status)">
                      {{ activeStep.Task.Status }}
                    </span>
                  </div>
                  <div class="cc-drawer-metric-box">
                    <span class="cc-drawer-metric-label">Duration</span>
                    <span class="cc-drawer-metric-val">{{ activeStep.DurationText || '—' }}</span>
                  </div>
                  <div class="cc-drawer-metric-box">
                    <span class="cc-drawer-metric-label">Completion</span>
                    <span class="cc-drawer-metric-val">{{ activeStep.Task.PercentComplete ?? 0 }}%</span>
                  </div>
                </div>

                <div class="cc-drawer-progress-bar">
                  <div
                    class="cc-drawer-progress-fill"
                    [attr.data-status]="GetStepCategory(activeStep.Task.Status)"
                    [style.width.%]="activeStep.Task.PercentComplete ?? 0">
                  </div>
                </div>

                <!-- Specialist Agent & AI Agent Run Deep Links -->
                <div class="cc-drawer-section">
                  <h4 class="cc-drawer-section-title">Execution &amp; Telemetry Links</h4>
                  <div class="cc-drawer-links-stack">
                    @if (activeStep.AgentID && activeStep.AgentName) {
                      <button
                        type="button"
                        class="cc-drawer-link-card"
                        (click)="OnAgentChipClicked($event, activeStep.AgentID)">
                        <div class="cc-link-card-icon">
                          <i class="fa-solid fa-robot"></i>
                        </div>
                        <div class="cc-link-card-body">
                          <span class="cc-link-card-label">Assigned Specialist Agent</span>
                          <span class="cc-link-card-title">{{ activeStep.AgentName }}</span>
                        </div>
                        <i class="fa-solid fa-arrow-up-right-from-square cc-link-card-ext"></i>
                      </button>
                    }

                    @if (activeStep.AgentRunID) {
                      <button
                        type="button"
                        class="cc-drawer-link-card"
                        (click)="OnOpenAgentRunClicked($event, activeStep.AgentRunID)">
                        <div class="cc-link-card-icon run-icon">
                          <i class="fa-solid fa-gauge-high"></i>
                        </div>
                        <div class="cc-link-card-body">
                          <span class="cc-link-card-label">AI Agent Run Trace</span>
                          <span class="cc-link-card-title">Open Full Step &amp; Prompt Run Log</span>
                        </div>
                        <i class="fa-solid fa-arrow-up-right-from-square cc-link-card-ext"></i>
                      </button>
                    }
                  </div>
                </div>

                <!-- Dependencies -->
                @if (activeStep.DependsOnNames.length > 0) {
                  <div class="cc-drawer-section">
                    <h4 class="cc-drawer-section-title">Prerequisite Dependencies</h4>
                    <div class="cc-drawer-deps-list">
                      @for (depName of activeStep.DependsOnNames; track depName) {
                        <span class="cc-drawer-dep-pill">
                          <i class="fa-solid fa-code-commit"></i>
                          {{ depName }}
                        </span>
                      }
                    </div>
                  </div>
                }

                <!-- Timestamps -->
                <div class="cc-drawer-section">
                  <h4 class="cc-drawer-section-title">Timeline</h4>
                  <div class="cc-drawer-timestamps">
                    @if (activeStep.Task.StartedAt) {
                      <div class="cc-ts-row">
                        <span class="cc-ts-label">Started</span>
                        <span class="cc-ts-val">{{ FormatDateTime(activeStep.Task.StartedAt) }}</span>
                      </div>
                    }
                    @if (activeStep.Task.CompletedAt) {
                      <div class="cc-ts-row">
                        <span class="cc-ts-label">Completed</span>
                        <span class="cc-ts-val">{{ FormatDateTime(activeStep.Task.CompletedAt) }}</span>
                      </div>
                    }
                  </div>
                </div>

                <!-- Task Instructions -->
                @if (activeStep.Instructions) {
                  <div class="cc-drawer-section">
                    <h4 class="cc-drawer-section-title">Step Instructions</h4>
                    <div class="cc-drawer-text-box">{{ activeStep.Instructions }}</div>
                  </div>
                }

                <!-- Agent Output / Error Details -->
                @if (activeStep.Output) {
                  <div class="cc-drawer-section">
                    <div class="cc-drawer-section-head">
                      <h4 class="cc-drawer-section-title">
                        {{ activeStep.IsErrorOutput ? 'Error Diagnostics' : 'Specialist Agent Output' }}
                      </h4>
                      <button
                        type="button"
                        class="cc-copy-btn"
                        (click)="CopyStepOutput(activeStep.Output)"
                        title="Copy output to clipboard">
                        <i class="fa-regular" [class.fa-copy]="!CopiedOutput" [class.fa-check]="CopiedOutput"></i>
                        <span>{{ CopiedOutput ? 'Copied' : 'Copy' }}</span>
                      </button>
                    </div>
                    <div class="cc-drawer-output-box" [class.output-error]="activeStep.IsErrorOutput">{{ activeStep.Output }}</div>
                  </div>
                }
              }
            </div>
          </aside>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .tasks-command-center {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
      overflow: hidden;
    }

    /* Header */
    .cc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 24px;
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
    }

    .cc-header-left {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }

    .cc-title-icon {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 26%, var(--mj-border-default));
      color: var(--mj-brand-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }

    .cc-title-block {
      min-width: 0;
    }

    .cc-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .cc-title {
      margin: 0;
      font-size: 19px;
      font-weight: 700;
      color: var(--mj-text-primary);
      letter-spacing: -0.01em;
    }

    .cc-live-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
      border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 35%, transparent);
    }

    .cc-live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--mj-brand-primary);
      animation: ccPulse 1.5s infinite ease-in-out;
    }

    @keyframes ccPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.25); }
    }

    .cc-subtitle {
      margin: 3px 0 0 0;
      font-size: 13px;
      color: var(--mj-text-secondary);
    }

    .cc-header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .cc-view-switcher {
      display: inline-flex;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      padding: 3px;
      gap: 2px;
    }

    .cc-view-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--mj-text-secondary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .cc-view-btn:hover {
      color: var(--mj-text-primary);
    }

    .cc-view-btn.active {
      background: var(--mj-bg-surface);
      color: var(--mj-brand-primary);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .cc-refresh-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 14px;
      border-radius: 8px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .cc-refresh-btn:hover:not(:disabled) {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-brand-primary);
      color: var(--mj-brand-primary);
    }

    .cc-refresh-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* KPI Ribbon */
    .cc-kpi-ribbon {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      padding: 14px 24px;
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
    }

    .cc-kpi-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 14px;
      border-radius: 10px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      min-width: 0;
    }

    .cc-kpi-card.kpi-card-active {
      border-color: color-mix(in srgb, var(--mj-brand-primary) 45%, var(--mj-border-default));
      background: color-mix(in srgb, var(--mj-brand-primary) 6%, var(--mj-bg-surface));
    }

    .cc-kpi-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
    }

    .cc-kpi-icon.kpi-brand {
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
      color: var(--mj-brand-primary);
    }

    .cc-kpi-icon.kpi-active {
      background: rgba(245, 158, 11, 0.15);
      color: #d97706;
    }

    .cc-kpi-icon.kpi-success {
      background: rgba(16, 185, 129, 0.15);
      color: #059669;
    }

    .cc-kpi-icon.kpi-rate {
      background: rgba(99, 102, 241, 0.15);
      color: #4f46e5;
    }

    .cc-kpi-icon.kpi-time {
      background: rgba(14, 165, 233, 0.15);
      color: #0284c7;
    }

    .cc-kpi-body {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .cc-kpi-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mj-text-muted);
    }

    .cc-kpi-value-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-top: 2px;
      flex-wrap: wrap;
    }

    .cc-kpi-value {
      font-size: 18px;
      font-weight: 700;
      color: var(--mj-text-primary);
    }

    .cc-kpi-sub {
      font-size: 11px;
      color: var(--mj-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Filter Bar */
    .cc-filter-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 24px;
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .cc-search-box {
      position: relative;
      flex: 1;
      min-width: 240px;
      display: flex;
      align-items: center;
    }

    .cc-search-icon {
      position: absolute;
      left: 12px;
      color: var(--mj-text-muted);
      font-size: 13px;
      pointer-events: none;
    }

    .cc-search-input {
      width: 100%;
      padding: 8px 32px 8px 34px;
      border-radius: 8px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .cc-search-input:focus {
      border-color: var(--mj-brand-primary);
      background: var(--mj-bg-surface);
    }

    .cc-search-clear {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: var(--mj-text-muted);
      cursor: pointer;
      padding: 4px;
    }

    .cc-status-pills {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .cc-filter-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 11px;
      border-radius: 999px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-secondary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .cc-filter-pill:hover {
      border-color: var(--mj-brand-primary);
      color: var(--mj-text-primary);
    }

    .cc-filter-pill.active {
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
      border-color: var(--mj-brand-primary);
      color: var(--mj-brand-primary);
    }

    .cc-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }

    .cc-status-dot.dot-active { background: #f59e0b; }
    .cc-status-dot.dot-completed { background: #10b981; }
    .cc-status-dot.dot-failed { background: #ef4444; }

    .cc-pill-count {
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--mj-bg-surface);
      font-size: 11px;
      color: var(--mj-text-muted);
    }

    .cc-agent-filter {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
    }

    .cc-agent-filter-icon {
      color: var(--mj-brand-primary);
      font-size: 13px;
    }

    .cc-agent-select {
      padding: 7px 4px;
      border: none;
      background: transparent;
      color: var(--mj-text-primary);
      font-size: 12px;
      font-weight: 600;
      outline: none;
      cursor: pointer;
    }

    /* Main Workspace Body & Grid */
    .cc-workspace-body {
      flex: 1;
      min-height: 0;
      display: flex;
      overflow: hidden;
      position: relative;
    }

    .cc-main-scroll {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
      padding: 20px 24px;
    }

    .cc-workflow-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 1280px;
      margin: 0 auto;
    }

    .cc-workflow-card {
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 12px;
      padding: 16px 18px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      cursor: pointer;
    }

    .cc-workflow-card:hover {
      border-color: color-mix(in srgb, var(--mj-brand-primary) 45%, var(--mj-border-default));
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    }

    .cc-workflow-card.card-selected {
      border-color: var(--mj-brand-primary);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);
    }

    .cc-workflow-card.card-active {
      border-left: 4px solid var(--mj-brand-primary);
    }

    .cc-workflow-card.card-completed {
      border-left: 4px solid #10b981;
    }

    .cc-workflow-card.card-failed {
      border-left: 4px solid #ef4444;
    }

    .cc-wf-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .cc-wf-header-left {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }

    .cc-wf-status-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .cc-wf-status-icon[data-status="completed"] {
      background: rgba(16, 185, 129, 0.14);
      color: #059669;
    }

    .cc-wf-status-icon[data-status="active"] {
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
      color: var(--mj-brand-primary);
    }

    .cc-wf-status-icon[data-status="failed"] {
      background: rgba(239, 68, 68, 0.14);
      color: #dc2626;
    }

    .cc-wf-title-group {
      min-width: 0;
      flex: 1;
    }

    .cc-wf-title-line {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .cc-wf-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--mj-text-primary);
    }

    .cc-wf-step-count-badge {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      color: var(--mj-text-secondary);
    }

    .cc-wf-status-badge {
      padding: 2px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .cc-wf-status-badge[data-status="completed"] {
      background: rgba(16, 185, 129, 0.14);
      color: #059669;
    }

    .cc-wf-status-badge[data-status="active"] {
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
      color: var(--mj-brand-primary);
    }

    .cc-wf-status-badge[data-status="failed"] {
      background: rgba(239, 68, 68, 0.14);
      color: #dc2626;
    }

    .cc-wf-agent-pipeline {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .cc-agent-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 28%, var(--mj-border-default));
      background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .cc-agent-chip:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 18%, var(--mj-bg-surface));
    }

    .cc-pipeline-arrow {
      font-size: 10px;
      color: var(--mj-text-muted);
    }

    .cc-wf-header-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .cc-wf-duration {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--mj-bg-surface-sunken);
      font-size: 12px;
      font-weight: 600;
      color: var(--mj-text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .cc-wf-timestamp {
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .cc-wf-inspect-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-secondary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .cc-wf-inspect-btn:hover {
      border-color: var(--mj-brand-primary);
      color: var(--mj-brand-primary);
    }

    /* Progress Bar inside Card */
    .cc-wf-progress-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 12px 0;
    }

    .cc-wf-progress-track {
      flex: 1;
      height: 6px;
      border-radius: 999px;
      background: var(--mj-bg-surface-sunken);
      overflow: hidden;
    }

    .cc-wf-progress-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.35s ease;
    }

    .cc-wf-progress-fill[data-status="completed"] { background: #10b981; }
    .cc-wf-progress-fill[data-status="active"] { background: var(--mj-brand-primary); }
    .cc-wf-progress-fill[data-status="failed"] { background: #ef4444; }

    .cc-wf-progress-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--mj-text-muted);
      font-variant-numeric: tabular-nums;
    }

    /* Step Rows inside Card */
    .cc-wf-steps-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-top: 1px solid var(--mj-border-default);
      padding-top: 10px;
    }

    .cc-step-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }

    .cc-step-row:hover {
      border-color: var(--mj-border-default);
      background: color-mix(in srgb, var(--mj-brand-primary) 4%, var(--mj-bg-surface-sunken));
    }

    .cc-step-row.step-selected {
      border-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface));
    }

    .cc-step-index {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .cc-step-index[data-status="completed"] {
      background: rgba(16, 185, 129, 0.16);
      color: #059669;
    }

    .cc-step-index[data-status="active"] {
      background: color-mix(in srgb, var(--mj-brand-primary) 16%, transparent);
      color: var(--mj-brand-primary);
    }

    .cc-step-index[data-status="failed"] {
      background: rgba(239, 68, 68, 0.16);
      color: #dc2626;
    }

    .cc-step-main {
      flex: 1;
      min-width: 0;
    }

    .cc-step-top-line {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .cc-step-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .cc-step-agent-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 7px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      color: var(--mj-text-secondary);
    }

    .cc-step-dep-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--mj-text-muted);
    }

    .cc-step-preview {
      margin: 4px 0 0 0;
      font-size: 12px;
      color: var(--mj-text-secondary);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .cc-step-preview.preview-error {
      color: #dc2626;
    }

    .cc-step-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .cc-step-duration {
      font-size: 11px;
      font-weight: 600;
      color: var(--mj-text-muted);
      font-variant-numeric: tabular-nums;
    }

    .cc-step-status-pill {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 999px;
    }

    .cc-step-status-pill[data-status="completed"] {
      background: rgba(16, 185, 129, 0.14);
      color: #059669;
    }

    .cc-step-status-pill[data-status="active"] {
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
      color: var(--mj-brand-primary);
    }

    .cc-step-status-pill[data-status="failed"] {
      background: rgba(239, 68, 68, 0.14);
      color: #dc2626;
    }

    .cc-step-run-btn {
      background: none;
      border: 1px solid var(--mj-border-default);
      border-radius: 5px;
      color: var(--mj-text-muted);
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 11px;
    }

    .cc-step-run-btn:hover {
      color: var(--mj-brand-primary);
      border-color: var(--mj-brand-primary);
    }

    /* Timeline & Waterfall DAG View */
    .cc-timeline-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 1280px;
      margin: 0 auto;
    }

    .cc-timeline-card {
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 12px;
      overflow: hidden;
    }

    .cc-timeline-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      background: var(--mj-bg-surface-sunken);
      border-bottom: 1px solid var(--mj-border-default);
      cursor: pointer;
    }

    .cc-timeline-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .cc-timeline-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .cc-waterfall-table {
      display: flex;
      flex-direction: column;
    }

    .cc-waterfall-head {
      display: grid;
      grid-template-columns: 280px 170px 1fr;
      gap: 12px;
      padding: 8px 18px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mj-text-muted);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .cc-waterfall-row {
      display: grid;
      grid-template-columns: 280px 170px 1fr;
      gap: 12px;
      align-items: center;
      padding: 10px 18px;
      border-bottom: 1px solid var(--mj-border-default);
      cursor: pointer;
      transition: background 0.12s ease;
    }

    .cc-waterfall-row:last-child {
      border-bottom: none;
    }

    .cc-waterfall-row:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .cc-waterfall-row.step-selected {
      background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface));
    }

    .cc-wf-col-step {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      min-width: 0;
    }

    .cc-waterfall-step-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .cc-waterfall-dep {
      font-size: 11px;
      color: var(--mj-text-muted);
      margin-top: 2px;
    }

    .cc-waterfall-track {
      position: relative;
      height: 26px;
      background: var(--mj-bg-surface-sunken);
      border-radius: 6px;
      overflow: hidden;
    }

    .cc-waterfall-bar {
      position: absolute;
      top: 3px;
      bottom: 3px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      padding: 0 8px;
      min-width: 64px;
      white-space: nowrap;
      font-size: 11px;
      font-weight: 600;
    }

    .cc-waterfall-bar[data-status="completed"] {
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid rgba(16, 185, 129, 0.5);
      color: #047857;
    }

    .cc-waterfall-bar[data-status="active"] {
      background: color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);
      border: 1px solid var(--mj-brand-primary);
      color: var(--mj-brand-primary);
    }

    .cc-waterfall-bar[data-status="failed"] {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.5);
      color: #b91c1c;
    }

    /* Slide-Over Inspector Drawer */
    .cc-inspector-drawer {
      width: 440px;
      max-width: 46%;
      height: 100%;
      background: var(--mj-bg-surface);
      border-left: 1px solid var(--mj-border-default);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      box-shadow: -4px 0 18px rgba(0, 0, 0, 0.06);
      animation: ccSlideIn 0.2s ease-out;
    }

    @keyframes ccSlideIn {
      from { opacity: 0; transform: translateX(24px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .cc-drawer-header {
      padding: 16px 20px;
      background: var(--mj-bg-surface-sunken);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
    }

    .cc-drawer-header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .cc-drawer-eyebrow {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mj-brand-primary);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .cc-drawer-close {
      background: none;
      border: none;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      color: var(--mj-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .cc-drawer-close:hover {
      background: var(--mj-border-default);
      color: var(--mj-text-primary);
    }

    .cc-drawer-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--mj-text-primary);
      line-height: 1.35;
    }

    .cc-drawer-step-tabs {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      margin-top: 12px;
      padding-bottom: 2px;
    }

    .cc-drawer-step-tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface);
      color: var(--mj-text-secondary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      max-width: 180px;
      white-space: nowrap;
    }

    .cc-drawer-step-tab.active {
      border-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
    }

    .cc-tab-num {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--mj-bg-surface-sunken);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      flex-shrink: 0;
    }

    .cc-tab-label {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cc-drawer-content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .cc-drawer-metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    .cc-drawer-metric-box {
      padding: 10px;
      border-radius: 8px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }

    .cc-drawer-metric-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--mj-text-muted);
    }

    .cc-drawer-metric-val {
      font-size: 14px;
      font-weight: 700;
      color: var(--mj-text-primary);
    }

    .cc-drawer-progress-bar {
      height: 8px;
      border-radius: 999px;
      background: var(--mj-bg-surface-sunken);
      overflow: hidden;
    }

    .cc-drawer-progress-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.3s ease;
    }

    .cc-drawer-progress-fill[data-status="completed"] { background: #10b981; }
    .cc-drawer-progress-fill[data-status="active"] { background: var(--mj-brand-primary); }
    .cc-drawer-progress-fill[data-status="failed"] { background: #ef4444; }

    .cc-drawer-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .cc-drawer-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .cc-drawer-section-title {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mj-text-muted);
    }

    .cc-drawer-links-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .cc-drawer-link-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;
    }

    .cc-drawer-link-card:hover {
      border-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 6%, var(--mj-bg-surface));
    }

    .cc-link-card-icon {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
      color: var(--mj-brand-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
    }

    .cc-link-card-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .cc-link-card-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--mj-text-muted);
    }

    .cc-link-card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .cc-link-card-ext {
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .cc-drawer-deps-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .cc-drawer-dep-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 6px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      font-size: 12px;
      color: var(--mj-text-secondary);
    }

    .cc-drawer-timestamps {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
    }

    .cc-ts-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
    }

    .cc-ts-label { color: var(--mj-text-muted); font-weight: 600; }
    .cc-ts-val { color: var(--mj-text-primary); font-variant-numeric: tabular-nums; }

    .cc-drawer-text-box {
      padding: 12px;
      border-radius: 8px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      font-size: 13px;
      line-height: 1.55;
      color: var(--mj-text-primary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .cc-drawer-output-box {
      padding: 12px;
      border-radius: 8px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      font-size: 13px;
      line-height: 1.6;
      color: var(--mj-text-primary);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 360px;
      overflow-y: auto;
    }

    .cc-drawer-output-box.output-error {
      border-color: #ef4444;
      color: #dc2626;
    }

    .cc-copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 5px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-secondary);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    /* Empty State */
    .cc-empty-state {
      max-width: 460px;
      margin: 64px auto;
      text-align: center;
      padding: 32px 24px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 14px;
    }

    .cc-empty-icon {
      width: 52px;
      height: 52px;
      border-radius: 12px;
      margin: 0 auto 14px auto;
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent);
      color: var(--mj-brand-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
    }

    .cc-empty-state h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--mj-text-primary);
    }

    .cc-empty-state p {
      margin: 0;
      font-size: 13px;
      line-height: 1.55;
      color: var(--mj-text-secondary);
    }

    .cc-reset-filters-btn {
      margin-top: 14px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 8px;
      border: 1px solid var(--mj-brand-primary);
      background: transparent;
      color: var(--mj-brand-primary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
  `]
})
export class TasksFullViewComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
  private cdr = inject(ChangeDetectorRef, { optional: true });

  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  @Input() BaseFilter: string = '1=1';

  /** @deprecated Use {@link BaseFilter}. */
  @Input() set baseFilter(value: string) {
    this.BaseFilter = value;
  }
  /** @deprecated Use {@link BaseFilter}. */
  get baseFilter(): string {
    return this.BaseFilter;
  }

  /**
   * Builds the task filter each time the view loads or refreshes, so the list includes tasks
   * created since the last load. Replaces {@link BaseFilter} when set.
   */
  @Input() BaseFilterResolver: (() => Promise<string>) | null = null;
  @Input() ActiveTaskId?: string;

  /** @deprecated Use {@link ActiveTaskId}. */
  @Input() set activeTaskId(value: string | undefined) {
    this.ActiveTaskId = value;
  }
  /** @deprecated Use {@link ActiveTaskId}. */
  get activeTaskId(): string | undefined {
    return this.ActiveTaskId;
  }

  @Output() OpenEntityRecord = new EventEmitter<{ entityName: string; recordId: string }>();
  /** @deprecated Use {@link OpenEntityRecord}. */
  @Output() openEntityRecord = this.OpenEntityRecord;

  @Output() TaskSelected = new EventEmitter<string | null>();
  /** @deprecated Use {@link TaskSelected}. */
  @Output() taskSelected = this.TaskSelected;

  public AllTasks: MJTaskEntity[] = [];
  /** @deprecated Use {@link AllTasks}. */
  public get allTasks(): MJTaskEntity[] {
    return this.AllTasks;
  }
  /** @deprecated Use {@link AllTasks}. */
  public set allTasks(value: MJTaskEntity[]) {
    this.AllTasks = value;
  }

  public FilteredTasks: MJTaskEntity[] = [];
  /** @deprecated Use {@link FilteredTasks}. */
  public get filteredTasks(): MJTaskEntity[] {
    return this.FilteredTasks;
  }
  /** @deprecated Use {@link FilteredTasks}. */
  public set filteredTasks(value: MJTaskEntity[]) {
    this.FilteredTasks = value;
  }

  public SubTasks: MJTaskEntity[] = [];
  /** @deprecated Use {@link SubTasks}. */
  public get subTasks(): MJTaskEntity[] {
    return this.SubTasks;
  }
  /** @deprecated Use {@link SubTasks}. */
  public set subTasks(value: MJTaskEntity[]) {
    this.SubTasks = value;
  }

  public SubTasksWithParent: MJTaskEntity[] = [];
  /** @deprecated Use {@link SubTasksWithParent}. */
  public get subTasksWithParent(): MJTaskEntity[] {
    return this.SubTasksWithParent;
  }
  /** @deprecated Use {@link SubTasksWithParent}. */
  public set subTasksWithParent(value: MJTaskEntity[]) {
    this.SubTasksWithParent = value;
  }

  public TaskDependencies: MJTaskDependencyEntity[] = [];
  /** @deprecated Use {@link TaskDependencies}. */
  public get taskDependencies(): MJTaskDependencyEntity[] {
    return this.TaskDependencies;
  }
  /** @deprecated Use {@link TaskDependencies}. */
  public set taskDependencies(value: MJTaskDependencyEntity[]) {
    this.TaskDependencies = value;
  }

  public AgentRunMap = new Map<string, string>();
  /** @deprecated Use {@link AgentRunMap}. */
  public get agentRunMap(): Map<string, string> {
    return this.AgentRunMap;
  }
  /** @deprecated Use {@link AgentRunMap}. */
  public set agentRunMap(value: Map<string, string>) {
    this.AgentRunMap = value;
  }

  public SelectedTask: MJTaskEntity | null = null;
  /** @deprecated Use {@link SelectedTask}. */
  public get selectedTask(): MJTaskEntity | null {
    return this.SelectedTask;
  }
  /** @deprecated Use {@link SelectedTask}. */
  public set selectedTask(value: MJTaskEntity | null) {
    this.SelectedTask = value;
  }

  public ShowDetailAnimation: boolean = false;
  /** @deprecated Use {@link ShowDetailAnimation}. */
  public get showDetailAnimation(): boolean {
    return this.ShowDetailAnimation;
  }
  /** @deprecated Use {@link ShowDetailAnimation}. */
  public set showDetailAnimation(value: boolean) {
    this.ShowDetailAnimation = value;
  }

  public isLoading: boolean = false;
  private aiEngineConfigured: boolean = false;

  // Command Center state
  public CommandViewMode: WorkflowCommandCenterViewMode = 'workflows';
  public StatusFilter: WorkflowStatusFilter = 'all';
  public SearchQuery: string = '';
  public SelectedAgentFilter: string = 'all';
  public WorkflowGroups: WorkflowGroupViewModel[] = [];
  public FilteredWorkflowGroups: WorkflowGroupViewModel[] = [];
  public AvailableAgents: Array<{ id: string; name: string; count: number }> = [];
  public InspectedGroup: WorkflowGroupViewModel | null = null;
  public InspectedStep: EnrichedWorkflowStep | null = null;
  public CopiedOutput: boolean = false;
  public Kpis: WorkflowCommandCenterKPIs = {
    TotalWorkflows: 0,
    TotalSteps: 0,
    ActiveWorkflows: 0,
    CompletedSteps: 0,
    SuccessRatePercent: 100,
    AvgExecutionTimeText: '—'
  };

  private allHierarchyTasks: MJTaskEntity[] = [];
  private streamSubscription: Subscription | null = null;
  private livePollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.LoadTasks();
    this.setupLiveTaskGraphSubscription();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const filterChanged = (key: string) => !!changes[key] && !changes[key].firstChange;
    if (filterChanged('baseFilter') || filterChanged('BaseFilter') || filterChanged('BaseFilterResolver')) {
      this.LoadTasks();
    }

    if ((changes['activeTaskId'] || changes['ActiveTaskId']) && this.ActiveTaskId) {
      this.selectTaskById(this.ActiveTaskId);
    }
  }

  ngOnDestroy(): void {
    if (this.streamSubscription) {
      this.streamSubscription.unsubscribe();
      this.streamSubscription = null;
    }
    this.stopLivePolling();
  }

  private setupLiveTaskGraphSubscription(): void {
    try {
      const runtime = ConversationsRuntime.Instance;
      if (runtime?.Streaming?.TaskGraphEvents$) {
        this.streamSubscription = runtime.Streaming.TaskGraphEvents$.subscribe(() => {
          void this.LoadTasks();
        });
      }
    } catch {
      // Safe no-op in isolated test contexts
    }
  }

  private updateLivePollingState(): void {
    const hasActive = this.WorkflowGroups.some(g => g.NormalizedCategory === 'active');
    if (hasActive && !this.livePollTimer) {
      this.livePollTimer = setInterval(() => {
        void this.LoadTasks();
      }, 4000);
    } else if (!hasActive && this.livePollTimer) {
      this.stopLivePolling();
    }
  }

  private stopLivePolling(): void {
    if (this.livePollTimer) {
      clearInterval(this.livePollTimer);
      this.livePollTimer = null;
    }
  }

  public async LoadTasks(): Promise<void> {
    this.isLoading = true;

    try {
      if (!this.aiEngineConfigured) {
        await AIEngineBase.Instance.Config(false);
        this.aiEngineConfigured = true;
      }

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const filter = this.BaseFilterResolver ? await this.BaseFilterResolver() : this.BaseFilter;

      const tasksResult = await rv.RunView<MJTaskEntity>(
        {
          EntityName: 'MJ: Tasks',
          ExtraFilter: filter,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 1000,
          ResultType: 'entity_object',
          BypassCache: true
        },
        this.CurrentUser
      );

      if (tasksResult.Success) {
        this.AllTasks = tasksResult.Results || [];
        this.FilteredTasks = this.AllTasks;
        await this.loadChildTasksAndDependencies(rv, this.AllTasks);
        this.rebuildWorkflowCommandCenter();
      } else {
        this.AllTasks = [];
        this.FilteredTasks = [];
        this.allHierarchyTasks = [];
        this.WorkflowGroups = [];
        this.FilteredWorkflowGroups = [];
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
      this.AllTasks = [];
      this.FilteredTasks = [];
      this.allHierarchyTasks = [];
      this.WorkflowGroups = [];
      this.FilteredWorkflowGroups = [];
    } finally {
      this.isLoading = false;
      this.updateLivePollingState();
      this.cdr?.markForCheck();
    }
  }

  /** @deprecated Use {@link LoadTasks}. */
  public async loadTasks(): Promise<void> {
    return this.LoadTasks();
  }

  /**
   * Ensures child step tasks and dependencies are loaded even when the primary filter
   * scopes to top-level (`ParentID IS NULL`) tasks.
   */
  private async loadChildTasksAndDependencies(rv: RunView, primaryTasks: MJTaskEntity[]): Promise<void> {
    const mergedMap = new Map<string, MJTaskEntity>();
    for (const t of primaryTasks) {
      if (t?.ID) {
        mergedMap.set(t.ID.toLowerCase(), t);
      }
    }

    const rootIds = Array.from(
      new Set(
        primaryTasks
          .map(t => t.RootParentID || t.ParentID || t.ID)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (rootIds.length > 0) {
      const quotedIds = rootIds.map(id => `'${EscapeSQLString(id)}'`).join(',');
      try {
        const childrenResult = await rv.RunView<MJTaskEntity>(
          {
            EntityName: 'MJ: Tasks',
            ExtraFilter: `ParentID IN (${quotedIds}) OR RootParentID IN (${quotedIds})`,
            OrderBy: '__mj_CreatedAt ASC',
            MaxRows: 1000,
            ResultType: 'entity_object',
            BypassCache: true
          },
          this.CurrentUser
        );
        if (childrenResult.Success && childrenResult.Results) {
          for (const child of childrenResult.Results) {
            if (child?.ID && !mergedMap.has(child.ID.toLowerCase())) {
              mergedMap.set(child.ID.toLowerCase(), child);
            }
          }
        }
      } catch {
        // Fallback to primaryTasks when running against minimal unit-test fake providers
      }

      const allTaskIds = Array.from(mergedMap.values())
        .map(t => t.ID)
        .filter((id): id is string => Boolean(id));
      if (allTaskIds.length > 0) {
        const quotedAllIds = allTaskIds.slice(0, 300).map(id => `'${EscapeSQLString(id)}'`).join(',');
        try {
          const depsResult = await rv.RunView<MJTaskDependencyEntity>(
            {
              EntityName: 'MJ: Task Dependencies',
              ExtraFilter: `TaskID IN (${quotedAllIds}) OR DependsOnTaskID IN (${quotedAllIds})`,
              ResultType: 'entity_object'
            },
            this.CurrentUser
          );
          if (depsResult.Success && depsResult.Results) {
            this.TaskDependencies = depsResult.Results;
          }
        } catch {
          // Optional dependency enrichment
        }
      }
    }

    this.allHierarchyTasks = Array.from(mergedMap.values());
    this.loadAgentRuns(this.allHierarchyTasks);
  }

  /**
   * Builds the hierarchy-aware `WorkflowGroups`, KPI metrics, and agent filter options.
   */
  private rebuildWorkflowCommandCenter(): void {
    const tasks = this.allHierarchyTasks.length > 0 ? this.allHierarchyTasks : this.AllTasks;
    const taskById = new Map<string, MJTaskEntity>();
    for (const t of tasks) {
      if (t?.ID) {
        taskById.set(t.ID.toLowerCase(), t);
      }
    }

    // Group tasks by root workflow ID
    const buckets = new Map<string, MJTaskEntity[]>();
    for (const t of tasks) {
      if (!t?.ID) continue;
      const rootKey = (t.RootParentID || t.ParentID || t.ID).toLowerCase();
      const list = buckets.get(rootKey) ?? [];
      list.push(t);
      buckets.set(rootKey, list);
    }

    const groups: WorkflowGroupViewModel[] = [];
    const agentUsageMap = new Map<string, { id: string; name: string; count: number }>();

    for (const [rootKey, bucket] of buckets.entries()) {
      const parentTask =
        bucket.find(t => t.ID.toLowerCase() === rootKey) ??
        bucket.find(t => !t.ParentID) ??
        bucket[0];
      const childSteps = bucket.filter(t => !UUIDsEqual(t.ID, parentTask.ID));
      const rawSteps = childSteps.length > 0 ? childSteps : [parentTask];

      // Sort steps chronologically by StartedAt / __mj_CreatedAt
      const sortedRawSteps = [...rawSteps].sort((a, b) => {
        const aTime = this.toEpochMs(a.StartedAt ?? a.__mj_CreatedAt);
        const bTime = this.toEpochMs(b.StartedAt ?? b.__mj_CreatedAt);
        return aTime - bTime;
      });

      // Calculate workflow time bounds
      const startCandidates = bucket
        .map(t => this.toEpochMs(t.StartedAt ?? t.__mj_CreatedAt))
        .filter(ms => ms > 0);
      const endCandidates = bucket
        .map(t => this.toEpochMs(t.CompletedAt ?? t.__mj_UpdatedAt))
        .filter(ms => ms > 0);
      const workflowStartMs = startCandidates.length > 0 ? Math.min(...startCandidates) : 0;
      const workflowEndMs = endCandidates.length > 0 ? Math.max(...endCandidates) : workflowStartMs;
      const totalSpanMs = Math.max(1000, workflowEndMs - workflowStartMs);

      const pipelineAgents: Array<{ id: string; name: string }> = [];
      const seenPipelineAgents = new Set<string>();

      const enrichedSteps: EnrichedWorkflowStep[] = sortedRawSteps.map((stepTask, idx) => {
        const agentName = this.resolveAgentName(stepTask);
        const agentId = stepTask.AgentID || null;
        if (agentId && agentName) {
          const lowerId = agentId.toLowerCase();
          if (!seenPipelineAgents.has(lowerId)) {
            seenPipelineAgents.add(lowerId);
            pipelineAgents.push({ id: agentId, name: agentName });
          }
          const existingUsage = agentUsageMap.get(lowerId);
          if (existingUsage) {
            existingUsage.count += 1;
          } else {
            agentUsageMap.set(lowerId, { id: agentId, name: agentName, count: 1 });
          }
        }

        const { instructions, output, isError } = this.splitTaskDescription(stepTask.Description || '');
        const stepStartMs = this.toEpochMs(stepTask.StartedAt ?? stepTask.__mj_CreatedAt) || workflowStartMs;
        const stepEndMs =
          this.toEpochMs(stepTask.CompletedAt) ||
          (stepTask.Status === 'In Progress' ? Date.now() : stepStartMs + 1000);
        const stepDurationMs = Math.max(0, stepEndMs - stepStartMs);

        const rawOffsetPct = workflowStartMs > 0
          ? ((stepStartMs - workflowStartMs) / totalSpanMs) * 100
          : idx * (80 / Math.max(1, sortedRawSteps.length));
        const offsetPct = Math.max(0, Math.min(86, Math.round(rawOffsetPct)));
        const rawWidthPct = (Math.max(1000, stepDurationMs) / totalSpanMs) * 100;
        const widthPct = Math.max(14, Math.min(100 - offsetPct, Math.round(rawWidthPct)));
        const startOffsetSec = Math.max(0, Math.round((stepStartMs - workflowStartMs) / 1000));

        // Resolve dependencies for this step
        const stepDeps = this.TaskDependencies.filter(d => UUIDsEqual(d.TaskID, stepTask.ID));
        const dependsOnNames: string[] = [];
        const dependsOnTaskIds: string[] = [];
        for (const dep of stepDeps) {
          if (dep.DependsOnTaskID) {
            dependsOnTaskIds.push(dep.DependsOnTaskID);
            const prereq = taskById.get(dep.DependsOnTaskID.toLowerCase());
            if (prereq?.Name) {
              dependsOnNames.push(prereq.Name);
            }
          }
        }

        const rawPreview = output || instructions || '';
        const cleanPreview = rawPreview.replace(/[#*`_~]/g, '').replace(/\s+/g, ' ').trim();

        return {
          Task: stepTask,
          StepNumber: idx + 1,
          AgentName: agentName,
          AgentID: agentId,
          AgentRunID: stepTask.AgentRunID || null,
          Instructions: instructions,
          Output: output,
          IsErrorOutput: isError,
          OutputPreview: cleanPreview.length > 180 ? `${cleanPreview.substring(0, 180)}...` : cleanPreview,
          DurationText: this.formatDurationMs(stepDurationMs, Boolean(stepTask.StartedAt)),
          DurationMs: stepDurationMs,
          TimelineOffsetPercent: offsetPct,
          TimelineWidthPercent: widthPct,
          StartOffsetLabel: `+${startOffsetSec}s`,
          DependsOnNames: dependsOnNames,
          DependsOnTaskIds: dependsOnTaskIds
        };
      });

      const totalSteps = enrichedSteps.length;
      const completedSteps = enrichedSteps.filter(s => s.Task.Status === 'Complete').length;
      const failedSteps = enrichedSteps.filter(
        s => s.Task.Status === 'Failed' || s.Task.Status === 'Cancelled' || s.Task.Status === 'Blocked'
      ).length;
      const activeSteps = enrichedSteps.filter(
        s => s.Task.Status === 'In Progress' || s.Task.Status === 'Pending'
      ).length;

      let category: 'active' | 'completed' | 'failed' = 'active';
      if (failedSteps > 0 || parentTask.Status === 'Failed' || parentTask.Status === 'Cancelled') {
        category = 'failed';
      } else if (completedSteps === totalSteps || parentTask.Status === 'Complete') {
        category = 'completed';
      }

      const percentComplete =
        category === 'completed'
          ? 100
          : totalSteps > 0
            ? Math.round((completedSteps / totalSteps) * 100)
            : parentTask.PercentComplete ?? 0;

      const { instructions: parentInstructions } = this.splitTaskDescription(parentTask.Description || '');
      const wfStartDate = parentTask.StartedAt ?? sortedRawSteps[0]?.StartedAt ?? parentTask.__mj_CreatedAt ?? null;
      const wfEndDate = parentTask.CompletedAt ?? sortedRawSteps[sortedRawSteps.length - 1]?.CompletedAt ?? null;
      const wfDurationMs =
        wfStartDate && wfEndDate
          ? Math.max(0, new Date(wfEndDate).getTime() - new Date(wfStartDate).getTime())
          : enrichedSteps.reduce((acc, s) => acc + s.DurationMs, 0);

      groups.push({
        RootTaskId: parentTask.ID,
        ParentTask: parentTask,
        Title: parentTask.Name || 'Agent Workflow',
        SummaryInstruction: parentInstructions,
        Status: parentTask.Status,
        NormalizedCategory: category,
        PercentComplete: percentComplete,
        TotalSteps: totalSteps,
        CompletedSteps: completedSteps,
        ActiveSteps: activeSteps,
        FailedSteps: failedSteps,
        Steps: enrichedSteps,
        AgentPipeline: pipelineAgents,
        StartedAt: wfStartDate ? new Date(wfStartDate) : null,
        CompletedAt: wfEndDate ? new Date(wfEndDate) : null,
        DurationText: this.formatDurationMs(wfDurationMs, wfDurationMs > 0),
        DurationMs: wfDurationMs,
        RelativeTimeText: this.formatRelativeTime(wfStartDate),
        ConversationDetailID: parentTask.ConversationDetailID || sortedRawSteps[0]?.ConversationDetailID || null,
        IsMultiStep: childSteps.length > 0
      });
    }

    // Sort workflows newest first
    groups.sort((a, b) => {
      const aMs = a.StartedAt ? a.StartedAt.getTime() : 0;
      const bMs = b.StartedAt ? b.StartedAt.getTime() : 0;
      return bMs - aMs;
    });

    this.WorkflowGroups = groups;
    this.AvailableAgents = Array.from(agentUsageMap.values()).sort((a, b) => b.count - a.count);
    this.computeCommandCenterKPIs(groups);
    this.applyWorkflowFilters();

    // Refresh open inspector drawer if active
    if (this.ActiveTaskId) {
      this.selectTaskById(this.ActiveTaskId, false);
    } else if (this.InspectedGroup) {
      const updatedGroup = groups.find(g => UUIDsEqual(g.RootTaskId, this.InspectedGroup!.RootTaskId)) ?? null;
      this.InspectedGroup = updatedGroup;
      if (updatedGroup && this.InspectedStep) {
        this.InspectedStep =
          updatedGroup.Steps.find(s => UUIDsEqual(s.Task.ID, this.InspectedStep!.Task.ID)) ??
          updatedGroup.Steps[0] ??
          null;
      }
    }
  }

  private computeCommandCenterKPIs(groups: WorkflowGroupViewModel[]): void {
    const totalWorkflows = groups.length;
    const totalSteps = groups.reduce((sum, g) => sum + g.TotalSteps, 0);
    const activeWorkflows = groups.filter(g => g.NormalizedCategory === 'active').length;
    const completedSteps = groups.reduce((sum, g) => sum + g.CompletedSteps, 0);
    const failedSteps = groups.reduce((sum, g) => sum + g.FailedSteps, 0);
    const terminalSteps = completedSteps + failedSteps;
    const successRate = terminalSteps > 0 ? Math.round((completedSteps / terminalSteps) * 100) : 100;

    const completedWithDuration = groups.filter(g => g.NormalizedCategory === 'completed' && g.DurationMs > 0);
    const avgMs =
      completedWithDuration.length > 0
        ? Math.round(completedWithDuration.reduce((sum, g) => sum + g.DurationMs, 0) / completedWithDuration.length)
        : 0;

    this.Kpis = {
      TotalWorkflows: totalWorkflows,
      TotalSteps: totalSteps,
      ActiveWorkflows: activeWorkflows,
      CompletedSteps: completedSteps,
      SuccessRatePercent: successRate,
      AvgExecutionTimeText: avgMs > 0 ? this.formatDurationMs(avgMs, true) : '—'
    };
  }

  public applyWorkflowFilters(): void {
    const q = this.SearchQuery.trim().toLowerCase();
    this.FilteredWorkflowGroups = this.WorkflowGroups.filter(group => {
      if (this.StatusFilter !== 'all' && group.NormalizedCategory !== this.StatusFilter) {
        return false;
      }
      if (this.SelectedAgentFilter !== 'all') {
        const matchesAgent = group.Steps.some(s => UUIDsEqual(s.AgentID, this.SelectedAgentFilter));
        if (!matchesAgent) return false;
      }
      if (q) {
        const titleMatch = group.Title.toLowerCase().includes(q);
        const stepMatch = group.Steps.some(
          s =>
            (s.Task.Name || '').toLowerCase().includes(q) ||
            s.Instructions.toLowerCase().includes(q) ||
            (s.Output || '').toLowerCase().includes(q) ||
            (s.AgentName || '').toLowerCase().includes(q)
        );
        return titleMatch || stepMatch;
      }
      return true;
    });
  }

  public SetCommandViewMode(mode: WorkflowCommandCenterViewMode): void {
    this.CommandViewMode = mode;
  }

  public SetStatusFilter(filter: WorkflowStatusFilter): void {
    this.StatusFilter = filter;
    this.applyWorkflowFilters();
  }

  public SetAgentFilter(agentId: string): void {
    this.SelectedAgentFilter = agentId;
    this.applyWorkflowFilters();
  }

  public OnFilterCriteriaChanged(): void {
    this.applyWorkflowFilters();
  }

  public ClearSearch(): void {
    this.SearchQuery = '';
    this.applyWorkflowFilters();
  }

  public ResetAllFilters(): void {
    this.SearchQuery = '';
    this.StatusFilter = 'all';
    this.SelectedAgentFilter = 'all';
    this.applyWorkflowFilters();
  }

  public CountByCategory(category: 'active' | 'completed' | 'failed'): number {
    return this.WorkflowGroups.filter(g => g.NormalizedCategory === category).length;
  }

  public GetStepCategory(status: MJTaskEntity['Status']): 'active' | 'completed' | 'failed' {
    if (status === 'Complete') return 'completed';
    if (status === 'Failed' || status === 'Cancelled' || status === 'Blocked') return 'failed';
    return 'active';
  }

  public IsGroupInspected(group: WorkflowGroupViewModel): boolean {
    return Boolean(this.InspectedGroup && UUIDsEqual(this.InspectedGroup.RootTaskId, group.RootTaskId));
  }

  public IsStepInspected(task: MJTaskEntity): boolean {
    return Boolean(this.InspectedStep && UUIDsEqual(this.InspectedStep.Task.ID, task.ID));
  }

  public InspectWorkflowGroup(
    group: WorkflowGroupViewModel,
    step?: EnrichedWorkflowStep,
    event?: MouseEvent
  ): void {
    event?.stopPropagation();
    this.InspectedGroup = group;
    this.InspectedStep = step ?? group.Steps[0] ?? null;
    this.SelectedTask = step ? step.Task : group.ParentTask;
    this.SubTasks = group.Steps.map(s => s.Task);
    this.SubTasksWithParent = [group.ParentTask, ...this.SubTasks];
    this.ShowDetailAnimation = true;
    this.TaskSelected.emit(this.SelectedTask.ID);
  }

  public SelectInspectorStep(step: EnrichedWorkflowStep): void {
    this.InspectedStep = step;
    this.SelectedTask = step.Task;
    this.TaskSelected.emit(step.Task.ID);
  }

  private selectTaskById(taskId: string, emitEvent: boolean = true): void {
    for (const group of this.WorkflowGroups) {
      if (UUIDsEqual(group.RootTaskId, taskId)) {
        this.InspectedGroup = group;
        this.InspectedStep = group.Steps[0] ?? null;
        this.SelectedTask = group.ParentTask;
        if (emitEvent) {
          this.TaskSelected.emit(taskId);
        }
        return;
      }
      const stepMatch = group.Steps.find(s => UUIDsEqual(s.Task.ID, taskId));
      if (stepMatch) {
        this.InspectedGroup = group;
        this.InspectedStep = stepMatch;
        this.SelectedTask = stepMatch.Task;
        if (emitEvent) {
          this.TaskSelected.emit(taskId);
        }
        return;
      }
    }
  }

  public async OnTaskClick(task: MJTaskEntity): Promise<void> {
    this.SelectedTask = task;
    this.ShowDetailAnimation = true;
    this.TaskSelected.emit(task.ID);
    this.selectTaskById(task.ID, false);
  }

  /** @deprecated Use {@link OnTaskClick}. */
  public async onTaskClick(task: MJTaskEntity): Promise<void> {
    return this.OnTaskClick(task);
  }

  public BackToTaskList(): void {
    this.InspectedGroup = null;
    this.InspectedStep = null;
    this.SelectedTask = null;
    this.SubTasks = [];
    this.SubTasksWithParent = [];
    this.ShowDetailAnimation = false;
    this.TaskSelected.emit(null);
  }

  /** @deprecated Use {@link BackToTaskList}. */
  public backToTaskList(): void {
    return this.BackToTaskList();
  }

  public OnSubTaskClick(subTask: MJTaskEntity): void {
    this.selectTaskById(subTask.ID, true);
  }

  /** @deprecated Use {@link OnSubTaskClick}. */
  public onSubTaskClick(subTask: MJTaskEntity): void {
    return this.OnSubTaskClick(subTask);
  }

  public OnAgentChipClicked(event: MouseEvent, agentId: string): void {
    event.stopPropagation();
    if (agentId) {
      this.OpenEntityRecord.emit({
        entityName: 'MJ: AI Agents',
        recordId: agentId
      });
    }
  }

  public OnOpenAgentRunClicked(event: MouseEvent, agentRunId: string): void {
    event.stopPropagation();
    if (agentRunId) {
      this.OpenEntityRecord.emit({
        entityName: 'MJ: AI Agent Runs',
        recordId: agentRunId
      });
    }
  }

  public OnOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    this.OpenEntityRecord.emit(event);
  }

  /** @deprecated Use {@link OnOpenEntityRecord}. */
  public onOpenEntityRecord(event: { entityName: string; recordId: string }): void {
    return this.OnOpenEntityRecord(event);
  }

  public CopyStepOutput(output: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(output);
      this.CopiedOutput = true;
      setTimeout(() => {
        this.CopiedOutput = false;
        this.cdr?.markForCheck();
      }, 1800);
    }
  }

  private loadAgentRuns(tasks: MJTaskEntity[]): void {
    this.AgentRunMap.clear();
    for (const task of tasks) {
      if (task?.ID && task.AgentRunID) {
        this.AgentRunMap.set(task.ID, task.AgentRunID);
      }
    }
  }

  private resolveAgentName(task: MJTaskEntity): string | null {
    if (task.Agent) {
      return task.Agent;
    }
    if (task.AgentID) {
      const agents = AIEngineBase.Instance.Agents || [];
      const found = agents.find((a: MJAIAgentEntityExtended) => UUIDsEqual(a.ID, task.AgentID));
      if (found?.Name) {
        return found.Name;
      }
    }
    return null;
  }

  private splitTaskDescription(raw: string): { instructions: string; output: string | null; isError: boolean } {
    const outputMarker = '\n\n--- Output ---\n';
    const errorMarker = '\n\n--- Error ---\n';
    const outIdx = raw.indexOf(outputMarker);
    if (outIdx >= 0) {
      return {
        instructions: raw.substring(0, outIdx).trim(),
        output: raw.substring(outIdx + outputMarker.length).trim(),
        isError: false
      };
    }
    const errIdx = raw.indexOf(errorMarker);
    if (errIdx >= 0) {
      return {
        instructions: raw.substring(0, errIdx).trim(),
        output: raw.substring(errIdx + errorMarker.length).trim(),
        isError: true
      };
    }
    return {
      instructions: raw.trim(),
      output: null,
      isError: false
    };
  }

  private toEpochMs(date: Date | string | null | undefined): number {
    if (!date) return 0;
    const ms = new Date(date).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  private formatDurationMs(durationMs: number, hasStarted: boolean): string {
    if (!hasStarted || durationMs <= 0) return '';
    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  private formatRelativeTime(date: Date | string | null | undefined): string {
    if (!date) return '';
    const ms = new Date(date).getTime();
    if (!Number.isFinite(ms)) return '';
    const diffSec = Math.round((Date.now() - ms) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  public FormatDateTime(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  public getDescription(): string {
    const activeCount = this.AllTasks.filter(t => t.Status === 'Pending' || t.Status === 'In Progress').length;
    const completedCount = this.AllTasks.filter(t => t.Status === 'Complete').length;
    return `${activeCount} active, ${completedCount} completed, ${this.AllTasks.length} total`;
  }

  public GetTaskDetailDescription(): string {
    if (this.SubTasks.length === 0) {
      return 'No sub-tasks';
    }
    const activeCount = this.SubTasks.filter(t => t.Status === 'Pending' || t.Status === 'In Progress').length;
    const completedCount = this.SubTasks.filter(t => t.Status === 'Complete').length;
    return `${activeCount} active, ${completedCount} completed, ${this.SubTasks.length} sub-tasks`;
  }

  /** @deprecated Use {@link GetTaskDetailDescription}. */
  public getTaskDetailDescription(): string {
    return this.GetTaskDetailDescription();
  }
}
