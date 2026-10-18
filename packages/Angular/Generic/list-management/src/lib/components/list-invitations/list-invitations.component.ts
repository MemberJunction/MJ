import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit, inject } from '@angular/core';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RunView } from '@memberjunction/core';
import type { MJListInvitationEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLListsClient } from '@memberjunction/graphql-dataprovider';

/**
 * Invitations management UI (mockup 16). For a single List:
 *   - Pending / Accepted / Expired / Revoked tabs.
 *   - Send new invitation form (email + role + TTL).
 *   - Revoke / Resend actions on Pending invites.
 *
 * Reads invitations directly via `RunView` (cheaper than going through
 * GraphQL — the entity is already accessible). Mutations route through
 * `GraphQLListsClient` so the audit-log + notification side effects
 * fire server-side.
 */

type InvitationStatus = 'Pending' | 'Accepted' | 'Expired' | 'Revoked';

interface InvitationRow {
  ID: string;
  Email: string;
  Role: 'Editor' | 'Viewer';
  Status: InvitationStatus;
  ExpiresAt: Date;
  CreatedAt: Date;
  Token: string;
}

@Component({
  standalone: false,
  selector: 'mj-list-invitations',
  templateUrl: './list-invitations.component.html',
  styleUrls: ['./list-invitations.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListInvitationsComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  @Input()
  get ListID(): string | null {
    return this._listId;
  }
  set ListID(value: string | null) {
    if (this._listId !== value) {
      this._listId = value;
      if (this.initialized && value) void this.loadInvitations();
    }
  }
  private _listId: string | null = null;

  /** Optional display name for the list — used in the empty-state copy. */
  @Input() ListName: string | null = null;

  public ActiveTab: InvitationStatus = 'Pending';

  /** @deprecated Use {@link ActiveTab}. */
  public get activeTab(): InvitationStatus {
    return this.ActiveTab;
  }
  /** @deprecated Use {@link ActiveTab}. */
  public set activeTab(value: InvitationStatus) {
    this.ActiveTab = value;
  }
  public Invitations: InvitationRow[] = [];

  /** @deprecated Use {@link Invitations}. */
  public get invitations(): InvitationRow[] {
    return this.Invitations;
  }
  /** @deprecated Use {@link Invitations}. */
  public set invitations(value: InvitationRow[]) {
    this.Invitations = value;
  }

  /**
   * Precomputed list of invitations matching the active tab, recomputed only when
   * the source data ({@link invitations}) or {@link activeTab} changes (see
   * {@link recomputeVisibleInvitations}) — NOT on every change-detection cycle.
   * Bound directly as the @for source in the template, so a getter here would
   * allocate a fresh array (map + filter) every CD tick.
   */
  public VisibleInvitations: InvitationRow[] = [];

  /** @deprecated Use {@link VisibleInvitations}. */
  public get visibleInvitations(): InvitationRow[] {
    return this.VisibleInvitations;
  }
  /** @deprecated Use {@link VisibleInvitations}. */
  public set visibleInvitations(value: InvitationRow[]) {
    this.VisibleInvitations = value;
  }
  public Loading = false;

  /** @deprecated Use {@link Loading}. */
  public get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  public set loading(value) {
    this.Loading = value;
  }
  public errorMessage: string | null = null;
  public Submitting = false;

  /** @deprecated Use {@link Submitting}. */
  public get submitting() {
    return this.Submitting;
  }
  /** @deprecated Use {@link Submitting}. */
  public set submitting(value) {
    this.Submitting = value;
  }

  // Send-new-invitation form
  public NewEmail = '';

  /** @deprecated Use {@link NewEmail}. */
  public get newEmail() {
    return this.NewEmail;
  }
  /** @deprecated Use {@link NewEmail}. */
  public set newEmail(value) {
    this.NewEmail = value;
  }
  public NewRole: 'Editor' | 'Viewer' = 'Viewer';

  /** @deprecated Use {@link NewRole}. */
  public get newRole(): 'Editor' | 'Viewer' {
    return this.NewRole;
  }
  /** @deprecated Use {@link NewRole}. */
  public set newRole(value: 'Editor' | 'Viewer') {
    this.NewRole = value;
  }
  public NewTtlHours = 168;

  /** @deprecated Use {@link NewTtlHours}. */
  public get newTtlHours() {
    return this.NewTtlHours;
  }
  /** @deprecated Use {@link NewTtlHours}. */
  public set newTtlHours(value) {
    this.NewTtlHours = value;
  } // 7 days default

  private initialized = false;

  async ngOnInit(): Promise<void> {
    this.initialized = true;
    if (this._listId) await this.loadInvitations();
  }

  public SetTab(tab: InvitationStatus): void {
    this.ActiveTab = tab;
    this.recomputeVisibleInvitations();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SetTab}. */
  public setTab(tab: InvitationStatus): void {
    return this.SetTab(tab);
  }

  /**
   * Recompute the precomputed {@link visibleInvitations} array. Called only when
   * the source data or the active tab changes — keeping the per-row hydration
   * (map) + filter out of the per-CD-cycle hot path.
   *
   * We hydrate Status="Pending" rows whose ExpiresAt is in the past as Expired
   * on the client so users see them without waiting for a server-side flip. The
   * server's Accept path also lazily marks them.
   */
  private recomputeVisibleInvitations(): void {
    const now = Date.now();
    const hydrated = this.Invitations.map<InvitationRow>((inv) =>
      inv.Status === 'Pending' && inv.ExpiresAt.getTime() < now
        ? { ...inv, Status: 'Expired' }
        : inv,
    );
    this.VisibleInvitations = hydrated.filter((i) => i.Status === this.ActiveTab);
  }

  public CountFor(status: InvitationStatus): number {
    const now = Date.now();
    let count = 0;
    for (const inv of this.Invitations) {
      const effective: InvitationStatus =
        inv.Status === 'Pending' && inv.ExpiresAt.getTime() < now ? 'Expired' : inv.Status;
      if (effective === status) count++;
    }
    return count;
  }

  /** @deprecated Use {@link CountFor}. */
  public countFor(status: InvitationStatus): number {
    return this.CountFor(status);
  }

  public FormatExpiry(d: Date): string {
    const diff = d.getTime() - Date.now();
    if (diff < 0) return `expired ${d.toLocaleDateString()}`;
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 24) return `expires in ${hours}h`;
    const days = Math.floor(hours / 24);
    return `expires in ${days}d`;
  }

  /** @deprecated Use {@link FormatExpiry}. */
  public formatExpiry(d: Date): string {
    return this.FormatExpiry(d);
  }

  public get CanSend(): boolean {
    return !!this._listId && this.NewEmail.trim().length > 0 && this.NewEmail.includes('@') && !this.Submitting;
  }

  /** @deprecated Use {@link CanSend}. */
  public get canSend(): boolean {
    return this.CanSend;
  }

  public async SendInvitation(): Promise<void> {
    if (!this.CanSend || !this._listId) return;
    this.Submitting = true;
    this.cdr.markForCheck();
    try {
      const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
      const client = new GraphQLListsClient(provider);
      const result = await client.Invite({
        ListID: this._listId,
        Email: this.NewEmail.trim(),
        Role: this.NewRole,
        TtlHours: this.NewTtlHours,
      });
      if (result.Success) {
        this.NewEmail = '';
        await this.loadInvitations();
      } else {
        this.errorMessage = `Failed to send: ${result.Message}`;
      }
    } catch (e) {
      this.errorMessage = e instanceof Error ? e.message : String(e);
    } finally {
      this.Submitting = false;
      this.cdr.markForCheck();
    }
  }

  public async Revoke(invitationId: string): Promise<void> {
    const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
    const client = new GraphQLListsClient(provider);
    const result = await client.RevokeInvitation(invitationId);
    if (result.Success) {
      await this.loadInvitations();
    } else {
      this.errorMessage = `Failed to revoke: ${result.Message}`;
      this.cdr.markForCheck();
    }
  }

  /**
   * "Resend" = create a fresh invitation for the same email + role. The
   * old one stays Pending until either accepted or expired; users see
   * both in the Pending tab until one is consumed.
   */
  public async Resend(inv: InvitationRow): Promise<void> {
    const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
    const client = new GraphQLListsClient(provider);
    if (!this._listId) return;
    const result = await client.Invite({
      ListID: this._listId,
      Email: inv.Email,
      Role: inv.Role,
      TtlHours: 168,
    });
    if (result.Success) await this.loadInvitations();
    else {
      this.errorMessage = `Failed to resend: ${result.Message}`;
      this.cdr.markForCheck();
    }
  }

  private async loadInvitations(): Promise<void> {
    if (!this._listId) return;
    this.Loading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJListInvitationEntity>({
        EntityName: 'MJ: List Invitations',
        ExtraFilter: `ListID='${this._listId.replace(/'/g, "''")}'`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'simple',
      });
      if (!result.Success) {
        this.errorMessage = result.ErrorMessage ?? 'Failed to load invitations';
        this.Invitations = [];
        this.recomputeVisibleInvitations();
        return;
      }
      this.Invitations = (result.Results ?? []).map((r) => ({
        ID: String(r.ID),
        Email: String(r.Email),
        Role: r.Role as 'Editor' | 'Viewer',
        Status: r.Status as InvitationStatus,
        ExpiresAt: new Date(r.ExpiresAt as unknown as string),
        CreatedAt: new Date(r.__mj_CreatedAt as unknown as string),
        Token: String(r.Token),
      }));
      this.recomputeVisibleInvitations();
    } catch (e) {
      this.errorMessage = e instanceof Error ? e.message : String(e);
      this.Invitations = [];
      this.recomputeVisibleInvitations();
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
  }
}
