import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatListModule } from '@angular/material/list';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';

interface TableRow {
    id: number;
    name: string;
    status: string;
    category: string;
    date: string;
}

@Component({
    selector: 'app-data-display',
    standalone: true,
    imports: [
        CommonModule,
        MatTableModule,
        MatSortModule,
        MatPaginatorModule,
        MatListModule,
        MatGridListModule,
        MatBadgeModule,
        MatIconModule,
        MatChipsModule
    ],
    template: `
    <div class="page-container">

      <!-- ======================================== -->
      <!-- SECTION 1: Data Table                    -->
      <!-- ======================================== -->
      <section class="section">
        <h2 class="section-title">Data Table</h2>
        <p class="section-desc">
          Sortable table using <code>mat-table</code> with <code>matSort</code>.
          Header background maps to <code>--mj-bg-surface-sunken</code>.
        </p>

        <div class="table-container">
          <table mat-table [dataSource]="dataSource" matSort class="data-table">

            <!-- ID Column -->
            <ng-container matColumnDef="id">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> ID </th>
              <td mat-cell *matCellDef="let row"> {{ row.id }} </td>
            </ng-container>

            <!-- Name Column -->
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Name </th>
              <td mat-cell *matCellDef="let row"> {{ row.name }} </td>
            </ng-container>

            <!-- Category Column -->
            <ng-container matColumnDef="category">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Category </th>
              <td mat-cell *matCellDef="let row"> {{ row.category }} </td>
            </ng-container>

            <!-- Status Column -->
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Status </th>
              <td mat-cell *matCellDef="let row">
                <span class="status-badge" [class]="'status-' + row.status.toLowerCase()">
                  {{ row.status }}
                </span>
              </td>
            </ng-container>

            <!-- Date Column -->
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef mat-sort-header> Date </th>
              <td mat-cell *matCellDef="let row"> {{ row.date }} </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
        </div>

        <div class="token-note">
          <mat-icon class="token-icon">palette</mat-icon>
          <span>Header bg &rarr; <code>--mj-bg-surface-sunken</code></span>
        </div>
      </section>

      <!-- ======================================== -->
      <!-- SECTION 2: Paginator                     -->
      <!-- ======================================== -->
      <section class="section">
        <h2 class="section-title">Paginator</h2>
        <p class="section-desc">
          Page navigation using <code>mat-paginator</code>.
          Active elements use <code>--mj-brand-primary</code>.
        </p>

        <div class="demo-block">
          <mat-paginator
            [length]="120"
            [pageSize]="10"
            [pageSizeOptions]="[10, 20, 30]"
            showFirstLastButtons>
          </mat-paginator>
        </div>

        <div class="token-note">
          <mat-icon class="token-icon">palette</mat-icon>
          <span>Active &rarr; <code>--mj-brand-primary</code></span>
        </div>
      </section>

      <!-- ======================================== -->
      <!-- SECTION 3: List                          -->
      <!-- ======================================== -->
      <section class="section">
        <h2 class="section-title">List</h2>
        <p class="section-desc">
          Lists using <code>mat-list</code> and <code>mat-nav-list</code>.
          Hover state maps to <code>--mj-bg-surface-hover</code>.
        </p>

        <div class="mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-4">
          <!-- Basic list with icons -->
          <div class="demo-block">
            <h3 class="demo-label">Basic List</h3>
            <mat-list>
              @for (item of listItems; track item.label) {
                <mat-list-item>
                  <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                  <span matListItemTitle>{{ item.label }}</span>
                  <span matListItemLine>{{ item.secondary }}</span>
                </mat-list-item>
              }
            </mat-list>
          </div>

          <!-- Navigation list -->
          <div class="demo-block">
            <h3 class="demo-label">Navigation List</h3>
            <mat-nav-list>
              @for (item of navItems; track item.label) {
                <a mat-list-item>
                  <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                  <span matListItemTitle>{{ item.label }}</span>
                  <span matListItemLine>{{ item.secondary }}</span>
                </a>
              }
            </mat-nav-list>
          </div>

          <!-- Selection list -->
          <div class="demo-block">
            <h3 class="demo-label">Selection List</h3>
            <mat-selection-list>
              @for (item of selectionItems; track item) {
                <mat-list-option>{{ item }}</mat-list-option>
              }
            </mat-selection-list>
          </div>
        </div>

        <div class="token-note">
          <mat-icon class="token-icon">palette</mat-icon>
          <span>Hover &rarr; <code>--mj-bg-surface-hover</code></span>
        </div>
      </section>

      <!-- ======================================== -->
      <!-- SECTION 4: Grid List                     -->
      <!-- ======================================== -->
      <section class="section">
        <h2 class="section-title">Grid List</h2>
        <p class="section-desc">
          Tiled layout using <code>mat-grid-list</code> with 4 columns.
          Tiles use MJ brand, accent, and tertiary colors.
        </p>

        <mat-grid-list cols="4" rowHeight="120px" gutterSize="12px">
          @for (tile of gridTiles; track tile.label) {
            <mat-grid-tile
              [colspan]="tile.cols"
              [rowspan]="tile.rows"
              [style.background]="tile.color">
              <div class="tile-content mj-grid mj-flex-column mj-align-center mj-justify-center mj-gap-2">
                <mat-icon class="tile-icon">{{ tile.icon }}</mat-icon>
                <span class="tile-label">{{ tile.label }}</span>
              </div>
            </mat-grid-tile>
          }
        </mat-grid-list>

        <div class="token-note" style="margin-top: var(--mj-space-4)">
          <mat-icon class="token-icon">palette</mat-icon>
          <span>Tiles &rarr; <code>--mj-brand-primary</code>, <code>--mj-brand-accent</code>, <code>--mj-brand-tertiary</code></span>
        </div>
      </section>

      <!-- ======================================== -->
      <!-- SECTION 5: Badges                        -->
      <!-- ======================================== -->
      <section class="section">
        <h2 class="section-title">Badges</h2>
        <p class="section-desc">
          Notification badges using <code>matBadge</code>.
          Default badge background uses <code>--mj-status-error</code>.
        </p>

        <div class="mj-row mj-row-cols-md-2 mj-row-cols-lg-3 mj-gap-4">
          <!-- Badge on icons -->
          <div class="demo-block">
            <h3 class="demo-label">On Icons</h3>
            <div class="badge-row mj-grid mj-gap-8 mj-align-center">
              <mat-icon matBadge="5" matBadgeColor="warn" class="badge-demo-icon">notifications</mat-icon>
              <mat-icon matBadge="12" matBadgeColor="primary" class="badge-demo-icon">mail</mat-icon>
              <mat-icon matBadge="3" matBadgeColor="accent" class="badge-demo-icon">shopping_cart</mat-icon>
              <mat-icon matBadge="" matBadgeSize="small" matBadgeColor="warn" class="badge-demo-icon">chat</mat-icon>
            </div>
          </div>

          <!-- Badge on text -->
          <div class="demo-block">
            <h3 class="demo-label">On Text</h3>
            <div class="badge-row mj-grid mj-gap-8 mj-align-center">
              <span matBadge="4" matBadgeOverlap="false" matBadgeColor="warn" class="badge-text">Messages</span>
              <span matBadge="99+" matBadgeOverlap="false" matBadgeColor="primary" class="badge-text">Inbox</span>
              <span matBadge="New" matBadgeOverlap="false" matBadgeColor="accent" class="badge-text">Updates</span>
            </div>
          </div>

          <!-- Badge positions -->
          <div class="demo-block">
            <h3 class="demo-label">Positions</h3>
            <div class="badge-row mj-grid mj-gap-8 mj-align-center">
              <mat-icon matBadge="1" matBadgePosition="above after" matBadgeColor="warn" class="badge-demo-icon">folder</mat-icon>
              <mat-icon matBadge="2" matBadgePosition="above before" matBadgeColor="primary" class="badge-demo-icon">folder</mat-icon>
              <mat-icon matBadge="3" matBadgePosition="below after" matBadgeColor="accent" class="badge-demo-icon">folder</mat-icon>
              <mat-icon matBadge="4" matBadgePosition="below before" matBadgeColor="warn" class="badge-demo-icon">folder</mat-icon>
            </div>
          </div>
        </div>

        <div class="token-note">
          <mat-icon class="token-icon">palette</mat-icon>
          <span>Badge bg &rarr; <code>--mj-status-error</code> (default warn), primary / accent variants</span>
        </div>
      </section>

    </div>
  `,
    styles: [`
    .page-container {
      max-width: 1100px;
      margin: 0 auto;
      font-family: var(--mj-font-family);
      color: var(--mj-text-primary);
    }

    /* ---- Section layout ---- */
    .section {
      margin-bottom: var(--mj-space-10);
    }

    .section-title {
      font-size: var(--mj-text-2xl);
      font-weight: var(--mj-font-bold);
      color: var(--mj-text-primary);
      margin: 0 0 var(--mj-space-2) 0;
    }

    .section-desc {
      font-size: var(--mj-text-sm);
      color: var(--mj-text-secondary);
      margin: 0 0 var(--mj-space-5) 0;
      line-height: var(--mj-leading-relaxed);

      code {
        background-color: var(--mj-bg-surface-sunken);
        padding: 2px 6px;
        border-radius: var(--mj-radius-sm);
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-brand-primary);
      }
    }

    /* ---- Demo blocks ---- */
    .demo-block {
      background-color: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg);
      padding: var(--mj-space-5);
      margin-bottom: var(--mj-space-4);
    }

    .demo-label {
      font-size: var(--mj-text-sm);
      font-weight: var(--mj-font-semibold);
      color: var(--mj-text-secondary);
      margin: 0 0 var(--mj-space-3) 0;
    }

    /* ---- Token note ---- */
    .token-note {
      display: inline-flex;
      align-items: center;
      gap: var(--mj-space-2);
      background-color: var(--mj-status-info-bg);
      border: 1px solid var(--mj-status-info-border);
      border-radius: var(--mj-radius-md);
      padding: var(--mj-space-2) var(--mj-space-4);
      font-size: var(--mj-text-xs);
      color: var(--mj-status-info-text);

      code {
        background-color: color-mix(in srgb, var(--mj-status-info) 10%, transparent);
        padding: 1px 5px;
        border-radius: var(--mj-radius-sm);
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
      }
    }

    .token-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* ---- Data Table ---- */
    .table-container {
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg);
      overflow: hidden;
      margin-bottom: var(--mj-space-4);
    }

    .data-table {
      width: 100%;
    }

    .data-table th.mat-header-cell {
      background-color: var(--mj-bg-surface-sunken);
      font-weight: var(--mj-font-semibold);
      font-size: var(--mj-text-xs);
      text-transform: uppercase;
      letter-spacing: var(--mj-tracking-wide);
      color: var(--mj-text-secondary);
      padding: var(--mj-space-3) var(--mj-space-4);
    }

    .data-table td.mat-cell {
      padding: var(--mj-space-3) var(--mj-space-4);
      font-size: var(--mj-text-sm);
      color: var(--mj-text-primary);
    }

    .data-table tr.mat-mdc-row:hover {
      background-color: var(--mj-bg-surface-hover);
    }

    /* Status badges in table */
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: var(--mj-radius-full);
      font-size: var(--mj-text-xs);
      font-weight: var(--mj-font-medium);
    }

    .status-active {
      background-color: var(--mj-status-success-bg);
      color: var(--mj-status-success-text);
    }

    .status-pending {
      background-color: var(--mj-status-warning-bg);
      color: var(--mj-status-warning-text);
    }

    .status-inactive {
      background-color: var(--mj-status-error-bg);
      color: var(--mj-status-error-text);
    }

    .status-review {
      background-color: var(--mj-status-info-bg);
      color: var(--mj-status-info-text);
    }

    /* ---- Grid List tiles ---- */
    mat-grid-tile {
      border-radius: var(--mj-radius-lg);
      overflow: hidden;
    }

    .tile-content {
      color: var(--mj-text-inverse);
    }

    .tile-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: inherit;
    }

    .tile-label {
      font-size: var(--mj-text-sm);
      font-weight: var(--mj-font-semibold);
    }

    /* ---- Badge section ---- */

    .badge-demo-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: var(--mj-text-secondary);
    }

    .badge-text {
      font-size: var(--mj-text-base);
      font-weight: var(--mj-font-medium);
      color: var(--mj-text-primary);
    }
  `]
})
export class DataDisplayComponent implements AfterViewInit {
    /* ---- Table data ---- */
    displayedColumns: string[] = ['id', 'name', 'category', 'status', 'date'];

