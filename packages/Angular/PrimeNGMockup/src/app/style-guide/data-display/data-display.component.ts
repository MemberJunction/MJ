import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { PanelModule } from 'primeng/panel';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';
import { DataViewModule } from 'primeng/dataview';
import { OrderListModule } from 'primeng/orderlist';
import { PickListModule } from 'primeng/picklist';
import { PaginatorModule } from 'primeng/paginator';
import { ScrollerModule } from 'primeng/scroller';

interface TableRow {
    id: number;
    name: string;
    status: string;
    severity: 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast';
    category: string;
    date: string;
}

interface Product {
    name: string;
    price: number;
    category: string;
    rating: number;
}

interface PaginatorPageEvent {
    first?: number;
    rows?: number;
    page?: number;
    pageCount?: number;
}

@Component({
    selector: 'app-data-display',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        CardModule,
        PanelModule,
        TableModule,
        TagModule,
        BadgeModule,
        ButtonModule,
        DataViewModule,
        OrderListModule,
        PickListModule,
        PaginatorModule,
        ScrollerModule
    ],
    template: `
    <div class="data-display-page">
        <!-- Table Section -->
        <section class="token-section">
            <h2>Data Table</h2>
            <p class="section-desc">PrimeNG table with MJ-themed headers, borders, hover states, and selection highlighting.</p>
            <p class="token-mapping">Header bg: --mj-bg-surface-sunken | Row hover: --mj-bg-surface-hover | Border: --mj-border-subtle</p>

            <p-table
                [value]="tableData"
                [tableStyle]="{'min-width': '50rem'}"
                styleClass="p-datatable-sm"
                selectionMode="single"
                [(selection)]="selectedRow"
                [sortField]="'name'"
                [sortOrder]="1">
                <ng-template pTemplate="header">
                    <tr>
                        <th pSortableColumn="id">ID <p-sortIcon field="id"></p-sortIcon></th>
                        <th pSortableColumn="name">Name <p-sortIcon field="name"></p-sortIcon></th>
                        <th pSortableColumn="category">Category <p-sortIcon field="category"></p-sortIcon></th>
                        <th>Status</th>
                        <th pSortableColumn="date">Date <p-sortIcon field="date"></p-sortIcon></th>
                    </tr>
                </ng-template>
                <ng-template pTemplate="body" let-row>
                    <tr [pSelectableRow]="row">
                        <td>{{ row.id }}</td>
                        <td>{{ row.name }}</td>
                        <td>{{ row.category }}</td>
                        <td>
                            <p-tag [value]="row.status" [severity]="row.severity"></p-tag>
                        </td>
                        <td>{{ row.date }}</td>
                    </tr>
                </ng-template>
            </p-table>
        </section>

        <!-- DataView Section -->
        <section class="token-section">
            <h2>DataView</h2>
            <p class="section-desc">Alternative data display as a list or grid of items.</p>
            <p-dataView [value]="products" layout="list">
                <ng-template pTemplate="list" let-products>
                    <div class="mj-grid mj-flex-column">
                        @for (product of products; track product.name) {
                            <div class="dataview-item mj-grid mj-flex-nowrap mj-gap-3 mj-align-center mj-justify-between">
                                <div class="dataview-item-content mj-grid mj-flex-column mj-gap-1">
                                    <span class="dataview-item-name">{{ product.name }}</span>
                                    <span class="dataview-item-category">{{ product.category }}</span>
                                </div>
                                <span class="dataview-item-price">\${{ product.price }}</span>
                            </div>
                        }
                    </div>
                </ng-template>
            </p-dataView>
        </section>

        <!-- OrderList Section -->
        <section class="token-section">
            <h2>OrderList</h2>
            <p class="section-desc">Reorderable list of items with drag-and-drop support.</p>
            <p-orderList [value]="orderListItems" header="Reorder Items" [dragdrop]="true" [listStyle]="{'max-height': '200px'}">
                <ng-template pTemplate="item" let-item>
                    <span>{{ item }}</span>
                </ng-template>
            </p-orderList>
        </section>

        <!-- PickList Section -->
        <section class="token-section">
            <h2>PickList</h2>
            <p class="section-desc">Dual-list component for transferring items between source and target.</p>
            <p-pickList
                [source]="pickListSource"
                [target]="pickListTarget"
                sourceHeader="Available"
                targetHeader="Selected"
                [sourceStyle]="{'height': '200px'}"
                [targetStyle]="{'height': '200px'}"
                [dragdrop]="true">
                <ng-template pTemplate="item" let-item>
                    <span>{{ item }}</span>
                </ng-template>
            </p-pickList>
        </section>

        <!-- Paginator Section -->
        <section class="token-section">
            <h2>Paginator</h2>
            <p class="section-desc">Standalone pagination control with page navigation.</p>
            <p-paginator [rows]="10" [totalRecords]="120" [rowsPerPageOptions]="[10, 20, 30]" (onPageChange)="OnPageChange($event)"></p-paginator>
            <p class="token-mapping" style="margin-top: var(--mj-space-2);">Active page uses --mj-brand-primary</p>
        </section>

        <!-- Scroller Section -->
        <section class="token-section">
            <h2>VirtualScroller (Scroller)</h2>
            <p class="section-desc">Virtualized scrolling for large lists. Only visible items are rendered in the DOM.</p>
            <p-scroller [items]="virtualItems" [itemSize]="40" [style]="{'width': '100%', 'height': '200px'}" styleClass="border-1 surface-border">
                <ng-template pTemplate="item" let-item let-options="options">
                    <div class="virtual-item" [style.height]="'40px'" style="display:flex;align-items:center;padding:0 var(--mj-space-4);">
                        {{ item }}
                    </div>
                </ng-template>
            </p-scroller>
        </section>

        <!-- Cards Section -->
        <section class="token-section">
            <h2>Cards</h2>
            <p class="section-desc">PrimeNG cards using MJ surface and shadow tokens for elevation.</p>
            <p class="token-mapping">Background: --mj-bg-surface-elevated | Shadow: --mj-shadow-sm | Radius: --mj-radius-lg</p>

            <div class="mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-5">
                <p-card header="Basic Card" subheader="Using MJ tokens">
                    <p>This card uses <code>--mj-bg-surface-elevated</code> for its background and
                    <code>--mj-shadow-sm</code> for subtle elevation.</p>
                </p-card>

                <p-card header="Card with Actions">
                    <p>Cards can contain any content including buttons and interactive elements.</p>
                    <ng-template pTemplate="footer">
                        <div class="card-footer-actions mj-grid mj-gap-2">
                            <button pButton label="Save" class="p-button-primary p-button-sm"></button>
                            <button pButton label="Cancel" class="p-button-text p-button-sm"></button>
                        </div>
                    </ng-template>
                </p-card>

                <p-card>
                    <ng-template pTemplate="header">
                        <div class="card-custom-header">
                            <i class="pi pi-chart-line card-icon"></i>
                        </div>
                    </ng-template>
                    <div class="metric-card-content mj-grid mj-flex-column mj-gap-1">
                        <span class="metric-value">2,847</span>
                        <span class="metric-label">Total Records</span>
                    </div>
                </p-card>
            </div>
        </section>

        <!-- Panel Section -->
        <section class="token-section">
            <h2>Panels</h2>
            <p class="section-desc">Collapsible panels with MJ-themed headers and content areas.</p>
            <p class="token-mapping">Header: --mj-bg-surface-elevated | Content: --mj-bg-surface | Border: --mj-border-default</p>

            <div class="mj-grid mj-flex-column mj-gap-4">
                <p-panel header="Collapsible Panel" [toggleable]="true">
                    <p>This panel uses <code>--mj-bg-surface-elevated</code> for the header and
                    <code>--mj-bg-surface</code> for the content area. The toggle animation
                    uses <code>--mj-transition-base</code> timing.</p>
                </p-panel>

                <p-panel header="Another Panel" [toggleable]="true" [collapsed]="true">
                    <p>Collapsed by default. Click the header to expand.</p>
                </p-panel>
            </div>
        </section>

        <!-- Tags & Badges Section -->
        <section class="token-section">
            <h2>Tags &amp; Badges</h2>
            <p class="section-desc">Status indicators using MJ status tokens for consistent semantic coloring.</p>

            <h3 class="subsection-title">Tags</h3>
            <p class="token-mapping">success: --mj-status-success-* | warning: --mj-status-warning-* | danger: --mj-status-error-* | info: --mj-status-info-*</p>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <p-tag value="Success" severity="success"></p-tag>
                <p-tag value="Warning" severity="warn"></p-tag>
                <p-tag value="Danger" severity="danger"></p-tag>
                <p-tag value="Info" severity="info"></p-tag>
                <p-tag value="Default"></p-tag>
            </div>

            <h3 class="subsection-title">Tags with Icons</h3>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <p-tag value="Active" severity="success" icon="pi pi-check"></p-tag>
                <p-tag value="Pending" severity="warn" icon="pi pi-clock"></p-tag>
                <p-tag value="Failed" severity="danger" icon="pi pi-times"></p-tag>
                <p-tag value="Processing" severity="info" icon="pi pi-spin pi-spinner"></p-tag>
            </div>

            <h3 class="subsection-title">Badges</h3>
            <div class="component-row mj-grid mj-gap-3 mj-align-center">
                <span class="badge-demo">
                    Notifications <p-badge value="4"></p-badge>
                </span>
                <span class="badge-demo">
                    Messages <p-badge value="12" severity="success"></p-badge>
                </span>
                <span class="badge-demo">
                    Alerts <p-badge value="3" severity="danger"></p-badge>
                </span>
            </div>
        </section>
    </div>
  `,
    styles: [`
    .data-display-page {
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
        margin: 0 0 var(--mj-space-2) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .token-mapping {
        font-family: var(--mj-font-family-mono);
        font-size: 11px;
        color: var(--mj-text-muted);
        margin: 0 0 var(--mj-space-5) 0;
    }

    .subsection-title {
        font-size: var(--mj-text-base);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
        margin: var(--mj-space-5) 0 var(--mj-space-1) 0;
    }

    .component-row {
        margin-bottom: var(--mj-space-4);
    }

    /* DataView */
    .dataview-item {
        padding: var(--mj-space-3) var(--mj-space-4);
        border-bottom: 1px solid var(--mj-border-subtle);
    }

    .dataview-item-name {
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
    }

    .dataview-item-category {
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
    }

    .dataview-item-price {
        font-weight: var(--mj-font-bold);
        color: var(--mj-brand-primary);
    }

    /* Cards Grid */

    .card-custom-header {
        padding: var(--mj-space-5);
        text-align: center;
        background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent);
    }

    .card-icon {
        font-size: var(--mj-text-3xl);
        color: var(--mj-brand-primary);
    }

    .metric-card-content {
        text-align: center;
    }

    .metric-value {
        font-size: var(--mj-text-3xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
    }

    .metric-label {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
    }

    /* Badges */
    .badge-demo {
        display: inline-flex;
        align-items: center;
        gap: var(--mj-space-2);
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
    }

    /* Virtual item */
    .virtual-item {
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
        border-bottom: 1px solid var(--mj-border-subtle);
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
export class DataDisplayComponent {
    tableData: TableRow[] = [
        { id: 1, name: 'Sync CRM Contacts', status: 'Active', severity: 'success', category: 'Integration', date: '2026-02-03' },
        { id: 2, name: 'Weekly Report Generator', status: 'Pending', severity: 'warn', category: 'Reporting', date: '2026-02-03' },
        { id: 3, name: 'Inventory Updater', status: 'Failed', severity: 'danger', category: 'Data', date: '2026-02-02' },
        { id: 4, name: 'AI Sentiment Analysis', status: 'Active', severity: 'success', category: 'AI/ML', date: '2026-02-02' },
        { id: 5, name: 'Email Campaign Dispatch', status: 'Queued', severity: 'info', category: 'Marketing', date: '2026-02-01' },
        { id: 6, name: 'Database Backup', status: 'Active', severity: 'success', category: 'Operations', date: '2026-02-01' },
        { id: 7, name: 'User Session Cleanup', status: 'Disabled', severity: 'warn', category: 'Maintenance', date: '2026-01-31' },
    ];

    selectedRow: TableRow | null = null;

    products: Product[] = [
        { name: 'Wireless Headphones', price: 79.99, category: 'Electronics', rating: 4 },
        { name: 'Ergonomic Keyboard', price: 129.99, category: 'Accessories', rating: 5 },
        { name: 'USB-C Hub', price: 49.99, category: 'Electronics', rating: 3 },
        { name: 'Standing Desk Mat', price: 39.99, category: 'Office', rating: 4 },
        { name: 'Webcam HD', price: 89.99, category: 'Electronics', rating: 4 }
    ];

    orderListItems: string[] = ['Design Review', 'Sprint Planning', 'Code Review', 'Deploy to Staging', 'QA Testing'];

    pickListSource: string[] = ['Angular', 'React', 'Vue', 'Svelte', 'Ember'];
    pickListTarget: string[] = ['TypeScript', 'JavaScript'];

    virtualItems: string[] = Array.from({ length: 1000 }, (_, i) => `Item #${i + 1}`);

    OnPageChange(event: PaginatorPageEvent) {
        // Page change handler
    }
}
