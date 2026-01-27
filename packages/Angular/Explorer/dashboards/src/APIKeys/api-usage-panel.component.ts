import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { APIKeyEntity, APIKeyUsageLogEntity } from '@memberjunction/core-entities';

/** Tree shaking prevention function */
export function LoadAPIUsagePanel(): void {
    // This function prevents tree shaking
}

/** Time bucket for aggregation */
interface TimeBucket {
    label: string;
    date: Date;
    requests: number;
    errors: number;
    avgResponseTime: number;
}

/** Endpoint stats */
interface EndpointStats {
    endpoint: string;
    method: string;
    requests: number;
    avgResponseTime: number;
    errorRate: number;
}

/** Key stats */
interface KeyStats {
    keyId: string;
    label: string;
    requests: number;
    lastUsed: Date | null;
}

/** Status code group */
interface StatusGroup {
    label: string;
    code: string;
    count: number;
    percentage: number;
    color: string;
}

/** Usage log item for display */
interface UsageLogItem {
    id: string;
    timestamp: Date;
    endpoint: string;
    method: string;
    statusCode: number;
    responseTime: number;
    keyLabel: string;
    keyId: string;
}

/**
 * API Usage Analytics Panel Component
 * Comprehensive usage statistics and drill-down capabilities
 */
@Component({
    selector: 'mj-api-usage-panel',
    templateUrl: './api-usage-panel.component.html',
    styleUrls: ['./api-usage-panel.component.css']
})
export class APIUsagePanelComponent implements OnInit {
    private md = new Metadata();
    private cdr: ChangeDetectorRef;

    // Loading states
    public IsLoading = true;
    public IsLoadingLogs = false;

    // Time range filter
    public TimeRange: 'day' | 'week' | 'month' | 'all' = 'week';

    // Summary KPIs
    public TotalRequests = 0;
    public TotalErrors = 0;
    public AvgResponseTime = 0;
    public SuccessRate = 0;
    public UniqueKeys = 0;
    public UniqueEndpoints = 0;

    // Trend data (vs previous period)
    public RequestsTrend = 0;
    public ErrorsTrend = 0;
    public ResponseTimeTrend = 0;

    // Chart data
    public TimeBuckets: TimeBucket[] = [];
    public MaxRequests = 0;
    public MaxErrors = 0;

    // Breakdown data
    public TopEndpoints: EndpointStats[] = [];
    public TopKeys: KeyStats[] = [];
    public StatusGroups: StatusGroup[] = [];

    // Recent logs
    public RecentLogs: UsageLogItem[] = [];
    public ShowLogsPanel = false;
    public LogsFilter: { endpoint?: string; keyId?: string } = {};

    // Key map for labels
    public KeyMap = new Map<string, string>();

    // Expose Math for template
    public Math = Math;

    constructor(cdr: ChangeDetectorRef) {
        this.cdr = cdr;
    }

    async ngOnInit(): Promise<void> {
        await this.loadData();
    }