    tableData: TableRow[] = [
        { id: 1, name: 'Dashboard Widget',   category: 'UI',         status: 'Active',   date: '2026-01-15' },
        { id: 2, name: 'Auth Provider',      category: 'Security',   status: 'Active',   date: '2026-01-20' },
        { id: 3, name: 'Report Builder',     category: 'Analytics',  status: 'Pending',  date: '2026-01-22' },
        { id: 4, name: 'Email Service',      category: 'Messaging',  status: 'Inactive', date: '2025-12-10' },
        { id: 5, name: 'Data Pipeline',      category: 'ETL',        status: 'Review',   date: '2026-01-28' },
        { id: 6, name: 'User Preferences',   category: 'UI',         status: 'Active',   date: '2026-02-01' },
        { id: 7, name: 'AI Prompt Runner',   category: 'AI',         status: 'Pending',  date: '2026-02-03' }
    ];

    dataSource = new MatTableDataSource<TableRow>(this.tableData);

    @ViewChild(MatSort) sort!: MatSort;

    /* ---- List data ---- */
    listItems = [
        { icon: 'dashboard',      label: 'Dashboard',     secondary: 'Overview of key metrics' },
        { icon: 'people',         label: 'Users',         secondary: 'Manage user accounts' },
        { icon: 'settings',       label: 'Settings',      secondary: 'Application configuration' },
        { icon: 'notifications',  label: 'Notifications', secondary: '5 unread messages' }
    ];

