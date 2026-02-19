import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent, ArtifactViewerTab } from '../base-artifact-viewer.component';

/**
 * JSON schema for Data artifact content.
 * The agent produces this structure when emitting query/view results.
 */
interface DataArtifactSpec {
  /** Data source type */
  source: 'query' | 'view';

  /** Display title for the data */
  title?: string;

  /** For query source: the query ID to render via mj-query-viewer */
  queryId?: string;

  /** For query source: parameter values to pass */
  parameters?: Record<string, string | number | boolean>;

  /** For view source: the entity name */
  entityName?: string;

  /** For view source: extra WHERE filter */
  extraFilter?: string;

  /** Column definitions for inline data display */
  columns?: DataArtifactColumn[];

  /** Inline row data (when results are embedded directly) */
  rows?: Record<string, unknown>[];

  /** Query metadata */
  metadata?: {
    sql?: string;
    rowCount?: number;
    executionTimeMs?: number;
  };
}

interface DataArtifactColumn {
  field: string;
  headerName?: string;
  width?: number;
}

/**
 * Viewer component for Data artifacts.
 *
 * Displays tabular data from query or view results. Supports two modes:
 * 1. **Inline data**: Rows and columns embedded directly in the artifact JSON — rendered in a simple HTML table
 * 2. **Reference mode** (future): Points to a query ID or view that can be rendered via mj-query-viewer or mj-entity-data-grid
 *
 * The inline data mode is used by the Query Builder agent when it emits results
 * from Execute Research Query action calls.
 */
@Component({
  standalone: false,
  selector: 'mj-data-artifact-viewer',
  template: `
    <div class="data-artifact-viewer" [ngClass]="cssClass">
      @if (spec) {
        <!-- Title bar -->
        <div class="data-toolbar">
          <div class="data-title">
            <i class="fas fa-table"></i>
            <span>{{ spec.title || 'Data Results' }}</span>
            @if (spec.metadata?.rowCount != null) {
              <span class="row-count">{{ spec.metadata!.rowCount }} rows</span>
            }
            @if (spec.metadata?.executionTimeMs != null) {
              <span class="exec-time">{{ spec.metadata!.executionTimeMs }}ms</span>
            }
          </div>
          <div class="data-actions">
            <button class="btn-icon" title="Copy as CSV" (click)="OnCopyCsv()">
              <i class="fas fa-copy"></i> CSV
            </button>
            <button class="btn-icon" title="Copy as JSON" (click)="OnCopyJson()">
              <i class="fas fa-brackets-curly"></i> JSON
            </button>
          </div>
        </div>

        <!-- Inline data table -->
        @if (HasInlineData) {
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  @for (col of DisplayColumns; track col.field) {
                    <th [style.width]="col.width ? col.width + 'px' : 'auto'">
                      {{ col.headerName || col.field }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of spec.rows; track $index) {
                  <tr>
                    @for (col of DisplayColumns; track col.field) {
                      <td [title]="CellValue(row, col.field)">{{ CellValue(row, col.field) }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>No data rows available</p>
          </div>
        }
      } @else if (HasError) {
        <div class="error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>{{ ErrorMessage }}</p>
        </div>
      } @else {
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No data to display</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .data-artifact-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .data-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
    }

    .data-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 13px;
      color: #333;
    }

    .data-title i {
      color: #6c757d;
    }

    .row-count {
      padding: 2px 8px;
      background: #e9ecef;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
      color: #495057;
    }

    .exec-time {
      padding: 2px 8px;
      background: #d4edda;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
      color: #155724;
    }

    .data-actions {
      display: flex;
      gap: 6px;
    }

    .btn-icon {
      padding: 4px 10px;
      background: white;
      border: 1px solid #ced4da;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
      color: #495057;
    }

    .btn-icon:hover {
      background: #e9ecef;
      border-color: #adb5bd;
    }

    .table-container {
      flex: 1;
      overflow: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .data-table th {
      position: sticky;
      top: 0;
      background: #f1f3f5;
      border-bottom: 2px solid #dee2e6;
      padding: 8px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #495057;
      white-space: nowrap;
    }

    .data-table td {
      padding: 6px 12px;
      border-bottom: 1px solid #f1f3f5;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .data-table tbody tr:hover {
      background: #f8f9fa;
    }

    .data-table tbody tr:nth-child(even) {
      background: #fdfdfe;
    }

    .data-table tbody tr:nth-child(even):hover {
      background: #f8f9fa;
    }

    .empty-state, .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: #6c757d;
      text-align: center;
      gap: 12px;
    }

    .empty-state i, .error-state i {
      font-size: 32px;
    }

    .error-state {
      color: #dc3545;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'DataArtifactViewerPlugin')
export class DataArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
  public spec: DataArtifactSpec | null = null;
  public HasError = false;
  public ErrorMessage = '';

  // private cdr: ChangeDetectorRef | null = null;

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }
  public override get hasDisplayContent(): boolean {
    return this.spec != null;
  }

  public override get parentShouldShowRawContent(): boolean {
    return true;
  }

  public get HasInlineData(): boolean {
    return !!(this.spec?.rows && this.spec.rows.length > 0);
  }

  /**
   * Build column definitions from explicit columns or by inferring from the first row
   */
  public get DisplayColumns(): DataArtifactColumn[] {
    if (!this.spec) return [];

    if (this.spec.columns && this.spec.columns.length > 0) {
      return this.spec.columns;
    }

    // Infer columns from the first row's keys
    if (this.spec.rows && this.spec.rows.length > 0) {
      return Object.keys(this.spec.rows[0]).map(key => ({
        field: key,
        headerName: key
      }));
    }

    return [];
  }

  ngOnInit(): void {
    try {
      this.spec = this.parseJsonContent<DataArtifactSpec>();
      if (!this.spec) {
        this.HasError = true;
        this.ErrorMessage = 'Failed to parse data artifact content';
      }
    } catch (error) {
      this.HasError = true;
      this.ErrorMessage = error instanceof Error ? error.message : 'Failed to load data';
    }
  }

  /**
   * Provide SQL tab when query metadata includes the SQL
   */
  public GetAdditionalTabs(): ArtifactViewerTab[] {
    const tabs: ArtifactViewerTab[] = [];

    if (this.spec?.metadata?.sql) {
      tabs.push({
        label: 'SQL',
        icon: 'fa-database',
        contentType: 'code',
        language: 'sql',
        content: this.spec.metadata.sql
      });
    }

    return tabs;
  }

  public CellValue(row: Record<string, unknown>, field: string): string {
    const val = row[field];
    if (val == null) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  public OnCopyCsv(): void {
    if (!this.spec?.rows || this.spec.rows.length === 0) return;

    const cols = this.DisplayColumns;
    const header = cols.map(c => c.headerName || c.field).join(',');
    const rows = this.spec.rows.map(row =>
      cols.map(c => {
        const val = this.CellValue(row, c.field);
        // Escape values containing commas or quotes
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      }).join(',')
    );

    const csv = [header, ...rows].join('\n');
    navigator.clipboard.writeText(csv);
  }

  public OnCopyJson(): void {
    if (!this.spec?.rows) return;
    navigator.clipboard.writeText(JSON.stringify(this.spec.rows, null, 2));
  }
}