    /**
     * Load all usage data
     */
    public async loadData(): Promise<void> {
        this.IsLoading = true;
        try {
            // Load keys for label lookup
            await this.loadKeys();
            // Load usage data
            await this.loadUsageStats();
        } catch (error) {
            console.error('Error loading usage data:', error);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Load API keys for label lookup
     */
    private async loadKeys(): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<APIKeyEntity>({
            EntityName: 'MJ: API Keys',
            Fields: ['ID', 'Label'],
            ResultType: 'simple'
        });
        if (result.Success) {
            for (const key of result.Results) {
                this.KeyMap.set(key.ID, key.Label);
            }
        }
    }

    /**
     * Load usage statistics based on time range
     */
    private async loadUsageStats(): Promise<void> {
        const rv = new RunView();
        const filter = this.getTimeFilter();

        const result = await rv.RunView<APIKeyUsageLogEntity>({
            EntityName: 'MJ: API Key Usage Logs',
            ExtraFilter: filter,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 5000,
            ResultType: 'entity_object'
        });

        if (result.Success) {
            const logs = result.Results;
            this.calculateSummaryKPIs(logs);
            this.buildTimeBuckets(logs);
            this.buildEndpointStats(logs);
            this.buildKeyStats(logs);
            this.buildStatusGroups(logs);
            this.RecentLogs = logs.slice(0, 20).map(log => this.mapLogToItem(log));
        }
    }

    /**
     * Get time filter for RunView based on selected range
     */
    private getTimeFilter(): string {
        const now = new Date();
        let startDate: Date;

        switch (this.TimeRange) {
            case 'day':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case 'all':
            default:
                return '';
        }

        return `__mj_CreatedAt >= '${startDate.toISOString()}'`;
    }

    /**
     * Calculate summary KPIs
     */
    private calculateSummaryKPIs(logs: APIKeyUsageLogEntity[]): void {
        this.TotalRequests = logs.length;

        // Count errors (4xx and 5xx status codes)
        this.TotalErrors = logs.filter(l => l.StatusCode >= 400).length;

        // Calculate average response time
        const totalResponseTime = logs.reduce((sum, l) => sum + (l.ResponseTimeMs || 0), 0);
        this.AvgResponseTime = this.TotalRequests > 0
            ? Math.round(totalResponseTime / this.TotalRequests)
            : 0;

        // Success rate
        this.SuccessRate = this.TotalRequests > 0
            ? Math.round(((this.TotalRequests - this.TotalErrors) / this.TotalRequests) * 100)
            : 100;

        // Unique counts
        const keySet = new Set(logs.map(l => l.APIKeyID));
        const endpointSet = new Set(logs.map(l => l.Endpoint));
        this.UniqueKeys = keySet.size;
        this.UniqueEndpoints = endpointSet.size;
    }

    /**
     * Build time buckets for chart
     */
    private buildTimeBuckets(logs: APIKeyUsageLogEntity[]): void {
        const bucketCount = this.TimeRange === 'day' ? 24 : this.TimeRange === 'week' ? 7 : 30;
        const bucketDuration = this.TimeRange === 'day' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

        const now = new Date();
        const buckets: TimeBucket[] = [];

        for (let i = bucketCount - 1; i >= 0; i--) {
            const bucketDate = new Date(now.getTime() - i * bucketDuration);
            const bucketLogs = logs.filter(l => {
                const logDate = new Date(l.__mj_CreatedAt);
                const nextBucket = new Date(bucketDate.getTime() + bucketDuration);
                return logDate >= bucketDate && logDate < nextBucket;
            });

            const errors = bucketLogs.filter(l => l.StatusCode >= 400).length;
            const totalTime = bucketLogs.reduce((sum, l) => sum + (l.ResponseTimeMs || 0), 0);

            buckets.push({
                label: this.formatBucketLabel(bucketDate),
                date: bucketDate,
                requests: bucketLogs.length,
                errors,
                avgResponseTime: bucketLogs.length > 0 ? Math.round(totalTime / bucketLogs.length) : 0
            });
        }

        this.TimeBuckets = buckets;
        this.MaxRequests = Math.max(...buckets.map(b => b.requests), 1);
        this.MaxErrors = Math.max(...buckets.map(b => b.errors), 1);
    }

    /**
     * Format bucket label based on time range
     */
    private formatBucketLabel(date: Date): string {
        if (this.TimeRange === 'day') {
            return date.toLocaleTimeString('en-US', { hour: 'numeric' });
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    /**
     * Build endpoint statistics
     */
    private buildEndpointStats(logs: APIKeyUsageLogEntity[]): void {
        const endpointMap = new Map<string, {
            endpoint: string;
            method: string;
            requests: number;
            totalTime: number;
            errors: number
        }>();

        for (const log of logs) {
            const key = `${log.Method}:${log.Endpoint}`;
            const existing = endpointMap.get(key);
            if (existing) {
                existing.requests++;
                existing.totalTime += log.ResponseTimeMs || 0;
                if (log.StatusCode >= 400) existing.errors++;
            } else {
                endpointMap.set(key, {
                    endpoint: log.Endpoint,
                    method: log.Method,
                    requests: 1,
                    totalTime: log.ResponseTimeMs || 0,
                    errors: log.StatusCode >= 400 ? 1 : 0
                });
            }
        }

        this.TopEndpoints = Array.from(endpointMap.values())
            .map(e => ({
                endpoint: e.endpoint,
                method: e.method,
                requests: e.requests,
                avgResponseTime: Math.round(e.totalTime / e.requests),
                errorRate: Math.round((e.errors / e.requests) * 100)
            }))
            .sort((a, b) => b.requests - a.requests)
            .slice(0, 10);
    }

    /**
     * Build key statistics
     */
    private buildKeyStats(logs: APIKeyUsageLogEntity[]): void {
        const keyMap = new Map<string, { requests: number; lastUsed: Date | null }>();

        for (const log of logs) {
            const existing = keyMap.get(log.APIKeyID);
            const logDate = new Date(log.__mj_CreatedAt);
            if (existing) {
                existing.requests++;
                if (!existing.lastUsed || logDate > existing.lastUsed) {
                    existing.lastUsed = logDate;
                }
            } else {
                keyMap.set(log.APIKeyID, {
                    requests: 1,
                    lastUsed: logDate
                });
            }
        }

        this.TopKeys = Array.from(keyMap.entries())
            .map(([keyId, stats]) => ({
                keyId,
                label: this.KeyMap.get(keyId) || 'Unknown Key',
                requests: stats.requests,
                lastUsed: stats.lastUsed
            }))
            .sort((a, b) => b.requests - a.requests)
            .slice(0, 10);
    }

    /**
     * Build status code groups
     */
    private buildStatusGroups(logs: APIKeyUsageLogEntity[]): void {
        const groups: Record<string, { count: number; label: string; color: string }> = {
            '2xx': { count: 0, label: 'Success (2xx)', color: '#10b981' },
            '3xx': { count: 0, label: 'Redirect (3xx)', color: '#3b82f6' },
            '4xx': { count: 0, label: 'Client Error (4xx)', color: '#f59e0b' },
            '5xx': { count: 0, label: 'Server Error (5xx)', color: '#ef4444' }
        };

        for (const log of logs) {
            const code = Math.floor(log.StatusCode / 100);
            const key = `${code}xx`;
            if (groups[key]) {
                groups[key].count++;
            }
        }

        this.StatusGroups = Object.entries(groups)
            .filter(([_, v]) => v.count > 0)
            .map(([code, v]) => ({
                code,
                label: v.label,
                count: v.count,
                percentage: this.TotalRequests > 0 ? Math.round((v.count / this.TotalRequests) * 100) : 0,
                color: v.color
            }));
    }

    /**
     * Map log entity to display item
     */
    private mapLogToItem(log: APIKeyUsageLogEntity): UsageLogItem {
        return {
            id: log.ID,
            timestamp: new Date(log.__mj_CreatedAt),
            endpoint: log.Endpoint,
            method: log.Method,
            statusCode: log.StatusCode,
            responseTime: log.ResponseTimeMs || 0,
            keyLabel: this.KeyMap.get(log.APIKeyID) || 'Unknown',
            keyId: log.APIKeyID
        };
    }

    /**
     * Change time range and reload
     */
    public async setTimeRange(range: 'day' | 'week' | 'month' | 'all'): Promise<void> {
        this.TimeRange = range;
        await this.loadData();
    }

    /**
     * Get bar height percentage for chart
     */
    public getBarHeight(value: number): number {
        if (this.MaxRequests === 0) return 0;
        return Math.max(2, (value / this.MaxRequests) * 100);
    }

    /**
     * Get error bar height for chart
     */
    public getErrorBarHeight(bucket: TimeBucket): number {
        if (bucket.requests === 0) return 0;
        return (bucket.errors / bucket.requests) * 100;
    }

    /**
     * Drill down into endpoint
     */
    public drillDownEndpoint(endpoint: EndpointStats): void {
        this.LogsFilter = { endpoint: endpoint.endpoint };
        this.loadFilteredLogs();
        this.ShowLogsPanel = true;
    }

    /**
     * Drill down into key
     */
    public drillDownKey(key: KeyStats): void {
        this.LogsFilter = { keyId: key.keyId };
        this.loadFilteredLogs();
        this.ShowLogsPanel = true;
    }

    /**
     * Load filtered logs for drill-down
     */
    private async loadFilteredLogs(): Promise<void> {
        this.IsLoadingLogs = true;
        const rv = new RunView();
        let filter = this.getTimeFilter();

        if (this.LogsFilter.endpoint) {
            filter += filter ? ' AND ' : '';
            filter += `Endpoint = '${this.LogsFilter.endpoint}'`;
        }
        if (this.LogsFilter.keyId) {
            filter += filter ? ' AND ' : '';
            filter += `APIKeyID = '${this.LogsFilter.keyId}'`;
        }

        const result = await rv.RunView<APIKeyUsageLogEntity>({
            EntityName: 'MJ: API Key Usage Logs',
            ExtraFilter: filter,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 100,
            ResultType: 'entity_object'
        });

        if (result.Success) {
            this.RecentLogs = result.Results.map(log => this.mapLogToItem(log));
        }

        this.IsLoadingLogs = false;
        this.cdr.markForCheck();
    }

    /**
     * Close logs panel
     */
    public closeLogsPanel(): void {
        this.ShowLogsPanel = false;
        this.LogsFilter = {};
    }

    /**
     * Get status class for HTTP status code
     */
    public getStatusClass(statusCode: number): string {
        if (statusCode >= 200 && statusCode < 300) return 'status-success';
        if (statusCode >= 300 && statusCode < 400) return 'status-info';
        if (statusCode >= 400 && statusCode < 500) return 'status-warning';
        if (statusCode >= 500) return 'status-error';
        return '';
    }

    /**
     * Get method badge class
     */
    public getMethodClass(method: string): string {
        const m = method.toUpperCase();
        if (m === 'GET') return 'method-get';
        if (m === 'POST') return 'method-post';
        if (m === 'PUT' || m === 'PATCH') return 'method-put';
        if (m === 'DELETE') return 'method-delete';
        return 'method-other';
    }

    /**
     * Format date for display
     */
    public formatDate(date: Date | null): string {
        if (!date) return 'Never';
        const d = new Date(date);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;

        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    /**
     * Format number with K/M suffix
     */
    public formatNumber(num: number): string {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }
}
