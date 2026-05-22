import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RunView } from '@memberjunction/core';

/**
 * Audit log view for a single List (mockup 18). Reads from the generic
 * `MJ: Audit Logs` entity, scoped to this list via `EntityID` (the MJ:
 * Lists entity row) + `RecordID` = the list ID. The event-type dropdown
 * is populated lazily from the audit-log-type rows actually present in
 * the data — keeps the UI honest about what events have happened
 * (instead of showing filter options that never match).
 */

interface AuditLogRow {
  ID: string;
  EventDate: Date;
  UserID: string;
  UserName: string;
  AuditLogTypeID: string;
  EventType: string;
  Description: string;
  Details: string | null;
}

@Component({
  standalone: false,
  selector: 'mj-list-audit-log',
  templateUrl: './list-audit-log.component.html',
  styleUrls: ['./list-audit-log.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListAuditLogComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  /** ListID we're auditing. Required. */
  @Input()
  get ListID(): string | null {
    return this._listId;
  }
  set ListID(value: string | null) {
    if (this._listId !== value) {
      this._listId = value;
      if (value && this.initialized) {
        void this.loadEntries();
      }
    }
  }
  private _listId: string | null = null;

  /** Max rows to load. Defaults to a sensible 200 for the per-list view. */
  @Input() PageSize = 200;

  public entries: AuditLogRow[] = [];
  public eventTypes: Array<{ ID: string; Name: string }> = [];
  public filterType = '';
  public filterText = '';
  public loading = false;
  public errorMessage: string | null = null;

  private initialized = false;

  async ngOnInit(): Promise<void> {
    this.initialized = true;
    if (this._listId) await this.loadEntries();
  }

  public get visibleEntries(): AuditLogRow[] {
    const term = this.filterText.trim().toLowerCase();
    return this.entries.filter((e) => {
      if (this.filterType && e.AuditLogTypeID !== this.filterType) return false;
      if (term) {
        const hay = `${e.Description} ${e.UserName}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }

  public OnFilterChange(): void {
    this.cdr.markForCheck();
  }

  public formatDate(d: Date): string {
    return d.toLocaleString();
  }

  public formatDetails(raw: string | null): string {
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }

  /**
   * Bulk-load audit-log entries + their type names + user names in three
   * RunViews via the batch helper so the UI only spins once. We then
   * compose the joined view in memory (1k rows × 3 lookups stays cheap).
   */
  private async loadEntries(): Promise<void> {
    if (!this._listId) return;
    this.loading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();

    try {
      const md = this.ProviderToUse;
      const listsEntity = md.Entities.find((e) => e.Name === 'MJ: Lists');
      if (!listsEntity) throw new Error('MJ: Lists entity not found in metadata');

      const rv = RunView.FromMetadataProvider(md);
      const logs = await rv.RunView<{
        ID: string;
        UserID: string;
        AuditLogTypeID: string;
        Description: string | null;
        Details: string | null;
        __mj_CreatedAt: Date;
      }>({
        EntityName: 'MJ: Audit Logs',
        ExtraFilter: `EntityID='${listsEntity.ID}' AND RecordID='${this._listId.replace(/'/g, "''")}'`,
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: this.PageSize,
        Fields: ['ID', 'UserID', 'AuditLogTypeID', 'Description', 'Details', '__mj_CreatedAt'],
        ResultType: 'simple',
      });

      if (!logs.Success) {
        this.errorMessage = logs.ErrorMessage ?? 'Failed to load audit logs';
        this.entries = [];
        return;
      }

      const rows = logs.Results ?? [];
      const userIds = Array.from(new Set(rows.map((r) => String(r.UserID))));
      const typeIds = Array.from(new Set(rows.map((r) => String(r.AuditLogTypeID))));

      const [users, types] = await Promise.all([
        userIds.length > 0
          ? rv.RunView<{ ID: string; Name: string }>({
              EntityName: 'MJ: Users',
              ExtraFilter: `ID IN (${userIds.map((id) => `'${id}'`).join(',')})`,
              Fields: ['ID', 'Name'],
              ResultType: 'simple',
            })
          : Promise.resolve({ Success: true, Results: [] }),
        typeIds.length > 0
          ? rv.RunView<{ ID: string; Name: string }>({
              EntityName: 'MJ: Audit Log Types',
              ExtraFilter: `ID IN (${typeIds.map((id) => `'${id}'`).join(',')})`,
              Fields: ['ID', 'Name'],
              ResultType: 'simple',
            })
          : Promise.resolve({ Success: true, Results: [] }),
      ]);

      const userById = new Map<string, string>();
      for (const u of users.Results ?? []) userById.set(String(u.ID), String(u.Name));
      const typeById = new Map<string, string>();
      for (const t of types.Results ?? []) typeById.set(String(t.ID), String(t.Name));

      this.entries = rows.map((r) => ({
        ID: String(r.ID),
        EventDate: new Date(r.__mj_CreatedAt),
        UserID: String(r.UserID),
        UserName: userById.get(String(r.UserID)) ?? '(unknown user)',
        AuditLogTypeID: String(r.AuditLogTypeID),
        EventType: typeById.get(String(r.AuditLogTypeID)) ?? '(unknown event)',
        Description: r.Description ?? '',
        Details: r.Details,
      }));

      // Populate the event-type dropdown with only types we actually have.
      this.eventTypes = [...typeById.entries()]
        .map(([ID, Name]) => ({ ID, Name }))
        .sort((a, b) => a.Name.localeCompare(b.Name));
    } catch (e) {
      this.errorMessage = e instanceof Error ? e.message : String(e);
      this.entries = [];
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
}
