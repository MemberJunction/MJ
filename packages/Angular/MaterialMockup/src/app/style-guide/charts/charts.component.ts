import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import Chart from 'chart.js/auto';

@Component({
    selector: 'app-charts',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="charts-page">
        <!-- Bar Chart -->
        <section class="token-section">
            <h2>Bar Chart</h2>
            <p class="section-desc">Monthly revenue comparison across two fiscal years. Uses grouped bars with MJ brand primary and success colors.</p>
            <div class="mj-grid mj-gap-6">
                <div class="mj-col-12 chart-container mj-grid mj-flex-column">
                    <canvas class="mj-col" #barCanvas></canvas>
                </div>
            </div>
        </section>

        <!-- Line Chart -->
        <section class="token-section">
            <h2>Line Chart</h2>
            <p class="section-desc">Weekly user activity trends with smooth curves. Demonstrates tension-based line interpolation and fill areas.</p>
            <div class="mj-grid mj-gap-6">
                <div class="mj-col-12 chart-container mj-grid mj-flex-column">
                    <canvas class="mj-col" #lineCanvas></canvas>
                </div>
            </div>
        </section>

        <!-- Pie & Doughnut -->
        <section class="token-section">
            <h2>Pie &amp; Doughnut Charts</h2>
            <p class="section-desc">Proportional data visualization. Pie shows market share breakdown; Doughnut shows budget allocation with a center cutout.</p>
            <div class="mj-grid mj-gap-6">
                <div class="mj-col-md-6 chart-container mj-grid mj-flex-column">
                    <h3 class="chart-subtitle">Market Share</h3>
                    <canvas class="mj-col" #pieCanvas></canvas>
                </div>
                <div class="mj-col-md-6 chart-container mj-grid mj-flex-column">
                    <h3 class="chart-subtitle">Budget Allocation</h3>
                    <canvas class="mj-col" #doughnutCanvas></canvas>
                </div>
            </div>
        </section>

        <!-- Radar & Polar Area -->
        <section class="token-section">
            <h2>Radar &amp; Polar Area Charts</h2>
            <p class="section-desc">Multi-axis data comparison. Radar overlays two skill profiles; Polar Area maps quarterly performance metrics by magnitude.</p>
            <div class="mj-grid mj-gap-6">
                <div class="mj-col-md-6 chart-container mj-grid mj-flex-column">
                    <h3 class="chart-subtitle">Skill Assessment</h3>
                    <canvas class="mj-col" #radarCanvas></canvas>
                </div>
                <div class="mj-col-md-6 chart-container mj-grid mj-flex-column">
                    <h3 class="chart-subtitle">Quarterly Performance</h3>
                    <canvas class="mj-col" #polarCanvas></canvas>
                </div>
            </div>
        </section>
    </div>
    `,
    styles: [`
    .charts-page {
        max-width: 1100px;
    }

    .token-section {
        margin-bottom: var(--mj-space-10);
    }

    .token-section h2 {
        font-size: var(--mj-text-2xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
        margin: 0 0 var(--mj-space-2) 0;
    }

    .section-desc {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        margin: 0 0 var(--mj-space-5) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .chart-subtitle {
        font-size: var(--mj-text-base);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
        margin: 0 0 var(--mj-space-3) 0;
    }

    .chart-container {
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-5);
        height: 300px;
    }

    .chart-container canvas {
        min-height: 0;
    }
    `]
})
export class ChartsComponent implements AfterViewInit, OnDestroy {
    @ViewChild('barCanvas') barCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('lineCanvas') lineCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('pieCanvas') pieCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('doughnutCanvas') doughnutCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('radarCanvas') radarCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('polarCanvas') polarCanvas!: ElementRef<HTMLCanvasElement>;

    private barChart: Chart | null = null;
    private lineChart: Chart | null = null;
    private pieChart: Chart | null = null;
    private doughnutChart: Chart | null = null;
    private radarChart: Chart | null = null;
    private polarChart: Chart | null = null;
    private themeObserver: MutationObserver | null = null;

    ngAfterViewInit(): void {
        this.BuildAllCharts();
        this.themeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                    this.DestroyAllCharts();
                    this.BuildAllCharts();
                    break;
                }
            }
        });
        this.themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    ngOnDestroy(): void {
        this.themeObserver?.disconnect();
        this.DestroyAllCharts();
    }

    private GetTokenColor(token: string): string {
        return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    }

    private WithAlpha(token: string, alpha: number): string {
        const raw = this.GetTokenColor(token);
        const parsed = this.parseColor(raw);
        if (parsed) {
            return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
        }
        return raw;
    }

    private parseColor(color: string): { r: number; g: number; b: number } | null {
        const hexMatch = color.match(/^#([0-9a-f]{3,8})$/i);
        if (hexMatch) {
            let hex = hexMatch[1];
            if (hex.length === 3) {
                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }
            return {
                r: parseInt(hex.substring(0, 2), 16),
                g: parseInt(hex.substring(2, 4), 16),
                b: parseInt(hex.substring(4, 6), 16)
            };
        }
        const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (rgbMatch) {
            return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };
        }
        return null;
    }

    private BuildAllCharts(): void {
        const primary = this.GetTokenColor('--mj-brand-primary');
        const primaryLight = this.WithAlpha('--mj-brand-primary', 0.15);
        const success = this.GetTokenColor('--mj-status-success');
        const successLight = this.WithAlpha('--mj-status-success', 0.15);
        const warning = this.GetTokenColor('--mj-status-warning');
        const error = this.GetTokenColor('--mj-status-error');
        const info = this.GetTokenColor('--mj-status-info');
        const textMuted = this.GetTokenColor('--mj-text-muted');
        const textSecondary = this.GetTokenColor('--mj-text-secondary');
        const surface = this.GetTokenColor('--mj-bg-surface');
        const gridColor = this.WithAlpha('--mj-border-subtle', 0.15);

        this.BuildBarChart(primary, success, textSecondary, gridColor);
        this.BuildLineChart(primary, primaryLight, info, textSecondary, gridColor, surface);
        this.BuildPieChart(primary, success, warning, error, textMuted, textSecondary, surface);
        this.BuildDoughnutChart(primary, info, warning, success, textSecondary, surface);
        this.BuildRadarChart(primary, primaryLight, success, successLight, textSecondary, gridColor, surface);
        this.BuildPolarAreaChart(primary, success, warning, info, textSecondary, gridColor);
    }

    private DestroyAllCharts(): void {
        this.barChart?.destroy();
        this.lineChart?.destroy();
        this.pieChart?.destroy();
        this.doughnutChart?.destroy();
        this.radarChart?.destroy();
        this.polarChart?.destroy();
        this.barChart = null;
        this.lineChart = null;
        this.pieChart = null;
        this.doughnutChart = null;
        this.radarChart = null;
        this.polarChart = null;
    }

    private BuildBarChart(primary: string, success: string, textSecondary: string, gridColor: string): void {
        this.barChart = new Chart(this.barCanvas.nativeElement, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [
                    {
                        label: 'FY 2025',
                        backgroundColor: primary,
                        borderColor: primary,
                        data: [42000, 51000, 46000, 58000, 53000, 61000],
                        borderRadius: 4,
                        barPercentage: 0.7
                    },
                    {
                        label: 'FY 2026',
                        backgroundColor: success,
                        borderColor: success,
                        data: [48000, 55000, 52000, 63000, 59000, 68000],
                        borderRadius: 4,
                        barPercentage: 0.7
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: this.BuildSharedPluginOptions(textSecondary),
                scales: this.BuildSharedScaleOptions(textSecondary, gridColor)
            }
        });
    }

    private BuildLineChart(primary: string, primaryLight: string, info: string, textSecondary: string, gridColor: string, surface: string): void {
        const infoLight = this.WithAlpha('--mj-status-info', 0.10);
        this.lineChart = new Chart(this.lineCanvas.nativeElement, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [
                    {
                        label: 'Active Users',
                        data: [1200, 1900, 1700, 2100, 2400, 1800, 1500],
                        borderColor: primary,
                        backgroundColor: primaryLight,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: primary,
                        pointBorderColor: surface,
                        pointBorderWidth: 2,
                        pointRadius: 4
                    },
                    {
                        label: 'New Signups',
                        data: [300, 450, 380, 520, 610, 400, 350],
                        borderColor: info,
                        backgroundColor: infoLight,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: info,
                        pointBorderColor: surface,
                        pointBorderWidth: 2,
                        pointRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: this.BuildSharedPluginOptions(textSecondary),
                scales: this.BuildSharedScaleOptions(textSecondary, gridColor)
            }
        });
    }

    private BuildPieChart(primary: string, success: string, warning: string, error: string, textMuted: string, textSecondary: string, surface: string): void {
        this.pieChart = new Chart(this.pieCanvas.nativeElement, {
            type: 'pie',
            data: {
                labels: ['MemberJunction', 'Competitor A', 'Competitor B', 'Competitor C', 'Others'],
                datasets: [
                    {
                        data: [35, 22, 18, 14, 11],
                        backgroundColor: [primary, success, warning, error, textMuted],
                        borderColor: surface,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textSecondary, font: { size: 11 }, padding: 12 }
                    }
                }
            }
        });
    }

    private BuildDoughnutChart(primary: string, info: string, warning: string, success: string, textSecondary: string, surface: string): void {
        this.doughnutChart = new Chart(this.doughnutCanvas.nativeElement, {
            type: 'doughnut',
            data: {
                labels: ['Engineering', 'Marketing', 'Operations', 'Research'],
                datasets: [
                    {
                        data: [40, 25, 20, 15],
                        backgroundColor: [primary, info, warning, success],
                        borderColor: surface,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textSecondary, font: { size: 11 }, padding: 12 }
                    }
                }
            }
        });
    }

    private BuildRadarChart(primary: string, primaryLight: string, success: string, successLight: string, textSecondary: string, gridColor: string, surface: string): void {
        this.radarChart = new Chart(this.radarCanvas.nativeElement, {
            type: 'radar',
            data: {
                labels: ['TypeScript', 'Angular', 'SQL', 'DevOps', 'Architecture', 'Testing'],
                datasets: [
                    {
                        label: 'Senior Dev',
                        data: [90, 85, 80, 70, 88, 75],
                        borderColor: primary,
                        backgroundColor: primaryLight,
                        pointBackgroundColor: primary,
                        pointBorderColor: surface,
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Mid-Level Dev',
                        data: [70, 65, 55, 45, 50, 60],
                        borderColor: success,
                        backgroundColor: successLight,
                        pointBackgroundColor: success,
                        pointBorderColor: surface,
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: this.BuildSharedPluginOptions(textSecondary),
                scales: {
                    r: {
                        ticks: { color: textSecondary, font: { size: 10 }, backdropColor: 'transparent' },
                        grid: { color: gridColor },
                        pointLabels: { color: textSecondary, font: { size: 11 } },
                        angleLines: { color: gridColor }
                    }
                }
            }
        });
    }

    private BuildPolarAreaChart(primary: string, success: string, warning: string, info: string, textSecondary: string, gridColor: string): void {
        this.polarChart = new Chart(this.polarCanvas.nativeElement, {
            type: 'polarArea',
            data: {
                labels: ['Q1', 'Q2', 'Q3', 'Q4'],
                datasets: [
                    {
                        data: [78, 92, 85, 96],
                        backgroundColor: [
                            this.WithAlpha('--mj-brand-primary', 0.6),
                            this.WithAlpha('--mj-status-success', 0.6),
                            this.WithAlpha('--mj-status-warning', 0.6),
                            this.WithAlpha('--mj-status-info', 0.6)
                        ],
                        borderColor: [primary, success, warning, info],
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textSecondary, font: { size: 11 }, padding: 12 }
                    }
                },
                scales: {
                    r: {
                        ticks: { color: textSecondary, font: { size: 10 }, backdropColor: 'transparent' },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    private BuildSharedScaleOptions(textSecondary: string, gridColor: string): Record<string, object> {
        return {
            x: {
                ticks: { color: textSecondary, font: { size: 11 } },
                grid: { color: gridColor }
            },
            y: {
                ticks: { color: textSecondary, font: { size: 11 } },
                grid: { color: gridColor }
            }
        };
    }

    private BuildSharedPluginOptions(textSecondary: string): Record<string, object> {
        return {
            legend: {
                labels: { color: textSecondary, font: { size: 12 } }
            }
        };
    }
}
