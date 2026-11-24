import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  inject,
} from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import type { MJLeftNavItem, MJLeftNavSection } from '@memberjunction/ng-ui-components';
import { RegisterClass } from '@memberjunction/global';
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import type {
  MJCommunicationBaseMessageTypeEntity,
  MJCommunicationComplianceRegimeEntity,
  MJCommunicationComplianceRegimeJurisdictionEntity,
  MJCommunicationComplianceRegimeRuleEntity,
  MJCommunicationComplianceRuleTypeEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSenderPermissionEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionPolicyEntity,
  MJEntityCommunicationMessageTypeEntity,
  MJJurisdictionEntity,
  MJJurisdictionMemberEntity,
  ResourceData,
} from '@memberjunction/core-entities';
import {
  COMMS_ADMIN_TABS,
  type CommsAdminLoadedMetadata,
  type CommsAdminTabId,
} from './communications-admin.types';

/**
 * Communications Admin Dashboard (V2 Compliance, Senders, Regimes, Suppressions, Domains).
 *
 * 🚨 SAFETY BOUNDARY: Agent context & tools are strictly read-only / navigational
 * (SwitchCommsAdminTab, RefreshCommsAdminData). No mutations (Admin Block, Regime toggle,
 * Sender edit, Principal registration, DNS changes) are exposed as agent tools.
 */
