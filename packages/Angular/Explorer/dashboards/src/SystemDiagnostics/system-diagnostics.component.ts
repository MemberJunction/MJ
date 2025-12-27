import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { BaseEngineRegistry, DataPool, EngineMemoryStats } from '@memberjunction/core';

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
 * Interface for DataPool cache statistics
 */
export interface DataPoolStats {
    memoryEntries: number;
    totalEstimatedBytes: number;
    totalDisplay: string;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    config: {
        enablePooling: boolean;
        poolingWindowMs: number;
        poolingMaxExtensionMs: number;
        enableLocalCache: boolean;
        enableCrossEngineSharing: boolean;
    };
    entries: CacheEntryInfo[];
    localStorage: {
        available: boolean;
        enabled: boolean;
        providerType: string | null;
        entriesSynced: number;
    };
}

/**
 * Interface for individual cache entry info
 */
export interface CacheEntryInfo {
    key: string;
    entityName: string;
    filter: string | undefined;
    itemCount: number;
    estimatedSizeBytes: number;
    sizeDisplay: string;
    loadedAt: Date;
    lastAccessedAt: Date;
    entityUpdatedAt: Date | null;
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
 * - DataPool cache statistics and configuration
 * - System health overview
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
                    <div class="card-icon card-icon--cache">
                        <i class="fa-solid fa-database"></i>
                    </div>
                    <div class="card-content">
                        <div class="card-value">{{ dataPoolStats?.memoryEntries || 0 }}</div>
                        <div class="card-label">Cache Entries</div>
                        <div class="card-subtitle">{{ dataPoolStats?.totalDisplay || '0 B' }}</div>
                    </div>
                </div>

