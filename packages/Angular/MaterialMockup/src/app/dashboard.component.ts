import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

interface RecentAction {
    name: string;
    status: string;
    statusColor: string;
    date: string;
    duration: string;
}

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, MatCardModule, MatTableModule, MatChipsModule, MatIconModule, MatButtonModule],
    template: `
    <div class="dashboard-container">
        <!-- KPIs -->
        <div class="kpi-grid">
            @for (kpi of kpis; track kpi.label) {
                <mat-card class="kpi-card" appearance="outlined">
                    <mat-card-content>
                        <div class="kpi-header">
                            <div class="kpi-text">
                                <span class="kpi-label">{{ kpi.label }}</span>
                                <span class="kpi-value">{{ kpi.value }}</span>
                            </div>
                            <div class="kpi-icon-box" [style.background-color]="kpi.iconBg">
                                <mat-icon [style.color]="kpi.iconColor">{{ kpi.icon }}</mat-icon>
                            </div>
                        </div>
                        <div class="kpi-footer">
                            @if (kpi.change) {
                                <span class="kpi-change" [style.color]="kpi.changeColor">{{ kpi.change }}</span>
                            }
                            <span class="kpi-sublabel">{{ kpi.subLabel }}</span>
                        </div>
                    </mat-card-content>
                </mat-card>
            }
        </div>

        <!-- Main Content -->
        <div class="dashboard-main">
            <!-- Recent Actions Table -->
            <mat-card class="dashboard-table-section" appearance="outlined">
                <mat-card-header>
                    <mat-card-title>Recent Executions</mat-card-title>
                </mat-card-header>
                <mat-card-content>
                    <table mat-table [dataSource]="recentActions" class="actions-table">
                        <ng-container matColumnDef="name">
                            <th mat-header-cell *matHeaderCellDef>Action Name</th>
                            <td mat-cell *matCellDef="let action">{{ action.name }}</td>
                        </ng-container>

                        <ng-container matColumnDef="status">
                            <th mat-header-cell *matHeaderCellDef>Status</th>
                            <td mat-cell *matCellDef="let action">
                                <mat-chip [style.--mdc-chip-label-text-color]="action.statusColor"
                                          [style.--mdc-chip-elevated-container-color]="'transparent'"
                                          [style.border]="'1px solid ' + action.statusColor">
                                    {{ action.status }}
                                </mat-chip>
                            </td>
                        </ng-container>

                        <ng-container matColumnDef="date">
                            <th mat-header-cell *matHeaderCellDef>Date</th>
                            <td mat-cell *matCellDef="let action">{{ action.date }}</td>
                        </ng-container>

                        <ng-container matColumnDef="duration">
                            <th mat-header-cell *matHeaderCellDef>Duration</th>
                            <td mat-cell *matCellDef="let action">{{ action.duration }}</td>
                        </ng-container>

                        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                        <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
                    </table>
                </mat-card-content>
            </mat-card>

            <!-- System Stats -->
            <mat-card class="dashboard-stats-section" appearance="outlined">
                <mat-card-header>
                    <mat-card-title>System Overview</mat-card-title>
                </mat-card-header>
                <mat-card-content>
                    <div class="stats-content">
                        <div class="stat-item">
                            <mat-icon class="stat-icon" style="color: var(--mj-brand-primary);">pie_chart</mat-icon>
                            <div class="stat-info">
                                <span class="stat-value">247</span>
                                <span class="stat-label">Total Entities</span>
                            </div>
                        </div>
                        <div class="stat-item">
                            <mat-icon class="stat-icon" style="color: var(--mj-brand-tertiary);">storage</mat-icon>
                            <div class="stat-info">
                                <span class="stat-value">1.2M</span>
                                <span class="stat-label">Records Processed</span>
                            </div>
                        </div>
                        <div class="stat-item">
                            <mat-icon class="stat-icon" style="color: var(--mj-brand-accent);">schedule</mat-icon>
                            <div class="stat-info">
                                <span class="stat-value">99.9%</span>
                                <span class="stat-label">Uptime</span>
                            </div>
                        </div>
                        <div class="stat-item">
                            <mat-icon class="stat-icon" style="color: var(--mj-status-success);">group</mat-icon>
                            <div class="stat-info">
                                <span class="stat-value">42</span>
                                <span class="stat-label">Active Users</span>
                            </div>
                        </div>
                    </div>
                </mat-card-content>
            </mat-card>
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

    /* Table Section */
    .dashboard-table-section {
        mat-card-header {
            padding-bottom: var(--mj-space-3);
        }
    }

    .actions-table {
        width: 100%;
        background: transparent;
    }

    .actions-table th {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-secondary);
    }

    .actions-table td {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
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
        font-size: 28px;
        width: 28px;
        height: 28px;
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
            icon: 'bolt',
            iconBg: 'var(--mj-color-info-50)',
            iconColor: 'var(--mj-color-info-500)',
            change: '24 new',
            changeColor: 'var(--mj-status-success-text)',
            subLabel: 'since last visit'
        },
        {
            label: 'Success Rate',
            value: '98.5%',
            icon: 'check_circle',
            iconBg: 'var(--mj-color-success-50)',
            iconColor: 'var(--mj-color-success-500)',
            change: '',
            changeColor: '',
            subLabel: 'Global System Health'
        },
        {
            label: 'AI Agents',
            value: '5 Active',
            icon: 'smart_toy',
            iconBg: 'color-mix(in srgb, var(--mj-brand-tertiary) 15%, transparent)',
            iconColor: 'var(--mj-brand-tertiary)',
            change: '+2',
            changeColor: 'var(--mj-brand-tertiary)',
            subLabel: 'in training'
        }
    ];

    displayedColumns = ['name', 'status', 'date', 'duration'];

    recentActions: RecentAction[] = [
        { name: 'Sync CRM Contacts', status: 'Success', statusColor: 'var(--mj-status-success-text)', date: '2026-02-03 14:30', duration: '450ms' },
        { name: 'Weekly Report Gen', status: 'Pending', statusColor: 'var(--mj-status-warning-text)', date: '2026-02-03 14:25', duration: '-' },
        { name: 'Update Inventory', status: 'Failed', statusColor: 'var(--mj-status-error-text)', date: '2026-02-03 14:10', duration: '12s' },
        { name: 'AI Sentiment Analysis', status: 'Success', statusColor: 'var(--mj-status-success-text)', date: '2026-02-03 13:55', duration: '2.4s' }
    ];
}