@Component({
  standalone: false,
  selector: 'mj-communications-admin-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./communications-admin.css'],
  template: `
    <mj-page-layout>
      <mj-page-header
        Title="Communications Admin"
        Icon="fa-solid fa-shield-halved"
        Subtitle="Compliance gate, senders, regimes, suppressions, and domain authentication"
      >
        <div actions>
          <mj-refresh-button [Loading]="IsLoading" (Clicked)="LoadMetadata()" />
        </div>
      </mj-page-header>
      <mj-page-body [Flex]="true" [Padding]="false" Direction="row">
        <mj-left-nav
          MobileTitle="Communications Admin"
          [Sections]="NavSections"
          [ActiveId]="ActiveTab"
          (ItemClicked)="OnNavItemClicked($event)"
        ></mj-left-nav>

        <mj-left-nav-content [Loading]="IsLoading" [Error]="LoadError">
          @switch (ActiveTab) {
            @case ('simulator') {
              <mj-comms-gate-simulator-tab [Provider]="Provider" [Metadata]="LoadedMetadata" />
            }
            @case ('senders') {
              <mj-comms-senders-permissions-tab
                [Provider]="Provider"
                [Metadata]="LoadedMetadata"
                (RefreshRequested)="LoadMetadata()"
              />
            }
            @case ('regimes') {
              <mj-comms-regimes-jurisdictions-tab
                [Provider]="Provider"
                [Metadata]="LoadedMetadata"
                (RefreshRequested)="LoadMetadata()"
              />
            }
            @case ('endpoints') {
              <mj-comms-endpoints-suppressions-tab [Provider]="Provider" [Metadata]="LoadedMetadata" />
            }
            @case ('policies') {
              <mj-comms-policies-principals-tab
                [Provider]="Provider"
                [Metadata]="LoadedMetadata"
                (RefreshRequested)="LoadMetadata()"
              />
            }
            @case ('domains') {
              <mj-comms-sending-domains-tab
                [Provider]="Provider"
                [Metadata]="LoadedMetadata"
                (RefreshRequested)="LoadMetadata()"
              />
            }
          }
        </mj-left-nav-content>
      </mj-page-body>
    </mj-page-layout>
  `,
})
@RegisterClass(BaseDashboard, 'CommunicationsAdminDashboard')
export class CommunicationsAdminDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);

  /** Re-declared so host resource wrappers can bind `[Provider]` and thread it through to tabs. */
  @Input() override Provider: IMetadataProvider | null = null;

  /** Re-declared so host resource wrappers can forward `[Data]` (deep-link queryParams & config). */
  @Input()
  public override set Data(value: ResourceData) {
    super.Data = value;
  }
  public override get Data(): ResourceData {
    return super.Data;
  }

  public readonly Tabs = COMMS_ADMIN_TABS;
  public readonly NavSections: MJLeftNavSection[] = [
    {
      items: COMMS_ADMIN_TABS.map((t) => ({
        id: t.Key,
        label: t.Label,
        icon: t.Icon,
      })),
    },
  ];
  public ActiveTab: CommsAdminTabId = 'simulator';
  public IsLoading = false;
  public LoadError = '';
  public LoadedMetadata: CommsAdminLoadedMetadata | null = null;

  public OnNavItemClicked(item: MJLeftNavItem): void {
    this.SelectTab(item.id as CommsAdminTabId);
  }

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Communications Admin';
  }

  protected async initDashboard(): Promise<void> {
    const params = this.GetQueryParams();
    const tab = params['tab'] as CommsAdminTabId | undefined;
    if (tab && this.Tabs.some((t) => t.Key === tab)) {
      this.ActiveTab = tab;
    }
  }

  protected async loadData(): Promise<void> {
    await this.LoadMetadata();
  }

  protected override OnQueryParamsChanged(
    params: Record<string, string>,
    _source: 'popstate' | 'deeplink',
  ): void {
    const tab = params['tab'] as CommsAdminTabId | undefined;
    if (tab && tab !== this.ActiveTab && this.Tabs.some((t) => t.Key === tab)) {
      this.ActiveTab = tab;
      this.publishAgentContext();
      this.cdr.markForCheck();
    }
  }

  public ngAfterViewInit(): void {
    this.registerAgentTools();
    this.publishAgentContext();
  }

  public SelectTab(tabId: CommsAdminTabId): void {
    this.ActiveTab = tabId;
    this.UpdateQueryParams({ tab: tabId });
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  public async LoadMetadata(): Promise<void> {
    this.IsLoading = true;
    this.LoadError = '';
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const results = await rv.RunViews([
        { EntityName: 'MJ: Communication Senders', OrderBy: 'Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Communication Sender Permissions', ResultType: 'entity_object' },
        { EntityName: 'MJ: Communication Preferences', OrderBy: 'DisplayOrder ASC, Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Communication Principals', OrderBy: 'DisplayOrder ASC, Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Communication Base Message Types', OrderBy: 'Type ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Communication Compliance Regimes', OrderBy: 'Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Communication Compliance Regime Jurisdictions', ResultType: 'entity_object' },
        { EntityName: 'MJ: Communication Compliance Regime Rules', ResultType: 'entity_object' },
        { EntityName: 'MJ: Communication Compliance Rule Types', ResultType: 'entity_object' },
        { EntityName: 'MJ: Jurisdictions', OrderBy: 'Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Jurisdiction Members', ResultType: 'entity_object' },
        { EntityName: 'MJ: Communication Suppression Policies', OrderBy: 'Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Communication Sending Domains', OrderBy: 'Domain ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Entity Communication Message Types', ResultType: 'entity_object' },
      ]);

      const failed = results.filter((r) => !r.Success);
      if (failed.length > 0) {
        this.LoadError =
          failed.map((r) => r.ErrorMessage).filter(Boolean).join('; ') ||
          'Failed to load communications metadata.';
        return;
      }

      this.LoadedMetadata = {
        Senders: (results[0]?.Results ?? []) as MJCommunicationSenderEntity[],
        SenderPermissions: (results[1]?.Results ?? []) as MJCommunicationSenderPermissionEntity[],
        Preferences: (results[2]?.Results ?? []) as MJCommunicationPreferenceEntity[],
        Principals: (results[3]?.Results ?? []) as MJCommunicationPrincipalEntity[],
        BaseMessageTypes: (results[4]?.Results ?? []) as MJCommunicationBaseMessageTypeEntity[],
        Regimes: (results[5]?.Results ?? []) as MJCommunicationComplianceRegimeEntity[],
        RegimeJurisdictions: (results[6]?.Results ?? []) as MJCommunicationComplianceRegimeJurisdictionEntity[],
        RegimeRules: (results[7]?.Results ?? []) as MJCommunicationComplianceRegimeRuleEntity[],
        RuleTypes: (results[8]?.Results ?? []) as MJCommunicationComplianceRuleTypeEntity[],
        Jurisdictions: (results[9]?.Results ?? []) as MJJurisdictionEntity[],
        JurisdictionMembers: (results[10]?.Results ?? []) as MJJurisdictionMemberEntity[],
        SuppressionPolicies: (results[11]?.Results ?? []) as MJCommunicationSuppressionPolicyEntity[],
        SendingDomains: (results[12]?.Results ?? []) as MJCommunicationSendingDomainEntity[],
        EntityCommMessageTypes: (results[13]?.Results ?? []) as MJEntityCommunicationMessageTypeEntity[],
      };
      this.publishAgentContext();
    } catch (err: unknown) {
      this.LoadError = err instanceof Error ? err.message : 'Failed to load communications metadata.';
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  private publishAgentContext(): void {
    this.navigationService?.SetAgentContext(this, {
      ActiveTab: this.ActiveTab,
      SenderCount: this.LoadedMetadata?.Senders.length ?? 0,
      RegimeCount: this.LoadedMetadata?.Regimes.length ?? 0,
      SendingDomainCount: this.LoadedMetadata?.SendingDomains.length ?? 0,
      IsLoading: this.IsLoading,
    });
  }

  private registerAgentTools(): void {
    this.navigationService?.SetAgentClientTools(this, [
      {
        Name: 'SwitchCommsAdminTab',
        Description: 'Switch active section in Communications Admin Dashboard',
        ParameterSchema: {
          type: 'object',
          properties: {
            tab: {
              type: 'string',
              enum: this.Tabs.map((t) => t.Key),
            },
          },
          required: ['tab'],
        },
        Handler: async (params: Record<string, unknown>) => {
          const tab = params['tab'] as CommsAdminTabId;
          if (!this.Tabs.some((t) => t.Key === tab)) {
            return { Success: false, ErrorMessage: `Unknown tab: ${String(tab)}` };
          }
          this.SelectTab(tab);
          return { Success: true, ActiveTab: tab };
        },
      },
      {
        Name: 'RefreshCommsAdminData',
        Description: 'Reload Communications Admin metadata',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.LoadMetadata();
          return this.LoadError ? { Success: false, ErrorMessage: this.LoadError } : { Success: true };
        },
      },
    ]);
  }
}

export function LoadCommunicationsAdminDashboard(): void {
  // Prevents tree-shaking
}
