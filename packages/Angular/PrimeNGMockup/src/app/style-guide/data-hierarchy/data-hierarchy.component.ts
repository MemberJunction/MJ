import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TreeModule } from 'primeng/tree';
import { TreeTableModule } from 'primeng/treetable';
import { OrganizationChartModule } from 'primeng/organizationchart';
import { TimelineModule } from 'primeng/timeline';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TreeNode } from 'primeng/api';

interface TimelineEvent {
    status: string;
    date: string;
    icon: string;
    color: string;
    description: string;
}

@Component({
    selector: 'app-data-hierarchy',
    standalone: true,
    imports: [
        CommonModule,
        TreeModule,
        TreeTableModule,
        OrganizationChartModule,
        TimelineModule,
        ButtonModule,
        TagModule
    ],
    template: `
    <div class="data-hierarchy-page">
        <!-- Tree Section -->
        <section class="token-section">
            <h2>Tree</h2>
            <p class="section-desc">Hierarchical tree view for navigating nested data structures like file systems and categories.</p>
            <p class="token-mapping">Node hover: --mj-bg-surface-hover | Selected: --mj-brand-primary | Lines: --mj-border-subtle</p>

            <div class="tree-container">
                <p-tree
                    [value]="treeData"
                    selectionMode="single"
                    [(selection)]="selectedTreeNode"
                    [style]="{'width': '100%'}">
                </p-tree>
            </div>
        </section>

        <!-- TreeTable Section -->
        <section class="token-section">
            <h2>TreeTable</h2>
            <p class="section-desc">Hierarchical data displayed in a tabular format with expandable rows for parent-child relationships.</p>
            <p class="token-mapping">Header bg: --mj-bg-surface-sunken | Expand icon: --mj-brand-primary | Row hover: --mj-bg-surface-hover</p>

            <p-treeTable
                [value]="treeTableData"
                [columns]="treeTableCols"
                [tableStyle]="{'min-width': '50rem'}">
                <ng-template pTemplate="header" let-columns>
                    <tr>
                        @for (col of columns; track col.field) {
                            <th>{{ col.header }}</th>
                        }
                    </tr>
                </ng-template>
                <ng-template pTemplate="body" let-rowNode let-rowData="rowData" let-columns="columns">
                    <tr>
                        @for (col of columns; track col.field; let i = $index) {
                            <td>
                                @if (i === 0) {
                                    <p-treeTableToggler [rowNode]="rowNode"></p-treeTableToggler>
                                }
                                @if (col.field === 'type') {
                                    <p-tag [value]="rowData[col.field]" [severity]="GetTypeSeverity(rowData[col.field])"></p-tag>
                                } @else {
                                    {{ rowData[col.field] }}
                                }
                            </td>
                        }
                    </tr>
                </ng-template>
            </p-treeTable>
        </section>

        <!-- Organization Chart Section -->
        <section class="token-section">
            <h2>Organization Chart</h2>
            <p class="section-desc">Visual representation of hierarchical relationships such as company org structures and reporting chains.</p>
            <p class="token-mapping">Node bg: --mj-bg-surface-elevated | Border: --mj-brand-primary | Connector: --mj-border-default</p>

            <div class="org-chart-container">
                <p-organizationChart
                    [value]="orgChartData"
                    selectionMode="single"
                    [(selection)]="selectedOrgNode">
                    <ng-template let-node pTemplate="default">
                        <div class="mj-grid mj-flex-column mj-align-center mj-gap-1 org-node">
                            <span class="org-node-name">{{ node.label }}</span>
                            @if (node.data?.title) {
                                <span class="org-node-title">{{ node.data.title }}</span>
                            }
                        </div>
                    </ng-template>
                </p-organizationChart>
            </div>
        </section>

        <!-- Timeline Section -->
        <section class="token-section">
            <h2>Timeline</h2>
            <p class="section-desc">Chronological display of events and milestones with customizable markers and content.</p>
            <p class="token-mapping">Connector: --mj-border-subtle | Marker: --mj-brand-primary | Content bg: --mj-bg-surface-elevated</p>

            <p-timeline [value]="timelineEvents" align="alternate">
                <ng-template pTemplate="content" let-event>
                    <div class="timeline-card">
                        <h3 class="timeline-event-title">{{ event.status }}</h3>
                        <p class="timeline-event-desc">{{ event.description }}</p>
                    </div>
                </ng-template>
                <ng-template pTemplate="opposite" let-event>
                    <span class="timeline-date">{{ event.date }}</span>
                </ng-template>
                <ng-template pTemplate="marker" let-event>
                    <span class="timeline-marker" [style.backgroundColor]="event.color">
                        <i [class]="event.icon" style="color: var(--mj-brand-on-primary); font-size: 0.75rem;"></i>
                    </span>
                </ng-template>
            </p-timeline>
        </section>
    </div>
  `,
    styles: [`
    .data-hierarchy-page {
        max-width: 1100px;
    }

    .token-section {
        margin-bottom: var(--mj-space-12);
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
        margin: 0 0 var(--mj-space-2) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .token-mapping {
        font-family: var(--mj-font-family-mono);
        font-size: 11px;
        color: var(--mj-text-muted);
        margin: 0 0 var(--mj-space-5) 0;
    }

    .component-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--mj-space-3);
        margin-bottom: var(--mj-space-4);
    }

    /* Tree */
    .tree-container {
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-md);
        overflow: hidden;
    }

    /* TreeTable - no additional wrapper needed */

    /* Organization Chart */
    .org-chart-container {
        overflow-x: auto;
        padding: var(--mj-space-5) 0;
    }

    .org-node {
        padding: var(--mj-space-2) var(--mj-space-4);
    }

    .org-node-name {
        font-weight: var(--mj-font-semibold);
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
    }

    .org-node-title {
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
    }

    /* Timeline */
    .timeline-card {
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-md);
        padding: var(--mj-space-3) var(--mj-space-4);
        box-shadow: var(--mj-shadow-sm);
    }

    .timeline-event-title {
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
        margin: 0 0 var(--mj-space-1) 0;
    }

    .timeline-event-desc {
        font-size: var(--mj-text-xs);
        color: var(--mj-text-secondary);
        margin: 0;
        line-height: var(--mj-leading-relaxed);
    }

    .timeline-date {
        font-size: var(--mj-text-xs);
        font-weight: var(--mj-font-medium);
        color: var(--mj-text-muted);
    }

    .timeline-marker {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
    }

    code {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent);
        padding: var(--mj-space-0-5) var(--mj-space-1-5);
        border-radius: var(--mj-radius-sm);
    }
  `]
})
export class DataHierarchyComponent {
    selectedTreeNode: TreeNode | null = null;
    selectedOrgNode: TreeNode | null = null;

