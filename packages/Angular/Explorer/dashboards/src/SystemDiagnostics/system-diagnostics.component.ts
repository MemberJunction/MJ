import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { BaseEngineRegistry, EngineMemoryStats } from '@memberjunction/core';

/**
 * Interface representing a single engine's diagnostic info for display
 */
export interface EngineDiagnosticInfo {
    className: string;
    isLoaded: boolean;
    registeredAt: Date;
    lastLoadedAt: Date | null;
    estimatedMemoryBytes: number;
    itemCount: number;
    memoryDisplay: string;
}

/**
 * Interface for redundant entity loading info
 */
export interface RedundantLoadInfo {
    entityName: string;
    engines: string[];
}

/**
 * Tree-shaking prevention function - ensures component is included in builds
 */
export function LoadSystemDiagnosticsResource() {
    // Force inclusion in production builds
}

/**
 * System Diagnostics Resource Component
 *
 * Provides a comprehensive view of:
 * - All registered BaseEngine instances and their memory usage
 * - Entity load tracking across engines (identifies redundant loading)
 *
 * This is a client-side only dashboard - all data comes from in-memory registries.
 */
@RegisterClass(BaseResourceComponent, 'SystemDiagnosticsResource')
@Component({
    selector: 'app-system-diagnostics',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="system-diagnostics">
            <!-- Header -->
            <div class="diagnostics-header">
                <div class="header-title">
                    <i class="fa-solid fa-stethoscope"></i>
                    <h2>System Diagnostics</h2>
                </div>
                <div class="header-controls">
                    <div class="auto-refresh-control">
                        <label>
                            <input type="checkbox" [(ngModel)]="autoRefresh" (change)="toggleAutoRefresh()">
                            Auto-refresh
                        </label>
                        @if (autoRefresh) {
                            <span class="refresh-indicator">
                                <i class="fa-solid fa-sync-alt spinning"></i>
                                Every 5s
                            </span>
                        }
                    </div>
                    <button class="refresh-btn" (click)="refreshData()" [disabled]="isLoading">
                        <i class="fa-solid fa-refresh" [class.spinning]="isLoading"></i>
                        Refresh Now
                    </button>
                </div>
            </div>

            <!-- Overview Cards -->
            <div class="overview-cards">
                <div class="overview-card">
                    <div class="card-icon card-icon--engines">
                        <i class="fa-solid fa-cogs"></i>
                    </div>
                    <div class="card-content">
                        <div class="card-value">{{ engineStats?.totalEngines || 0 }}</div>
                        <div class="card-label">Registered Engines</div>
                        <div class="card-subtitle">{{ engineStats?.loadedEngines || 0 }} loaded</div>
                    </div>
                </div>

                <div class="overview-card">
                    <div class="card-icon card-icon--memory">
                        <i class="fa-solid fa-microchip"></i>
                    </div>
                    <div class="card-content">
                        <div class="card-value">{{ formatBytes(engineStats?.totalEstimatedMemoryBytes || 0) }}</div>
                        <div class="card-label">Engine Memory</div>
                        <div class="card-subtitle">Estimated total</div>
                    </div>
                </div>

                <div class="overview-card">
                    <div class="card-icon" [class.card-icon--warning]="redundantLoads.length > 0" [class.card-icon--success]="redundantLoads.length === 0">
                        <i class="fa-solid fa-copy"></i>
                    </div>
                    <div class="card-content">
                        <div class="card-value">{{ redundantLoads.length }}</div>
                        <div class="card-label">Redundant Loads</div>
                        <div class="card-subtitle">
                            @if (redundantLoads.length === 0) {
                                No redundant loading detected
                            } @else {
                                {{ redundantLoads.length }} entities loaded by multiple engines
                            }
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Content with Left Nav -->
            <div class="main-content">
                <!-- Left Navigation -->
                <div class="left-nav">
                    <div class="nav-section">
                        <div class="nav-section-title">Diagnostics</div>
                        <div
                            class="nav-item"
                            [class.active]="activeSection === 'engines'"
                            (click)="setActiveSection('engines')"
                        >
                            <i class="fa-solid fa-cogs"></i>
                            <span>Engine Registry</span>
                            <span class="nav-badge">{{ engineStats?.totalEngines || 0 }}</span>
                        </div>
                        <div
                            class="nav-item"
                            [class.active]="activeSection === 'redundant'"
                            (click)="setActiveSection('redundant')"
                        >
                            <i class="fa-solid fa-copy"></i>
                            <span>Redundant Loading</span>
                            @if (redundantLoads.length > 0) {
                                <span class="nav-badge nav-badge--warning">{{ redundantLoads.length }}</span>
                            } @else {
                                <span class="nav-badge nav-badge--success">0</span>
                            }
                        </div>
                    </div>
                </div>

                <!-- Content Area -->
                <div class="content-area">
                    <!-- Engine Registry Section -->
                    @if (activeSection === 'engines') {
                        <div class="section-panel">
                            <div class="panel-header">
                                <h3>
                                    <i class="fa-solid fa-cogs"></i>
                                    Registered Engines
                                </h3>
                                <div class="panel-actions">
                                    <button class="action-btn" (click)="refreshAllEngines()" [disabled]="isRefreshingEngines">
                                        <i class="fa-solid fa-sync" [class.spinning]="isRefreshingEngines"></i>
                                        Refresh All Engines
                                    </button>
                                </div>
                            </div>

                            <div class="section-panel-content">
                            @if (engines.length === 0) {
                                <div class="empty-state">
                                    <i class="fa-solid fa-inbox"></i>
                                    <p>No engines registered yet</p>
                                    <span class="empty-hint">Engines register themselves when they are first configured</span>
                                </div>
                            } @else {
                                <div class="engine-grid">
                                    @for (engine of engines; track engine.className) {
                                        <div class="engine-card" [class.loaded]="engine.isLoaded">
                                            <div class="engine-header">
                                                <div class="engine-name">{{ engine.className }}</div>
                                                <div class="engine-status" [class.status-loaded]="engine.isLoaded" [class.status-pending]="!engine.isLoaded">
                                                    {{ engine.isLoaded ? 'Loaded' : 'Not Loaded' }}
                                                </div>
                                            </div>
                                            <div class="engine-stats">
                                                <div class="stat-item">
                                                    <i class="fa-solid fa-microchip"></i>
                                                    <span class="stat-label">Memory:</span>
                                                    <span class="stat-value">{{ engine.memoryDisplay }}</span>
                                                </div>
                                                <div class="stat-item">
                                                    <i class="fa-solid fa-layer-group"></i>
                                                    <span class="stat-label">Items:</span>
                                                    <span class="stat-value">{{ engine.itemCount.toLocaleString() }}</span>
                                                </div>
                                                @if (engine.lastLoadedAt) {
                                                    <div class="stat-item">
                                                        <i class="fa-solid fa-clock"></i>
                                                        <span class="stat-label">Loaded:</span>
                                                        <span class="stat-value">{{ formatTime(engine.lastLoadedAt) }}</span>
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    }
                                </div>
                            }
                            </div>
                        </div>
                    }

                    <!-- Redundant Loading Section -->
                    @if (activeSection === 'redundant') {
                        <div class="section-panel">
                            <div class="panel-header">
                                <h3>
                                    <i class="fa-solid fa-copy"></i>
                                    Redundant Entity Loading
                                </h3>
                            </div>

                            <div class="section-panel-content">
                                <div class="info-banner">
                                    <i class="fa-solid fa-info-circle"></i>
                                    <div>
                                        <strong>What is this?</strong>
                                        This section shows entities that are loaded by multiple engines.
                                        Redundant loading indicates potential optimization opportunities where engines
                                        could share data or consolidate their loading logic.
                                    </div>
                                </div>

                                @if (redundantLoads.length === 0) {
                                    <div class="empty-state success-state">
                                        <i class="fa-solid fa-check-circle"></i>
                                        <p>No redundant entity loading detected</p>
                                        <span class="empty-hint">Each entity is being loaded by only one engine</span>
                                    </div>
                                } @else {
                                    <div class="redundant-loads-table-wrapper">
                                        <table class="redundant-loads-table">
                                            <thead>
                                                <tr>
                                                    <th>Entity Name</th>
                                                    <th>Loaded By Engines</th>
                                                    <th class="text-right">Engine Count</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @for (load of redundantLoads; track load.entityName) {
                                                    <tr>
                                                        <td class="entity-name">{{ load.entityName }}</td>
                                                        <td class="engines-cell">
                                                            <div class="engine-chips">
                                                                @for (engine of load.engines; track engine) {
                                                                    <span class="engine-chip">{{ engine }}</span>
                                                                }
                                                            </div>
                                                        </td>
                                                        <td class="text-right count-cell">
                                                            <span class="count-badge">{{ load.engines.length }}</span>
                                                        </td>
                                                    </tr>
                                                }
                                            </tbody>
                                        </table>
                                    </div>

                                    <div class="recommendation-banner">
                                        <i class="fa-solid fa-lightbulb"></i>
                                        <div>
                                            <strong>Recommendation:</strong>
                                            Consider consolidating data loading by having dependent engines
                                            access data from a parent engine, or restructuring the engine
                                            hierarchy to avoid duplicate data fetches.
                                        </div>
                                    </div>
                                }
                            </div>
                        </div>
                    }
                </div>
            </div>

            <!-- Last Updated -->
            <div class="footer">
                <span class="last-updated">
                    <i class="fa-solid fa-clock"></i>
                    Last updated: {{ lastUpdated | date:'medium' }}
                </span>
            </div>
        </div>
    `,
    styles: [`
        .system-diagnostics {
            padding: 0;
            background: #f8f9fa;
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Header */
        .diagnostics-header {
            background: white;
            padding: 20px 24px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            flex-shrink: 0;
        }

        .header-title {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .header-title i {
            font-size: 24px;
            color: #4caf50;
        }

        .header-title h2 {
            margin: 0;
            font-size: 22px;
            font-weight: 600;
            color: #333;
        }

        .header-controls {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .auto-refresh-control {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 13px;
            color: #666;
        }

        .auto-refresh-control label {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }

        .auto-refresh-control input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
        }

        .refresh-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #4caf50;
            font-size: 12px;
        }

        .refresh-btn {
            background: #4caf50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
        }

        .refresh-btn:hover:not(:disabled) {
            background: #43a047;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
        }

        .refresh-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .spinning {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Overview Cards */
        .overview-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            padding: 20px 24px;
            background: white;
            border-bottom: 1px solid #e0e0e0;
            flex-shrink: 0;
        }

        .overview-card {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 20px;
            background: #f8f9fa;
            border-radius: 10px;
            transition: all 0.2s ease;
        }

        .overview-card:hover {
            background: #f0f4f8;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .card-icon {
            width: 52px;
            height: 52px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            flex-shrink: 0;
        }

        .card-icon--engines {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }

        .card-icon--memory {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }

        .card-icon--warning {
            background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
            color: white;
        }

        .card-icon--success {
            background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
            color: white;
        }

        .card-content {
            flex: 1;
            min-width: 0;
        }

        .card-value {
            font-size: 22px;
            font-weight: 700;
            color: #333;
            line-height: 1.2;
        }

        .card-label {
            font-size: 13px;
            color: #666;
            margin-top: 2px;
        }

        .card-subtitle {
            font-size: 11px;
            color: #999;
            margin-top: 2px;
        }

        /* Main Content */
        .main-content {
            display: flex;
            flex: 1;
            min-height: 0;
        }

        /* Left Navigation */
        .left-nav {
            width: 240px;
            background: white;
            border-right: 1px solid #e0e0e0;
            padding: 16px 0;
            flex-shrink: 0;
        }

        .nav-section {
            padding: 0 12px;
        }

        .nav-section-title {
            font-size: 11px;
            font-weight: 600;
            color: #999;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 12px;
            margin-bottom: 4px;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            border-radius: 8px;
            cursor: pointer;
            color: #666;
            font-size: 14px;
            transition: all 0.2s ease;
            margin-bottom: 4px;
        }

        .nav-item:hover {
            background: #f0f4f8;
            color: #333;
        }

        .nav-item.active {
            background: #e8f5e9;
            color: #2e7d32;
            font-weight: 500;
        }

        .nav-item i {
            width: 18px;
            text-align: center;
            font-size: 15px;
        }

        .nav-item span:first-of-type {
            flex: 1;
        }

        .nav-badge {
            background: #e0e0e0;
            color: #666;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 10px;
            min-width: 24px;
            text-align: center;
        }

        .nav-item.active .nav-badge {
            background: #4caf50;
            color: white;
        }

        .nav-badge--warning {
            background: #ff9800 !important;
            color: white !important;
        }

        .nav-badge--success {
            background: #4caf50 !important;
            color: white !important;
        }

        /* Content Area */
        .content-area {
            flex: 1;
            padding: 24px;
            overflow: hidden;
            min-width: 0;
            display: flex;
            flex-direction: column;
        }

        .section-panel {
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
        }

        .section-panel-content {
            flex: 1;
            overflow-y: auto;
            min-height: 0;
            padding: 20px 24px;
        }

        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #f0f0f0;
            background: #fafafa;
        }

        .panel-header h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #333;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .panel-header h3 i {
            color: #4caf50;
        }

        .panel-actions {
            display: flex;
            gap: 12px;
        }

        .action-btn {
            background: #f0f0f0;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            color: #666;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        }

        .action-btn:hover:not(:disabled) {
            background: #e0e0e0;
            color: #333;
        }

        .action-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Empty State */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            color: #999;
        }

        .empty-state i {
            font-size: 48px;
            margin-bottom: 16px;
            color: #ddd;
        }

        .empty-state.success-state i {
            color: #4caf50;
        }

        .empty-state p {
            margin: 0;
            font-size: 16px;
            color: #666;
        }

        .empty-hint {
            font-size: 13px;
            margin-top: 8px;
        }

        /* Engine Grid */
        .engine-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 16px;
        }

        .engine-card {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 16px 20px;
            border: 2px solid transparent;
            transition: all 0.2s ease;
        }

        .engine-card.loaded {
            border-color: #4caf50;
            background: #f1f8e9;
        }

        .engine-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .engine-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .engine-name {
            font-size: 15px;
            font-weight: 600;
            color: #333;
        }

        .engine-status {
            font-size: 11px;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 12px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .status-loaded {
            background: #c8e6c9;
            color: #2e7d32;
        }

        .status-pending {
            background: #fff3e0;
            color: #ef6c00;
        }

        .engine-stats {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: #666;
        }

        .stat-item i {
            width: 16px;
            color: #999;
        }

        .stat-label {
            color: #999;
        }

        .stat-value {
            font-weight: 500;
            color: #333;
        }

        /* Info Banner */
        .info-banner {
            display: flex;
            gap: 12px;
            padding: 16px 20px;
            background: #e3f2fd;
            border-radius: 8px;
            font-size: 13px;
            color: #1565c0;
            margin-bottom: 20px;
        }

        .info-banner i {
            margin-top: 2px;
            flex-shrink: 0;
        }

        /* Recommendation Banner */
        .recommendation-banner {
            display: flex;
            gap: 12px;
            padding: 16px 20px;
            background: #fff3e0;
            border-radius: 8px;
            font-size: 13px;
            color: #e65100;
            margin-top: 20px;
        }

        .recommendation-banner i {
            margin-top: 2px;
            flex-shrink: 0;
            color: #ff9800;
        }

        /* Redundant Loads Table */
        .redundant-loads-table-wrapper {
            overflow-x: auto;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
        }

        .redundant-loads-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .redundant-loads-table th {
            background: #f8f9fa;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            color: #666;
            border-bottom: 1px solid #e0e0e0;
            white-space: nowrap;
        }

        .redundant-loads-table th.text-right {
            text-align: right;
        }

        .redundant-loads-table td {
            padding: 12px 16px;
            border-bottom: 1px solid #f0f0f0;
            color: #333;
        }

        .redundant-loads-table td.text-right {
            text-align: right;
        }

        .redundant-loads-table tbody tr:last-child td {
            border-bottom: none;
        }

        .redundant-loads-table tbody tr:hover {
            background: #f8f9fa;
        }

        .redundant-loads-table .entity-name {
            font-weight: 500;
            color: #333;
        }

        .engine-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .engine-chip {
            padding: 4px 10px;
            background: #667eea;
            color: white;
            font-size: 11px;
            border-radius: 12px;
            font-weight: 500;
        }

        .count-badge {
            display: inline-block;
            padding: 4px 12px;
            background: #ff9800;
            color: white;
            font-size: 12px;
            font-weight: 600;
            border-radius: 12px;
        }

        /* Footer */
        .footer {
            padding: 12px 24px;
            background: white;
            border-top: 1px solid #e0e0e0;
            text-align: right;
            flex-shrink: 0;
        }

        .last-updated {
            font-size: 12px;
            color: #999;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        /* Responsive */
        @media (max-width: 1024px) {
            .main-content {
                flex-direction: column;
            }

            .left-nav {
                width: 100%;
                border-right: none;
                border-bottom: 1px solid #e0e0e0;
                padding: 12px;
            }

            .nav-section {
                display: flex;
                gap: 8px;
                overflow-x: auto;
                padding: 0;
            }

            .nav-section-title {
                display: none;
            }

            .nav-item {
                white-space: nowrap;
                padding: 10px 16px;
            }
        }

        @media (max-width: 768px) {
            .diagnostics-header {
                flex-direction: column;
                align-items: flex-start;
            }

            .header-controls {
                width: 100%;
                flex-wrap: wrap;
            }

            .overview-cards {
                grid-template-columns: repeat(2, 1fr);
            }

            .engine-grid {
                grid-template-columns: 1fr;
            }
        }
    `]
})
export class SystemDiagnosticsComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    // State
    isLoading = false;
    autoRefresh = false;
    activeSection: 'engines' | 'redundant' = 'engines';
    lastUpdated = new Date();
    isRefreshingEngines = false;

    // Data
    engineStats: EngineMemoryStats | null = null;
    engines: EngineDiagnosticInfo[] = [];
    redundantLoads: RedundantLoadInfo[] = [];

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit() {
        this.refreshData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    setActiveSection(section: 'engines' | 'redundant'): void {
        this.activeSection = section;
        this.cdr.markForCheck();
    }

    toggleAutoRefresh(): void {
        if (this.autoRefresh) {
            // Start auto-refresh interval
            interval(5000)
                .pipe(takeUntil(this.destroy$))
                .subscribe(() => {
                    if (this.autoRefresh) {
                        this.refreshData();
                    }
                });
        }
    }

    async refreshData(): Promise<void> {
        this.isLoading = true;
        this.cdr.markForCheck();

        try {
            // Get engine registry stats
            this.engineStats = BaseEngineRegistry.Instance.GetMemoryStats();

            // Transform to display format
            this.engines = this.engineStats.engineStats.map(engine => ({
                className: engine.className,
                isLoaded: engine.isLoaded,
                registeredAt: engine.registeredAt,
                lastLoadedAt: engine.lastLoadedAt,
                estimatedMemoryBytes: engine.estimatedMemoryBytes,
                itemCount: engine.itemCount,
                memoryDisplay: this.formatBytes(engine.estimatedMemoryBytes)
            }));

            // Get redundantly loaded entities
            const redundantMap = BaseEngineRegistry.Instance.GetRedundantlyLoadedEntities();
            this.redundantLoads = Array.from(redundantMap.entries())
                .map(([entityName, engines]) => ({
                    entityName,
                    engines
                }))
                .sort((a, b) => b.engines.length - a.engines.length);

            this.lastUpdated = new Date();
        } catch (error) {
            console.error('Error refreshing diagnostics data:', error);
        } finally {
            this.isLoading = false;
            this.cdr.markForCheck();
        }
    }

    async refreshAllEngines(): Promise<void> {
        this.isRefreshingEngines = true;
        this.cdr.markForCheck();

        try {
            const count = await BaseEngineRegistry.Instance.RefreshAllEngines();
            console.log(`Refreshed ${count} engines`);
            this.refreshData();
        } catch (error) {
            console.error('Error refreshing engines:', error);
        } finally {
            this.isRefreshingEngines = false;
            this.cdr.markForCheck();
        }
    }

    formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTime(date: Date): string {
        return date.toLocaleTimeString();
    }

    // === BaseResourceComponent Required Methods ===

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'System Diagnostics';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-stethoscope';
    }
}
