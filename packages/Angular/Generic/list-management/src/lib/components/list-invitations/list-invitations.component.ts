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

  public activeTab: InvitationStatus = 'Pending';
  public invitations: InvitationRow[] = [];
  public loading = false;
  public errorMessage: string | null = null;
  public submitting = false;

  // Send-new-invitation form
  public newEmail = '';
  public newRole: 'Editor' | 'Viewer' = 'Viewer';
  public newTtlHours = 168; // 7 days default

  private initialized = false;

  async ngOnInit(): Promise<void> {
    this.initialized = true;
    if (this._listId) await this.loadInvitations();
  }

  public setTab(tab: InvitationStatus): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  public get visibleInvitations(): InvitationRow[] {
    // We hydrate Status="Pending" rows whose ExpiresAt is in the past as
    // Expired on the client so users see them without waiting for a
    // server-side flip. The server's Accept path also lazily marks them.
    const now = Date.now();
    const hydrated = this.invitations.map<InvitationRow>((inv) =>
      inv.Status === 'Pending' && inv.ExpiresAt.getTime() < now
        ? { ...inv, Status: 'Expired' }
        : inv,
    );
    return hydrated.filter((i) => i.Status === this.activeTab);
  }

  public countFor(status: InvitationStatus): number {
    const now = Date.now();
    let count = 0;
    for (const inv of this.invitations) {
      const effective: InvitationStatus =
        inv.Status === 'Pending' && inv.ExpiresAt.getTime() < now ? 'Expired' : inv.Status;
      if (effective === status) count++;
    }
    return count;
  }

  public formatExpiry(d: Date): string {
    const diff = d.getTime() - Date.now();
    if (diff < 0) return `expired ${d.toLocaleDateString()}`;
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 24) return `expires in ${hours}h`;
    const days = Math.floor(hours / 24);
    return `expires in ${days}d`;
  }

  public get canSend(): boolean {
    return !!this._listId && this.newEmail.trim().length > 0 && this.newEmail.includes('@') && !this.submitting;
  }

  public async SendInvitation(): Promise<void> {
    if (!this.canSend || !this._listId) return;
    this.submitting = true;
    this.cdr.markForCheck();
    try {
      const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
      const client = new GraphQLListsClient(provider);
      const result = await client.Invite({
        ListID: this._listId,
        Email: this.newEmail.trim(),
        Role: this.newRole,
        TtlHours: this.newTtlHours,
      });
      if (result.Success) {
        this.newEmail = '';
        await this.loadInvitations();
      } else {
        this.errorMessage = `Failed to send: ${result.Message}`;
      }
    } catch (e) {
      this.errorMessage = e instanceof Error ? e.message : String(e);
    } finally {
      this.submitting = false;
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
    this.loading = true;
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
        this.invitations = [];
        return;
      }
      this.invitations = (result.Results ?? []).map((r) => ({
        ID: String(r.ID),
        Email: String(r.Email),
        Role: r.Role as 'Editor' | 'Viewer',
        Status: r.Status as InvitationStatus,
        ExpiresAt: new Date(r.ExpiresAt as unknown as string),
        CreatedAt: new Date(r.__mj_CreatedAt as unknown as string),
        Token: String(r.Token),
      }));
    } catch (e) {
      this.errorMessage = e instanceof Error ? e.message : String(e);
      this.invitations = [];
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
}
