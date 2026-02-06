import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { map, takeUntil, debounceTime } from 'rxjs/operators';
import {
  AIInstrumentationService,
  DashboardKPIs,
  TrendData,
  LiveExecution,
  ChartData,
  ExecutionDetails
} from '../services/ai-instrumentation.service';
import { DataPointClickEvent } from './charts/time-series-chart.component';
import { KPICardData } from './widgets/kpi-card.component';
import { HeatmapData } from './charts/performance-heatmap.component';
import { RunView, CompositeKey } from '@memberjunction/core';
import { ResourceData } from "@memberjunction/core-entities";
import { AIPromptRunEntityExtended, AIAgentRunEntityExtended, AIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';

export interface DrillDownTab {
  id: string;
  title: string;
  type: 'chart' | 'executions' | 'model-detail';
  data?: any;
  timestamp?: Date;
  metric?: string;
  closeable: boolean;
}

export interface ExecutionRecord {
  id: string;
  type: 'prompt' | 'agent';
  name: string;
  model?: string;
  status: string;
  startTime: Date;
  endTime?: Date;
  duration: number;
  cost: number;
  tokens: number;
  errorMessage?: string;
}

export interface ExecutionMonitoringState {
  selectedTimeRange: string;
  refreshInterval: number;
  panelStates: {
    cost: boolean;
    efficiency: boolean;
    executions: boolean;
  };
  drillDownTabs: Array<{
    id: string;
    title: string;
    type: string;
    timestamp?: string;
    metric?: string;
  }>;
  activeTabId: string;
  splitterSizes?: number[];
}

/**
 * Tree-shaking prevention function - ensures component is included in builds
 */
export function LoadAIMonitorResource() {
  // Force inclusion in production builds
}

/**
 * AI Monitor Resource - displays AI execution monitoring and analytics
 * Extends BaseResourceComponent to work with the resource type system
 */
@RegisterClass(BaseResourceComponent, 'AIMonitorResource')
@Component({
  standalone: false,
  selector: 'app-execution-monitoring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="execution-monitoring" [class.loading]="isLoading">
      <!-- Loading Overlay -->
      @if (isLoading) {
        <div class="loading-overlay">
          <mj-loading text="Loading dashboard data..." size="large"></mj-loading>
        </div>
      }
      <!-- Header Controls -->
      <div class="monitoring-header">
        <h2 class="monitoring-title">
          <i class="fa-solid fa-chart-line"></i>
          AI Execution Monitoring
        </h2>
        
        <div class="monitoring-controls">
          <div class="time-range-control">
            <label>Time Range:</label>
            <select [(ngModel)]="selectedTimeRange" (change)="onTimeRangeChange()" [disabled]="isLoading">
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
          
          <button class="refresh-btn" (click)="refreshData()" [disabled]="isLoading">
            <i class="fa-solid fa-refresh" [class.spinning]="isLoading"></i>
            Refresh
          </button>
        </div>
      </div>

      <!-- KPI Dashboard -->
      <div class="kpi-dashboard">
        <div class="kpi-grid">
          @for (kpi of kpiCards$ | async; track kpi.title) {
            <app-kpi-card 
              [data]="kpi"
              (click)="onKpiClick(kpi)"
              [class.clickable]="isKpiClickable(kpi)"
            ></app-kpi-card>
          }
        </div>
      </div>

      <!-- Main Dashboard with Kendo Splitter -->
      <kendo-splitter class="dashboard-splitter" orientation="vertical" (layoutChange)="onSplitterLayoutChange($event)">
        <!-- Top Row: System Health and Trends Chart -->
        <kendo-splitter-pane size="45%" [resizable]="true" [collapsible]="false">
          <kendo-splitter orientation="horizontal" (layoutChange)="onSplitterLayoutChange($event)">
            <!-- System Health -->
            <kendo-splitter-pane size="30%" [resizable]="true" [collapsible]="true" [collapsed]="false">
              <div class="dashboard-section system-status">
                <div class="status-container">
                  <div class="chart-header">
                    <h4 class="chart-title">
                      <i class="fa-solid fa-heartbeat"></i>
                      System Health
                    </h4>
                  </div>
                  @if (kpis$ | async; as kpis) {
                    <div class="status-metrics">
                      <div class="status-metric">
                        <div class="status-icon status-icon--success">
                          <i class="fa-solid fa-check"></i>
                        </div>
                        <div class="status-info">
                          <div class="status-label">Success Rate</div>
                          <div class="status-value">{{ (kpis.successRate * 100).toFixed(1) }}%</div>
                          <div class="status-subtitle">Last {{ selectedTimeRange }}</div>
                        </div>
                      </div>
                      
                      <div class="status-metric">
                        <div class="status-icon status-icon--warning">
                          <i class="fa-solid fa-exclamation-triangle"></i>
                        </div>
                        <div class="status-info">
                          <div class="status-label">Error Rate</div>
                          <div class="status-value">{{ (kpis.errorRate * 100).toFixed(1) }}%</div>
                          <div class="status-subtitle">{{ kpis.totalExecutions }} total executions</div>
                        </div>
                      </div>
                      
                      <div class="status-metric">
                        <div class="status-icon status-icon--info">
                          <i class="fa-solid fa-clock"></i>
                        </div>
                        <div class="status-info">
                          <div class="status-label">Avg Response Time</div>
                          <div class="status-value">{{ (kpis.avgExecutionTime / 1000).toFixed(2) }}s</div>
                          <div class="status-subtitle">Across all models</div>
                        </div>
                      </div>
                      
                      <div class="status-metric">
                        <div class="status-icon status-icon--primary">
                          <i class="fa-solid fa-bolt"></i>
                        </div>
                        <div class="status-info">
                          <div class="status-label">Active Executions</div>
                          <div class="status-value">{{ kpis.activeExecutions }}</div>
                          <div class="status-subtitle">Currently running</div>
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </kendo-splitter-pane>
            
            <!-- Drill-down Tab Container -->
            <kendo-splitter-pane [resizable]="true" [collapsible]="false">
              <div class="dashboard-section drill-down-container">
                <div class="drill-down-tabs">
                  <div class="tab-header">
                    @for (tab of drillDownTabs; track tab.id) {
                      <div 
                        class="tab-item"
                        [class.active]="activeTabId === tab.id"
                        (click)="selectTab(tab.id)"
                      >
                        <span class="tab-title">{{ tab.title }}</span>
                        @if (tab.closeable) {
                          <button 
                            class="tab-close"
                            (click)="closeTab($event, tab.id)"
                            title="Close tab"
                          >
                            <i class="fa-solid fa-times"></i>
                          </button>
                        }
                      </div>
                    }
                  </div>
                  
                  <div class="tab-content">
                    @if (activeTab?.type === 'chart') {
                      <div class="tab-pane trends-chart">
                        <app-time-series-chart
                          [data]="(trends$ | async) ?? []"
                          title="Execution Trends"
                          [config]="timeSeriesConfig"
                          (dataPointClick)="onDataPointClick($event)"
                          (timeRangeChange)="onChartTimeRangeChange($event)"
                        ></app-time-series-chart>
                      </div>
                    }
                    
                    @if (activeTab?.type === 'executions') {
                      <div class="tab-pane executions-drill-down">
                        <div class="drill-down-header">
                          <h4>
                            <i class="fa-solid fa-list"></i>
                            {{ activeTab?.title }}
                          </h4>
                          <div class="drill-down-meta">
                            @if (activeTab?.timestamp) {
                              <span class="timestamp">{{ getFormattedTimestamp(activeTab) }}</span>
                            }
                            @if (activeTab?.metric) {
                              <span class="metric-badge">{{ getFormattedMetricLabel(activeTab) }}</span>
                            }
                          </div>
                        </div>
                        
                        @if (loadingDrillDown) {
                          <div class="loading-spinner">
                            <mj-loading text="Loading execution details..." size="small"></mj-loading>
                          </div>
                        } @else if (activeTab?.data?.length > 0) {
                          <div class="executions-table">
                            <div class="table-header">
                              <div class="header-cell">Type</div>
                              <div class="header-cell">Name</div>
                              <div class="header-cell">Model</div>
                              <div class="header-cell">Status</div>
                              <div class="header-cell">Duration</div>
                              <div class="header-cell">Cost</div>
                              <div class="header-cell">Tokens</div>
                              <div class="header-cell">Time</div>
                            </div>
                            @for (execution of activeTab?.data; track execution.id) {
                              <div 
                                class="table-row"
                                (click)="viewExecutionDetail(execution)"
                              >
                                <div class="table-cell">
                                  <span class="type-badge" [class]="'type-badge--' + execution.type">
                                    {{ execution.type }}
                                  </span>
                                </div>
                                <div class="table-cell">{{ execution.name }}</div>
                                <div class="table-cell">{{ execution.model || 'N/A' }}</div>
                                <div class="table-cell">
                                  <span class="status-badge" [class]="'status-badge--' + execution.status">
                                    {{ execution.status }}
                                  </span>
                                </div>
                                <div class="table-cell">{{ formatDuration(execution.duration) }}</div>
                                <div class="table-cell">{{ formatCurrency(execution.cost) }}</div>
                                <div class="table-cell">{{ execution.tokens.toLocaleString() }}</div>
                                <div class="table-cell">{{ formatTime(execution.startTime) }}</div>
                              </div>
                            }
                          </div>
                        } @else {
                          <div class="no-data">
                            <i class="fa-solid fa-inbox"></i>
                            <p>No executions found for this time period</p>
                          </div>
                        }
                      </div>
                    }
                    
                    @if (activeTab?.type === 'model-detail') {
                      <div class="tab-pane model-detail">
                        <div class="drill-down-header">
                          <h4>
                            <i class="fa-solid fa-microchip"></i>
                            Model Details: {{ activeTab?.data?.name }}
                          </h4>
                        </div>
                        
                        @if (loadingDrillDown) {
                          <div class="loading-spinner">
                            <mj-loading text="Loading model details..." size="small"></mj-loading>
                          </div>
                        } @else if (activeTab?.data) {
                          <div class="model-details">
                            <div class="model-info-grid">
                              <div class="info-item">
                                <label>Model Name:</label>
                                <span>{{ activeTab?.data?.name }}</span>
                              </div>
                              <div class="info-item">
                                <label>Vendor:</label>
                                <span>{{ activeTab?.data?.vendor }}</span>
                              </div>
                              <div class="info-item">
                                <label>API Name:</label>
                                <span>{{ activeTab?.data?.apiName }}</span>
                              </div>
                              <div class="info-item">
                                <label>Input Cost:</label>
                                <span>\${{ activeTab?.data?.inputTokenCost?.toFixed(6) || '0' }} per token</span>
                              </div>
                              <div class="info-item">
                                <label>Output Cost:</label>
                                <span>\${{ activeTab?.data?.outputTokenCost?.toFixed(6) || '0' }} per token</span>
                              </div>
                              <div class="info-item">
                                <label>Active:</label>
                                <span class="status-indicator" [class.active]="activeTab?.data?.isActive">
                                  {{ activeTab?.data?.isActive ? 'Yes' : 'No' }}
                                </span>
                              </div>
                            </div>
                            
                            @if (activeTab?.data?.description) {
                              <div class="model-description">
                                <h5>Description</h5>
                                <p>{{ activeTab?.data?.description }}</p>
                              </div>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                </div>
              </div>
            </kendo-splitter-pane>
          </kendo-splitter>
        </kendo-splitter-pane>

        <!-- Bottom Row: Analysis Panels with Expansion Layout -->
        <kendo-splitter-pane [resizable]="true" [collapsible]="false">
          <kendo-splitter orientation="horizontal" (layoutChange)="onSplitterLayoutChange($event)">
            <!-- Left: Performance Heatmap -->
            <kendo-splitter-pane size="50%" [resizable]="true" [collapsible]="false">
              <div class="dashboard-section performance-matrix">
                <app-performance-heatmap
                  [data]="(performanceMatrix$ | async) ?? []"
                  title="Agent vs Model Performance"
                  [config]="heatmapConfig"
                ></app-performance-heatmap>
              </div>
            </kendo-splitter-pane>

            <!-- Right: Analysis Panels with Collapsible Sections -->
            <kendo-splitter-pane [resizable]="true" [collapsible]="false">
              <div class="dashboard-section analysis-panels">
                
                <!-- Cost Analysis Panel -->
                <div class="analysis-panel">
                  <div class="panel-header" (click)="togglePanel('cost')">
                    <span class="panel-title">
                      <i class="fa-solid fa-dollar-sign"></i>
                      Cost Analysis
                    </span>
                    <i class="fa-solid panel-toggle-icon" [class.fa-chevron-down]="!panelStates.cost" [class.fa-chevron-up]="panelStates.cost"></i>
                  </div>
                  @if (panelStates.cost) {
                    <div class="panel-content">
                      @if (costData$ | async; as costData) {
                        <div class="cost-bars">
                          @for (item of costData.slice(0, 8); track item.model) {
                            <div class="cost-bar-item">
                              <div class="cost-bar-info">
                                <span class="model-name">{{ item.model }}</span>
                                <span class="cost-value">{{ formatCurrency(item.cost) }}</span>
                              </div>
                              <div class="cost-bar-container">
                                <div 
                                  class="cost-bar"
                                  [style.width.%]="getCostBarWidth(item.cost, getMaxCost(costData))"
                                ></div>
                              </div>
                              <div class="token-info">
                                {{ formatTokens(item.tokens) }} tokens
                              </div>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Token Efficiency Panel -->
                <div class="analysis-panel">
                  <div class="panel-header" (click)="togglePanel('efficiency')">
                    <span class="panel-title">
                      <i class="fa-solid fa-chart-pie"></i>
                      Token Efficiency
                    </span>
                    <i class="fa-solid panel-toggle-icon" [class.fa-chevron-down]="!panelStates.efficiency" [class.fa-chevron-up]="panelStates.efficiency"></i>
                  </div>
                  @if (panelStates.efficiency) {
                    <div class="panel-content">
                      @if (tokenEfficiency$ | async; as efficiencyData) {
                        <div class="efficiency-items">
                          @for (item of efficiencyData.slice(0, 6); track item.model) {
                            <div class="efficiency-item">
                              <div class="efficiency-header">
                                <span class="model-name">{{ item.model }}</span>
                                <span class="efficiency-ratio">
                                  {{ getTokenRatio(item.inputTokens, item.outputTokens) }}
                                </span>
                              </div>
                              <div class="token-breakdown">
                                <div class="token-bar">
                                  <div 
                                    class="token-segment token-segment--input"
                                    [style.width.%]="getTokenPercentage(item.inputTokens, item.inputTokens + item.outputTokens)"
                                  ></div>
                                  <div 
                                    class="token-segment token-segment--output"
                                    [style.width.%]="getTokenPercentage(item.outputTokens, item.inputTokens + item.outputTokens)"
                                  ></div>
                                </div>
                                <div class="token-labels">
                                  <span class="input-label">Input: {{ formatTokens(item.inputTokens) }}</span>
                                  <span class="output-label">Output: {{ formatTokens(item.outputTokens) }}</span>
                                </div>
                              </div>
                              <div class="cost-per-token">
                                {{ formatCostPerToken(item.cost, item.inputTokens + item.outputTokens) }}
                              </div>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Live Executions Panel -->
                <div class="analysis-panel">
                  <div class="panel-header" (click)="togglePanel('executions')">
                    <span class="panel-title">
                      <i class="fa-solid fa-bolt"></i>
                      Live Executions
                    </span>
                    <i class="fa-solid panel-toggle-icon" [class.fa-chevron-down]="!panelStates.executions" [class.fa-chevron-up]="panelStates.executions"></i>
                  </div>
                  @if (panelStates.executions) {
                    <div class="panel-content live-executions-panel">
                      <app-live-execution-widget
                        [executions]="(liveExecutions$ | async) ?? []"
                        (executionClick)="onExecutionClick($event)"
                      ></app-live-execution-widget>
                    </div>
                  }
                </div>
              </div>
            </kendo-splitter-pane>
          </kendo-splitter>
        </kendo-splitter-pane>
      </kendo-splitter>

      <!-- Execution Details Modal -->
      @if (selectedExecution) {
        <div class="execution-modal" (click)="closeExecutionModal()">
        <div class="execution-modal-content" (click)="$event.stopPropagation()">
          <div class="execution-modal-header">
            <h3>Execution Details</h3>
            <div class="modal-header-actions">
              <button class="open-record-btn" (click)="openFullRecord()">
                <i class="fa-solid fa-external-link-alt"></i>
                Open
              </button>
              <button class="close-btn" (click)="closeExecutionModal()">
                <i class="fa-solid fa-times"></i>
              </button>
            </div>
          </div>
          <div class="execution-modal-body">
            @if (executionDetails) {
              <div class="execution-details">
              <div class="detail-section">
                <h4>Basic Information</h4>
                <div class="detail-grid">
                  <div class="detail-item">
                    <label>Type:</label>
                    <span>{{ executionDetails.type | titlecase }}</span>
                  </div>
                  <div class="detail-item">
                    <label>Name:</label>
                    <span>{{ executionDetails.name }}</span>
                  </div>
                  <div class="detail-item">
                    <label>Status:</label>
                    <span class="status-badge" [class]="'status-badge--' + executionDetails.status">
                      {{ executionDetails.status | titlecase }}
                    </span>
                  </div>
                  <div class="detail-item">
                    <label>Started:</label>
                    <span>{{ executionDetails.startTime | date:'medium' }}</span>
                  </div>
                  @if (executionDetails.endTime) {
                    <div class="detail-item">
                      <label>Completed:</label>
                      <span>{{ executionDetails.endTime | date:'medium' }}</span>
                    </div>
                  }
                  <div class="detail-item">
                    <label>Duration:</label>
                    <span>{{ formatDuration(getDuration(executionDetails)) }}</span>
                  </div>
                </div>
              </div>
              
              <div class="detail-section">
                <h4>Resource Usage</h4>
                <div class="detail-grid">
                  <div class="detail-item">
                    <label>Cost:</label>
                    <span>{{ formatCurrency(executionDetails.cost, 6) }}</span>
                  </div>
                  <div class="detail-item">
                    <label>Tokens:</label>
                    <span>{{ executionDetails.tokens.toLocaleString() }}</span>
                  </div>
                  @if (executionDetails.model) {
                    <div class="detail-item">
                      <label>Model:</label>
                      <span>{{ executionDetails.model }}</span>
                    </div>
                  }
                </div>
              </div>
              
              @if (executionDetails.errorMessage) {
                <div class="detail-section">
                  <h4>Error Information</h4>
                  <div class="error-message">{{ executionDetails.errorMessage }}</div>
                </div>
              }
              
              @if (executionDetails.children.length > 0) {
                <div class="detail-section">
                  <h4>Child Executions ({{ executionDetails.children.length }})</h4>
                  <div class="child-executions">
                    @for (child of executionDetails.children; track child.id) {
                      <div class="child-execution">
                    <div class="child-info">
                      <span class="child-name">{{ child.name }}</span>
                      <span class="child-type">{{ child.type }}</span>
                      <span class="child-status" [class]="'status-badge--' + child.status">
                        {{ child.status }}
                      </span>
                    </div>
                    <div class="child-metrics">
                        <span>{{ formatCurrency(child.cost) }}</span>
                        <span>{{ child.tokens.toLocaleString() }} tokens</span>
                      </div>
                      </div>
                    }
                  </div>
                </div>
              }
              </div>
            }
            
            @if (loadingExecutionDetails) {
              <div class="loading-details">
                <mj-loading text="Loading execution details..." size="medium"></mj-loading>
              </div>
            }
          </div>
        </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .execution-monitoring {
      padding: 0;
      background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ed 100%);
      width: 100%;
      height: 100%;
      position: relative;
      overflow: auto;
      display: flex;
      flex-direction: column;
    }

    .execution-monitoring.loading {
      overflow: hidden;
    }

    /* Loading Overlay */
    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.7);
      z-index: 999;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }

    /* === Dashboard Header - Clean White Style === */
    .monitoring-header {
      background: white;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      border-bottom: 1px solid #e0e6ed;
      position: relative;
      z-index: 10;
    }

    .monitoring-title {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .monitoring-title i {
      color: #6366f1;
      font-size: 22px;
    }

    .monitoring-controls {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    .time-range-control {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .time-range-control label {
      color: #64748b;
      font-weight: 500;
    }

    .time-range-control select {
      padding: 8px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 13px;
      background: #f8fafc;
      color: #1e293b;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .time-range-control select:hover:not(:disabled) {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .time-range-control select:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .time-range-control select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .time-range-control select option {
      background: white;
      color: #1e293b;
    }

    .refresh-btn {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
    }

    .refresh-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
    }

    .refresh-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .refresh-btn i.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .kpi-dashboard {
      padding: 20px;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }

    .dashboard-splitter {
      flex: 1;
      min-height: 500px;
      margin: 0 20px 20px 20px;
    }

    .dashboard-section {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.08);
      overflow: hidden;
      height: 100%;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(99, 102, 241, 0.08);
      transition: box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .dashboard-section:hover {
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.12);
    }

    /* Ensure splitter panes take full height */
    :host ::ng-deep .k-splitter-pane {
      overflow: hidden;
    }

    :host ::ng-deep .k-splitter .k-splitter-pane {
      padding: 10px;
    }

    :host ::ng-deep .k-splitter-horizontal > .k-splitter-pane {
      padding: 10px 5px;
    }

    :host ::ng-deep .k-splitter-vertical > .k-splitter-pane {
      padding: 5px 10px;
    }

    /* Cost Analysis Styles */
    .cost-chart-container, .efficiency-chart-container, .status-container {
      padding: 20px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .chart-header {
      margin-bottom: 16px;
    }

    .chart-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chart-title i {
      color: #6366f1;
    }

    .cost-bars, .efficiency-items {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .cost-bar-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .cost-bar-item:last-child {
      border-bottom: none;
    }

    .cost-bar-info {
      min-width: 120px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .model-name {
      font-size: 12px;
      font-weight: 500;
      color: #333;
    }

    .cost-value {
      font-size: 11px;
      color: #8b5cf6;
      font-weight: 600;
    }

    .cost-bar-container {
      flex: 1;
      height: 8px;
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
      border-radius: 4px;
      overflow: hidden;
    }

    .cost-bar {
      height: 100%;
      background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%);
      border-radius: 4px;
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .token-info {
      font-size: 10px;
      color: #666;
      min-width: 80px;
      text-align: right;
    }

    /* Token Efficiency Styles */
    .efficiency-item {
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .efficiency-item:last-child {
      border-bottom: none;
    }

    .efficiency-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .efficiency-ratio {
      font-size: 11px;
      color: #6366f1;
      font-weight: 600;
    }

    .token-breakdown {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .token-bar {
      height: 8px;
      background: rgba(99, 102, 241, 0.1);
      border-radius: 4px;
      overflow: hidden;
      display: flex;
    }

    .token-segment {
      height: 100%;
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .token-segment--input {
      background: linear-gradient(90deg, #6366f1 0%, #818cf8 100%);
    }

    .token-segment--output {
      background: linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%);
    }

    .token-labels {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #666;
    }

    .input-label {
      color: #6366f1;
      font-weight: 500;
    }

    .output-label {
      color: #8b5cf6;
      font-weight: 500;
    }

    .cost-per-token {
      font-size: 10px;
      color: #999;
      margin-top: 4px;
    }

    /* System Status Styles */
    .status-metrics {
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
    }

    .status-metric {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 6px;
    }

    .status-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .status-icon--success {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%);
      color: #10b981;
    }

    .status-icon--warning {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.15) 100%);
      color: #f59e0b;
    }

    .status-icon--info {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
      color: #6366f1;
    }

    .status-icon--primary {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(167, 139, 250, 0.15) 100%);
      color: #8b5cf6;
    }

    .status-info {
      flex: 1;
    }

    .status-label {
      font-size: 12px;
      color: #666;
      font-weight: 500;
    }

    .status-value {
      font-size: 18px;
      font-weight: 700;
      color: #333;
      margin: 2px 0;
    }

    .status-subtitle {
      font-size: 10px;
      color: #999;
    }

    /* Execution Modal Styles */
    .execution-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    }

    .execution-modal-content {
      background: white;
      border-radius: 8px;
      max-width: 800px;
      width: 100%;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .execution-modal-header {
      padding: 20px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .execution-modal-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }

    .modal-header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .open-record-btn {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
    }

    .open-record-btn:hover {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
    }

    .open-record-btn i {
      font-size: 12px;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 16px;
      color: #999;
      cursor: pointer;
      padding: 4px;
    }

    .close-btn:hover {
      color: #333;
    }

    .execution-modal-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }

    .execution-details {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .detail-section h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
      border-bottom: 1px solid #f0f0f0;
      padding-bottom: 6px;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .detail-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .detail-item label {
      font-size: 11px;
      color: #666;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .detail-item span {
      font-size: 13px;
      color: #333;
    }

    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .status-badge--completed {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%);
      color: #10b981;
    }

    .status-badge--running {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
      color: #6366f1;
    }

    .status-badge--failed {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.15) 100%);
      color: #ef4444;
    }

    .error-message {
      background: #fff3e0;
      border: 1px solid #ffcc02;
      border-radius: 4px;
      padding: 12px;
      font-size: 12px;
      color: #e65100;
      font-family: monospace;
    }

    .child-executions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .child-execution {
      background: #f8f9fa;
      border-radius: 4px;
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .child-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .child-name {
      font-size: 12px;
      font-weight: 500;
      color: #333;
    }

    .child-type {
      font-size: 10px;
      background: #e0e0e0;
      padding: 2px 6px;
      border-radius: 3px;
      color: #666;
    }

    .child-status {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .child-metrics {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: #666;
    }

    .loading-details {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      gap: 12px;
    }

    /* Drill-down Tab Styles */
    .drill-down-container {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .drill-down-tabs {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .tab-header {
      display: flex;
      border-bottom: 1px solid rgba(99, 102, 241, 0.1);
      background: linear-gradient(180deg, #f8f9ff 0%, #f3f4f6 100%);
      min-height: 44px;
      overflow-x: auto;
    }

    .tab-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: #64748b;
      white-space: nowrap;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      min-width: 120px;
      justify-content: space-between;
    }

    .tab-item:hover {
      background: rgba(99, 102, 241, 0.05);
      color: #6366f1;
    }

    .tab-item.active {
      background: white;
      color: #6366f1;
      border-bottom-color: #6366f1;
      font-weight: 600;
    }

    .tab-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tab-close {
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
      padding: 2px;
      border-radius: 2px;
      font-size: 10px;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .tab-close:hover {
      background: rgba(0, 0, 0, 0.1);
      color: #333;
    }

    .tab-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .tab-pane {
      height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .trends-chart {
      padding: 0;
    }

    .trends-chart app-time-series-chart {
      height: 100%;
      display: block;
      overflow: hidden;
    }

    /* Ensure chart fits within tab pane */
    .tab-pane.trends-chart {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Drill-down specific styles */
    .executions-drill-down {
      padding: 20px;
      overflow-y: auto;
    }

    .drill-down-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e0e0e0;
    }

    .drill-down-header h4 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .drill-down-meta {
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 12px;
    }

    .timestamp {
      color: #666;
      background: #f0f0f0;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .metric-badge {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 600;
      box-shadow: 0 2px 4px rgba(99, 102, 241, 0.25);
    }

    .loading-spinner {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: #666;
      gap: 12px;
    }

    .executions-table {
      display: flex;
      flex-direction: column;
      gap: 0;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      overflow: hidden;
    }

    .table-header {
      display: grid;
      grid-template-columns: 80px 1fr 120px 100px 100px 80px 100px 120px;
      gap: 12px;
      background: #f8f9fa;
      padding: 12px 16px;
      font-size: 11px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .table-row {
      display: grid;
      grid-template-columns: 80px 1fr 120px 100px 100px 80px 100px 120px;
      gap: 12px;
      padding: 12px 16px;
      border-top: 1px solid #f0f0f0;
      cursor: pointer;
      transition: background 0.2s ease;
      align-items: center;
    }

    .table-row:hover {
      background: #f8f9fa;
    }

    .table-cell {
      font-size: 12px;
      color: #333;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .type-badge {
      background: linear-gradient(135deg, rgba(100, 116, 139, 0.1) 0%, rgba(71, 85, 105, 0.1) 100%);
      color: #64748b;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .type-badge--prompt {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
      color: #6366f1;
    }

    .type-badge--agent {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%);
      color: #10b981;
    }

    .no-data {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      color: #999;
      gap: 16px;
    }

    .no-data i {
      font-size: 48px;
      color: #ddd;
    }

    .no-data p {
      margin: 0;
      font-size: 14px;
    }

    /* Model detail styles */
    .model-detail {
      padding: 20px;
      overflow-y: auto;
    }

    .model-details {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .model-info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 6px;
    }

    .info-item label {
      font-size: 11px;
      color: #666;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0;
    }

    .info-item span {
      font-size: 14px;
      color: #333;
      font-weight: 500;
    }

    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
    }

    .status-indicator.active {
      color: #4caf50;
    }

    .status-indicator.active::before {
      content: '';
      width: 6px;
      height: 6px;
      background: #4caf50;
      border-radius: 50%;
    }

    .model-description {
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .model-description h5 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .model-description p {
      margin: 0;
      font-size: 13px;
      color: #666;
      line-height: 1.5;
    }

    /* Clickable KPI cards */
    .clickable {
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .clickable:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    /* Collapsible Panel Styles */
    .analysis-panels {
      padding: 12px;
      height: 100%;
      overflow-y: auto;
      background: linear-gradient(180deg, #f8f9ff 0%, #f3f4f6 100%);
    }

    .analysis-panel {
      margin-bottom: 12px;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
      background: white;
      overflow: hidden;
      border: 1px solid rgba(99, 102, 241, 0.08);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .analysis-panel:hover {
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.12);
    }

    .analysis-panel:last-child {
      margin-bottom: 0;
    }

    .panel-header {
      padding: 14px 18px;
      background: linear-gradient(180deg, #fafbff 0%, #f8f9fc 100%);
      border-bottom: 1px solid rgba(99, 102, 241, 0.08);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .panel-header:hover {
      background: linear-gradient(180deg, #f0f1ff 0%, #e8e9ff 100%);
    }

    .panel-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      color: #1e293b;
      font-size: 14px;
    }

    .panel-title i {
      color: #6366f1;
      width: 18px;
    }

    .panel-toggle-icon {
      color: #6366f1;
      font-size: 12px;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .panel-content {
      padding: 18px;
      border-top: 1px solid rgba(99, 102, 241, 0.05);
      animation: slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        max-height: 0;
      }
      to {
        opacity: 1;
        max-height: 500px;
      }
    }

    .live-executions-panel {
      padding: 0;
    }

    .live-executions-panel app-live-execution-widget {
      height: 300px;
      display: block;
    }

    /* Responsive Design */
    @media (max-width: 1200px) {
      .dashboard-splitter {
        min-height: 400px;
      }
      
      .table-header,
      .table-row {
        grid-template-columns: 60px 1fr 100px 80px 80px 60px 80px 100px;
        gap: 8px;
      }
      
      .model-info-grid {
        grid-template-columns: 1fr;
      }
      
      .analysis-panels {
        padding: 8px;
      }
      
      .analysis-panel {
        margin-bottom: 8px;
      }
    }

    @media (max-width: 768px) {
      .execution-monitoring {
        padding: 12px;
      }
      
      .monitoring-header {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .monitoring-controls {
        width: 100%;
        justify-content: flex-start;
      }
      
      .dashboard-splitter {
        min-height: 350px;
      }
      
      .kpi-grid {
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      }

      /* Reduce padding on smaller screens */
      :host ::ng-deep .k-splitter .k-splitter-pane {
        padding: 5px;
      }

      :host ::ng-deep .k-splitter-horizontal > .k-splitter-pane {
        padding: 5px 2px;
      }

      :host ::ng-deep .k-splitter-vertical > .k-splitter-pane {
        padding: 2px 5px;
      }
      
      .tab-header {
        overflow-x: auto;
      }
      
      .tab-item {
        min-width: 100px;
        padding: 6px 12px;
      }
      
      .table-header,
      .table-row {
        grid-template-columns: 1fr;
        gap: 4px;
        text-align: left;
      }
      
      .table-row {
        display: block;
        padding: 16px;
      }
      
      .table-cell {
        display: block;
        margin-bottom: 8px;
      }
      
      .table-cell:before {
        content: attr(data-label) ': ';
        font-weight: 600;
        color: #666;
        font-size: 11px;
        text-transform: uppercase;
      }
      
      .executions-drill-down,
      .model-detail {
        padding: 12px;
      }
      
      .panel-content {
        padding: 12px;
      }
      
      .panel-header {
        padding: 10px 12px;
      }
      
      .panel-title {
        font-size: 13px;
      }
    }
  `]
})
export class ExecutionMonitoringComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private stateChangeSubject$ = new Subject<ExecutionMonitoringState>();

  // Configuration
  selectedTimeRange = '24h';
  isLoading = false;

  // Chart configurations
  timeSeriesConfig = {
    showGrid: true,
    showTooltip: true,
    animationDuration: 500,
    useDualAxis: true
  };

  heatmapConfig = {
    height: 350,
    showTooltip: true,
    animationDuration: 300
  };

  // Data streams
  kpis$: Observable<DashboardKPIs>;
  trends$: Observable<TrendData[]>;
  liveExecutions$: Observable<LiveExecution[]>;
  chartData$: Observable<ChartData>;

  // Derived data streams
  kpiCards$: Observable<KPICardData[]>;
  performanceMatrix$: Observable<HeatmapData[]>;
  costData$: Observable<{ model: string; cost: number; tokens: number }[]>;
  tokenEfficiency$: Observable<{ inputTokens: number; outputTokens: number; cost: number; model: string }[]>;

  // Modal state
  selectedExecution: LiveExecution | null = null;
  executionDetails: ExecutionDetails | null = null;
  loadingExecutionDetails = false;

  // Drill-down tab state
  drillDownTabs: DrillDownTab[] = [];
  activeTabId: string = 'main-chart';
  loadingDrillDown = false;

  // Panel state for collapsible sections
  panelStates = {
    cost: true,
    efficiency: true,  // Expanded by default
    executions: false
  };

  get activeTab(): DrillDownTab | undefined {
    return this.drillDownTabs.find(tab => tab.id === this.activeTabId);
  }

  constructor(
    private instrumentationService: AIInstrumentationService,
    private navigationService: NavigationService,
    private cdr: ChangeDetectorRef
  ) {
    super();
    // Initialize data streams
    this.kpis$ = this.instrumentationService.kpis$;
    this.trends$ = this.instrumentationService.trends$;
    this.liveExecutions$ = this.instrumentationService.liveExecutions$;
    this.chartData$ = this.instrumentationService.chartData$;

    // Subscribe to loading state from service
    this.instrumentationService.isLoading$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(loading => {
      this.isLoading = loading;
      this.cdr.markForCheck();
    });

    // Derived streams
    this.kpiCards$ = this.kpis$.pipe(
      map(kpis => this.createKPICards(kpis))
    );

    this.performanceMatrix$ = this.chartData$.pipe(
      map(data => data.performanceMatrix.map(item => ({
        agent: item.agent,
        model: item.model,
        avgTime: item.avgTime,
        successRate: item.successRate
      })))
    );

    this.costData$ = this.chartData$.pipe(
      map(data => data.costByModel)
    );

    this.tokenEfficiency$ = this.chartData$.pipe(
      map(data => data.tokenEfficiency)
    );
  }

  ngOnInit() {
    // Load initial state if provided from resource configuration
    if (this.Data?.Configuration) {
      this.loadUserState(this.Data.Configuration);
    } else {
      // Default initialization
      this.setTimeRange(this.selectedTimeRange);
      
      // Initialize with main chart tab
      this.drillDownTabs = [
        {
          id: 'main-chart',
          title: 'Execution Trends',
          type: 'chart',
          closeable: false
        }
      ];
    
      // Trigger initial data load
      this.instrumentationService.refresh();
    }
    
    // Set up debounced state change - could be used for persistence in the future
    this.stateChangeSubject$.pipe(
      debounceTime(2000), // 2 second debounce
      takeUntil(this.destroy$)
    ).subscribe(_state => {
      // State change handling placeholder
    });

    // Notify that the resource has finished loading
    this.NotifyLoadComplete();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.stateChangeSubject$.complete();
  }

  private getCurrentState(): ExecutionMonitoringState {
    return {
      selectedTimeRange: this.selectedTimeRange,
      refreshInterval: 0, // Always manual refresh now
      panelStates: { ...this.panelStates },
      drillDownTabs: this.drillDownTabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        type: tab.type,
        timestamp: tab.timestamp?.toISOString(),
        metric: tab.metric
      })),
      activeTabId: this.activeTabId
    };
  }

  private emitStateChange(): void {
    const currentState = this.getCurrentState();
    this.stateChangeSubject$.next(currentState);
  }

  public loadUserState(state: Partial<ExecutionMonitoringState>): void {
    
    if (state.selectedTimeRange) {
      this.selectedTimeRange = state.selectedTimeRange;
      this.setTimeRange(state.selectedTimeRange);
    }
    
    // No longer need to handle refreshInterval since we removed auto-refresh
    
    if (state.panelStates) {
      // Only override if state has explicit panel states, otherwise keep defaults
      this.panelStates = { ...this.panelStates, ...state.panelStates };
    }
    
    if (state.drillDownTabs && state.drillDownTabs.length > 0) {
      this.drillDownTabs = state.drillDownTabs.map(tab => ({
        ...tab,
        type: tab.type as 'chart' | 'executions' | 'model-detail',
        timestamp: tab.timestamp ? new Date(tab.timestamp) : undefined,
        closeable: tab.id !== 'main-chart'
      }));
    } else {
      // Initialize with default tab if not provided
      this.drillDownTabs = [
        {
          id: 'main-chart',
          title: 'Execution Trends',
          type: 'chart',
          closeable: false
        }
      ];
    }
    
    if (state.activeTabId) {
      this.activeTabId = state.activeTabId;
    }
  }

  private createKPICards(kpis: DashboardKPIs): KPICardData[] {
    return [
      {
        title: 'Total Executions',
        value: kpis.totalExecutions,
        icon: 'fa-chart-bar',
        color: 'primary',
        subtitle: `${kpis.activeExecutions} active`
      },
      {
        title: 'Total Cost',
        value: `$${kpis.totalCost.toFixed(4)}`,
        icon: 'fa-dollar-sign',
        color: 'warning',
        subtitle: `${kpis.costCurrency} • $${kpis.dailyCostBurn.toFixed(2)}/day`
      },
      {
        title: 'Success Rate',
        value: `${(kpis.successRate * 100).toFixed(1)}%`,
        icon: 'fa-check-circle',
        color: 'success',
        subtitle: `${(kpis.errorRate * 100).toFixed(1)}% errors`
      },
      {
        title: 'Avg Response Time',
        value: `${(kpis.avgExecutionTime / 1000).toFixed(2)}s`,
        icon: 'fa-clock',
        color: 'info',
        subtitle: 'All models average'
      },
      {
        title: 'Token Usage',
        value: this.formatTokens(kpis.totalTokens),
        icon: 'fa-coins',
        color: 'primary',
        subtitle: `$${kpis.costPerToken.toFixed(6)}/token`
      },
      {
        title: 'Top Model',
        value: kpis.topModel,
        icon: 'fa-microchip',
        color: 'info',
        subtitle: 'Most used'
      }
    ];
  }


  onTimeRangeChange(): void {
    // Simply change time range - loading state is managed by the service
    this.setTimeRange(this.selectedTimeRange);
    this.emitStateChange();
  }

  private setTimeRange(range: string): void {
    const { start, end } = this.getTimeRangeFromSelection(range);
    this.instrumentationService.setDateRange(start, end);
  }
  
  private getTimeRangeFromSelection(range?: string): { start: Date; end: Date } {
    const now = new Date();
    const selectedRange = range || this.selectedTimeRange;
    let start: Date;

    switch (selectedRange) {
      case '1h':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return { start, end: now };
  }

  refreshData(): void {
    // Simply trigger refresh - loading state is managed by the service
    this.instrumentationService.refresh();
  }

  onExecutionClick(execution: LiveExecution): void {
    this.selectedExecution = execution;
    this.loadExecutionDetails(execution);
  }

  onDataPointClick(event: DataPointClickEvent): void {
    const timestamp = event.data.timestamp;
    const metric = event.metric;
    
    // Create new drill-down tab
    const tabId = `drill-down-${timestamp.getTime()}-${metric}`;
    const tabTitle = `${this.getMetricDisplayLabel(metric)} - ${this.formatTimestamp(timestamp)}`;
    
    const newTab: DrillDownTab = {
      id: tabId,
      title: tabTitle,
      type: 'executions',
      timestamp: timestamp,
      metric: metric,
      closeable: true
    };
    
    // Add tab if it doesn't exist
    if (!this.drillDownTabs.find(tab => tab.id === tabId)) {
      this.drillDownTabs.push(newTab);
      this.emitStateChange(); // Emit state when new tab is added
      this.cdr.markForCheck();
    }
    
    // Switch to the new tab
    this.selectTab(tabId);
    
    // Load drill-down data
    this.loadDrillDownData(newTab);
  }

  onChartTimeRangeChange(range: string): void {
    this.selectedTimeRange = range;
    this.setTimeRange(range);
  }

  private getMetricValue(data: TrendData, metric: string): number {
    switch (metric) {
      case 'executions': return data.executions;
      case 'cost': return data.cost;
      case 'tokens': return data.tokens;
      case 'avgTime': return data.avgTime;
      case 'errors': return data.errors;
      default: return 0;
    }
  }

  private formatMetricValue(metric: string, value: number): string {
    switch (metric) {
      case 'executions': return value.toLocaleString();
      case 'cost': return `$${value.toFixed(4)}`;
      case 'tokens': return value.toLocaleString();
      case 'avgTime': return `${(value / 1000).toFixed(1)}s`;
      case 'errors': return value.toString();
      default: return value.toString();
    }
  }

  private async loadExecutionDetails(execution: LiveExecution): Promise<void> {
    this.loadingExecutionDetails = true;
    this.executionDetails = null;

    try {
      const details = await this.instrumentationService.getExecutionDetails(
        execution.id,
        execution.type
      );
      this.executionDetails = details;
    } catch (error) {
      console.error('Error loading execution details:', error);
    } finally {
      this.loadingExecutionDetails = false;
    }
  }

  closeExecutionModal(): void {
    this.selectedExecution = null;
    this.executionDetails = null;
    this.loadingExecutionDetails = false;
  }

  openFullRecord(): void {
    if (this.selectedExecution) {
      // Determine the entity name based on the execution type
      const entityName = this.selectedExecution.type === 'prompt'
        ? 'MJ: AI Prompt Runs'
        : 'MJ: AI Agent Runs';

      // Open the record using NavigationService
      const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: this.selectedExecution.id }]);
      this.navigationService.OpenEntityRecord(entityName, compositeKey);

      // Close the modal
      this.closeExecutionModal();
    }
  }

  // Utility methods for templates
  trackByKpiTitle(index: number, kpi: KPICardData): string {
    return kpi.title;
  }

  trackByCostModel(index: number, item: { model: string; cost: number; tokens: number }): string {
    return item.model;
  }

  trackByEfficiencyModel(index: number, item: { model: string; inputTokens: number; outputTokens: number; cost: number }): string {
    return item.model;
  }

  formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  }

  formatCurrency(amount: number, decimals: number = 4): string {
    return `$${amount.toFixed(decimals)}`;
  }

  formatCostPerToken(cost: number, tokens: number): string {
    const costPer1K = tokens > 0 ? (cost / tokens) * 1000 : 0;
    return `$${costPer1K.toFixed(4)}/1K tokens`;
  }

  getCostBarWidth(cost: number, maxCost: number): number {
    return maxCost > 0 ? (cost / maxCost) * 100 : 0;
  }

  getMaxCost(costData: { cost: number }[]): number {
    return Math.max(...costData.map(item => item.cost));
  }

  getTokenRatio(input: number, output: number): string {
    const total = input + output;
    if (total === 0) return '0:0';
    const ratio = output / input;
    return `1:${ratio.toFixed(1)}`;
  }

  getTokenPercentage(tokens: number, total: number): number {
    return total > 0 ? (tokens / total) * 100 : 0;
  }

  getCostPerToken(cost: number, tokens: number): string {
    const costPer1K = tokens > 0 ? (cost / tokens) * 1000 : 0;
    return costPer1K.toFixed(4);
  }

  // Tab management methods
  selectTab(tabId: string): void {
    this.activeTabId = tabId;
    // Trigger chart resize after tab switch to fix chart rendering
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  closeTab(event: MouseEvent, tabId: string): void {
    event.stopPropagation();
    
    const tabIndex = this.drillDownTabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;
    
    // Remove the tab
    this.drillDownTabs.splice(tabIndex, 1);
    
    // If we closed the active tab, switch to another tab
    if (this.activeTabId === tabId) {
      if (this.drillDownTabs.length > 0) {
        // Switch to the previous tab or first tab
        const newActiveIndex = Math.max(0, tabIndex - 1);
        this.activeTabId = this.drillDownTabs[newActiveIndex].id;
        // Trigger resize after tab switch
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 100);
      } else {
        // No tabs left, this shouldn't happen as main chart is not closeable
        this.activeTabId = 'main-chart';
      }
    }
    
    this.emitStateChange();
  }

  // KPI click handling
  onKpiClick(kpi: KPICardData): void {
    if (kpi.title === 'Top Model' && kpi.value !== 'N/A') {
      this.openModelDrillDown(String(kpi.value));
    }
    // Add other KPI drill-downs as needed
  }

  isKpiClickable(kpi: KPICardData): boolean {
    return kpi.title === 'Top Model' && kpi.value !== 'N/A';
  }

  private async openModelDrillDown(modelName: string): Promise<void> {
    const tabId = `model-detail-${modelName.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const tabTitle = `Model: ${modelName}`;
    
    // Check if tab already exists
    if (this.drillDownTabs.find(tab => tab.id === tabId)) {
      this.selectTab(tabId);
      return;
    }
    
    // Create new model detail tab
    const newTab: DrillDownTab = {
      id: tabId,
      title: tabTitle,
      type: 'model-detail',
      closeable: true
    };
    
    this.drillDownTabs.push(newTab);
    this.selectTab(tabId);
    
    // Load model details
    this.loadModelDetails(newTab, modelName);
  }

  private async loadDrillDownData(tab: DrillDownTab): Promise<void> {
    if (!tab.timestamp) return;
    
    this.loadingDrillDown = true;
    
    try {
      // Determine bucket size based on selected time range
      const { start, end } = this.getTimeRangeFromSelection();
      const duration = end.getTime() - start.getTime();
      const hours = duration / (1000 * 60 * 60);
      
      let windowSizeMs: number;
      let alignToDay = false;
      
      if (hours <= 24) {
        // For up to 24 hours, use 1 hour window (30 min before and after)
        windowSizeMs = 30 * 60 * 1000;
      } else if (hours <= 24 * 7) {
        // For up to 7 days, use full day window
        // Since data is aggregated into 4-hour buckets, we need to capture the full day
        windowSizeMs = 12 * 60 * 60 * 1000; // 12 hours before/after = 24 hour window
        alignToDay = true;
      } else {
        // For more than 7 days, use full day window
        windowSizeMs = 12 * 60 * 60 * 1000; // 12 hours before/after = 24 hour window
        alignToDay = true;
      }
      
      // Create time window around the clicked point
      let startTime = new Date(tab.timestamp.getTime() - windowSizeMs);
      let endTime = new Date(tab.timestamp.getTime() + windowSizeMs);
      
      // For day-aligned queries, expand to full day boundaries
      if (alignToDay) {
        // Set start to beginning of the day
        startTime = new Date(tab.timestamp);
        startTime.setHours(0, 0, 0, 0);
        
        // Set end to end of the day
        endTime = new Date(tab.timestamp);
        endTime.setHours(23, 59, 59, 999);
      }
      
      // Load executions for this time period
      const [promptResults, agentResults] = await Promise.all([
        new RunView().RunView<AIPromptRunEntityExtended>({
          EntityName: 'MJ: AI Prompt Runs',
          ExtraFilter: `RunAt >= '${startTime.toISOString()}' AND RunAt <= '${endTime.toISOString()}'`,
          OrderBy: 'RunAt DESC' 
        }),
        new RunView().RunView<AIAgentRunEntityExtended>({
          EntityName: 'MJ: AI Agent Runs',
          ExtraFilter: `StartedAt >= '${startTime.toISOString()}' AND StartedAt <= '${endTime.toISOString()}'`,
          OrderBy: 'StartedAt DESC' 
        })
      ]);
      
      // Convert to ExecutionRecord format
      const executions: ExecutionRecord[] = [];
      
      // Add prompt executions
      for (const run of promptResults.Results) {
        const duration = run.CompletedAt ? 
          new Date(run.CompletedAt).getTime() - new Date(run.RunAt).getTime() : 
          Date.now() - new Date(run.RunAt).getTime();
          
        executions.push({
          id: run.ID,
          type: 'prompt',
          name: run.Prompt || 'Unnamed Prompt',
          model: run.Model || undefined,
          status: run.Success ? 'completed' : (run.Success === false ? 'failed' : 'running'),
          startTime: new Date(run.RunAt),
          endTime: run.CompletedAt ? new Date(run.CompletedAt) : undefined,
          duration: duration,
          cost: run.Cost || 0,
          tokens: run.TokensUsed || 0,
          errorMessage: run.ErrorMessage || undefined
        });
      }
      
      // Add agent executions
      for (const run of agentResults.Results) {
        const duration = run.CompletedAt ? 
          new Date(run.CompletedAt).getTime() - new Date(run.StartedAt).getTime() : 
          Date.now() - new Date(run.StartedAt).getTime();
          
        executions.push({
          id: run.ID,
          type: 'agent',
          name: run.Agent || 'Unnamed Agent',
          status: run.Status.toLowerCase(),
          startTime: new Date(run.StartedAt),
          endTime: run.CompletedAt ? new Date(run.CompletedAt) : undefined,
          duration: duration,
          cost: run.TotalCost || 0,
          tokens: run.TotalTokensUsed || 0,
          errorMessage: run.ErrorMessage || undefined
        });
      }
      
      // Sort by start time (most recent first)
      executions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
      
      // Update tab data
      tab.data = executions;
      this.cdr.markForCheck();
      
    } catch (error) {
      console.error('Error loading drill-down data:', error);
      tab.data = [];
      this.cdr.markForCheck();
    } finally {
      this.loadingDrillDown = false;
      this.cdr.markForCheck();
    }
  }

  private async loadModelDetails(tab: DrillDownTab, modelName: string): Promise<void> {
    this.loadingDrillDown = true;
    
    try {
      // Find model by name
      const rv = new RunView();
      const result = await rv.RunView<AIModelEntityExtended>({
        EntityName: 'AI Models',
        ExtraFilter: `Name = '${modelName.replace(/'/g, "''")}'` 
      });
      
      const model = result.Results[0];
      if (model) {
        tab.data = {
          name: model.Name,
          vendor: model.Vendor,
          apiName: model.APIName,
          inputTokenCost: 0, // Not available in current model
          outputTokenCost: 0, // Not available in current model  
          isActive: model.IsActive,
          description: model.Description
        };
      } else {
        tab.data = null;
      }
      
    } catch (error) {
      console.error('Error loading model details:', error);
      tab.data = null;
    } finally {
      this.loadingDrillDown = false;
    }
  }

  // Helper methods for drill-down

  formatTimestamp(timestamp: Date): string {
    return timestamp.toLocaleString();
  }

  formatTime(time: Date): string {
    return time.toLocaleTimeString();
  }

  getMetricDisplayLabel(metric: string): string {
    const labels: { [key: string]: string } = {
      executions: 'Executions',
      cost: 'Cost',
      tokens: 'Tokens',
      avgTime: 'Avg Time',
      errors: 'Errors'
    };
    return labels[metric] || metric;
  }

  getFormattedTimestamp(tab: DrillDownTab | undefined): string {
    return tab?.timestamp ? this.formatTimestamp(tab.timestamp) : '';
  }

  getFormattedMetricLabel(tab: DrillDownTab | undefined): string {
    return tab?.metric ? this.getMetricDisplayLabel(tab.metric) : '';
  }

  // Panel management methods
  togglePanel(panelName: 'cost' | 'efficiency' | 'executions'): void {
    this.panelStates[panelName] = !this.panelStates[panelName];
    this.emitStateChange();
  }

  viewExecutionDetail(execution: ExecutionRecord): void {
    // Convert ExecutionRecord to LiveExecution format for the modal
    const liveExecution: LiveExecution = {
      id: execution.id,
      type: execution.type,
      name: execution.name,
      status: execution.status as 'running' | 'completed' | 'failed',
      startTime: execution.startTime,
      duration: execution.duration,
      cost: execution.cost,
      tokens: execution.tokens
    };
    
    this.onExecutionClick(liveExecution);
  }

  formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  getDuration(details: ExecutionDetails): number {
    const start = details.startTime.getTime();
    const end = details.endTime ? details.endTime.getTime() : Date.now();
    return end - start;
  }

  onSplitterLayoutChange(event: any): void {
    // Trigger window resize event to force charts to recalculate dimensions
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);

    // Emit state change when splitter changes
    this.emitStateChange();
  }

  // === BaseResourceComponent Required Methods ===

  /**
   * Get the display name for this resource
   */
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Monitor';
  }

  /**
   * Get the icon class for this resource
   */
  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }
}