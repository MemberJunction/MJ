import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ElementRef, ViewChild, AfterViewInit, NgZone } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RegisterClass, TelemetryManager, TelemetryEvent, TelemetryPattern, TelemetryInsight, TelemetryCategory } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { BaseEngineRegistry, EngineMemoryStats } from '@memberjunction/core';
import * as d3 from 'd3';

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
 * Display-friendly telemetry pattern info
 */
export interface TelemetryPatternDisplay {
    fingerprint: string;
    category: TelemetryCategory;
    operation: string;
    entityName: string | null;
    filter: string | null;
    orderBy: string | null;
    count: number;
    avgElapsedMs: number;
    totalElapsedMs: number;
    minElapsedMs: number;
    maxElapsedMs: number;
    lastSeen: Date;
    sampleParams: Record<string, unknown>;
}

/**
 * Display-friendly telemetry event for timeline
 */
export interface TelemetryEventDisplay {
    id: string;
    category: TelemetryCategory;
    operation: string;
    entityName: string | null;
    filter: string | null;
    startTime: number;
    endTime: number | undefined;
    elapsedMs: number | undefined;
    timestamp: Date;
    params: Record<string, unknown>;
}

/**
 * Extended insight with expansion state
 */
export interface TelemetryInsightDisplay extends TelemetryInsight {
    expanded: boolean;
    relatedEvents: TelemetryEventDisplay[];
}

/**
 * Sort configuration for patterns table
 */
export interface PatternSortConfig {
    column: 'category' | 'operation' | 'entity' | 'count' | 'avgMs' | 'totalMs';
    direction: 'asc' | 'desc';
}

/**
 * Summary stats for telemetry
 */
export interface TelemetrySummary {
    totalEvents: number;
    totalPatterns: number;
    totalInsights: number;
    activeEvents: number;
    byCategory: Record<TelemetryCategory, { events: number; avgMs: number }>;
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
                        <div
                            class="nav-item"
                            [class.active]="activeSection === 'performance'"
                            (click)="setActiveSection('performance')"
                        >
                            <i class="fa-solid fa-chart-line"></i>
                            <span>Performance</span>
                            <span class="nav-badge">{{ telemetrySummary?.totalEvents || 0 }}</span>
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