    navItems = [
        { icon: 'home',           label: 'Home',          secondary: 'Return to main page' },
        { icon: 'analytics',     label: 'Analytics',     secondary: 'View usage statistics' },
        { icon: 'description',   label: 'Documents',     secondary: 'Browse files and reports' },
        { icon: 'help',          label: 'Help Center',   secondary: 'Guides and documentation' }
    ];

    selectionItems = ['Design Tokens', 'Dark Mode', 'Responsive Layout', 'Accessibility', 'Performance'];

    /* ---- Grid tiles ---- */
    gridTiles = [
        { label: 'Primary',  icon: 'star',       color: 'var(--mj-brand-primary)',      cols: 2, rows: 1 },
        { label: 'Accent',   icon: 'favorite',   color: 'var(--mj-brand-accent)',       cols: 1, rows: 1 },
        { label: 'Tertiary', icon: 'bolt',        color: 'var(--mj-brand-tertiary)',     cols: 1, rows: 1 },
        { label: 'Navy',     icon: 'anchor',      color: 'var(--mj-brand-secondary)',    cols: 1, rows: 1 },
        { label: 'Success',  icon: 'check_circle', color: 'var(--mj-status-success)',   cols: 1, rows: 1 },
        { label: 'Warning',  icon: 'warning',     color: 'var(--mj-status-warning)',     cols: 1, rows: 1 },
        { label: 'Error',    icon: 'error',        color: 'var(--mj-status-error)',      cols: 1, rows: 1 }
    ];

    ngAfterViewInit(): void {
        this.dataSource.sort = this.sort;
    }
}
