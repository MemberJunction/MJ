import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

interface RecentAction {
    name: string;
    status: string;
    severity: 'success' | 'warning' | 'danger';
    date: string;
    duration: string;
}

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, CardModule, ButtonModule, PanelModule, TableModule, TagModule],
    template: `
    <div class="dashboard-container">
      <!-- KPIs -->
      <div class="kpi-grid">
        @for (kpi of kpis; track kpi.label) {
            <div class="kpi-card">
                <div class="kpi-header">
                    <div class="kpi-text">
                        <span class="kpi-label">{{ kpi.label }}</span>
                        <span class="kpi-value">{{ kpi.value }}</span>
                    </div>
                    <div class="kpi-icon-box" [style.background-color]="kpi.iconBg">
                        <i [class]="kpi.icon" [style.color]="kpi.iconColor"></i>
                    </div>
                </div>
                <div class="kpi-footer">
                    <span class="kpi-change" [style.color]="kpi.changeColor">{{ kpi.change }}</span>
                    <span class="kpi-sublabel">{{ kpi.subLabel }}</span>
                </div>
            </div>
        }
      </div>

      <!-- Main Content -->
      <div class="dashboard-main">
        <!-- Recent Actions Table -->
        <div class="dashboard-table-section">
            <p-panel header="Recent Executions" styleClass="h-full">
                <p-table [value]="recentActions" [tableStyle]="{'min-width': '40rem'}" styleClass="p-datatable-sm">
                    <ng-template pTemplate="header">
                        <tr>
                            <th>Action Name</th>
                            <th>Status</th>
                            <th>Date</th>
                            <th>Duration</th>
                        </tr>
                    </ng-template>
                    <ng-template pTemplate="body" let-action>
                        <tr>
                            <td>{{ action.name }}</td>
                            <td>
                                <p-tag [value]="action.status" [severity]="action.severity"></p-tag>
                            </td>
                            <td>{{ action.date }}</td>
                            <td>{{ action.duration }}</td>
                        </tr>
                    </ng-template>
                </p-table>
            </p-panel>
        </div>

        <!-- System Stats -->
        <div class="dashboard-stats-section">
            <p-panel header="System Overview" styleClass="h-full">
                <div class="stats-content">
                    <div class="stat-item">
                        <i class="pi pi-chart-pie stat-icon" style="color: var(--mj-brand-primary);"></i>
                        <div class="stat-info">
                            <span class="stat-value">247</span>
                            <span class="stat-label">Total Entities</span>
                        </div>
                    </div>
                    <div class="stat-item">
                        <i class="pi pi-database stat-icon" style="color: var(--mj-brand-tertiary);"></i>
                        <div class="stat-info">
                            <span class="stat-value">1.2M</span>
                            <span class="stat-label">Records Processed</span>
                        </div>
                    </div>
                    <div class="stat-item">
                        <i class="pi pi-clock stat-icon" style="color: var(--mj-brand-accent);"></i>
                        <div class="stat-info">
                            <span class="stat-value">99.9%</span>
                            <span class="stat-label">Uptime</span>
                        </div>
                    </div>
                    <div class="stat-item">
                        <i class="pi pi-users stat-icon" style="color: var(--mj-status-success);"></i>
                        <div class="stat-info">
                            <span class="stat-value">42</span>
                            <span class="stat-label">Active Users</span>
                        </div>
                    </div>
                </div>
            </p-panel>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .dashboard-container {
        max-width: 1200px;
    }

    /* KPI Grid */
    .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: var(--mj-space-5);
        margin-bottom: var(--mj-space-6);
    }

    .kpi-card {
        background: var(--mj-bg-surface-elevated);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-5);
        box-shadow: var(--mj-shadow-sm);
        transition: box-shadow var(--mj-transition-base);

        &:hover {
            box-shadow: var(--mj-shadow-md);
        }
    }

    .kpi-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--mj-space-3);
    }

    .kpi-text {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-2);
    }

    .kpi-label {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-secondary);
    }

    .kpi-value {
        font-size: var(--mj-text-2xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
    }

    .kpi-icon-box {
        width: 40px;
        height: 40px;
        border-radius: var(--mj-radius-md);
        display: flex;
        align-items: center;
        justify-content: center;

        i {
            font-size: var(--mj-text-xl);
        }
    }

    .kpi-footer {
        display: flex;
        align-items: center;
        gap: var(--mj-space-2);
    }

    .kpi-change {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
    }

    .kpi-sublabel {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
    }

    /* Main Layout */
    .dashboard-main {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: var(--mj-space-5);
    }

    @media (max-width: 992px) {
        .dashboard-main {
            grid-template-columns: 1fr;
        }
    }

    /* Stats */
    .stats-content {
        display: flex;
        flex-direction: column;
        gap: var(--mj-space-5);
    }

    .stat-item {
        display: flex;
        align-items: center;
        gap: var(--mj-space-4);
        padding: var(--mj-space-3);
        border-radius: var(--mj-radius-md);
        transition: background var(--mj-transition-base);

        &:hover {
            background: var(--mj-bg-surface-hover);
        }
    }

    .stat-icon {
        font-size: var(--mj-text-2xl);
    }

    .stat-info {
        display: flex;
        flex-direction: column;
    }

    .stat-value {
        font-size: var(--mj-text-xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
    }

    .stat-label {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
    }
  `]
})
export class DashboardComponent {
    kpis = [
        {
            label: 'Total Actions',
            value: '152',
            icon: 'pi pi-bolt',
            iconBg: 'var(--mj-color-info-50)',
            iconColor: 'var(--mj-color-info-500)',
            change: '24 new',
            changeColor: 'var(--mj-status-success-text)',
            subLabel: 'since last visit'
        },
        {
            label: 'Success Rate',
            value: '98.5%',
            icon: 'pi pi-check-circle',
            iconBg: 'var(--mj-color-success-50)',
            iconColor: 'var(--mj-color-success-500)',
            change: '',
            changeColor: '',
            subLabel: 'Global System Health'
        },
        {
            label: 'AI Agents',
            value: '5 Active',
            icon: 'pi pi-microchip-ai',
            iconBg: 'color-mix(in srgb, var(--mj-brand-tertiary) 15%, transparent)',
            iconColor: 'var(--mj-brand-tertiary)',
            change: '+2',
            changeColor: 'var(--mj-brand-tertiary)',
            subLabel: 'in training'
        }
    ];

    recentActions: RecentAction[] = [
        { name: 'Sync CRM Contacts', status: 'Success', severity: 'success', date: '2026-02-03 14:30', duration: '450ms' },
        { name: 'Weekly Report Gen', status: 'Pending', severity: 'warning', date: '2026-02-03 14:25', duration: '-' },
        { name: 'Update Inventory', status: 'Failed', severity: 'danger', date: '2026-02-03 14:10', duration: '12s' },
        { name: 'AI Sentiment Analysis', status: 'Success', severity: 'success', date: '2026-02-03 13:55', duration: '2.4s' }
    ];
}