                <div class="overview-card">
                    <div class="card-icon card-icon--pooling">
                        <i class="fa-solid fa-layer-group"></i>
                    </div>
                    <div class="card-content">
                        <div class="card-value">{{ dataPoolStats?.config?.enablePooling ? 'Active' : 'Disabled' }}</div>
                        <div class="card-label">Request Pooling</div>
                        <div class="card-subtitle">
                            @if (dataPoolStats?.config?.enablePooling) {
                                {{ dataPoolStats?.config?.poolingWindowMs }}ms window
                            } @else {
                                Not configured
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
                            [class.active]="activeSection === 'datapool'"
                            (click)="setActiveSection('datapool')"
                        >
                            <i class="fa-solid fa-database"></i>
                            <span>DataPool Cache</span>
                            <span class="nav-badge">{{ dataPoolStats?.memoryEntries || 0 }}</span>
                        </div>
                        <div
                            class="nav-item"
                            [class.active]="activeSection === 'config'"
                            (click)="setActiveSection('config')"
                        >
                            <i class="fa-solid fa-sliders-h"></i>
                            <span>Configuration</span>
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

                    <!-- DataPool Cache Section -->
                    @if (activeSection === 'datapool') {
                        <div class="section-panel">
                            <div class="panel-header">
                                <h3>
                                    <i class="fa-solid fa-database"></i>
                                    DataPool Cache
                                </h3>
                                <div class="panel-actions">
                                    <button class="action-btn action-btn--warning" (click)="invalidateAllCache()">
                                        <i class="fa-solid fa-trash-alt"></i>
                                        Clear All Cache
                                    </button>
                                </div>
                            </div>

                            <div class="section-panel-content">
                            <div class="cache-overview">
                                <div class="cache-stat-row">
                                    <div class="cache-stat">
                                        <div class="cache-stat-icon">
                                            <i class="fa-solid fa-cubes"></i>
                                        </div>
                                        <div class="cache-stat-content">
                                            <div class="cache-stat-value">{{ dataPoolStats?.memoryEntries || 0 }}</div>
                                            <div class="cache-stat-label">Cached Entries</div>
                                        </div>
                                    </div>
                                    <div class="cache-stat">
                                        <div class="cache-stat-icon">
                                            <i class="fa-solid fa-hdd"></i>
                                        </div>
                                        <div class="cache-stat-content">
                                            <div class="cache-stat-value">{{ dataPoolStats?.totalDisplay || '0 B' }}</div>
                                            <div class="cache-stat-label">Total Size</div>
                                        </div>
                                    </div>
                                    @if (dataPoolStats?.oldestEntry) {
                                        <div class="cache-stat">
                                            <div class="cache-stat-icon">
                                                <i class="fa-solid fa-hourglass-start"></i>
                                            </div>
                                            <div class="cache-stat-content">
                                                <div class="cache-stat-value">{{ formatTimeNullable(dataPoolStats!.oldestEntry) }}</div>
                                                <div class="cache-stat-label">Oldest Entry</div>
                                            </div>
                                        </div>
                                    }
                                    @if (dataPoolStats?.newestEntry) {
                                        <div class="cache-stat">
                                            <div class="cache-stat-icon">
                                                <i class="fa-solid fa-hourglass-end"></i>
                                            </div>
                                            <div class="cache-stat-content">
                                                <div class="cache-stat-value">{{ formatTimeNullable(dataPoolStats!.newestEntry) }}</div>
                                                <div class="cache-stat-label">Newest Entry</div>
                                            </div>
                                        </div>
                                    }
                                </div>
                            </div>

                            <div class="feature-grid">
                                <div class="feature-card" [class.feature-enabled]="dataPoolStats?.config?.enableCrossEngineSharing">
                                    <div class="feature-icon">
                                        <i class="fa-solid fa-share-alt"></i>
                                    </div>
                                    <div class="feature-content">
                                        <div class="feature-name">Cross-Engine Sharing</div>
                                        <div class="feature-status">
                                            {{ dataPoolStats?.config?.enableCrossEngineSharing ? 'Enabled' : 'Disabled' }}
                                        </div>
                                        <div class="feature-description">
                                            Allows engines to share cached data
                                        </div>
                                    </div>
                                </div>

                                <div class="feature-card" [class.feature-enabled]="dataPoolStats?.config?.enableLocalCache">
                                    <div class="feature-icon">
                                        <i class="fa-solid fa-save"></i>
                                    </div>
                                    <div class="feature-content">
                                        <div class="feature-name">Local Cache</div>
                                        <div class="feature-status">
                                            {{ dataPoolStats?.config?.enableLocalCache ? 'Enabled' : 'Disabled' }}
                                        </div>
                                        <div class="feature-description">
                                            Persists cache to browser storage
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Local Storage Status -->
                            <div class="storage-status-section">
                                <h4>
                                    <i class="fa-solid fa-hard-drive"></i>
                                    Local Storage Status
                                </h4>
                                <div class="storage-status-grid">
                                    <div class="storage-status-item">
                                        <span class="status-label">Provider Available:</span>
                                        <span class="status-value" [class.status-yes]="dataPoolStats?.localStorage?.available" [class.status-no]="!dataPoolStats?.localStorage?.available">
                                            {{ dataPoolStats?.localStorage?.available ? 'Yes' : 'No' }}
                                        </span>
                                    </div>
                                    <div class="storage-status-item">
                                        <span class="status-label">Caching Enabled:</span>
                                        <span class="status-value" [class.status-yes]="dataPoolStats?.localStorage?.enabled" [class.status-no]="!dataPoolStats?.localStorage?.enabled">
                                            {{ dataPoolStats?.localStorage?.enabled ? 'Yes' : 'No' }}
                                        </span>
                                    </div>
                                    @if (dataPoolStats?.localStorage?.providerType) {
                                        <div class="storage-status-item">
                                            <span class="status-label">Provider Type:</span>
                                            <span class="status-value">{{ dataPoolStats?.localStorage?.providerType }}</span>
                                        </div>
                                    }
                                    <div class="storage-status-item">
                                        <span class="status-label">Entries Synced:</span>
                                        <span class="status-value">{{ dataPoolStats?.localStorage?.entriesSynced || 0 }}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Cache Entries Table -->
                            @if (dataPoolStats && dataPoolStats.entries && dataPoolStats.entries.length > 0) {
                                <div class="cache-entries-section">
                                    <h4>
                                        <i class="fa-solid fa-list"></i>
                                        Cached Entries ({{ dataPoolStats.entries.length }})
                                    </h4>
                                    <div class="cache-entries-table-wrapper">
                                        <table class="cache-entries-table">
                                            <thead>
                                                <tr>
                                                    <th>Entity</th>
                                                    <th>Filter</th>
                                                    <th class="text-right">Items</th>
                                                    <th class="text-right">Size</th>
                                                    <th>Loaded</th>
                                                    <th>Last Accessed</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                @for (entry of dataPoolStats!.entries; track entry.key) {
                                                    <tr>
                                                        <td class="entity-name">{{ entry.entityName }}</td>
                                                        <td class="filter-cell">
                                                            @if (entry.filter) {
                                                                <code class="filter-text">{{ entry.filter }}</code>
                                                            } @else {
                                                                <span class="no-filter">All records</span>
                                                            }
                                                        </td>
                                                        <td class="text-right">{{ entry.itemCount.toLocaleString() }}</td>
                                                        <td class="text-right">{{ entry.sizeDisplay }}</td>
                                                        <td>{{ formatTime(entry.loadedAt) }}</td>
                                                        <td>{{ formatTime(entry.lastAccessedAt) }}</td>
                                                    </tr>
                                                }
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            } @else {
                                <div class="cache-entries-section">
                                    <h4>
                                        <i class="fa-solid fa-list"></i>
                                        Cached Entries
                                    </h4>
                                    <div class="empty-entries">
                                        <i class="fa-solid fa-inbox"></i>
                                        <p>No entries in cache</p>
                                    </div>
                                </div>
                            }
                            </div>
                        </div>
                    }

                    <!-- Configuration Section -->
                    @if (activeSection === 'config') {
                        <div class="section-panel">
                            <div class="panel-header">
                                <h3>
                                    <i class="fa-solid fa-sliders-h"></i>
                                    DataPool Configuration
                                </h3>
                            </div>

                            <div class="section-panel-content">
                            <div class="config-grid">
                                <div class="config-item">
                                    <div class="config-label">Request Pooling</div>
                                    <div class="config-value">
                                        <span class="config-badge" [class.badge-enabled]="dataPoolStats?.config?.enablePooling" [class.badge-disabled]="!dataPoolStats?.config?.enablePooling">
                                            {{ dataPoolStats?.config?.enablePooling ? 'Enabled' : 'Disabled' }}
                                        </span>
                                    </div>
                                    <div class="config-description">
                                        Batches multiple data requests together for efficiency
                                    </div>
                                </div>

                                @if (dataPoolStats?.config?.enablePooling) {
                                    <div class="config-item">
                                        <div class="config-label">Pooling Window</div>
                                        <div class="config-value">{{ dataPoolStats?.config?.poolingWindowMs }}ms</div>
                                        <div class="config-description">
                                            Initial window for collecting requests before executing
                                        </div>
                                    </div>

                                    <div class="config-item">
                                        <div class="config-label">Max Extension</div>
                                        <div class="config-value">{{ dataPoolStats?.config?.poolingMaxExtensionMs }}ms</div>
                                        <div class="config-description">
                                            Maximum time the window can be extended by new requests (capped debounce)
                                        </div>
                                    </div>
                                }

                                <div class="config-item">
                                    <div class="config-label">Cross-Engine Sharing</div>
                                    <div class="config-value">
                                        <span class="config-badge" [class.badge-enabled]="dataPoolStats?.config?.enableCrossEngineSharing" [class.badge-disabled]="!dataPoolStats?.config?.enableCrossEngineSharing">
                                            {{ dataPoolStats?.config?.enableCrossEngineSharing ? 'Enabled' : 'Disabled' }}
                                        </span>
                                    </div>
                                    <div class="config-description">
                                        When enabled, engines share cached data through a central memory cache
                                    </div>
                                </div>

                                <div class="config-item">
                                    <div class="config-label">Local Cache</div>
                                    <div class="config-value">
                                        <span class="config-badge" [class.badge-enabled]="dataPoolStats?.config?.enableLocalCache" [class.badge-disabled]="!dataPoolStats?.config?.enableLocalCache">
                                            {{ dataPoolStats?.config?.enableLocalCache ? 'Enabled' : 'Disabled' }}
                                        </span>
                                    </div>
                                    <div class="config-description">
                                        Persists cache to local storage for faster subsequent page loads
                                    </div>
                                </div>
                            </div>

                            <div class="config-note">
                                <i class="fa-solid fa-info-circle"></i>
                                <div>
                                    <strong>Note:</strong> Configuration changes can be made programmatically via
                                    <code>DataPool.Instance.Configure()</code> or by using <code>ConfigEx()</code> on any BaseEngine.
                                </div>
                            </div>
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

        .card-icon--cache {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
        }

        .card-icon--pooling {
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

        .action-btn--warning:hover:not(:disabled) {
            background: #ffebee;
            color: #d32f2f;
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
            padding: 20px 24px;
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

        /* Cache Overview */
        .cache-overview {
            padding: 24px;
            border-bottom: 1px solid #f0f0f0;
        }

        .cache-stat-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 20px;
        }

        .cache-stat {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px;
            background: #f8f9fa;
            border-radius: 10px;
        }

        .cache-stat-icon {
            width: 44px;
            height: 44px;
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
        }

        .cache-stat-content {
            flex: 1;
        }

        .cache-stat-value {
            font-size: 18px;
            font-weight: 700;
            color: #333;
        }

        .cache-stat-label {
            font-size: 12px;
            color: #999;
            margin-top: 2px;
        }

        /* Feature Grid */
        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            padding: 24px;
        }

        .feature-card {
            display: flex;
            gap: 16px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
            border: 2px solid #e0e0e0;
            transition: all 0.2s ease;
        }

        .feature-card.feature-enabled {
            border-color: #4caf50;
            background: #f1f8e9;
        }

        .feature-icon {
            width: 48px;
            height: 48px;
            background: #e0e0e0;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            color: #999;
            flex-shrink: 0;
        }

        .feature-card.feature-enabled .feature-icon {
            background: #4caf50;
            color: white;
        }

        .feature-content {
            flex: 1;
        }

        .feature-name {
            font-size: 15px;
            font-weight: 600;
            color: #333;
        }

        .feature-status {
            font-size: 12px;
            font-weight: 500;
            color: #999;
            margin-top: 4px;
        }

        .feature-card.feature-enabled .feature-status {
            color: #4caf50;
        }

        .feature-description {
            font-size: 12px;
            color: #666;
            margin-top: 8px;
            line-height: 1.4;
        }

        /* Configuration Grid */
        .config-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            padding: 24px;
        }

        .config-item {
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
        }

        .config-label {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px;
        }

        .config-value {
            font-size: 18px;
            font-weight: 600;
            color: #4caf50;
            margin-bottom: 8px;
        }

        .config-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }

        .badge-enabled {
            background: #c8e6c9;
            color: #2e7d32;
        }

        .badge-disabled {
            background: #ffcdd2;
            color: #c62828;
        }

        .config-description {
            font-size: 12px;
            color: #666;
            line-height: 1.5;
        }

        .config-note {
            display: flex;
            gap: 12px;
            margin: 0 24px 24px;
            padding: 16px 20px;
            background: #e3f2fd;
            border-radius: 8px;
            font-size: 13px;
            color: #1565c0;
        }

        .config-note i {
            margin-top: 2px;
        }

        .config-note code {
            background: rgba(0, 0, 0, 0.08);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
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
        /* Storage Status Section */
        .storage-status-section {
            padding: 24px;
            border-top: 1px solid #f0f0f0;
        }

        .storage-status-section h4 {
            margin: 0 0 16px 0;
            font-size: 14px;
            font-weight: 600;
            color: #333;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .storage-status-section h4 i {
            color: #4caf50;
        }

        .storage-status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }

        .storage-status-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 12px 16px;
            background: #f8f9fa;
            border-radius: 8px;
            min-width: 0;
        }

        .status-label {
            font-size: 12px;
            color: #666;
        }

        .status-value {
            font-size: 13px;
            font-weight: 600;
            color: #333;
            word-break: break-word;
            overflow-wrap: break-word;
        }

        .status-value.status-yes {
            color: #2e7d32;
        }

        .status-value.status-no {
            color: #c62828;
        }

        /* Cache Entries Section */
        .cache-entries-section {
            padding: 24px;
            border-top: 1px solid #f0f0f0;
        }

        .cache-entries-section h4 {
            margin: 0 0 16px 0;
            font-size: 14px;
            font-weight: 600;
            color: #333;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .cache-entries-section h4 i {
            color: #4caf50;
        }

        .cache-entries-table-wrapper {
            overflow-x: auto;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
        }

        .cache-entries-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .cache-entries-table th {
            background: #f8f9fa;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            color: #666;
            border-bottom: 1px solid #e0e0e0;
            white-space: nowrap;
        }

        .cache-entries-table th.text-right {
            text-align: right;
        }

        .cache-entries-table td {
            padding: 12px 16px;
            border-bottom: 1px solid #f0f0f0;
            color: #333;
        }

        .cache-entries-table td.text-right {
            text-align: right;
        }

        .cache-entries-table tbody tr:last-child td {
            border-bottom: none;
        }

        .cache-entries-table tbody tr:hover {
            background: #f8f9fa;
        }

        .cache-entries-table .entity-name {
            font-weight: 500;
            color: #333;
        }

        .cache-entries-table .filter-cell {
            max-width: 300px;
        }

        .cache-entries-table .filter-text {
            font-size: 11px;
            background: #e3f2fd;
            color: #1565c0;
            padding: 2px 6px;
            border-radius: 4px;
            display: inline-block;
            max-width: 280px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .cache-entries-table .no-filter {
            font-size: 12px;
            color: #999;
            font-style: italic;
        }

        .empty-entries {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            color: #999;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .empty-entries i {
            font-size: 36px;
            margin-bottom: 12px;
            color: #ddd;
        }

        .empty-entries p {
            margin: 0;
            font-size: 14px;
            color: #666;
        }

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
    activeSection: 'engines' | 'datapool' | 'config' = 'engines';
    lastUpdated = new Date();
    isRefreshingEngines = false;

    // Data
    engineStats: EngineMemoryStats | null = null;
    engines: EngineDiagnosticInfo[] = [];
    dataPoolStats: DataPoolStats | null = null;

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

    setActiveSection(section: 'engines' | 'datapool' | 'config'): void {
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

            // Get DataPool detailed stats
            const detailedStats = DataPool.Instance.GetDetailedCacheStats();
            const config = DataPool.Instance.Config;
            const localStorageStatus = await DataPool.Instance.GetLocalStorageStatus();

            // Transform entries for display
            const entries: CacheEntryInfo[] = detailedStats.entries.map(entry => ({
                key: entry.key,
                entityName: entry.entityName,
                filter: entry.filter,
                itemCount: entry.itemCount,
                estimatedSizeBytes: entry.estimatedSizeBytes,
                sizeDisplay: this.formatBytes(entry.estimatedSizeBytes),
                loadedAt: entry.loadedAt,
                lastAccessedAt: entry.lastAccessedAt,
                entityUpdatedAt: entry.entityUpdatedAt
            }));

            this.dataPoolStats = {
                memoryEntries: detailedStats.memoryEntries,
                totalEstimatedBytes: detailedStats.totalEstimatedBytes,
                totalDisplay: this.formatBytes(detailedStats.totalEstimatedBytes),
                oldestEntry: detailedStats.oldestEntry,
                newestEntry: detailedStats.newestEntry,
                config: {
                    enablePooling: config.enablePooling,
                    poolingWindowMs: config.poolingWindowMs,
                    poolingMaxExtensionMs: config.poolingMaxExtensionMs,
                    enableLocalCache: config.enableLocalCache,
                    enableCrossEngineSharing: config.enableCrossEngineSharing
                },
                entries,
                localStorage: localStorageStatus
            };

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

    async invalidateAllCache(): Promise<void> {
        try {
            await DataPool.Instance.InvalidateAll();
            this.refreshData();
        } catch (error) {
            console.error('Error invalidating cache:', error);
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

    formatTimeNullable(date: Date | null): string {
        if (!date) return 'N/A';
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
