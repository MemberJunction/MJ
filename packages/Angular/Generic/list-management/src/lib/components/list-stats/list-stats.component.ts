import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RunView } from '@memberjunction/core';

/**
 * Usage-stats side panel for a single list (mockup 25). Surfaces four
 * cheap-to-compute counters + a recent-activity feed pulled from the
 * generic `MJ: Audit Logs` table (same one Phase 2's sharing emits to).
 *
 * Stats:
 *   - Member count                — `count(MJ: List Details)` for this list
 *   - Active shares               — non-revoked `MJ: Resource Permissions`
 *   - Growth this month           — `count(MJ: List Details where __mj_CreatedAt >= start-of-month)`
 *   - Time since last activity    — newest audit-log timestamp
 *
 * Recent activity = the 5 most-recent audit events (uses the same join
 * pattern as `mj-list-audit-log` — type + user lookup in a single batch).
 */

interface RecentActivity {
  ID: string;
  EventType: string;
  Description: string;
  Who: string;
  When: Date;
}

function newestOf(...dates: (Date | null)[]): Date | null {
  const ms = dates.filter((d): d is Date => d != null).map((d) => d.getTime());
  return ms.length === 0 ? null : new Date(Math.max(...ms));
}

@Component({
  standalone: false,
  selector: 'mj-list-stats',
  templateUrl: './list-stats.component.html',
  styleUrls: ['./list-stats.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListStatsComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input()
  set ListID(value: string | null) {
    if (this._listId !== value) {
      this._listId = value;
      if (this.initialized && value) void this.load();
    }
  }
  get ListID(): string | null {
    return this._listId;
  }
  private _listId: string | null = null;

  /**
   * Bump this number from the parent after any mutation (add / remove /
   * status update / share / unshare) to force the stats panel to re-query.
   * Without this, the Members count drifts from reality until full reload.
   */
  @Input()
  set RefreshTrigger(value: number) {
    if (value !== this._refreshTrigger) {
      this._refreshTrigger = value;
      if (this.initialized && this._listId) void this.load();
    }
  }
  get RefreshTrigger(): number {
    return this._refreshTrigger;
  }
  private _refreshTrigger = 0;

  public memberCount = 0;
  public activeShareCount = 0;
  public growthThisMonth = 0;
  public lastActivityAt: Date | null = null;
  public recent: RecentActivity[] = [];
  public loading = false;

  private initialized = false;

  async ngOnInit(): Promise<void> {
    this.initialized = true;
    if (this._listId) await this.load();
  }

  public formatRelative(d: Date | null): string {
    if (!d || isNaN(d.getTime())) return 'never';
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'just now';
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  private async load(): Promise<void> {
    if (!this._listId) return;
    this.loading = true;
    this.cdr.markForCheck();
    try {
      const md = this.ProviderToUse;
      const listsEntity = md.Entities.find((e) => e.Name === 'MJ: Lists');
      if (!listsEntity) return;
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const escapedId = this._listId.replace(/'/g, "''");

      const rv = RunView.FromMetadataProvider(md);
      // Cache-buster: every RunView gets an always-true predicate that
      // varies on each load() call. The server keys its RunView cache off
      // the literal filter string, so we force a miss on every refresh.
      // Without this, Members / Growth / Active shares / Last activity
      // would all read stale until a full server restart, even after the
      // RefreshTrigger input bumps. SQL comments (`/* */`) are rejected by
      // the ExtraFilter injection validator, so we use a numeric equality
      // instead.
      const cb = Date.now();
      const cbPredicate = ` AND ${cb} = ${cb}`;
      const [members, growth, shares, audits, latestMember] = await Promise.all([
        rv.RunView<{ ID: string }>({
          EntityName: 'MJ: List Details',
          ExtraFilter: `ListID='${escapedId}'${cbPredicate}`,
          Fields: ['ID'],
          ResultType: 'simple',
        }),
        rv.RunView<{ ID: string }>({
          EntityName: 'MJ: List Details',
          ExtraFilter: `ListID='${escapedId}' AND __mj_CreatedAt >= '${startOfMonth}'${cbPredicate}`,
          Fields: ['ID'],
          ResultType: 'simple',
        }),
        rv.RunView<{ ID: string }>({
          EntityName: 'MJ: Resource Permissions',
          ExtraFilter:
            `ResourceTypeID='E64D433E-F36B-1410-8560-0041FA62858A' AND ResourceRecordID='${escapedId}' AND Status<>'Revoked'${cbPredicate}`,
          Fields: ['ID'],
          ResultType: 'simple',
        }),
        rv.RunView<{
          ID: string;
          UserID: string;
          AuditLogTypeID: string;
          Description: string | null;
          __mj_CreatedAt: Date;
        }>({
          EntityName: 'MJ: Audit Logs',
          ExtraFilter: `EntityID='${listsEntity.ID}' AND RecordID='${escapedId}'${cbPredicate}`,
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: 5,
          Fields: ['ID', 'UserID', 'AuditLogTypeID', 'Description', '__mj_CreatedAt'],
          ResultType: 'simple',
        }),
        // Newest list-detail timestamp. Audit Logs only fire for sharing
        // events, so without this the "Last activity" widget reads "never"
        // even after the user has been adding/editing members all day.
        rv.RunView<{ __mj_UpdatedAt: Date }>({
          EntityName: 'MJ: List Details',
          ExtraFilter: `ListID='${escapedId}'${cbPredicate}`,
          OrderBy: '__mj_UpdatedAt DESC',
          MaxRows: 1,
          Fields: ['__mj_UpdatedAt'],
          ResultType: 'simple',
        }),
      ]);

      this.memberCount = members.Results?.length ?? 0;
      this.growthThisMonth = growth.Results?.length ?? 0;
      this.activeShareCount = shares.Results?.length ?? 0;

      const auditRows = audits.Results ?? [];
      const latestAuditAt =
        auditRows.length > 0 ? new Date(auditRows[0].__mj_CreatedAt) : null;
      const rawLatestMember = latestMember.Results?.[0]?.__mj_UpdatedAt;
      const parsedLatestMember = rawLatestMember ? new Date(rawLatestMember as Date | string) : null;
      const latestMemberAt =
        parsedLatestMember && !isNaN(parsedLatestMember.getTime()) ? parsedLatestMember : null;
      this.lastActivityAt = newestOf(latestAuditAt, latestMemberAt);

      if (auditRows.length === 0) {
        this.recent = [];
        return;
      }

      // Resolve user + audit-log type names in two cheap lookups.
      const userIds = Array.from(new Set(auditRows.map((r) => String(r.UserID))));
      const typeIds = Array.from(new Set(auditRows.map((r) => String(r.AuditLogTypeID))));
      const [users, types] = await Promise.all([
        rv.RunView<{ ID: string; Name: string }>({
          EntityName: 'MJ: Users',
          ExtraFilter: `ID IN (${userIds.map((id) => `'${id}'`).join(',')})`,
          Fields: ['ID', 'Name'],
          ResultType: 'simple',
        }),
        rv.RunView<{ ID: string; Name: string }>({
          EntityName: 'MJ: Audit Log Types',
          ExtraFilter: `ID IN (${typeIds.map((id) => `'${id}'`).join(',')})`,
          Fields: ['ID', 'Name'],
          ResultType: 'simple',
        }),
      ]);

      const userById = new Map<string, string>();
      for (const u of users.Results ?? []) userById.set(String(u.ID), String(u.Name));
      const typeById = new Map<string, string>();
      for (const t of types.Results ?? []) typeById.set(String(t.ID), String(t.Name));

      this.recent = auditRows.map((r) => ({
        ID: String(r.ID),
        EventType: typeById.get(String(r.AuditLogTypeID)) ?? '(unknown event)',
        Description: r.Description ?? '',
        Who: userById.get(String(r.UserID)) ?? '(unknown user)',
        When: new Date(r.__mj_CreatedAt),
      }));
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
}