    treeTableCols = [
        { field: 'name', header: 'Name' },
        { field: 'size', header: 'Size / Budget' },
        { field: 'type', header: 'Type' }
    ];

    treeData: TreeNode[] = [
        {
            label: 'Documents',
            icon: 'pi pi-fw pi-folder',
            expanded: true,
            children: [
                {
                    label: 'Work',
                    icon: 'pi pi-fw pi-folder',
                    children: [
                        { label: 'Expenses.xlsx', icon: 'pi pi-fw pi-file' },
                        { label: 'Resume.pdf', icon: 'pi pi-fw pi-file' }
                    ]
                },
                {
                    label: 'Personal',
                    icon: 'pi pi-fw pi-folder',
                    children: [
                        { label: 'Vacation.jpg', icon: 'pi pi-fw pi-image' },
                        { label: 'Notes.txt', icon: 'pi pi-fw pi-file' }
                    ]
                }
            ]
        },
        {
            label: 'Downloads',
            icon: 'pi pi-fw pi-folder',
            expanded: true,
            children: [
                {
                    label: 'Images',
                    icon: 'pi pi-fw pi-folder',
                    children: [
                        { label: 'Logo.png', icon: 'pi pi-fw pi-image' },
                        { label: 'Banner.svg', icon: 'pi pi-fw pi-image' }
                    ]
                },
                {
                    label: 'Videos',
                    icon: 'pi pi-fw pi-folder',
                    children: [
                        { label: 'Tutorial.mp4', icon: 'pi pi-fw pi-video' },
                        { label: 'Demo.webm', icon: 'pi pi-fw pi-video' }
                    ]
                }
            ]
        }
    ];

