import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import type {
  MJCommunicationPrincipalEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSendingDomainEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import { CommsPoliciesPrincipalsTabComponent } from './comms-policies-principals-tab.component';
import { CommsGateSimulatorTabComponent } from './comms-gate-simulator-tab.component';
import { CommsSendingDomainsTabComponent } from './comms-sending-domains-tab.component';
import { CommsEndpointsSuppressionsTabComponent } from './comms-endpoints-suppressions-tab.component';
import { CommunicationComplianceAdminResourceComponent } from './communication-compliance-admin-resource.component';
import type { CommsAdminLoadedMetadata } from './communications-admin.types';

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual<typeof import('@angular/core')>('@angular/core');
  return {
    ...actual,
    inject: () => ({ markForCheck: vi.fn(), detectChanges: vi.fn() } as unknown as ChangeDetectorRef),
  };
});

describe('Communications Admin Dashboard Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('CommsPoliciesPrincipalsTabComponent edits and saves principal slot mappings while preserving existing config', async () => {
    const tab = new CommsPoliciesPrincipalsTabComponent();
    const refreshSpy = vi.fn();
    tab.RefreshRequested.subscribe(refreshSpy);

    const principal = {
      ID: 'prin-1',
      Name: 'Contacts',
      Entity: 'Contacts',
      Configuration: JSON.stringify({ CustomFlag: true, Slots: { FullName: 'Name', Jurisdiction: 'Country' } }),
      Save: vi.fn().mockResolvedValue(true),
    } as unknown as MJCommunicationPrincipalEntity;

    tab.EditSlots(principal);
    expect(tab.SlotForm.FullName).toBe('Name');
    expect(tab.SlotForm.Jurisdiction).toBe('Country');

    tab.SlotForm.Timezone = 'Timezone';
    tab.SlotForm.IsExistingCustomer = 'IsActiveCustomer';
    await tab.SaveSlots();

    expect(principal.Save).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(principal.Configuration!) as { CustomFlag: boolean; Slots: Record<string, string> };
    expect(saved.CustomFlag).toBe(true);
    expect(saved.Slots).toEqual({
      FullName: 'Name',
      Jurisdiction: 'Country',
      Timezone: 'Timezone',
      IsExistingCustomer: 'IsActiveCustomer',
    });
    expect(tab.SelectedPrincipal).toBeNull();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('CommsGateSimulatorTabComponent executes SimulateCommsComplianceGate on server via ExecuteGQL', async () => {
    const tab = new CommsGateSimulatorTabComponent();
    const routeOp = vi.fn().mockResolvedValue({
      Success: true,
      Output: {
        Success: true,
        Decision: 'Allowed',
        ResultJSON: JSON.stringify({
          Decision: 'Allowed',
          Obligations: {
            RequireOneClickHeader: true,
            RequireFooterUnsubscribe: true,
            RequireSenderPostalAddress: false,
            AllowOpenPixel: true,
            AllowClickTracking: true,
          },
          AuditSnapshot: {
            EnforcementMode: 'Enforce',
            ApplicableRegimes: ['CAN-SPAM'],
            ExpandedRecipientJurisdictions: ['US'],
            ExpandedSenderJurisdictions: [],
            MergedRules: {},
          },
        }),
      },
    });
    Object.defineProperty(tab, 'ProviderToUse', { get: () => ({ RouteOperation: routeOp }) });

    tab.Metadata = {
      Senders: [{ ID: 'sender-1', Name: 'Default' } as unknown as MJCommunicationSenderEntity],
      Principals: [],
      Preferences: [],
      Jurisdictions: [],
      JurisdictionMembers: [],
      Regimes: [],
      RegimeJurisdictions: [],
      RegimeRules: [],
      RuleTypes: [],
      SuppressionPolicies: [],
      SendingDomains: [],
      EntityCommMessageTypes: [],
    } as unknown as CommsAdminLoadedMetadata;

    await tab.RunSimulation();

    expect(routeOp).toHaveBeenCalledWith('Communications.SimulateComplianceGate', {
      SenderID: 'sender-1',
      PrincipalID: undefined,
      RecordID: undefined,
      PreferenceID: undefined,
      MessageClass: 'Marketing',
      RecipientJurisdictionID: undefined,
    });
    expect(tab.DecisionResult?.Decision).toBe('Allowed');
    expect(tab.DecisionResult?.AuditSnapshot.ApplicableRegimes).toEqual(['CAN-SPAM']);
    expect(tab.ErrorMessage).toBe('');
  });

  it('CommsSendingDomainsTabComponent calls CreateSendingDomain and VerifySendingDomain remote operations', async () => {
    const tab = new CommsSendingDomainsTabComponent();
    const refreshSpy = vi.fn();
    tab.RefreshRequested.subscribe(refreshSpy);

    const routeOp = vi
      .fn()
      .mockResolvedValueOnce({
        Success: true,
        Output: {
          Success: true,
          Status: 'Pending',
          ProviderDomainID: 'sg-dom-1',
          DNSRecordsJSON: JSON.stringify([
            { Type: 'CNAME', Purpose: 'DKIM', Host: 's1._domainkey.example.com', Value: 's1.sendgrid.net', Validated: false },
          ]),
        },
      })
      .mockResolvedValueOnce({
        Success: true,
        Output: {
          Success: true,
          Verified: true,
          Status: 'Verified',
          DNSRecordsJSON: JSON.stringify([
            { Type: 'CNAME', Purpose: 'DKIM', Host: 's1._domainkey.example.com', Value: 's1.sendgrid.net', Validated: true },
          ]),
        },
      });
    Object.defineProperty(tab, 'ProviderToUse', { get: () => ({ RouteOperation: routeOp }) });

    const domain = {
      ID: 'dom-1',
      Domain: 'example.com',
      Status: 'Pending',
      ProviderDomainID: null,
      DNSRecords: null,
      LastVerifiedAt: null,
      VerifiedAt: null,
    } as unknown as MJCommunicationSendingDomainEntity;

    await tab.GenerateDnsRecords(domain);
    expect(routeOp).toHaveBeenNthCalledWith(1, 'Communications.CreateSendingDomain', { DomainID: 'dom-1' });
    expect(domain.ProviderDomainID).toBe('sg-dom-1');
    expect(tab.SelectedRecords).toHaveLength(1);

    await tab.VerifyDns(domain);
    expect(routeOp).toHaveBeenNthCalledWith(2, 'Communications.VerifySendingDomain', { DomainID: 'dom-1' });
    expect(domain.Status).toBe('Verified');
    expect(domain.VerifiedAt).toBeInstanceOf(Date);
    expect(tab.StatusMessage).toContain('Verified');
    expect(refreshSpy).toHaveBeenCalledTimes(2);
  });

  it('CommsEndpointsSuppressionsTabComponent revokes suppression and blocks endpoints via remote operations', async () => {
    const tab = new CommsEndpointsSuppressionsTabComponent();
    const searchSpy = vi.spyOn(tab, 'Search').mockResolvedValue(undefined);
    const routeOp = vi
      .fn()
      .mockResolvedValueOnce({
        Success: true,
        Output: {
          Success: true,
          WarningMessage: 'SendGrid returned 404 (already cleared)',
        },
      })
      .mockResolvedValueOnce({
        Success: true,
        Output: {
          Success: true,
          SuppressionID: 'supp-new-1',
        },
      });
    Object.defineProperty(tab, 'ProviderToUse', { get: () => ({ RouteOperation: routeOp }) });

    const supp = { ID: 'supp-1', Status: 'Active' } as unknown as MJCommunicationSuppressionEntity;
    await tab.RevokeSuppression(supp);

    expect(routeOp).toHaveBeenNthCalledWith(1, 'Communications.RevokeSuppression', {
      SuppressionID: 'supp-1',
    });
    expect(tab.ErrorMessage).toContain('SendGrid returned 404');

    const endpoint = { ID: 'ep-1' } as unknown as MJCommunicationEndpointEntity;
    await tab.AddAdminBlock(endpoint);
    expect(routeOp).toHaveBeenNthCalledWith(2, 'Communications.BlockEndpoint', {
      EndpointID: 'ep-1',
    });
    expect(searchSpy).toHaveBeenCalledTimes(2);
  });

  it('CommunicationComplianceAdminResourceComponent exposes display name and icon class', async () => {
    const res = new CommunicationComplianceAdminResourceComponent();
    expect(await res.GetResourceDisplayName({} as never)).toBe('Compliance & Admin');
    expect(await res.GetResourceIconClass({} as never)).toBe('fa-solid fa-shield-halved');
  });
});
