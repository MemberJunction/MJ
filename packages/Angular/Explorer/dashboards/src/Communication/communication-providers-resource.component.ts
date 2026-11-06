import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import {
    ResourceData,
    MJCommunicationProviderEntity,
    MJCommunicationLogEntity,
    MJAIBridgeAgentIdentityEntity,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { RunView, CompositeKey } from '@memberjunction/core';

type ProviderEnterpriseScopeMode = MJCommunicationProviderEntity['EnterpriseScopeMode'];

interface EnterpriseScopeOption {
    Value: ProviderEnterpriseScopeMode;
    Label: string;
    Summary: string;
}

interface ProviderCardData {
    Entity: MJCommunicationProviderEntity;
    SentCount: number;
    SuccessRate: number;
    FailedCount: number;
    IconClass: string;
    LogoClass: string;
    ScopeLabel: string;
    ScopeBadgeClass: string;
}

@RegisterClass(BaseResourceComponent, 'CommunicationProvidersResource')
@Component({
  standalone: false,
    selector: 'mj-communication-providers-resource',
    template: `
    <mj-page-layout>
      <mj-page-header
        Title="Providers & Enterprise Mailbox Governance"
        Icon="fa-solid fa-server"
        Subtitle="Manage messaging & calendar providers, enterprise mailbox scope boundaries, and dedicated Agent Utility Mailboxes">
        <div actions>
          <button mjButton variant="secondary" size="sm" (click)="AddNewAgentIdentity()">
            <i class="fa-solid fa-robot"></i> <span class="action-btn-label">Add Utility Mailbox</span>
          </button>
          <button mjButton variant="primary" size="sm" (click)="addNewProvider()">
            <i class="fa-solid fa-plus"></i> <span class="action-btn-label">Add Provider</span>
          </button>
        </div>
      </mj-page-header>

      <mj-page-body>
      @if (isLoading) {
        <div class="loading-state">
          <mj-loading text="Loading providers and mailbox governance..."></mj-loading>
        </div>
      }

      @if (!isLoading) {
        <!-- PROVIDERS GRID -->
        <div class="section-heading">
          <div class="section-heading-title">
            <i class="fa-solid fa-plug"></i> Configured Communication & Calendar Providers
          </div>
          <div class="section-heading-sub">
            Enterprise credentials default to <strong>Utility Mailboxes Only</strong> so agents cannot read or send from arbitrary user inboxes unless explicitly scoped.
          </div>
        </div>

        <div class="providers-grid">
          @for (card of providerCards; track card.Entity.ID) {
            <div class="provider-card" [class.disabled]="card.Entity.Status === 'Disabled'">
              <div class="provider-card-header">
                <div class="provider-card-logo" [ngClass]="card.LogoClass">
                  <i [class]="card.IconClass"></i>
                </div>
                <div class="provider-card-title">
                  <div class="provider-card-name">{{card.Entity.Name}}</div>
                  <div class="provider-card-desc">{{card.Entity.Description || 'No description'}}</div>
                </div>
                <span class="provider-card-status" [ngClass]="card.Entity.Status.toLowerCase()">
                  {{card.Entity.Status}}
                </span>
              </div>
              <div class="provider-card-body">
                <div class="provider-capabilities">
                  <span class="capability-chip" [class.supported]="card.Entity.SupportsSending" [class.unsupported]="!card.Entity.SupportsSending">
                    <i [class]="card.Entity.SupportsSending ? 'fa-solid fa-check' : 'fa-solid fa-xmark'"></i> Sending
                  </span>
                  <span class="capability-chip" [class.supported]="card.Entity.SupportsReceiving" [class.unsupported]="!card.Entity.SupportsReceiving">
                    <i [class]="card.Entity.SupportsReceiving ? 'fa-solid fa-check' : 'fa-solid fa-xmark'"></i> Receiving
                  </span>
                  <span class="capability-chip" [class.supported]="card.Entity.SupportsCalendar" [class.unsupported]="!card.Entity.SupportsCalendar">
                    <i [class]="card.Entity.SupportsCalendar ? 'fa-regular fa-calendar-check' : 'fa-solid fa-xmark'"></i> Calendar
                  </span>
                  <span class="capability-chip" [class.supported]="card.Entity.SupportsFreeBusy" [class.unsupported]="!card.Entity.SupportsFreeBusy">
                    <i [class]="card.Entity.SupportsFreeBusy ? 'fa-solid fa-user-clock' : 'fa-solid fa-xmark'"></i> Free/Busy
                  </span>
                  @if (card.Entity.SupportsScheduledSending) {
                    <span class="capability-chip supported">
                      <i class="fa-solid fa-check"></i> Scheduled
                    </span>
                  }
                  @if (card.Entity.SupportsDrafts) {
                    <span class="capability-chip supported">
                      <i class="fa-solid fa-check"></i> Drafts
                    </span>
                  }
                  @if (card.Entity.SupportsForwarding) {
                    <span class="capability-chip supported">
                      <i class="fa-solid fa-check"></i> Forward
                    </span>
                  }
                  @if (card.Entity.SupportsReplying) {
                    <span class="capability-chip supported">
                      <i class="fa-solid fa-check"></i> Reply
                    </span>
                  }
                </div>

                <!-- ENTERPRISE GOVERNANCE SUMMARY BANNER -->
                <div class="governance-banner">
                  <div class="governance-row">
                    <span class="governance-label"><i class="fa-solid fa-shield-halved"></i> Mailbox Scope</span>
                    <span class="scope-badge" [ngClass]="card.ScopeBadgeClass">{{card.ScopeLabel}}</span>
                  </div>
                  <div class="governance-row">
                    <span class="governance-label"><i class="fa-solid fa-globe"></i> Allowed Domains</span>
                    <span class="governance-domains">{{card.Entity.AllowedEmailDomains || 'All domains (unrestricted)'}}</span>
                  </div>
                </div>

                <div class="provider-card-stats">
                  <div class="provider-stat">
                    <div class="provider-stat-value">{{card.SentCount}}</div>
                    <div class="provider-stat-label">Sent (24h)</div>
                  </div>
                  <div class="provider-stat">
                    <div class="provider-stat-value">{{card.SuccessRate}}%</div>
                    <div class="provider-stat-label">Success</div>
                  </div>
                  <div class="provider-stat">
                    <div class="provider-stat-value">{{card.FailedCount}}</div>
                    <div class="provider-stat-label">Failed</div>
                  </div>
                </div>
              </div>
              <div class="provider-card-footer">
                <button (click)="OpenGovernanceModal(card.Entity)">
                  <i class="fa-solid fa-shield-halved"></i> Enterprise Scope
                </button>
                <button (click)="configureProvider(card.Entity)">
                  <i class="fa-solid fa-gear"></i> Record
                </button>
                <button (click)="viewProviderLogs(card.Entity)">
                  <i class="fa-solid fa-chart-line"></i> Analytics
                </button>
              </div>
            </div>
          }
        </div>

        <!-- AGENT UTILITY MAILBOXES SECTION (MJ: AI Bridge Agent Identities) -->
        <div class="section-heading utility-mailboxes-heading">
          <div class="section-heading-title">
            <i class="fa-solid fa-envelope-circle-check"></i> Agent Utility Mailboxes (MJ: AI Bridge Agent Identities)
          </div>
          <div class="section-heading-sub">
            Dedicated agent and shared utility email identities that Chief of Staff and other AI agents can use in <code>UtilityMailboxesOnly</code> or <code>SendAsAgent</code> mode without exposing personal employee inboxes.
          </div>
        </div>

        @if (AgentUtilityMailboxes.length === 0) {
          <div class="utility-empty-card">
            <div class="utility-empty-icon"><i class="fa-solid fa-inbox"></i></div>
            <div class="utility-empty-title">No Agent Utility Mailboxes Registered</div>
            <div class="utility-empty-desc">
              Register shared or per-user agent email addresses (e.g., <code>cos-exec&#64;company.com</code> or <code>sage&#64;company.com</code>) in <strong>MJ: AI Bridge Agent Identities</strong> so agents can send briefings and calendar invites safely when <code>EnterpriseScopeMode</code> is set to <code>UtilityMailboxesOnly</code>.
            </div>
            <button mjButton variant="secondary" size="sm" (click)="AddNewAgentIdentity()">
              <i class="fa-solid fa-plus"></i> Register Utility Mailbox
            </button>
          </div>
        } @else {
          <div class="utility-mailboxes-grid">
            @for (identity of AgentUtilityMailboxes; track identity.ID) {
              <div class="utility-mailbox-card" [class.inactive]="!identity.IsActive">
                <div class="utility-mailbox-header">
                  <div class="utility-mailbox-icon">
                    <i class="fa-solid fa-at"></i>
                  </div>
                  <div class="utility-mailbox-info">
                    <div class="utility-mailbox-title">{{identity.DisplayName || identity.IdentityValue}}</div>
                    <div class="utility-mailbox-address">{{identity.IdentityValue}}</div>
                  </div>
                  <span class="provider-card-status" [class.active]="identity.IsActive" [class.disabled]="!identity.IsActive">
                    {{identity.IsActive ? 'Active' : 'Inactive'}}
                  </span>
                </div>
                <div class="utility-mailbox-meta">
                  <div class="utility-meta-row">
                    <span class="utility-meta-label">Agent:</span>
                    <span class="utility-meta-val">{{identity.Agent || 'Unassigned'}}</span>
                  </div>
                  <div class="utility-meta-row">
                    <span class="utility-meta-label">Owner Scope:</span>
                    <span class="utility-meta-val">{{identity.User ? ('Dedicated: ' + identity.User) : 'Shared Org Utility Mailbox'}}</span>
                  </div>
                  <div class="utility-meta-row">
                    <span class="utility-meta-label">Bridge Provider:</span>
                    <span class="utility-meta-val">{{identity.Provider}}</span>
                  </div>
                </div>
                <div class="utility-mailbox-footer">
                  <button (click)="OpenAgentIdentity(identity)">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Identity Record
                  </button>
                </div>
              </div>
            }
          </div>
        }

        <!-- ENTERPRISE GOVERNANCE EDITOR MODAL -->
        @if (ActiveGovernanceProvider) {
          <div class="governance-modal-backdrop" (click)="CloseGovernanceModal()">
            <div class="governance-modal" (click)="$event.stopPropagation()">
              <div class="governance-modal-header">
                <div>
                  <div class="governance-modal-title">
                    <i class="fa-solid fa-shield-halved"></i> Enterprise Mailbox Governance — {{ActiveGovernanceProvider.Name}}
                  </div>
                  <div class="governance-modal-subtitle">
                    Configure which mailboxes and calendar scopes AI agents (including Chief of Staff) can access through this provider.
                  </div>
                </div>
                <button class="modal-close-btn" (click)="CloseGovernanceModal()">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div class="governance-modal-body">
                <div class="form-group">
                  <label class="form-label">Enterprise Mailbox Scope Mode (<code>EnterpriseScopeMode</code>)</label>
                  <div class="scope-options-list">
                    @for (opt of ScopeOptions; track opt.Value) {
                      <label class="scope-option-card" [class.selected]="DraftEnterpriseScopeMode === opt.Value">
                        <input
                          type="radio"
                          name="enterpriseScopeMode"
                          [value]="opt.Value"
                          [checked]="DraftEnterpriseScopeMode === opt.Value"
                          (change)="OnScopeModeChange(opt.Value)" />
                        <div class="scope-option-content">
                          <div class="scope-option-title">{{opt.Label}} (<code>{{opt.Value}}</code>)</div>
                          <div class="scope-option-desc">{{opt.Summary}}</div>
                        </div>
                      </label>
                    }
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Allowed Email Domains (<code>AllowedEmailDomains</code>)</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. bluecypress.io, memberjunction.org (leave blank for any domain)"
                    [(ngModel)]="DraftAllowedEmailDomains" />
                  <div class="form-hint">
                    Comma-separated list of corporate email domains permitted for user-scoped inbox &amp; calendar access. Users signed in with an email outside these domains will be blocked by the server-side security gate.
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Calendar &amp; Scheduling Capabilities</label>
                  <div class="checkbox-row">
                    <label class="checkbox-item">
                      <input type="checkbox" [(ngModel)]="DraftSupportsCalendar" />
                      <span><strong>Supports Calendar Events</strong> (<code>SupportsCalendar</code> — read/create/update/respond/cancel events)</span>
                    </label>
                    <label class="checkbox-item">
                      <input type="checkbox" [(ngModel)]="DraftSupportsFreeBusy" />
                      <span><strong>Supports Free/Busy &amp; Meeting Time Finder</strong> (<code>SupportsFreeBusy</code> — schedule availability &amp; slot calculation)</span>
                    </label>
                  </div>
                </div>

                @if (GovernanceSaveError) {
                  <div class="governance-alert error">
                    <i class="fa-solid fa-triangle-exclamation"></i> {{GovernanceSaveError}}
                  </div>
                }
                @if (GovernanceSaveMessage) {
                  <div class="governance-alert success">
                    <i class="fa-solid fa-circle-check"></i> {{GovernanceSaveMessage}}
                  </div>
                }
              </div>

              <div class="governance-modal-footer">
                <button mjButton variant="secondary" size="sm" (click)="CloseGovernanceModal()" [disabled]="IsSavingGovernance">
                  Cancel
                </button>
                <button mjButton variant="primary" size="sm" (click)="SaveGovernanceConfig()" [disabled]="IsSavingGovernance">
                  <i class="fa-solid fa-floppy-disk"></i> {{IsSavingGovernance ? 'Saving...' : 'Save Governance Settings'}}
                </button>
              </div>
            </div>
          </div>
        }
      }
      </mj-page-body>
    </mj-page-layout>
    `,
    styles: [`
    .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 80px 0;
    }

    .section-heading {
        margin-bottom: 14px;
    }
    .utility-mailboxes-heading {
        margin-top: 32px;
    }
    .section-heading-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--mj-text-primary);
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .section-heading-sub {
        font-size: 12px;
        color: var(--mj-text-muted);
        margin-top: 4px;
    }

    /* GRID */
    .providers-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 16px;
    }
    .provider-card {
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 12px;
        overflow: hidden;
        transition: all 0.15s ease;
    }
    .provider-card:hover {
        box-shadow: 0 2px 8px var(--mj-shadow-md);
        border-color: var(--mj-border-strong);
    }
    .provider-card.disabled { opacity: 0.65; }

    .provider-card-header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 20px 20px 16px;
    }
    .provider-card-logo {
        width: 48px; height: 48px;
        border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        font-size: 22px; flex-shrink: 0;
        background: var(--mj-bg-surface-sunken);
    }
    .provider-card-logo.sendgrid {
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
    }
    .provider-card-logo.twilio {
        background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        color: var(--mj-status-error);
    }
    .provider-card-logo.gmail {
        background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        color: var(--mj-status-error);
    }
    .provider-card-logo.msgraph {
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
    }

    .provider-card-title { flex: 1; min-width: 0; }
    .provider-card-name {
        font-size: 15px; font-weight: 700;
        color: var(--mj-text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .provider-card-desc {
        font-size: 12px;
        color: var(--mj-text-muted);
        margin-top: 2px;
    }
    .provider-card-status {
        font-size: 10px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.5px;
        padding: 3px 10px; border-radius: 10px;
        flex-shrink: 0;
    }
    .provider-card-status.active {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
    }
    .provider-card-status.disabled {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-muted);
    }

    .provider-card-body { padding: 0 20px 16px; }

    .provider-capabilities {
        display: flex; flex-wrap: wrap;
        gap: 6px; margin-bottom: 12px;
    }
    .capability-chip {
        display: inline-flex; align-items: center;
        gap: 4px; padding: 4px 10px;
        border-radius: 12px; font-size: 11px; font-weight: 500;
    }
    .capability-chip.supported {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
    }
    .capability-chip.unsupported {
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-muted);
        text-decoration: line-through;
    }

    /* GOVERNANCE BANNER */
    .governance-banner {
        background: var(--mj-bg-surface-sunken);
        border: 1px solid var(--mj-border-default);
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .governance-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 11px;
    }
    .governance-label {
        color: var(--mj-text-muted);
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 5px;
    }
    .governance-domains {
        color: var(--mj-text-primary);
        font-weight: 500;
        text-align: right;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
    }
    .scope-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 8px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }
    .scope-badge.utility {
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
    }
    .scope-badge.group {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
    }
    .scope-badge.tenant {
        background: color-mix(in srgb, var(--mj-status-warning) 18%, var(--mj-bg-surface));
        color: var(--mj-status-warning);
    }

    .provider-card-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px; padding: 12px;
        background: var(--mj-bg-surface-sunken);
        border-radius: 8px;
    }
    .provider-stat { text-align: center; }
    .provider-stat-value {
        font-size: 16px; font-weight: 800;
        color: var(--mj-text-primary);
    }
    .provider-stat-label {
        font-size: 10px;
        color: var(--mj-text-muted);
        text-transform: uppercase; letter-spacing: 0.3px;
    }

    .provider-card-footer {
        display: flex;
        border-top: 1px solid var(--mj-border-default);
    }
    .provider-card-footer button {
        flex: 1; padding: 12px 8px;
        border: none; background: transparent;
        font-size: 12px; font-weight: 600;
        color: var(--mj-brand-primary);
        cursor: pointer; transition: background 0.15s;
        font-family: inherit;
        display: flex; align-items: center;
        justify-content: center; gap: 6px;
    }
    .provider-card-footer button:hover {
        background: var(--mj-bg-surface-sunken);
    }
    .provider-card-footer button + button {
        border-left: 1px solid var(--mj-border-default);
    }

    /* UTILITY MAILBOXES */
    .utility-empty-card {
        background: var(--mj-bg-surface-card);
        border: 1px dashed var(--mj-border-default);
        border-radius: 12px;
        padding: 28px 24px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
    }
    .utility-empty-icon {
        font-size: 26px;
        color: var(--mj-text-muted);
    }
    .utility-empty-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--mj-text-primary);
    }
    .utility-empty-desc {
        font-size: 12px;
        color: var(--mj-text-muted);
        max-width: 620px;
        line-height: 1.5;
    }
    .utility-mailboxes-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 14px;
    }
    .utility-mailbox-card {
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 12px;
        overflow: hidden;
    }
    .utility-mailbox-card.inactive {
        opacity: 0.65;
    }
    .utility-mailbox-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
    }
    .utility-mailbox-icon {
        width: 38px; height: 38px;
        border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
        color: var(--mj-brand-primary);
        font-size: 16px;
    }
    .utility-mailbox-info {
        flex: 1;
        min-width: 0;
    }
    .utility-mailbox-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--mj-text-primary);
    }
    .utility-mailbox-address {
        font-size: 12px;
        color: var(--mj-text-muted);
    }
    .utility-mailbox-meta {
        padding: 0 16px 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .utility-meta-row {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
    }
    .utility-meta-label {
        color: var(--mj-text-muted);
    }
    .utility-meta-val {
        color: var(--mj-text-primary);
        font-weight: 600;
    }
    .utility-mailbox-footer {
        border-top: 1px solid var(--mj-border-default);
    }
    .utility-mailbox-footer button {
        width: 100%;
        padding: 10px;
        border: none;
        background: transparent;
        font-size: 12px;
        font-weight: 600;
        color: var(--mj-brand-primary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
    }
    .utility-mailbox-footer button:hover {
        background: var(--mj-bg-surface-sunken);
    }

    /* MODAL */
    .governance-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
    }
    .governance-modal {
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
        border-radius: 14px;
        width: 100%;
        max-width: 640px;
        box-shadow: 0 12px 32px var(--mj-shadow-lg);
        overflow: hidden;
    }
    .governance-modal-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 20px 24px 16px;
        border-bottom: 1px solid var(--mj-border-default);
    }
    .governance-modal-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--mj-text-primary);
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .governance-modal-subtitle {
        font-size: 12px;
        color: var(--mj-text-muted);
        margin-top: 4px;
    }
    .modal-close-btn {
        border: none;
        background: transparent;
        color: var(--mj-text-muted);
        cursor: pointer;
        font-size: 16px;
        padding: 4px 8px;
    }
    .governance-modal-body {
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 18px;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .form-label {
        font-size: 12px;
        font-weight: 700;
        color: var(--mj-text-primary);
    }
    .scope-options-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .scope-option-card {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--mj-border-default);
        border-radius: 10px;
        cursor: pointer;
        background: var(--mj-bg-surface);
    }
    .scope-option-card.selected {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface));
    }
    .scope-option-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--mj-text-primary);
    }
    .scope-option-desc {
        font-size: 11px;
        color: var(--mj-text-muted);
        margin-top: 2px;
        line-height: 1.4;
    }
    .form-input {
        padding: 9px 12px;
        border-radius: 8px;
        border: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        color: var(--mj-text-primary);
        font-size: 13px;
        font-family: inherit;
    }
    .form-hint {
        font-size: 11px;
        color: var(--mj-text-muted);
        line-height: 1.4;
    }
    .checkbox-row {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .checkbox-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--mj-text-primary);
        cursor: pointer;
    }
    .governance-alert {
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .governance-alert.error {
        background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
        color: var(--mj-status-error);
    }
    .governance-alert.success {
        background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
        color: var(--mj-status-success);
    }
    .governance-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 14px 24px;
        border-top: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-sunken);
    }
  `]
})
export class CommunicationProvidersResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = false;
    public ProviderCards: ProviderCardData[] = [];
    public AgentUtilityMailboxes: MJAIBridgeAgentIdentityEntity[] = [];

    public readonly ScopeOptions: EnterpriseScopeOption[] = [
        {
            Value: 'UtilityMailboxesOnly',
            Label: 'Utility Mailboxes Only (Recommended Default)',
            Summary: 'Enterprise credentials only access dedicated Agent Utility Mailboxes registered in MJ: AI Bridge Agent Identities. Personal user inbox & calendar access is blocked at the server gate.',
        },
        {
            Value: 'SecurityGroupScoped',
            Label: 'Security Group / ApplicationAccessPolicy Scoped',
            Summary: 'Enterprise credentials are restricted by an Exchange Online ApplicationAccessPolicy or Google Workspace OU/Group. Live preflight verification (VerifyMailboxAccess) confirms each user mailbox before enabling personal inbox/calendar tools.',
        },
        {
            Value: 'TenantWide',
            Label: 'Tenant-Wide App Access',
            Summary: 'Enterprise app credentials can access any corporate mailbox matching AllowedEmailDomains (pinned strictly on the server to ContextUser.Email).',
        },
    ];

    public ActiveGovernanceProvider: MJCommunicationProviderEntity | null = null;
    public DraftEnterpriseScopeMode: ProviderEnterpriseScopeMode = 'UtilityMailboxesOnly';
    public DraftAllowedEmailDomains = '';
    public DraftSupportsCalendar = false;
    public DraftSupportsFreeBusy = false;
    public IsSavingGovernance = false;
    public GovernanceSaveMessage = '';
    public GovernanceSaveError = '';

    /** @deprecated Use {@link ProviderCards}. */
    public get providerCards(): ProviderCardData[] {
      return this.ProviderCards;
    }
    /** @deprecated Use {@link ProviderCards}. */
    public set providerCards(value: ProviderCardData[]) {
      this.ProviderCards = value;
    }

    constructor(private cdr: ChangeDetectorRef, private navService: NavigationService) {
        super();
    }

    async ngOnInit(): Promise<void> {
        super.ngOnInit();
        await this.loadData();
        this.NotifyLoadComplete();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    public async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayIso = yesterday.toISOString();

            const [providersResult, logsResult, identitiesResult] = await Promise.all([
                rv.RunView<MJCommunicationProviderEntity>({
                    EntityName: 'MJ: Communication Providers',
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                }),
                rv.RunView<MJCommunicationLogEntity>({
                    EntityName: 'MJ: Communication Logs',
                    ExtraFilter: `MessageDate >= '${yesterdayIso}'`,
                    ResultType: 'entity_object'
                }),
                rv.RunView<MJAIBridgeAgentIdentityEntity>({
                    EntityName: 'MJ: AI Bridge Agent Identities',
                    ExtraFilter: `IdentityType = 'Email'`,
                    OrderBy: 'DisplayName ASC, IdentityValue ASC',
                    ResultType: 'entity_object'
                }),
            ]);

            if (providersResult.Success) {
                const logs = logsResult.Success ? logsResult.Results : [];
                this.ProviderCards = providersResult.Results.map(p => this.buildProviderCard(p, logs));
            }
            if (identitiesResult.Success) {
                this.AgentUtilityMailboxes = identitiesResult.Results;
            }
        } catch (error) {
            console.error('Error loading providers:', error);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    private buildProviderCard(provider: MJCommunicationProviderEntity, logs: MJCommunicationLogEntity[]): ProviderCardData {
        const providerLogs = logs.filter(l => l.CommunicationProvider === provider.Name);
        const sent = providerLogs.length;
        const failed = providerLogs.filter(l => l.Status === 'Failed').length;
        const rate = sent > 0 ? parseFloat(((sent - failed) / sent * 100).toFixed(1)) : 100;

        return {
            Entity: provider,
            SentCount: sent,
            SuccessRate: rate,
            FailedCount: failed,
            IconClass: this.getProviderIcon(provider.Name),
            LogoClass: this.getProviderLogoClass(provider.Name),
            ScopeLabel: this.getScopeLabel(provider.EnterpriseScopeMode),
            ScopeBadgeClass: this.getScopeBadgeClass(provider.EnterpriseScopeMode),
        };
    }

    private getScopeLabel(mode: ProviderEnterpriseScopeMode): string {
        switch (mode) {
            case 'UtilityMailboxesOnly':
                return 'Utility Mailboxes Only';
            case 'SecurityGroupScoped':
                return 'Security Group Scoped';
            case 'TenantWide':
                return 'Tenant-Wide';
            default:
                return mode;
        }
    }

    private getScopeBadgeClass(mode: ProviderEnterpriseScopeMode): string {
        switch (mode) {
            case 'UtilityMailboxesOnly':
                return 'utility';
            case 'SecurityGroupScoped':
                return 'group';
            case 'TenantWide':
                return 'tenant';
            default:
                return 'utility';
        }
    }

    private getProviderIcon(name: string): string {
        const n = name.toLowerCase();
        if (n.includes('sendgrid')) return 'fa-solid fa-envelope';
        if (n.includes('twilio')) return 'fa-solid fa-comment-sms';
        if (n.includes('gmail') || n.includes('google')) return 'fa-brands fa-google';
        if (n.includes('microsoft') || n.includes('graph') || n.includes('outlook')) return 'fa-brands fa-microsoft';
        if (n.includes('aws') || n.includes('ses')) return 'fa-brands fa-aws';
        if (n.includes('slack')) return 'fa-brands fa-slack';
        return 'fa-solid fa-server';
    }

    private getProviderLogoClass(name: string): string {
        const n = name.toLowerCase();
        if (n.includes('sendgrid')) return 'sendgrid';
        if (n.includes('twilio')) return 'twilio';
        if (n.includes('gmail') || n.includes('google')) return 'gmail';
        if (n.includes('microsoft') || n.includes('graph') || n.includes('outlook')) return 'msgraph';
        return '';
    }

    public OpenGovernanceModal(provider: MJCommunicationProviderEntity): void {
        this.ActiveGovernanceProvider = provider;
        this.DraftEnterpriseScopeMode = provider.EnterpriseScopeMode || 'UtilityMailboxesOnly';
        this.DraftAllowedEmailDomains = provider.AllowedEmailDomains || '';
        this.DraftSupportsCalendar = provider.SupportsCalendar;
        this.DraftSupportsFreeBusy = provider.SupportsFreeBusy;
        this.GovernanceSaveMessage = '';
        this.GovernanceSaveError = '';
        this.cdr.detectChanges();
    }

    public CloseGovernanceModal(): void {
        this.ActiveGovernanceProvider = null;
        this.GovernanceSaveMessage = '';
        this.GovernanceSaveError = '';
        this.cdr.detectChanges();
    }

    public OnScopeModeChange(mode: ProviderEnterpriseScopeMode): void {
        this.DraftEnterpriseScopeMode = mode;
        this.cdr.detectChanges();
    }

    public async SaveGovernanceConfig(): Promise<void> {
        if (!this.ActiveGovernanceProvider) {
            return;
        }
        try {
            this.IsSavingGovernance = true;
            this.GovernanceSaveMessage = '';
            this.GovernanceSaveError = '';
            this.cdr.detectChanges();

            this.ActiveGovernanceProvider.EnterpriseScopeMode = this.DraftEnterpriseScopeMode;
            const trimmedDomains = this.DraftAllowedEmailDomains.trim();
            this.ActiveGovernanceProvider.AllowedEmailDomains = trimmedDomains.length > 0 ? trimmedDomains : null;
            this.ActiveGovernanceProvider.SupportsCalendar = this.DraftSupportsCalendar;
            this.ActiveGovernanceProvider.SupportsFreeBusy = this.DraftSupportsFreeBusy;

            const saved = await this.ActiveGovernanceProvider.Save();
            if (saved) {
                this.GovernanceSaveMessage = 'Enterprise governance and calendar capabilities saved.';
                await this.loadData();
            } else {
                const msg = this.ActiveGovernanceProvider.LatestResult?.Message || 'Failed to save provider settings.';
                this.GovernanceSaveError = msg;
            }
        } catch (err) {
            this.GovernanceSaveError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsSavingGovernance = false;
            this.cdr.detectChanges();
        }
    }

    public ConfigureProvider(provider: MJCommunicationProviderEntity): void {
        const pk = new CompositeKey();
        pk.LoadFromEntityInfoAndRecord(this.ProviderToUse.Entities.find(e => e.Name === 'MJ: Communication Providers')!, provider);
        this.navService.OpenEntityRecord('MJ: Communication Providers', pk);
    }

    /** @deprecated Use {@link ConfigureProvider}. */
    public configureProvider(provider: MJCommunicationProviderEntity): void {
      return this.ConfigureProvider(provider);
    }

    public ViewProviderLogs(provider: MJCommunicationProviderEntity): void {
        console.log('View analytics for provider:', provider.Name);
    }

    /** @deprecated Use {@link ViewProviderLogs}. */
    public viewProviderLogs(provider: MJCommunicationProviderEntity): void {
      return this.ViewProviderLogs(provider);
    }

    public AddNewProvider(): void {
        this.navService.OpenEntityRecord('MJ: Communication Providers', new CompositeKey());
    }

    /** @deprecated Use {@link AddNewProvider}. */
    public addNewProvider(): void {
      return this.AddNewProvider();
    }

    public AddNewAgentIdentity(): void {
        this.navService.OpenEntityRecord('MJ: AI Bridge Agent Identities', new CompositeKey());
    }

    public OpenAgentIdentity(identity: MJAIBridgeAgentIdentityEntity): void {
        const entityInfo = this.ProviderToUse.Entities.find(e => e.Name === 'MJ: AI Bridge Agent Identities');
        if (!entityInfo) {
            return;
        }
        const pk = new CompositeKey();
        pk.LoadFromEntityInfoAndRecord(entityInfo, identity);
        this.navService.OpenEntityRecord('MJ: AI Bridge Agent Identities', pk);
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Providers';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-server';
    }
}

