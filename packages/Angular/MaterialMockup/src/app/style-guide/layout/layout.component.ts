import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatTreeModule, MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FlatTreeControl } from '@angular/cdk/tree';

interface TreeNode {
    name: string;
    children?: TreeNode[];
}

interface FlatNode {
    name: string;
    level: number;
    expandable: boolean;
}

@Component({
    selector: 'app-layout',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatExpansionModule,
        MatDividerModule,
        MatTreeModule,
        MatButtonModule,
        MatIconModule
    ],
    template: `
    <div class="layout-page">

        <!-- ============ CARDS ============ -->
        <section class="demo-section">
            <h2>Cards</h2>
            <p class="section-desc">
                Cards contain content and actions about a single subject.
                <code>bg &rarr; --mj-bg-surface-elevated</code>
            </p>

            <div class="mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <!-- Basic card -->
                <mat-card class="demo-card">
                    <mat-card-header>
                        <mat-card-title>Basic Card</mat-card-title>
                        <mat-card-subtitle>Simple content container</mat-card-subtitle>
                    </mat-card-header>
                    <mat-card-content>
                        <p>Cards are surfaces that display content and actions on a single topic. They should be easy to scan for relevant information.</p>
                    </mat-card-content>
                </mat-card>

                <!-- Card with avatar and actions -->
                <mat-card class="demo-card">
                    <mat-card-header>
                        <div mat-card-avatar class="card-avatar"></div>
                        <mat-card-title>Jane Doe</mat-card-title>
                        <mat-card-subtitle>Product Designer</mat-card-subtitle>
                    </mat-card-header>
                    <mat-card-content>
                        <p>Card with avatar, title, subtitle, and action buttons. Ideal for user profiles, team members, or contact cards.</p>
                    </mat-card-content>
                    <mat-card-actions>
                        <button mat-button>View Profile</button>
                        <button mat-button>Message</button>
                    </mat-card-actions>
                </mat-card>

                <!-- Card with image placeholder -->
                <mat-card class="demo-card">
                    <div class="card-image-placeholder mj-grid mj-flex-column mj-align-center mj-justify-center mj-gap-2">
                        <mat-icon>image</mat-icon>
                        <span>Card Image</span>
                    </div>
                    <mat-card-content>
                        <mat-card-title>Media Card</mat-card-title>
                        <mat-card-subtitle>With image area</mat-card-subtitle>
                        <p>This card includes an image region at the top. Use mat-card-image for responsive media display.</p>
                    </mat-card-content>
                    <mat-card-actions align="end">
                        <button mat-button>Share</button>
                        <button mat-flat-button>Learn More</button>
                    </mat-card-actions>
                </mat-card>

                <!-- Outlined card -->
                <mat-card class="demo-card" appearance="outlined">
                    <mat-card-header>
                        <mat-card-title>Outlined Card</mat-card-title>
                        <mat-card-subtitle>appearance="outlined"</mat-card-subtitle>
                    </mat-card-header>
                    <mat-card-content>
                        <p>Outlined cards use a border instead of elevation. Useful for low-emphasis containers or when combined with other elevated surfaces.</p>
                    </mat-card-content>
                    <mat-card-actions>
                        <button mat-button>Action</button>
                    </mat-card-actions>
                </mat-card>
            </div>

            <div class="demo-block">
                <h4>Elevated Card</h4>
                <mat-card class="demo-card elevated-card">
                    <mat-card-header>
                        <mat-icon mat-card-avatar class="card-icon-avatar mj-grid mj-align-center mj-justify-center">analytics</mat-icon>
                        <mat-card-title>Analytics Summary</mat-card-title>
                        <mat-card-subtitle>Last 30 days</mat-card-subtitle>
                    </mat-card-header>
                    <mat-card-content>
                        <div class="stats-row mj-grid mj-gap-6">
                            <div class="mj-grid mj-flex-column mj-gap-1">
                                <span class="stat-value">12,847</span>
                                <span class="stat-label">Page Views</span>
                            </div>
                            <div class="mj-grid mj-flex-column mj-gap-1">
                                <span class="stat-value">3,291</span>
                                <span class="stat-label">Visitors</span>
                            </div>
                            <div class="mj-grid mj-flex-column mj-gap-1">
                                <span class="stat-value">68%</span>
                                <span class="stat-label">Bounce Rate</span>
                            </div>
                        </div>
                    </mat-card-content>
                    <mat-card-actions>
                        <button mat-button>View Report</button>
                        <button mat-button>Export</button>
                    </mat-card-actions>
                </mat-card>
            </div>
        </section>

        <!-- ============ EXPANSION PANELS ============ -->
        <section class="demo-section">
            <h2>Expansion Panels</h2>
            <p class="section-desc">
                Expansion panels provide progressive disclosure of content.
                <code>bg &rarr; --mj-bg-surface</code>
            </p>

            <div class="demo-block">
                <h4>Accordion</h4>
                <mat-accordion class="demo-accordion">
                    <mat-expansion-panel>
                        <mat-expansion-panel-header>
                            <mat-panel-title>Personal Information</mat-panel-title>
                            <mat-panel-description>Enter your name and details</mat-panel-description>
                        </mat-expansion-panel-header>
                        <p>Provide your full name, date of birth, and contact information. This data is used for account verification and personalization.</p>
                    </mat-expansion-panel>

                    <mat-expansion-panel>
                        <mat-expansion-panel-header>
                            <mat-panel-title>Billing Address</mat-panel-title>
                            <mat-panel-description>Used for invoices</mat-panel-description>
                        </mat-expansion-panel-header>
                        <p>Enter the billing address associated with your payment method. This address will appear on all invoices and receipts.</p>
                    </mat-expansion-panel>

                    <mat-expansion-panel>
                        <mat-expansion-panel-header>
                            <mat-panel-title>Notification Preferences</mat-panel-title>
                            <mat-panel-description>Configure alerts</mat-panel-description>
                        </mat-expansion-panel-header>
                        <p>Choose which notifications you would like to receive via email, SMS, or in-app alerts. You can update these preferences at any time.</p>
                    </mat-expansion-panel>

                    <mat-expansion-panel>
                        <mat-expansion-panel-header>
                            <mat-panel-title>Privacy Settings</mat-panel-title>
                            <mat-panel-description>Manage data sharing</mat-panel-description>
                        </mat-expansion-panel-header>
                        <p>Control how your data is shared with third parties and configure your privacy preferences. Review our privacy policy for more information.</p>
                    </mat-expansion-panel>
                </mat-accordion>
            </div>
        </section>

        <!-- ============ DIVIDER ============ -->
        <section class="demo-section">
            <h2>Divider</h2>
            <p class="section-desc">
                Dividers separate content into clear groups.
                <code>color &rarr; --mj-border-default</code>
            </p>

            <div class="demo-block">
                <h4>Horizontal Divider</h4>
                <div class="divider-demo-surface">
                    <p>Content above the divider</p>
                    <mat-divider></mat-divider>
                    <p>Content below the divider</p>
                </div>
            </div>

            <div class="demo-block">
                <h4>Inset Divider</h4>
                <div class="divider-demo-surface">
                    <div class="divider-list-item mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                        <mat-icon>inbox</mat-icon>
                        <span>Inbox</span>
                    </div>
                    <mat-divider inset></mat-divider>
                    <div class="divider-list-item mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                        <mat-icon>star</mat-icon>
                        <span>Starred</span>
                    </div>
                    <mat-divider inset></mat-divider>
                    <div class="divider-list-item mj-grid mj-flex-nowrap mj-gap-3 mj-align-center">
                        <mat-icon>send</mat-icon>
                        <span>Sent</span>
                    </div>
                </div>
            </div>

            <div class="demo-block">
                <h4>Vertical Divider</h4>
                <div class="vertical-divider-container mj-grid mj-flex-nowrap mj-gap-5 mj-align-center">
                    <span class="vertical-divider-item">Section A</span>
                    <mat-divider vertical></mat-divider>
                    <span class="vertical-divider-item">Section B</span>
                    <mat-divider vertical></mat-divider>
                    <span class="vertical-divider-item">Section C</span>
                </div>
            </div>
        </section>

        <!-- ============ TREE ============ -->
        <section class="demo-section">
            <h2>Tree</h2>
            <p class="section-desc">
                Trees display hierarchical data with expandable/collapsible nodes.
                Uses standard text/bg tokens.
            </p>

            <div class="demo-block">
                <h4>Flat Tree</h4>
                <div class="tree-demo-surface">
                    <mat-tree [dataSource]="dataSource" [treeControl]="treeControl">
                        <!-- Leaf node -->
                        <mat-tree-node *matTreeNodeDef="let node" matTreeNodePadding>
                            <button mat-icon-button disabled></button>
                            <mat-icon class="tree-node-icon">description</mat-icon>
                            <span class="tree-node-label">{{ node.name }}</span>
                        </mat-tree-node>

                        <!-- Expandable node -->
                        <mat-tree-node *matTreeNodeDef="let node; when: HasChild" matTreeNodePadding>
                            <button mat-icon-button matTreeNodeToggle
                                    [attr.aria-label]="'Toggle ' + node.name">
                                <mat-icon>
                                    {{ treeControl.isExpanded(node) ? 'expand_more' : 'chevron_right' }}
                                </mat-icon>
                            </button>
                            <mat-icon class="tree-node-icon">folder</mat-icon>
                            <span class="tree-node-label">{{ node.name }}</span>
                        </mat-tree-node>
                    </mat-tree>
                </div>
            </div>
        </section>

    </div>
    `,
    styles: [`
    .layout-page {
        max-width: 1100px;
    }

    /* ── Section layout ── */
    .demo-section {
        margin-bottom: var(--mj-space-10);
    }

    .demo-section h2 {
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

        code {
            font-family: var(--mj-font-family-mono);
            font-size: var(--mj-text-xs);
            background: var(--mj-bg-surface-sunken);
            padding: 2px 6px;
            border-radius: var(--mj-radius-sm);
            color: var(--mj-brand-primary);
        }
    }

    .demo-block {
        margin-bottom: var(--mj-space-6);

        h4 {
            font-size: var(--mj-text-sm);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-secondary);
            margin: 0 0 var(--mj-space-3) 0;
            text-transform: uppercase;
            letter-spacing: var(--mj-tracking-wide);
        }
    }

    /* ── Cards ── */
    .demo-card {
        background: var(--mj-bg-surface-elevated);
        color: var(--mj-text-primary);
        border-radius: var(--mj-radius-lg);

        mat-card-content p {
            color: var(--mj-text-secondary);
            font-size: var(--mj-text-sm);
            line-height: var(--mj-leading-relaxed);
            margin: 0;
        }

        mat-card-subtitle {
            color: var(--mj-text-muted);
        }
    }

    .card-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--mj-brand-primary), var(--mj-color-accent-500));
    }

    .card-icon-avatar {
        background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent);
        color: var(--mj-brand-primary);
        border-radius: var(--mj-radius-md);
        width: 40px;
        height: 40px;
        font-size: 24px;
    }

    .card-image-placeholder {
        height: 160px;
        background: linear-gradient(135deg, var(--mj-bg-surface-sunken), var(--mj-bg-surface-active));
        color: var(--mj-text-muted);
        border-radius: var(--mj-radius-lg) var(--mj-radius-lg) 0 0;

        mat-icon {
            font-size: 40px;
            width: 40px;
            height: 40px;
        }

        span {
            font-size: var(--mj-text-xs);
            text-transform: uppercase;
            letter-spacing: var(--mj-tracking-wide);
        }
    }

    .elevated-card {
        box-shadow: var(--mj-shadow-lg);
    }

    .stats-row {
        margin-top: var(--mj-space-2);
    }

    .stat-value {
        font-size: var(--mj-text-xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
    }

    .stat-label {
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--mj-tracking-wide);
    }

    /* ── Expansion Panels ── */
    .demo-accordion {
        border-radius: var(--mj-radius-lg);
        overflow: hidden;
        border: 1px solid var(--mj-border-default);

        mat-expansion-panel {
            background: var(--mj-bg-surface);
            color: var(--mj-text-primary);
        }

        mat-panel-title {
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-primary);
        }

        mat-panel-description {
            color: var(--mj-text-muted);
        }

        p {
            color: var(--mj-text-secondary);
            font-size: var(--mj-text-sm);
            line-height: var(--mj-leading-relaxed);
            margin: 0;
        }
    }

    /* ── Divider ── */
    .divider-demo-surface {
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-4) var(--mj-space-5);

        p {
            margin: var(--mj-space-3) 0;
            color: var(--mj-text-secondary);
            font-size: var(--mj-text-sm);
        }
    }

    .divider-list-item {
        padding: var(--mj-space-3) 0;
        color: var(--mj-text-primary);
        font-size: var(--mj-text-sm);

        mat-icon {
            color: var(--mj-text-muted);
            font-size: 20px;
            width: 20px;
            height: 20px;
        }
    }

    .vertical-divider-container {
        height: 48px;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        padding: 0 var(--mj-space-5);
    }

    .vertical-divider-item {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        font-weight: var(--mj-font-medium);
    }

    /* ── Tree ── */
    .tree-demo-surface {
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        padding: var(--mj-space-3) var(--mj-space-2);
    }

    .tree-node-icon {
        color: var(--mj-text-muted);
        font-size: 20px;
        width: 20px;
        height: 20px;
        margin-right: var(--mj-space-2);
    }

    .tree-node-label {
        color: var(--mj-text-primary);
        font-size: var(--mj-text-sm);
    }
    `]
})
export class LayoutComponent {
    treeData: TreeNode[] = [
        {
            name: 'Applications',
            children: [
                { name: 'Calendar' },
                { name: 'Chrome' },
                { name: 'Webstorm' }
            ]
        },
        {
            name: 'Documents',
            children: [
                { name: 'Angular', children: [{ name: 'src' }] },
                { name: 'Material', children: [{ name: 'core' }, { name: 'button' }] }
            ]
        },
        {
            name: 'Downloads',
            children: [
                { name: 'October' },
                { name: 'November' }
            ]
        }
    ];

    treeControl = new FlatTreeControl<FlatNode>(
        node => node.level,
        node => node.expandable
    );

    private treeFlattener = new MatTreeFlattener<TreeNode, FlatNode>(
        (node: TreeNode, level: number): FlatNode => ({
            name: node.name,
            level,
            expandable: !!node.children && node.children.length > 0
        }),
        node => node.level,
        node => node.expandable,
        node => node.children
    );

    dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener);

    constructor() {
        this.dataSource.data = this.treeData;
    }

    HasChild = (_: number, node: FlatNode): boolean => node.expandable;
}