                    <!-- Performance Section -->
                    @if (activeSection === 'performance') {
                        <div class="section-panel perf-panel">
                            <div class="panel-header">
                                <h3>
                                    <i class="fa-solid fa-chart-line"></i>
                                    Performance Telemetry
                                </h3>
                                <div class="panel-actions">
                                    <button class="action-btn" [class.active]="telemetryEnabled" (click)="toggleTelemetry()">
                                        <i class="fa-solid" [class.fa-toggle-on]="telemetryEnabled" [class.fa-toggle-off]="!telemetryEnabled"></i>
                                        {{ telemetryEnabled ? 'Enabled' : 'Disabled' }}
                                    </button>
                                    <button class="action-btn" (click)="clearTelemetry()" [disabled]="!telemetryEnabled">
                                        <i class="fa-solid fa-trash"></i>
                                        Clear
                                    </button>
                                </div>
                            </div>

                            <!-- Performance Sub-Navigation Tabs -->
                            <div class="perf-tabs">
                                <button class="perf-tab" [class.active]="perfTab === 'monitor'" (click)="setPerfTab('monitor')">
                                    <i class="fa-solid fa-chart-area"></i>
                                    <span>Monitor</span>
                                </button>
                                <button class="perf-tab" [class.active]="perfTab === 'overview'" (click)="setPerfTab('overview')">
                                    <i class="fa-solid fa-gauge"></i>
                                    <span>Overview</span>
                                    @if (slowQueries.length > 0) {
                                        <span class="tab-badge warning">{{ slowQueries.length }}</span>
                                    }
                                </button>
                                <button class="perf-tab" [class.active]="perfTab === 'events'" (click)="setPerfTab('events')">
                                    <i class="fa-solid fa-timeline"></i>
                                    <span>Events</span>
                                    <span class="tab-badge">{{ telemetrySummary?.totalEvents || 0 }}</span>
                                </button>
                                <button class="perf-tab" [class.active]="perfTab === 'patterns'" (click)="setPerfTab('patterns')">
                                    <i class="fa-solid fa-fingerprint"></i>
                                    <span>Patterns</span>
                                    <span class="tab-badge">{{ telemetrySummary?.totalPatterns || 0 }}</span>
                                </button>
                                <button class="perf-tab" [class.active]="perfTab === 'insights'" (click)="setPerfTab('insights')">
                                    <i class="fa-solid fa-lightbulb"></i>
                                    <span>Insights</span>
                                    @if (telemetryInsights.length > 0) {
                                        <span class="tab-badge insight">{{ telemetryInsights.length }}</span>
                                    }
                                </button>
                            </div>

                            <div class="section-panel-content">
                                @if (!telemetryEnabled) {
                                    <div class="info-banner warning-banner">
                                        <i class="fa-solid fa-exclamation-triangle"></i>
                                        <div>
                                            <strong>Telemetry is disabled.</strong>
                                            Enable telemetry to track RunView, RunQuery, and Engine loading performance.
                                        </div>
                                    </div>
                                }

                                <!-- Monitor Tab (PerfMon Chart) -->
                                @if (perfTab === 'monitor') {
                                    <div class="perfmon-section">
                                        <div class="perfmon-header">
                                            <div class="perfmon-legend">
                                                <span class="legend-item runview"><span class="legend-dot"></span> RunView</span>
                                                <span class="legend-item runquery"><span class="legend-dot"></span> RunQuery</span>
                                                <span class="legend-item engine"><span class="legend-dot"></span> Engine</span>
                                                <span class="legend-item ai"><span class="legend-dot"></span> AI</span>
                                            </div>
                                        </div>
                                        <div class="perfmon-chart-container">
                                            <div class="perfmon-y-axis">
                                                <span class="axis-label">Duration (ms)</span>
                                            </div>
                                            <div #perfChart class="perfmon-chart"></div>
                                        </div>
                                        <div class="perfmon-footer">
                                            <span class="footer-note">
                                                <i class="fa-solid fa-info-circle"></i>
                                                Time relative to telemetry start. Hover over points for details.
                                            </span>
                                            <span class="footer-stats" *ngIf="telemetrySummary">
                                                {{ telemetrySummary.totalEvents }} events
                                            </span>
                                        </div>
                                    </div>
                                }

                                <!-- Overview Tab -->
                                @if (perfTab === 'overview') {
                                    <!-- Summary Stats -->
                                    <div class="telemetry-summary">
                                        <div class="summary-card">
                                            <div class="summary-value">{{ telemetrySummary?.totalEvents || 0 }}</div>
                                            <div class="summary-label">Total Events</div>
                                        </div>
                                        <div class="summary-card">
                                            <div class="summary-value">{{ telemetrySummary?.totalPatterns || 0 }}</div>
                                            <div class="summary-label">Unique Patterns</div>
                                        </div>
                                        <div class="summary-card">
                                            <div class="summary-value">{{ telemetrySummary?.totalInsights || 0 }}</div>
                                            <div class="summary-label">Insights</div>
                                        </div>
                                        <div class="summary-card">
                                            <div class="summary-value">{{ telemetrySummary?.activeEvents || 0 }}</div>
                                            <div class="summary-label">Active</div>
                                        </div>
                                    </div>

                                    <!-- Category Breakdown -->
                                    @if (telemetrySummary && telemetrySummary.totalEvents > 0) {
                                        <div class="category-breakdown">
                                            <h4>By Category</h4>
                                            <div class="category-grid">
                                                @for (cat of categoriesWithData; track cat.name) {
                                                    <div class="category-item" (click)="jumpToPatternsByCategory(cat.name)">
                                                        <span class="category-name">{{ cat.name }}</span>
                                                        <span class="category-events">{{ cat.events }}</span>
                                                        <span class="category-avg">avg {{ cat.avgMs | number:'1.0-0' }}ms</span>
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    }

                                    <!-- Slow Queries Section -->
                                    @if (slowQueries.length > 0) {
                                        <div class="slow-queries-section">
                                            <h4>
                                                <i class="fa-solid fa-turtle"></i>
                                                Slow Operations (>{{ slowQueryThresholdMs }}ms)
                                            </h4>
                                            <div class="slow-queries-list">
                                                @for (query of slowQueries.slice(0, 10); track query.id) {
                                                    <div class="slow-query-item">
                                                        <div class="slow-query-main">
                                                            <span class="category-chip small" [class]="'cat-' + query.category.toLowerCase()">
                                                                {{ query.category }}
                                                            </span>
                                                            <span class="slow-query-entity">{{ query.entityName || query.operation }}</span>
                                                            <span class="slow-query-time">{{ query.elapsedMs | number:'1.0-0' }}ms</span>
                                                        </div>
                                                        @if (query.filter) {
                                                            <div class="slow-query-filter">{{ truncateString(query.filter, 60) }}</div>
                                                        }
                                                        <div class="slow-query-timestamp">{{ formatTimestamp(query.timestamp) }}</div>
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    } @else if (telemetryEnabled && telemetrySummary && telemetrySummary.totalEvents > 0) {
                                        <div class="success-banner">
                                            <i class="fa-solid fa-check-circle"></i>
                                            <span>No slow operations detected. All operations completed under {{ slowQueryThresholdMs }}ms.</span>
                                        </div>
                                    }
                                }

                                <!-- Events Tab (Timeline) -->
                                @if (perfTab === 'events') {
                                    <!-- Filter Bar for Events -->
                                    <div class="filter-bar compact">
                                        <div class="search-box">
                                            <i class="fa-solid fa-search"></i>
                                            <input type="text"
                                                   placeholder="Search events..."
                                                   [(ngModel)]="searchQuery"
                                                   (ngModelChange)="onSearchChange()">
                                            @if (searchQuery) {
                                                <button class="clear-search" (click)="clearSearch()">
                                                    <i class="fa-solid fa-times"></i>
                                                </button>
                                            }
                                        </div>
                                        <div class="filter-buttons">
                                            <button class="filter-btn" [class.active]="categoryFilter === 'all'" (click)="setCategoryFilter('all')">
                                                All
                                            </button>
                                            @for (cat of categoriesWithData; track cat.name) {
                                                <button class="filter-btn" [class.active]="categoryFilter === cat.name" (click)="setCategoryFilterByName(cat.name)">
                                                    {{ cat.name }}
                                                </button>
                                            }
                                        </div>
                                    </div>

                                    <div class="timeline-section">
                                        <div class="timeline-container">
                                            @if (filteredEvents.length > 0) {
                                                @for (event of filteredEvents.slice(0, 50); track event.id) {
                                                    <div class="timeline-item" [class]="'tl-' + event.category.toLowerCase()">
                                                        <div class="timeline-marker">
                                                            <div class="marker-dot"></div>
                                                            <div class="marker-line"></div>
                                                        </div>
                                                        <div class="timeline-content">
                                                            <div class="timeline-header">
                                                                <span class="timeline-time">{{ formatTimestamp(event.timestamp) }}</span>
                                                                <span class="category-chip small" [class]="'cat-' + event.category.toLowerCase()">
                                                                    {{ event.category }}
                                                                </span>
                                                                @if (event.elapsedMs !== undefined) {
                                                                    <span class="timeline-duration" [class.slow]="(event.elapsedMs || 0) >= slowQueryThresholdMs">
                                                                        {{ event.elapsedMs | number:'1.0-0' }}ms
                                                                    </span>
                                                                }
                                                            </div>
                                                            <div class="timeline-body">
                                                                <span class="timeline-operation">{{ event.operation }}</span>
                                                                @if (event.entityName) {
                                                                    <span class="timeline-entity">{{ event.entityName }}</span>
                                                                }
                                                            </div>
                                                            @if (event.filter) {
                                                                <div class="timeline-filter">{{ truncateString(event.filter, 80) }}</div>
                                                            }
                                                        </div>
                                                    </div>
                                                }
                                            } @else {
                                                <div class="empty-state small">
                                                    <i class="fa-solid fa-hourglass-start"></i>
                                                    <p>No events recorded yet</p>
                                                </div>
                                            }
                                        </div>
                                    </div>
                                }

                                <!-- Patterns Tab -->
                                @if (perfTab === 'patterns') {
                                    <!-- Filter Bar -->
                                    <div class="filter-bar compact">
                                        <div class="search-box">
                                            <i class="fa-solid fa-search"></i>
                                            <input type="text"
                                                   placeholder="Search patterns..."
                                                   [(ngModel)]="searchQuery"
                                                   (ngModelChange)="onSearchChange()">
                                            @if (searchQuery) {
                                                <button class="clear-search" (click)="clearSearch()">
                                                    <i class="fa-solid fa-times"></i>
                                                </button>
                                            }
                                        </div>
                                        <div class="filter-buttons">
                                            <button class="filter-btn" [class.active]="categoryFilter === 'all'" (click)="setCategoryFilter('all')">
                                                All
                                            </button>
                                            @for (cat of categoriesWithData; track cat.name) {
                                                <button class="filter-btn" [class.active]="categoryFilter === cat.name" (click)="setCategoryFilterByName(cat.name)">
                                                    {{ cat.name }}
                                                </button>
                                            }
                                        </div>
                                    </div>

                                    @if (filteredPatterns.length > 0) {
                                        <div class="patterns-section">
                                            <div class="patterns-table-wrapper">
                                                <table class="patterns-table sortable">
                                                    <thead>
                                                        <tr>
                                                            <th class="sortable-header" (click)="sortPatternsBy('category')">
                                                                Category
                                                                <i class="fa-solid" [class]="getSortIcon('category')"></i>
                                                            </th>
                                                            <th class="sortable-header" (click)="sortPatternsBy('operation')">
                                                                Operation
                                                                <i class="fa-solid" [class]="getSortIcon('operation')"></i>
                                                            </th>
                                                            <th class="sortable-header" (click)="sortPatternsBy('entity')">
                                                                Entity/Query
                                                                <i class="fa-solid" [class]="getSortIcon('entity')"></i>
                                                            </th>
                                                            <th>Filter</th>
                                                            <th class="sortable-header text-right" (click)="sortPatternsBy('count')">
                                                                Count
                                                                <i class="fa-solid" [class]="getSortIcon('count')"></i>
                                                            </th>
                                                            <th class="sortable-header text-right" (click)="sortPatternsBy('avgMs')">
                                                                Avg (ms)
                                                                <i class="fa-solid" [class]="getSortIcon('avgMs')"></i>
                                                            </th>
                                                            <th class="sortable-header text-right" (click)="sortPatternsBy('totalMs')">
                                                                Total (ms)
                                                                <i class="fa-solid" [class]="getSortIcon('totalMs')"></i>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        @for (pattern of filteredPatterns; track pattern.fingerprint) {
                                                            <tr [class.duplicate-row]="pattern.count >= 2" [class.slow-row]="pattern.avgElapsedMs >= slowQueryThresholdMs">
                                                                <td>
                                                                    <span class="category-chip" [class]="'cat-' + pattern.category.toLowerCase()">
                                                                        {{ pattern.category }}
                                                                    </span>
                                                                </td>
                                                                <td class="operation-cell">{{ pattern.operation }}</td>
                                                                <td class="entity-cell">{{ pattern.entityName || '-' }}</td>
                                                                <td class="filter-cell" [title]="pattern.filter || ''">
                                                                    {{ truncateString(pattern.filter, 30) }}
                                                                </td>
                                                                <td class="text-right">
                                                                    @if (pattern.count >= 2) {
                                                                        <span class="count-warning">{{ pattern.count }}</span>
                                                                    } @else {
                                                                        {{ pattern.count }}
                                                                    }
                                                                </td>
                                                                <td class="text-right" [class.slow-value]="pattern.avgElapsedMs >= slowQueryThresholdMs">
                                                                    {{ pattern.avgElapsedMs | number:'1.1-1' }}
                                                                </td>
                                                                <td class="text-right">{{ pattern.totalElapsedMs | number:'1.0-0' }}</td>
                                                            </tr>
                                                        }
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    } @else if (telemetryEnabled && telemetryPatterns.length === 0) {
                                        <div class="empty-state">
                                            <i class="fa-solid fa-hourglass-start"></i>
                                            <p>No telemetry data yet</p>
                                            <span class="empty-hint">Navigate around the app to generate performance data</span>
                                        </div>
                                    } @else if (searchQuery || categoryFilter !== 'all') {
                                        <div class="empty-state small">
                                            <i class="fa-solid fa-filter"></i>
                                            <p>No patterns match your filter</p>
                                        </div>
                                    }
                                }

                                <!-- Insights Tab -->
                                @if (perfTab === 'insights') {
                                    @if (telemetryInsights.length > 0) {
                                        <div class="insights-section">
                                            <div class="insights-list">
                                                @for (insight of telemetryInsights; track insight.id) {
                                                    <div class="insight-card expandable" [class]="getSeverityClass(insight.severity)" [class.expanded]="insight.expanded">
                                                        <div class="insight-header" (click)="toggleInsightExpanded(insight)">
                                                            <i class="fa-solid" [class]="getSeverityIcon(insight.severity)"></i>
                                                            <span class="insight-title">{{ insight.title }}</span>
                                                            <span class="insight-category">{{ insight.category }}</span>
                                                            <i class="fa-solid expand-icon" [class.fa-chevron-down]="!insight.expanded" [class.fa-chevron-up]="insight.expanded"></i>
                                                        </div>

                                                        <!-- Always show key info for actionability -->
                                                        <div class="insight-key-info">
                                                            @if (insight.entityName) {
                                                                <div class="key-info-item">
                                                                    <span class="key-label">Entity:</span>
                                                                    <span class="key-value entity-name">{{ insight.entityName }}</span>
                                                                </div>
                                                            }
                                                            @if (getInsightFilter(insight)) {
                                                                <div class="key-info-item">
                                                                    <span class="key-label">Filter:</span>
                                                                    <code class="key-value filter-code">{{ getInsightFilter(insight) }}</code>
                                                                </div>
                                                            }
                                                        </div>

                                                        <div class="insight-message">{{ insight.message }}</div>
                                                        <div class="insight-suggestion">
                                                            <i class="fa-solid fa-arrow-right"></i>
                                                            {{ insight.suggestion }}
                                                        </div>

                                                        <!-- Expanded Details -->
                                                        @if (insight.expanded) {
                                                            <div class="insight-details">
                                                                <!-- Show all params from first related event -->
                                                                @if (insight.relatedEvents.length > 0) {
                                                                    <div class="detail-section">
                                                                        <div class="detail-label">Full Parameters</div>
                                                                        <div class="params-display">
                                                                            @for (param of getEventParams(insight.relatedEvents[0]); track param.key) {
                                                                                <div class="param-row">
                                                                                    <span class="param-key">{{ param.key }}:</span>
                                                                                    <span class="param-value">{{ param.value }}</span>
                                                                                </div>
                                                                            }
                                                                        </div>
                                                                    </div>
                                                                    <div class="detail-section">
                                                                        <div class="detail-label">Related Calls ({{ insight.relatedEvents.length }})</div>
                                                                        <div class="related-events">
                                                                            @for (event of insight.relatedEvents; track event.id) {
                                                                                <div class="related-event">
                                                                                    <span class="event-time">{{ formatTimestamp(event.timestamp) }}</span>
                                                                                    <span class="event-duration">{{ event.elapsedMs | number:'1.0-0' }}ms</span>
                                                                                    @if (event.entityName) {
                                                                                        <span class="event-entity">{{ event.entityName }}</span>
                                                                                    }
                                                                                    @if (event.filter) {
                                                                                        <span class="event-filter">{{ truncateString(event.filter, 40) }}</span>
                                                                                    }
                                                                                </div>
                                                                            }
                                                                        </div>
                                                                    </div>
                                                                }
                                                            </div>
                                                        }
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    } @else {
                                        <div class="empty-state">
                                            <i class="fa-solid fa-check-circle" style="color: #4caf50;"></i>
                                            <p>No optimization insights</p>
                                            <span class="empty-hint">Insights will appear when potential optimizations are detected</span>
                                        </div>
                                    }
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

        /* Performance Section Styles */
        .warning-banner {
            background: #fff3e0 !important;
            color: #e65100 !important;
        }

        .warning-banner i {
            color: #ff9800;
        }

        .telemetry-summary {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }

        .summary-card {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 16px;
            text-align: center;
        }

        .summary-value {
            font-size: 28px;
            font-weight: 700;
            color: #333;
        }

        .summary-label {
            font-size: 12px;
            color: #666;
            margin-top: 4px;
        }

        .category-breakdown {
            margin-bottom: 24px;
        }

        .category-breakdown h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: #666;
        }

        .category-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }

        .category-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: #f0f4f8;
            border-radius: 20px;
            font-size: 13px;
        }

        .category-name {
            font-weight: 600;
            color: #333;
        }

        .category-events {
            background: #667eea;
            color: white;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
        }

        .category-avg {
            color: #999;
            font-size: 11px;
        }

        .insights-section {
            margin-bottom: 24px;
        }

        .insights-section h4 {
            margin: 0 0 16px 0;
            font-size: 14px;
            font-weight: 600;
            color: #666;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .insights-section h4 i {
            color: #ff9800;
        }

        .insights-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .insight-card {
            padding: 16px;
            border-radius: 8px;
            border-left: 4px solid #ccc;
        }

        .insight-card.severity-info {
            background: #e3f2fd;
            border-left-color: #2196f3;
        }

        .insight-card.severity-warning {
            background: #fff3e0;
            border-left-color: #ff9800;
        }

        .insight-card.severity-optimization {
            background: #e8f5e9;
            border-left-color: #4caf50;
        }

        .insight-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }

        .insight-header i {
            font-size: 16px;
        }

        .severity-info .insight-header i { color: #2196f3; }
        .severity-warning .insight-header i { color: #ff9800; }
        .severity-optimization .insight-header i { color: #4caf50; }

        .insight-title {
            font-weight: 600;
            color: #333;
            flex: 1;
        }

        .insight-category {
            font-size: 11px;
            padding: 2px 8px;
            background: rgba(0,0,0,0.1);
            border-radius: 10px;
            color: #666;
        }

        .insight-message {
            font-size: 13px;
            color: #555;
            margin-bottom: 8px;
        }

        .insight-suggestion {
            font-size: 12px;
            color: #666;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .insight-suggestion i {
            color: #4caf50;
            font-size: 10px;
        }

        .patterns-section h4 {
            margin: 0 0 16px 0;
            font-size: 14px;
            font-weight: 600;
            color: #666;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .patterns-section h4 i {
            color: #667eea;
        }

        .patterns-table-wrapper {
            overflow-x: auto;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
        }

        .patterns-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .patterns-table th {
            background: #f8f9fa;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            color: #666;
            border-bottom: 1px solid #e0e0e0;
            white-space: nowrap;
        }

        .patterns-table td {
            padding: 12px 16px;
            border-bottom: 1px solid #f0f0f0;
            color: #333;
        }

        .patterns-table tbody tr:last-child td {
            border-bottom: none;
        }

        .patterns-table tbody tr:hover {
            background: #f8f9fa;
        }

        .duplicate-row {
            background: #fff3e0;
        }

        .duplicate-row:hover {
            background: #ffe0b2 !important;
        }

        .category-chip {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .cat-runview { background: #e3f2fd; color: #1565c0; }
        .cat-runquery { background: #f3e5f5; color: #7b1fa2; }
        .cat-engine { background: #e8f5e9; color: #2e7d32; }
        .cat-ai { background: #fff3e0; color: #e65100; }
        .cat-cache { background: #fce4ec; color: #c2185b; }
        .cat-network { background: #e0f2f1; color: #00695c; }
        .cat-custom { background: #f5f5f5; color: #616161; }

        .operation-cell {
            font-family: monospace;
            font-size: 12px;
        }

        .entity-cell {
            font-weight: 500;
        }

        .count-warning {
            display: inline-block;
            padding: 2px 8px;
            background: #ff9800;
            color: white;
            border-radius: 10px;
            font-weight: 600;
        }

        .action-btn.active {
            background: #4caf50;
            color: white;
        }

        /* Slow Queries Section */
        .slow-queries-section {
            margin-bottom: 24px;
            background: #fff8e1;
            border-radius: 8px;
            padding: 16px;
            border-left: 4px solid #ff9800;
        }

        .slow-queries-section h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: #e65100;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .slow-queries-section h4 i {
            color: #ff9800;
        }

        .slow-queries-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .slow-query-item {
            background: white;
            border-radius: 6px;
            padding: 10px 12px;
            border: 1px solid #ffe0b2;
        }

        .slow-query-main {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .slow-query-entity {
            flex: 1;
            font-weight: 500;
            color: #333;
        }

        .slow-query-time {
            font-weight: 700;
            color: #e65100;
            font-size: 14px;
        }

        .slow-query-filter {
            font-size: 11px;
            color: #666;
            margin-top: 4px;
            font-family: monospace;
        }

        .slow-query-timestamp {
            font-size: 11px;
            color: #999;
            margin-top: 4px;
        }

        /* View Toggle */
        .view-toggle {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
        }

        .toggle-btn {
            padding: 8px 16px;
            border: 1px solid #e0e0e0;
            background: white;
            border-radius: 6px;
            font-size: 13px;
            color: #666;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        }

        .toggle-btn:hover {
            background: #f5f5f5;
        }

        .toggle-btn.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        /* Expandable Insight Cards */
        .insight-card.expandable {
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .insight-card.expandable:hover {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .insight-card .expand-icon {
            color: #999;
            font-size: 12px;
            margin-left: auto;
        }

        .insight-card.expanded {
            border-width: 2px;
        }

        .insight-details {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid rgba(0, 0, 0, 0.1);
        }

        .detail-section {
            margin-bottom: 12px;
        }

        .detail-label {
            font-size: 11px;
            font-weight: 600;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 4px;
        }

        .detail-value {
            font-size: 13px;
            color: #333;
        }

        .related-events {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 200px;
            overflow-y: auto;
        }

        .related-event {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 6px 10px;
            background: rgba(0, 0, 0, 0.03);
            border-radius: 4px;
            font-size: 12px;
        }

        .event-time {
            font-family: monospace;
            color: #666;
        }

        .event-duration {
            font-weight: 600;
            color: #333;
        }

        .event-filter {
            color: #999;
            font-family: monospace;
            font-size: 11px;
        }

        /* Timeline Section */
        .timeline-section h4 {
            margin: 0 0 16px 0;
            font-size: 14px;
            font-weight: 600;
            color: #666;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .timeline-section h4 i {
            color: #667eea;
        }

        .timeline-container {
            position: relative;
            padding-left: 24px;
            max-height: 400px;
            overflow-y: auto;
        }

        .timeline-item {
            display: flex;
            gap: 16px;
            margin-bottom: 12px;
            position: relative;
        }

        .timeline-marker {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: absolute;
            left: -24px;
            top: 0;
            bottom: 0;
        }

        .marker-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #667eea;
            z-index: 1;
        }

        .marker-line {
            width: 2px;
            flex: 1;
            background: #e0e0e0;
            margin-top: 4px;
        }

        .timeline-item:last-child .marker-line {
            display: none;
        }

        .tl-runview .marker-dot { background: #1565c0; }
        .tl-runquery .marker-dot { background: #7b1fa2; }
        .tl-engine .marker-dot { background: #2e7d32; }
        .tl-ai .marker-dot { background: #e65100; }
        .tl-cache .marker-dot { background: #c2185b; }

        .timeline-content {
            flex: 1;
            background: #f8f9fa;
            border-radius: 6px;
            padding: 10px 14px;
        }

        .timeline-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 4px;
        }

        .timeline-time {
            font-family: monospace;
            font-size: 11px;
            color: #999;
        }

        .timeline-duration {
            font-size: 12px;
            font-weight: 600;
            color: #333;
        }

        .timeline-duration.slow {
            color: #e65100;
            background: #fff3e0;
            padding: 2px 6px;
            border-radius: 4px;
        }

        .timeline-body {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .timeline-operation {
            font-family: monospace;
            font-size: 12px;
            color: #666;
        }

        .timeline-entity {
            font-weight: 500;
            color: #333;
        }

        .timeline-filter {
            font-size: 11px;
            color: #999;
            font-family: monospace;
            margin-top: 4px;
        }

        /* Filter Bar */
        .filter-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 16px;
            padding: 12px 16px;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .search-box {
            flex: 1;
            min-width: 200px;
            position: relative;
            display: flex;
            align-items: center;
        }

        .search-box i {
            position: absolute;
            left: 12px;
            color: #999;
        }

        .search-box input {
            width: 100%;
            padding: 8px 36px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            font-size: 13px;
            background: white;
        }

        .search-box input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
        }

        .clear-search {
            position: absolute;
            right: 8px;
            background: none;
            border: none;
            color: #999;
            cursor: pointer;
            padding: 4px;
        }

        .clear-search:hover {
            color: #666;
        }

        .filter-buttons {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        .filter-btn {
            padding: 6px 14px;
            border: 1px solid #e0e0e0;
            background: white;
            border-radius: 16px;
            font-size: 12px;
            color: #666;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .filter-btn:hover {
            background: #f0f0f0;
        }

        .filter-btn.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        /* Sortable Table Headers */
        .sortable-header {
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }

        .sortable-header:hover {
            background: #f0f0f0;
        }

        .sortable-header i {
            margin-left: 6px;
            font-size: 11px;
            color: #999;
        }

        .sortable-header i.fa-sort-up,
        .sortable-header i.fa-sort-down {
            color: #667eea;
        }

        /* Table Enhancements */
        .filter-cell {
            font-family: monospace;
            font-size: 11px;
            color: #666;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .slow-row {
            background: #ffebee;
        }

        .slow-row:hover {
            background: #ffcdd2 !important;
        }

        .slow-value {
            color: #c62828;
            font-weight: 600;
        }

        /* Small category chips */
        .category-chip.small {
            font-size: 9px;
            padding: 2px 6px;
        }

        /* Small empty state */
        .empty-state.small {
            padding: 30px 20px;
        }

        .empty-state.small i {
            font-size: 32px;
            margin-bottom: 12px;
        }

        .empty-state.small p {
            font-size: 14px;
        }

        /* Performance Sub-Tabs */
        .perf-tabs {
            display: flex;
            gap: 4px;
            padding: 12px 24px;
            background: #f5f5f5;
            border-bottom: 1px solid #e0e0e0;
        }

        .perf-tab {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border: none;
            background: transparent;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            color: #666;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .perf-tab:hover {
            background: #e8e8e8;
            color: #333;
        }

        .perf-tab.active {
            background: white;
            color: #4caf50;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .perf-tab i {
            font-size: 14px;
        }

        .tab-badge {
            background: #e0e0e0;
            color: #666;
            font-size: 10px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 8px;
            min-width: 18px;
            text-align: center;
        }

        .perf-tab.active .tab-badge {
            background: #c8e6c9;
            color: #2e7d32;
        }

        .tab-badge.warning {
            background: #fff3e0;
            color: #e65100;
        }

        .tab-badge.insight {
            background: #fff8e1;
            color: #f57f17;
        }

        .perf-panel .section-panel-content {
            padding: 20px 24px;
        }

        /* Success Banner */
        .success-banner {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 20px;
            background: #e8f5e9;
            border-radius: 8px;
            font-size: 13px;
            color: #2e7d32;
            margin-top: 16px;
        }

        .success-banner i {
            font-size: 18px;
            color: #4caf50;
        }

        /* Compact Filter Bar */
        .filter-bar.compact {
            padding: 10px 14px;
            margin-bottom: 12px;
        }

        /* Clickable category items */
        .category-item {
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .category-item:hover {
            background: #e3f2fd;
            transform: translateY(-1px);
        }

        /* Insight Key Info (always visible) */
        .insight-key-info {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px 12px;
            background: rgba(0, 0, 0, 0.03);
            border-radius: 6px;
            margin: 8px 0;
            border-left: 3px solid #2196f3;
        }

        .key-info-item {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            font-size: 12px;
        }

        .key-label {
            color: #666;
            font-weight: 500;
            min-width: 50px;
            flex-shrink: 0;
        }

        .key-value {
            color: #333;
            word-break: break-all;
        }

        .key-value.entity-name {
            font-weight: 600;
            color: #1565c0;
        }

        .key-value.filter-code {
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 11px;
            background: rgba(0, 0, 0, 0.06);
            padding: 2px 6px;
            border-radius: 3px;
            color: #333;
        }

        /* Params Display */
        .params-display {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 10px;
            font-family: 'SF Mono', Monaco, 'Courier New', monospace;
            font-size: 11px;
            max-height: 200px;
            overflow-y: auto;
        }

        .param-row {
            display: flex;
            gap: 8px;
            padding: 4px 0;
            border-bottom: 1px solid #eee;
        }

        .param-row:last-child {
            border-bottom: none;
        }

        .param-key {
            color: #6f42c1;
            font-weight: 500;
            min-width: 100px;
            flex-shrink: 0;
        }

        .param-value {
            color: #333;
            word-break: break-all;
        }

        .event-entity {
            background: #e3f2fd;
            color: #1565c0;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
        }

        /* PerfMon Chart Styles */
        .perfmon-section {
            background: #1a1a2e;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
        }

        .perfmon-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .perfmon-header h4 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: #00ff88;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .perfmon-header h4 i {
            color: #00ff88;
        }

        .perfmon-legend {
            display: flex;
            gap: 16px;
            font-size: 11px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #888;
        }

        .legend-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }

        .legend-item.runview .legend-dot { background: #00bcd4; }
        .legend-item.runquery .legend-dot { background: #e040fb; }
        .legend-item.engine .legend-dot { background: #00ff88; }
        .legend-item.ai .legend-dot { background: #ff9800; }

        .perfmon-chart-container {
            display: flex;
            background: #0d0d1a;
            border: 1px solid #333;
            border-radius: 4px;
            position: relative;
        }

        .perfmon-y-axis {
            width: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-right: 1px solid #333;
        }

        .perfmon-y-axis .axis-label {
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .perfmon-chart {
            flex: 1;
            height: 300px;
            position: relative;
            overflow: hidden;
        }

        .perfmon-chart svg {
            width: 100%;
            height: 100%;
        }

        .perfmon-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #333;
        }

        .footer-note {
            font-size: 11px;
            color: #666;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .footer-note i {
            color: #00ff88;
        }

        .footer-stats {
            font-size: 11px;
            color: #00ff88;
            font-family: monospace;
        }

        /* D3 Chart Elements */
        .perfmon-chart :deep(.grid-line) {
            stroke: #333;
            stroke-dasharray: 2,2;
        }

        .perfmon-chart :deep(.axis-line) {
            stroke: #555;
        }

        .perfmon-chart :deep(.axis-text) {
            fill: #888;
            font-size: 10px;
            font-family: monospace;
        }

        .perfmon-chart :deep(.event-point) {
            cursor: pointer;
            transition: r 0.15s ease;
        }

        .perfmon-chart :deep(.event-point:hover) {
            r: 6;
        }

        .perfmon-chart :deep(.tooltip) {
            pointer-events: none;
        }

        .perfmon-chart :deep(.tooltip-bg) {
            fill: rgba(0, 0, 0, 0.9);
            rx: 4;
        }

        .perfmon-chart :deep(.tooltip-text) {
            fill: #fff;
            font-size: 11px;
            font-family: monospace;
        }

        .perfmon-chart :deep(.area-fill) {
            opacity: 0.15;
        }

        .perfmon-chart :deep(.line-path) {
            fill: none;
            stroke-width: 1.5;
            opacity: 0.8;
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

            .perfmon-legend {
                flex-wrap: wrap;
                gap: 8px;
            }
        }
    `]
})
export class SystemDiagnosticsComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    // State
    isLoading = false;
    autoRefresh = false;
    activeSection: 'engines' | 'redundant' | 'performance' = 'engines';
    lastUpdated = new Date();
    isRefreshingEngines = false;

    // Data
    engineStats: EngineMemoryStats | null = null;
    engines: EngineDiagnosticInfo[] = [];
    redundantLoads: RedundantLoadInfo[] = [];

    // Telemetry data
    telemetrySummary: TelemetrySummary | null = null;
    telemetryPatterns: TelemetryPatternDisplay[] = [];
    telemetryInsights: TelemetryInsightDisplay[] = [];
    telemetryEnabled = false;
    categoriesWithData: { name: string; events: number; avgMs: number }[] = [];

    // Timeline data
    telemetryEvents: TelemetryEventDisplay[] = [];
    timelineView: 'insights' | 'timeline' | 'chart' = 'insights';

    // Performance sub-tabs
    perfTab: 'monitor' | 'overview' | 'events' | 'patterns' | 'insights' = 'monitor';

    // D3 Chart reference
    @ViewChild('perfChart', { static: false }) perfChartRef!: ElementRef<HTMLDivElement>;
    private chartInitialized = false;

    // Slow queries
    slowQueries: TelemetryEventDisplay[] = [];
    slowQueryThresholdMs = 500;

    // Patterns sorting
    patternSort: PatternSortConfig = { column: 'count', direction: 'desc' };

    // Search/Filter
    searchQuery = '';
    categoryFilter: TelemetryCategory | 'all' = 'all';

    // Store telemetry boot time for relative time calculations
    private telemetryBootTime: number = 0;

    constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {
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

    setActiveSection(section: 'engines' | 'redundant' | 'performance'): void {
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

            // Get telemetry data
            this.refreshTelemetryData();

            this.lastUpdated = new Date();
        } catch (error) {
            console.error('Error refreshing diagnostics data:', error);
        } finally {
            this.isLoading = false;
            this.cdr.markForCheck();
        }
    }

    private refreshTelemetryData(): void {
        const tm = TelemetryManager.Instance;
        this.telemetryEnabled = tm.IsEnabled;

        // Get summary stats
        const stats = tm.GetStats();
        this.telemetrySummary = {
            totalEvents: stats.totalEvents,
            totalPatterns: stats.totalPatterns,
            totalInsights: stats.totalInsights,
            activeEvents: stats.activeEvents,
            byCategory: stats.byCategory
        };

        // Build categories with data for display
        const categoryNames: TelemetryCategory[] = ['RunView', 'RunQuery', 'Engine', 'AI', 'Cache'];
        this.categoriesWithData = categoryNames
            .filter(cat => stats.byCategory[cat]?.events > 0)
            .map(cat => ({
                name: cat,
                events: stats.byCategory[cat].events,
                avgMs: stats.byCategory[cat].avgMs
            }));

        // Get patterns and apply sorting
        const patterns = tm.GetPatterns({ minCount: 1, sortBy: 'count' });
        this.telemetryPatterns = this.sortPatterns(patterns.slice(0, 100).map(p => ({
            fingerprint: p.fingerprint,
            category: p.category,
            operation: p.operation,
            entityName: (p.sampleParams?.EntityName as string) || (p.sampleParams?.QueryName as string) || null,
            filter: (p.sampleParams?.ExtraFilter as string) || null,
            orderBy: (p.sampleParams?.OrderBy as string) || null,
            count: p.count,
            avgElapsedMs: Math.round(p.avgElapsedMs * 100) / 100,
            totalElapsedMs: Math.round(p.totalElapsedMs),
            minElapsedMs: p.minElapsedMs === Infinity ? 0 : Math.round(p.minElapsedMs),
            maxElapsedMs: Math.round(p.maxElapsedMs),
            lastSeen: new Date(p.lastSeen),
            sampleParams: p.sampleParams
        })));

        // Get all events for timeline
        const events = tm.GetEvents({ limit: 200 });
        this.telemetryEvents = events.map(e => this.eventToDisplay(e));

        // Get slow queries (operations above threshold)
        this.slowQueries = this.telemetryEvents
            .filter(e => e.elapsedMs !== undefined && e.elapsedMs >= this.slowQueryThresholdMs)
            .sort((a, b) => (b.elapsedMs || 0) - (a.elapsedMs || 0))
            .slice(0, 20);

        // Get insights and convert to display format with expansion support
        const insights = tm.GetInsights({ limit: 20 });
        this.telemetryInsights = insights.map(insight => ({
            ...insight,
            expanded: false,
            relatedEvents: this.getRelatedEventsForInsight(insight)
        }));
    }

    private eventToDisplay(e: TelemetryEvent): TelemetryEventDisplay {
        return {
            id: e.id,
            category: e.category,
            operation: e.operation,
            entityName: (e.params?.EntityName as string) || (e.params?.QueryName as string) || null,
            filter: (e.params?.ExtraFilter as string) || null,
            startTime: e.startTime,
            endTime: e.endTime,
            elapsedMs: e.elapsedMs,
            timestamp: new Date(e.startTime),
            params: e.params
        };
    }

    private getRelatedEventsForInsight(insight: TelemetryInsight): TelemetryEventDisplay[] {
        const tm = TelemetryManager.Instance;
        const events = tm.GetEvents({ limit: 500 });
        return events
            .filter(e => insight.relatedEventIds?.includes(e.id))
            .map(e => this.eventToDisplay(e));
    }

    private sortPatterns(patterns: TelemetryPatternDisplay[]): TelemetryPatternDisplay[] {
        return [...patterns].sort((a, b) => {
            let comparison = 0;
            switch (this.patternSort.column) {
                case 'category':
                    comparison = a.category.localeCompare(b.category);
                    break;
                case 'operation':
                    comparison = a.operation.localeCompare(b.operation);
                    break;
                case 'entity':
                    comparison = (a.entityName || '').localeCompare(b.entityName || '');
                    break;
                case 'count':
                    comparison = a.count - b.count;
                    break;
                case 'avgMs':
                    comparison = a.avgElapsedMs - b.avgElapsedMs;
                    break;
                case 'totalMs':
                    comparison = a.totalElapsedMs - b.totalElapsedMs;
                    break;
            }
            return this.patternSort.direction === 'asc' ? comparison : -comparison;
        });
    }

    sortPatternsBy(column: PatternSortConfig['column']): void {
        if (this.patternSort.column === column) {
            // Toggle direction
            this.patternSort.direction = this.patternSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.patternSort.column = column;
            this.patternSort.direction = 'desc';
        }
        this.telemetryPatterns = this.sortPatterns(this.telemetryPatterns);
        this.cdr.markForCheck();
    }

    getSortIcon(column: PatternSortConfig['column']): string {
        if (this.patternSort.column !== column) {
            return 'fa-sort';
        }
        return this.patternSort.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
    }

    toggleInsightExpanded(insight: TelemetryInsightDisplay): void {
        insight.expanded = !insight.expanded;
        this.cdr.markForCheck();
    }

    setTimelineView(view: 'insights' | 'timeline' | 'chart'): void {
        this.timelineView = view;
        if (view === 'chart') {
            // Render chart after view updates
            setTimeout(() => this.renderPerfChart(), 0);
        }
        this.cdr.markForCheck();
    }

    setPerfTab(tab: 'monitor' | 'overview' | 'events' | 'patterns' | 'insights'): void {
        this.perfTab = tab;
        if (tab === 'monitor') {
            // Render chart after view updates
            setTimeout(() => this.renderPerfChart(), 0);
        }
        this.cdr.markForCheck();
    }

    jumpToPatternsByCategory(categoryName: string): void {
        this.perfTab = 'patterns';
        this.categoryFilter = categoryName as TelemetryCategory;
        this.cdr.markForCheck();
    }

    getInsightFilter(insight: TelemetryInsightDisplay): string | null {
        // Get filter from first related event
        if (insight.relatedEvents.length > 0) {
            return insight.relatedEvents[0].filter;
        }
        return null;
    }

    getEventParams(event: TelemetryEventDisplay): Array<{ key: string; value: string }> {
        const params: Array<{ key: string; value: string }> = [];
        if (!event.params) return params;

        // Show important params first
        const priorityKeys = ['EntityName', 'ViewName', 'ViewID', 'QueryName', 'ExtraFilter', 'OrderBy', 'ResultType', 'MaxRows'];
        const shownKeys = new Set<string>();

        // Add priority keys first if they exist
        for (const key of priorityKeys) {
            if (event.params[key] !== undefined && event.params[key] !== null) {
                const value = this.formatParamValue(event.params[key]);
                if (value) {
                    params.push({ key, value });
                    shownKeys.add(key);
                }
            }
        }

        // Add remaining keys
        for (const [key, val] of Object.entries(event.params)) {
            if (!shownKeys.has(key) && !key.startsWith('_')) {
                const value = this.formatParamValue(val);
                if (value) {
                    params.push({ key, value });
                }
            }
        }

        return params;
    }

    private formatParamValue(val: unknown): string {
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') return val || '(empty)';
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (typeof val === 'number') return val.toString();
        if (Array.isArray(val)) return val.join(', ');
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    }

    setCategoryFilter(category: TelemetryCategory | 'all'): void {
        this.categoryFilter = category;
        this.cdr.markForCheck();
    }

    setCategoryFilterByName(name: string): void {
        // Cast string to TelemetryCategory since we know it comes from categoriesWithData
        this.categoryFilter = name as TelemetryCategory;
        this.cdr.markForCheck();
    }

    onSearchChange(): void {
        this.cdr.markForCheck();
    }

    clearSearch(): void {
        this.searchQuery = '';
        this.cdr.markForCheck();
    }

    get filteredPatterns(): TelemetryPatternDisplay[] {
        let patterns = this.telemetryPatterns;

        // Apply category filter
        if (this.categoryFilter !== 'all') {
            patterns = patterns.filter(p => p.category === this.categoryFilter);
        }

        // Apply search filter
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase();
            patterns = patterns.filter(p =>
                p.entityName?.toLowerCase().includes(query) ||
                p.operation.toLowerCase().includes(query) ||
                p.filter?.toLowerCase().includes(query) ||
                p.category.toLowerCase().includes(query)
            );
        }

        return patterns;
    }

    get filteredEvents(): TelemetryEventDisplay[] {
        let events = this.telemetryEvents;

        // Apply category filter
        if (this.categoryFilter !== 'all') {
            events = events.filter(e => e.category === this.categoryFilter);
        }

        // Apply search filter
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase();
            events = events.filter(e =>
                e.entityName?.toLowerCase().includes(query) ||
                e.operation.toLowerCase().includes(query) ||
                e.filter?.toLowerCase().includes(query) ||
                e.category.toLowerCase().includes(query)
            );
        }

        return events;
    }

    formatTimestamp(date: Date): string {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
    }

    truncateString(str: string | null, maxLength: number): string {
        if (!str) return '-';
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }

    toggleTelemetry(): void {
        const tm = TelemetryManager.Instance;
        tm.SetEnabled(!tm.IsEnabled);
        this.telemetryEnabled = tm.IsEnabled;
        this.cdr.markForCheck();
    }

    clearTelemetry(): void {
        TelemetryManager.Instance.Clear();
        TelemetryManager.Instance.ClearInsights();
        this.refreshTelemetryData();
        this.cdr.markForCheck();
    }

    getSeverityClass(severity: string): string {
        switch (severity) {
            case 'info': return 'severity-info';
            case 'warning': return 'severity-warning';
            case 'optimization': return 'severity-optimization';
            default: return '';
        }
    }

    getSeverityIcon(severity: string): string {
        switch (severity) {
            case 'info': return 'fa-info-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'optimization': return 'fa-lightbulb';
            default: return 'fa-circle';
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

    formatRelativeTime(ms: number): string {
        if (ms < 1000) {
            return `${ms.toFixed(0)}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const mins = Math.floor(ms / 60000);
            const secs = ((ms % 60000) / 1000).toFixed(0);
            return `${mins}m ${secs}s`;
        }
    }

    /**
     * Renders a Windows PerfMon-style D3 time series chart
     * Shows performance events over time with duration spikes
     */
    renderPerfChart(): void {
        if (!this.perfChartRef?.nativeElement) {
            return;
        }

        const container = this.perfChartRef.nativeElement;
        const events = this.telemetryEvents.filter(e => e.elapsedMs !== undefined);

        if (events.length === 0) {
            container.innerHTML = '<div style="color: #666; text-align: center; padding: 100px 20px;">No telemetry events with timing data yet.<br>Navigate around the app to generate performance data.</div>';
            return;
        }

        // Clear previous chart
        container.innerHTML = '';

        // Get dimensions
        const rect = container.getBoundingClientRect();
        const width = rect.width || 800;
        const height = rect.height || 300;
        const margin = { top: 20, right: 30, bottom: 40, left: 50 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Calculate boot time (earliest event)
        this.telemetryBootTime = Math.min(...events.map(e => e.startTime));

        // Prepare data with relative time
        const chartData = events.map(e => ({
            ...e,
            relativeTime: e.startTime - this.telemetryBootTime,
            duration: e.elapsedMs || 0
        })).sort((a, b) => a.relativeTime - b.relativeTime);

        // Create SVG
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Scales
        const xScale = d3.scaleLinear()
            .domain([0, d3.max(chartData, d => d.relativeTime) || 1000])
            .range([0, innerWidth]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(chartData, d => d.duration) || 100])
            .range([innerHeight, 0])
            .nice();

        // Draw grid lines
        this.drawGridLines(g, xScale, yScale, innerWidth, innerHeight);

        // Draw axes
        this.drawAxes(g, xScale, yScale, innerHeight);

        // Color mapping for categories
        const categoryColors: Record<string, string> = {
            'RunView': '#00bcd4',
            'RunQuery': '#e040fb',
            'Engine': '#00ff88',
            'AI': '#ff9800',
            'Cache': '#f06292',
            'Network': '#26a69a',
            'Custom': '#78909c'
        };

        // Draw area fill for each category (like PerfMon background)
        const categories = [...new Set(chartData.map(d => d.category))];
        categories.forEach(category => {
            const categoryData = chartData.filter(d => d.category === category);
            if (categoryData.length > 1) {
                this.drawCategoryArea(g, categoryData, xScale, yScale, innerHeight, categoryColors[category] || '#78909c');
            }
        });

        // Draw event points
        this.drawEventPoints(g, chartData, xScale, yScale, categoryColors, container);

        // Draw threshold line for slow queries
        this.drawThresholdLine(g, yScale, innerWidth, this.slowQueryThresholdMs);

        this.chartInitialized = true;
    }

    private drawGridLines(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        xScale: d3.ScaleLinear<number, number>,
        yScale: d3.ScaleLinear<number, number>,
        width: number,
        height: number
    ): void {
        // Horizontal grid lines
        const yTicks = yScale.ticks(5);
        g.selectAll('.grid-line-h')
            .data(yTicks)
            .enter()
            .append('line')
            .attr('class', 'grid-line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', d => yScale(d))
            .attr('y2', d => yScale(d))
            .attr('stroke', '#333')
            .attr('stroke-dasharray', '2,2');

        // Vertical grid lines
        const xTicks = xScale.ticks(10);
        g.selectAll('.grid-line-v')
            .data(xTicks)
            .enter()
            .append('line')
            .attr('class', 'grid-line')
            .attr('x1', d => xScale(d))
            .attr('x2', d => xScale(d))
            .attr('y1', 0)
            .attr('y2', height)
            .attr('stroke', '#333')
            .attr('stroke-dasharray', '2,2');
    }

    private drawAxes(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        xScale: d3.ScaleLinear<number, number>,
        yScale: d3.ScaleLinear<number, number>,
        height: number
    ): void {
        // X axis
        const xAxis = d3.axisBottom(xScale)
            .ticks(10)
            .tickFormat(d => this.formatRelativeTime(d as number));

        g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(xAxis)
            .attr('class', 'axis-line')
            .selectAll('text')
            .attr('class', 'axis-text')
            .attr('fill', '#888');

        // Y axis
        const yAxis = d3.axisLeft(yScale)
            .ticks(5)
            .tickFormat(d => `${d}ms`);

        g.append('g')
            .call(yAxis)
            .attr('class', 'axis-line')
            .selectAll('text')
            .attr('class', 'axis-text')
            .attr('fill', '#888');
    }

    private drawCategoryArea(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: Array<{ relativeTime: number; duration: number }>,
        xScale: d3.ScaleLinear<number, number>,
        yScale: d3.ScaleLinear<number, number>,
        height: number,
        color: string
    ): void {
        const area = d3.area<{ relativeTime: number; duration: number }>()
            .x(d => xScale(d.relativeTime))
            .y0(height)
            .y1(d => yScale(d.duration))
            .curve(d3.curveMonotoneX);

        g.append('path')
            .datum(data)
            .attr('class', 'area-fill')
            .attr('d', area)
            .attr('fill', color)
            .attr('opacity', 0.1);

        // Line on top
        const line = d3.line<{ relativeTime: number; duration: number }>()
            .x(d => xScale(d.relativeTime))
            .y(d => yScale(d.duration))
            .curve(d3.curveMonotoneX);

        g.append('path')
            .datum(data)
            .attr('class', 'line-path')
            .attr('d', line)
            .attr('stroke', color)
            .attr('fill', 'none')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.6);
    }

    private drawEventPoints(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: Array<TelemetryEventDisplay & { relativeTime: number; duration: number }>,
        xScale: d3.ScaleLinear<number, number>,
        yScale: d3.ScaleLinear<number, number>,
        categoryColors: Record<string, string>,
        container: HTMLDivElement
    ): void {
        // Create tooltip
        const tooltip = g.append('g')
            .attr('class', 'tooltip')
            .style('display', 'none');

        tooltip.append('rect')
            .attr('class', 'tooltip-bg')
            .attr('fill', 'rgba(0, 0, 0, 0.9)')
            .attr('rx', 4);

        const tooltipText = tooltip.append('text')
            .attr('class', 'tooltip-text')
            .attr('fill', '#fff')
            .attr('font-size', '11px')
            .attr('font-family', 'monospace');

        // Draw points
        g.selectAll('.event-point')
            .data(data)
            .enter()
            .append('circle')
            .attr('class', 'event-point')
            .attr('cx', d => xScale(d.relativeTime))
            .attr('cy', d => yScale(d.duration))
            .attr('r', d => d.duration >= this.slowQueryThresholdMs ? 5 : 3)
            .attr('fill', d => categoryColors[d.category] || '#78909c')
            .attr('stroke', d => d.duration >= this.slowQueryThresholdMs ? '#ff5252' : 'none')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('mouseenter', (event: MouseEvent, d) => {
                const target = event.target as SVGCircleElement;
                d3.select(target).attr('r', 7);

                // Update tooltip content
                const lines = [
                    `${d.category}: ${d.operation}`,
                    d.entityName ? `Entity: ${d.entityName}` : null,
                    `Duration: ${d.duration.toFixed(0)}ms`,
                    `Time: +${this.formatRelativeTime(d.relativeTime)}`
                ].filter(Boolean);

                tooltipText.selectAll('tspan').remove();
                lines.forEach((line, i) => {
                    tooltipText.append('tspan')
                        .attr('x', 8)
                        .attr('dy', i === 0 ? '1.2em' : '1.4em')
                        .text(line as string);
                });

                // Size tooltip background
                const textBBox = (tooltipText.node() as SVGTextElement).getBBox();
                tooltip.select('.tooltip-bg')
                    .attr('width', textBBox.width + 16)
                    .attr('height', textBBox.height + 12)
                    .attr('y', textBBox.y - 6);

                // Position tooltip
                const x = xScale(d.relativeTime);
                const y = yScale(d.duration);
                const tooltipWidth = textBBox.width + 16;

                // Flip tooltip if too close to right edge
                const translateX = x + tooltipWidth + 20 > (container.clientWidth - 80) ? x - tooltipWidth - 10 : x + 10;
                tooltip.attr('transform', `translate(${translateX},${y - 20})`);
                tooltip.style('display', 'block');
            })
            .on('mouseleave', (event: MouseEvent, d) => {
                const target = event.target as SVGCircleElement;
                d3.select(target).attr('r', d.duration >= this.slowQueryThresholdMs ? 5 : 3);
                tooltip.style('display', 'none');
            });
    }

    private drawThresholdLine(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        yScale: d3.ScaleLinear<number, number>,
        width: number,
        threshold: number
    ): void {
        const yPos = yScale(threshold);

        // Only draw if threshold is within visible range
        if (yPos > 0 && yPos < yScale.range()[0]) {
            g.append('line')
                .attr('x1', 0)
                .attr('x2', width)
                .attr('y1', yPos)
                .attr('y2', yPos)
                .attr('stroke', '#ff5252')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '5,3')
                .attr('opacity', 0.7);

            g.append('text')
                .attr('x', width - 5)
                .attr('y', yPos - 5)
                .attr('text-anchor', 'end')
                .attr('fill', '#ff5252')
                .attr('font-size', '10px')
                .text(`Slow (>${threshold}ms)`);
        }
    }

    // === BaseResourceComponent Required Methods ===

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'System Diagnostics';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-stethoscope';
    }
}