    treeTableData: TreeNode[] = [
        {
            data: { name: 'Engineering', size: '$2.4M', type: 'Department' },
            expanded: true,
            children: [
                {
                    data: { name: 'Frontend Team', size: '$800K', type: 'Team' },
                    children: [
                        { data: { name: 'Angular Project', size: '$350K', type: 'Project' } },
                        { data: { name: 'Design System', size: '$250K', type: 'Project' } }
                    ]
                },
                {
                    data: { name: 'Backend Team', size: '$1.2M', type: 'Team' },
                    children: [
                        { data: { name: 'API Platform', size: '$600K', type: 'Project' } },
                        { data: { name: 'Data Pipeline', size: '$400K', type: 'Project' } }
                    ]
                }
            ]
        },
        {
            data: { name: 'Marketing', size: '$1.1M', type: 'Department' },
            expanded: true,
            children: [
                {
                    data: { name: 'Content Team', size: '$500K', type: 'Team' },
                    children: [
                        { data: { name: 'Blog Redesign', size: '$150K', type: 'Project' } }
                    ]
                },
                {
                    data: { name: 'Growth Team', size: '$600K', type: 'Team' },
                    children: [
                        { data: { name: 'SEO Campaign', size: '$200K', type: 'Project' } }
                    ]
                }
            ]
        }
    ];

    orgChartData: TreeNode[] = [
        {
            label: 'Sarah Chen',
            expanded: true,
            data: { title: 'Chief Executive Officer' },
            children: [
                {
                    label: 'James Wilson',
                    expanded: true,
                    data: { title: 'VP Engineering' },
                    children: [
                        {
                            label: 'Emily Park',
                            data: { title: 'Frontend Lead' }
                        },
                        {
                            label: 'Marcus Lee',
                            data: { title: 'Backend Lead' }
                        },
                        {
                            label: 'Priya Sharma',
                            data: { title: 'DevOps Lead' }
                        }
                    ]
                },
                {
                    label: 'Lisa Rodriguez',
                    expanded: true,
                    data: { title: 'VP Marketing' },
                    children: [
                        {
                            label: 'David Kim',
                            data: { title: 'Content Manager' }
                        },
                        {
                            label: 'Anna Foster',
                            data: { title: 'Growth Manager' }
                        }
                    ]
                }
            ]
        }
    ];

    timelineEvents: TimelineEvent[] = [
        {
            status: 'Project Kickoff',
            date: 'Jan 15, 2026',
            icon: 'pi pi-flag',
            color: 'var(--mj-brand-primary, #4f46e5)',
            description: 'Initial planning and team alignment for the design system initiative.'
        },
        {
            status: 'Design Tokens Defined',
            date: 'Feb 1, 2026',
            icon: 'pi pi-palette',
            color: 'var(--mj-status-info-fg, #3b82f6)',
            description: 'Core color, typography, and spacing tokens established and documented.'
        },
        {
            status: 'Component Library v1',
            date: 'Mar 10, 2026',
            icon: 'pi pi-box',
            color: 'var(--mj-status-success-fg, #22c55e)',
            description: 'First release of the PrimeNG-based component library with MJ theming.'
        },
        {
            status: 'Beta Testing',
            date: 'Apr 5, 2026',
            icon: 'pi pi-users',
            color: 'var(--mj-status-warning-fg, #f59e0b)',
            description: 'Internal teams begin integrating the design system into production apps.'
        },
        {
            status: 'General Availability',
            date: 'May 1, 2026',
            icon: 'pi pi-check-circle',
            color: 'var(--mj-status-success-fg, #22c55e)',
            description: 'Full release with documentation, migration guides, and support channels.'
        }
    ];

    GetTypeSeverity(type: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        switch (type) {
            case 'Department':
                return 'info';
            case 'Team':
                return 'warn';
            case 'Project':
                return 'success';
            default:
                return 'info';
        }
    }
}
