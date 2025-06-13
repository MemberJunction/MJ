import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject, combineLatest } from 'rxjs';
import { map, takeUntil, startWith } from 'rxjs/operators';
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
import { RunView } from '@memberjunction/core';
import { AIPromptRunEntity, AIAgentRunEntity, AIModelEntity, AIPromptEntity, AIAgentEntity } from '@memberjunction/core-entities';

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

@Component({
  selector: 'app-execution-monitoring',
  template: `
    <div class="execution-monitoring">
      <!-- Header Controls -->
      <div class="monitoring-header">
        <h2 class="monitoring-title">
          <i class="fa-solid fa-chart-line"></i>
          AI Execution Monitoring
        </h2>
        
        <div class="monitoring-controls">
          <div class="refresh-control">
            <label>Refresh:</label>
            <select [(ngModel)]="refreshInterval" (change)="onRefreshIntervalChange()">
              <option [value]="0">Manual</option>
              <option [value]="10000">10s</option>
              <option [value]="30000">30s</option>
              <option [value]="60000">1m</option>
              <option [value]="300000">5m</option>
            </select>
          </div>
          
          <div class="time-range-control">
            <label>Time Range:</label>
            <select [(ngModel)]="selectedTimeRange" (change)="onTimeRangeChange()">
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
      <kendo-splitter class="dashboard-splitter" orientation="vertical">
        <!-- Top Row: System Health and Trends Chart -->
        <kendo-splitter-pane size="45%" [resizable]="true" [collapsible]="false">
          <kendo-splitter orientation="horizontal">
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
                            <i class="fa-solid fa-spinner fa-spin"></i>
                            Loading execution details...
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
                            <i class="fa-solid fa-spinner fa-spin"></i>
                            Loading model details...
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
          <kendo-splitter orientation="horizontal">
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
            <button class="close-btn" (click)="closeExecutionModal()">
              <i class="fa-solid fa-times"></i>
            </button>
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
                <div class="spinner"></div>
                <p>Loading execution details...</p>
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
      padding: 20px;
      background: #f8f9fa;
      min-height: 100vh;
    }

    .monitoring-header {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .monitoring-title {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .monitoring-title i {
      color: #2196f3;
    }

    .monitoring-controls {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }

    .refresh-control, .time-range-control {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

    .refresh-control label, .time-range-control label {
      color: #666;
      font-weight: 500;
    }

    .refresh-control select, .time-range-control select {
      padding: 6px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
      background: white;
    }

    .refresh-btn {
      background: #2196f3;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s ease;
    }

    .refresh-btn:hover:not(:disabled) {
      background: #1976d2;
    }

    .refresh-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .refresh-btn i.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .kpi-dashboard {
      margin-bottom: 20px;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }

    .dashboard-splitter {
      height: calc(100vh - 220px); /* Added 20px margin */
      min-height: 600px;
      margin-bottom: 20px;
    }

    .dashboard-section {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      height: 100%;
      display: flex;
      flex-direction: column;
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
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chart-title i {
      color: #2196f3;
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
      color: #ff9800;
      font-weight: 600;
    }

    .cost-bar-container {
      flex: 1;
      height: 8px;
      background: #f0f0f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .cost-bar {
      height: 100%;
      background: linear-gradient(90deg, #ff9800, #f57c00);
      border-radius: 4px;
      transition: width 0.3s ease;
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
      color: #2196f3;
      font-weight: 600;
    }

    .token-breakdown {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .token-bar {
      height: 6px;
      background: #f0f0f0;
      border-radius: 3px;
      overflow: hidden;
      display: flex;
    }

    .token-segment {
      height: 100%;
    }

    .token-segment--input {
      background: #4caf50;
    }

    .token-segment--output {
      background: #2196f3;
    }

    .token-labels {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #666;
    }

    .input-label {
      color: #4caf50;
    }

    .output-label {
      color: #2196f3;
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
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
    }

    .status-icon--warning {
      background: rgba(255, 152, 0, 0.1);
      color: #ff9800;
    }

    .status-icon--info {
      background: rgba(33, 150, 243, 0.1);
      color: #2196f3;
    }

    .status-icon--primary {
      background: rgba(156, 39, 176, 0.1);
      color: #9c27b0;
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
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
    }

    .status-badge--running {
      background: rgba(33, 150, 243, 0.1);
      color: #2196f3;
    }

    .status-badge--failed {
      background: rgba(244, 67, 54, 0.1);
      color: #f44336;
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

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #2196f3;
      border-radius: 50%;
      animation: spin 1s linear infinite;
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
      border-bottom: 1px solid #e0e0e0;
      background: #f8f9fa;
      min-height: 40px;
      overflow-x: auto;
    }

    .tab-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #f8f9fa;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      color: #666;
      white-space: nowrap;
      transition: all 0.2s ease;
      min-width: 120px;
      justify-content: space-between;
    }

    .tab-item:hover {
      background: #e9ecef;
      color: #333;
    }

    .tab-item.active {
      background: white;
      color: #2196f3;
      border-bottom-color: #2196f3;
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
      background: #2196f3;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: 500;
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
      background: #e9ecef;
      color: #666;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .type-badge--prompt {
      background: rgba(33, 150, 243, 0.1);
      color: #2196f3;
    }

    .type-badge--agent {
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
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
      padding: 10px;
      height: 100%;
      overflow-y: auto;
      background: #f8f9fa;
    }

    .analysis-panel {
      margin-bottom: 12px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      background: white;
      overflow: hidden;
    }

    .analysis-panel:last-child {
      margin-bottom: 0;
    }

    .panel-header {
      padding: 12px 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background 0.2s ease;
    }

    .panel-header:hover {
      background: #e9ecef;
    }

    .panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: #333;
      font-size: 14px;
    }

    .panel-title i {
      color: #2196f3;
      width: 16px;
    }

    .panel-toggle-icon {
      color: #666;
      font-size: 12px;
      transition: transform 0.2s ease;
    }

    .panel-content {
      padding: 16px;
      border-top: 1px solid #f0f0f0;
      animation: slideDown 0.2s ease-out;
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
        height: calc(100vh - 200px); /* Added 20px margin */
        margin-bottom: 20px;
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
        height: calc(100vh - 180px); /* Added 20px margin */
        min-height: 400px;
        margin-bottom: 20px;
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
export class ExecutionMonitoringComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Configuration
  refreshInterval = 30000; // 30 seconds
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
    efficiency: false,
    executions: false
  };

  get activeTab(): DrillDownTab | undefined {
    return this.drillDownTabs.find(tab => tab.id === this.activeTabId);
  }

  constructor(
    private instrumentationService: AIInstrumentationService
  ) {
    // Initialize data streams
    this.kpis$ = this.instrumentationService.kpis$;
    this.trends$ = this.instrumentationService.trends$;
    this.liveExecutions$ = this.instrumentationService.liveExecutions$;
    this.chartData$ = this.instrumentationService.chartData$;

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
    this.instrumentationService.setRefreshInterval(this.refreshInterval);
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
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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

  onRefreshIntervalChange(): void {
    this.instrumentationService.setRefreshInterval(this.refreshInterval);
  }

  onTimeRangeChange(): void {
    this.setTimeRange(this.selectedTimeRange);
  }

  private setTimeRange(range: string): void {
    const now = new Date();
    let start: Date;

    switch (range) {
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

    this.instrumentationService.setDateRange(start, now);
  }

  refreshData(): void {
    this.isLoading = true;
    // Force refresh by temporarily setting interval to 0 and back
    const currentInterval = this.refreshInterval;
    this.instrumentationService.setRefreshInterval(0);
    setTimeout(() => {
      this.instrumentationService.setRefreshInterval(currentInterval);
      this.isLoading = false;
    }, 100);
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
      } else {
        // No tabs left, this shouldn't happen as main chart is not closeable
        this.activeTabId = 'main-chart';
      }
    }
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
      // Create time window around the clicked point (±30 minutes)
      const startTime = new Date(tab.timestamp.getTime() - 30 * 60 * 1000);
      const endTime = new Date(tab.timestamp.getTime() + 30 * 60 * 1000);
      
      // Load executions for this time period
      const [promptResults, agentResults] = await Promise.all([
        new RunView().RunView<AIPromptRunEntity>({
          EntityName: 'MJ: AI Prompt Runs',
          ExtraFilter: `RunAt >= '${startTime.toISOString()}' AND RunAt <= '${endTime.toISOString()}'`,
          OrderBy: 'RunAt DESC',
          ResultType: 'entity_object'
        }),
        new RunView().RunView<AIAgentRunEntity>({
          EntityName: 'MJ: AI Agent Runs',
          ExtraFilter: `StartedAt >= '${startTime.toISOString()}' AND StartedAt <= '${endTime.toISOString()}'`,
          OrderBy: 'StartedAt DESC',
          ResultType: 'entity_object'
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
          name: await this.getPromptName(run.PromptID),
          model: run.ModelID ? await this.getModelName(run.ModelID) : undefined,
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
          name: await this.getAgentName(run.AgentID),
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
      
    } catch (error) {
      console.error('Error loading drill-down data:', error);
      tab.data = [];
    } finally {
      this.loadingDrillDown = false;
    }
  }

  private async loadModelDetails(tab: DrillDownTab, modelName: string): Promise<void> {
    this.loadingDrillDown = true;
    
    try {
      // Find model by name
      const rv = new RunView();
      const result = await rv.RunView<AIModelEntity>({
        EntityName: 'AI Models',
        ExtraFilter: `Name = '${modelName.replace(/'/g, "''")}'`,
        ResultType: 'entity_object'
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
  private async getPromptName(promptId: string): Promise<string> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<AIPromptEntity>({
        EntityName: 'AI Prompts',
        ExtraFilter: `ID = '${promptId}'`,
        ResultType: 'entity_object'
      });
      return result.Results[0]?.Name || 'Unknown Prompt';
    } catch {
      return 'Unknown Prompt';
    }
  }

  private async getAgentName(agentId: string): Promise<string> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<AIAgentEntity>({
        EntityName: 'AI Agents',
        ExtraFilter: `ID = '${agentId}'`,
        ResultType: 'entity_object'
      });
      return result.Results[0]?.Name || 'Unknown Agent';
    } catch {
      return 'Unknown Agent';
    }
  }

  private async getModelName(modelId: string): Promise<string> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<AIModelEntity>({
        EntityName: 'AI Models',
        ExtraFilter: `ID = '${modelId}'`,
        ResultType: 'entity_object'
      });
      return result.Results[0]?.Name || 'Unknown Model';
    } catch {
      return 'Unknown Model';
    }
  }

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
}