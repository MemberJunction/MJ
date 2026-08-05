import { describe, it, expect, vi } from 'vitest';
import type { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';
import {
    StubAgentIdentityProvisioner,
    IdentityProvisionerNotBoundError,
    ApplyProvisionResultToIdentity,
    AgentIdentityProvisionRequest,
    AgentIdentityProvisionResult,
    IGraphAdminLike,
    IGoogleWorkspaceAdminLike,
    ITelephonyCarrierLike,
    buildGraphMailboxPayload,
    buildGoogleWorkspaceMailboxPayload,
    buildCarrierNumberOrderPayload,
} from '../identity-provisioner';

// ──────────────────────────────────────────────────────────────────────────────
// Fakes.
// ──────────────────────────────────────────────────────────────────────────────

function fakeGraph(): IGraphAdminLike {
    return {
        CreateMailbox: vi.fn(async (p) => ({ UserPrincipalName: p.UserPrincipalName, ObjectId: 'oid-1' })),
    };
}
function fakeWorkspace(): IGoogleWorkspaceAdminLike {
    return {
        CreateMailbox: vi.fn(async (p) => ({ PrimaryEmail: p.PrimaryEmail, UserId: 'uid-1' })),
    };
}
function fakeCarrier(): ITelephonyCarrierLike {
    return {
        OrderNumber: vi.fn(async (p) => ({ PhoneNumber: p.RequestedNumber ?? '+15550001111', OrderId: 'ord-1' })),
    };
}

function request(overrides: Partial<AgentIdentityProvisionRequest> = {}): AgentIdentityProvisionRequest {
    return {
        AgentID: 'agent-1',
        ProviderID: 'provider-1',
        IdentityType: 'Email',
        RequestedValue: 'sage@customer.com',
        DisplayName: 'Sage',
        ...overrides,
    };
}

/** A minimal structural stand-in for the identity entity — only the fields the mapper touches. */
function fakeIdentity(): MJAIBridgeAgentIdentityEntity {
    return {
        AgentID: '',
        ProviderID: '',
        IdentityType: '',
        IdentityValue: '',
        DisplayName: null,
        IsActive: false,
        Configuration: null,
    } as unknown as MJAIBridgeAgentIdentityEntity;
}

// ──────────────────────────────────────────────────────────────────────────────
// NotBound behavior (no surfaces).
// ──────────────────────────────────────────────────────────────────────────────

describe('StubAgentIdentityProvisioner — not bound', () => {
    it('throws for every type when constructed with no surfaces (legacy stub behavior)', async () => {
        const p = new StubAgentIdentityProvisioner();
        await expect(p.Provision(request({ IdentityType: 'Email' }))).rejects.toBeInstanceOf(
            IdentityProvisionerNotBoundError,
        );
        await expect(p.Provision(request({ IdentityType: 'PhoneNumber' }))).rejects.toBeInstanceOf(
            IdentityProvisionerNotBoundError,
        );
        await expect(p.Provision(request({ IdentityType: 'AccountID' }))).rejects.toBeInstanceOf(
            IdentityProvisionerNotBoundError,
        );
    });

    it('AccountID always throws not-bound even when other surfaces are bound', async () => {
        const p = new StubAgentIdentityProvisioner({ Graph: fakeGraph(), Carrier: fakeCarrier() });
        await expect(p.Provision(request({ IdentityType: 'AccountID' }))).rejects.toBeInstanceOf(
            IdentityProvisionerNotBoundError,
        );
    });

    it('throws not-bound for Email when only the carrier is bound', async () => {
        const p = new StubAgentIdentityProvisioner({ Carrier: fakeCarrier() });
        await expect(p.Provision(request({ IdentityType: 'Email' }))).rejects.toBeInstanceOf(
            IdentityProvisionerNotBoundError,
        );
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Per-type provisioning (bound surfaces).
// ──────────────────────────────────────────────────────────────────────────────

describe('StubAgentIdentityProvisioner — Provision', () => {
    it('provisions a Graph mailbox and returns the Graph result detail', async () => {
        const graph = fakeGraph();
        const p = new StubAgentIdentityProvisioner({ Graph: graph });
        const result = await p.Provision(request());

        expect(graph.CreateMailbox).toHaveBeenCalledWith({
            UserPrincipalName: 'sage@customer.com',
            MailNickname: 'sage',
            DisplayName: 'Sage',
        });
        expect(result.IdentityValue).toBe('sage@customer.com');
        expect(result.DisplayName).toBe('Sage');
        expect(result.Configuration).toEqual({ Directory: 'Graph', ObjectId: 'oid-1' });
    });

    it('routes Email to Google Workspace when EmailDirectory is GoogleWorkspace', async () => {
        const workspace = fakeWorkspace();
        const p = new StubAgentIdentityProvisioner({
            Graph: fakeGraph(),
            GoogleWorkspace: workspace,
            EmailDirectory: 'GoogleWorkspace',
        });
        const result = await p.Provision(request());
        expect(workspace.CreateMailbox).toHaveBeenCalledOnce();
        expect(result.Configuration).toEqual({ Directory: 'GoogleWorkspace', UserId: 'uid-1' });
    });

    it('falls back to Google Workspace for Email when only Workspace is bound', async () => {
        const workspace = fakeWorkspace();
        const p = new StubAgentIdentityProvisioner({ GoogleWorkspace: workspace });
        const result = await p.Provision(request());
        expect(workspace.CreateMailbox).toHaveBeenCalledOnce();
        expect(result.IdentityValue).toBe('sage@customer.com');
    });

    it('provisions a phone number via the carrier (using RequestedValue)', async () => {
        const carrier = fakeCarrier();
        const p = new StubAgentIdentityProvisioner({ Carrier: carrier });
        const result = await p.Provision(
            request({ IdentityType: 'PhoneNumber', RequestedValue: '+15551234567', Configuration: { Region: 'US' } }),
        );
        expect(carrier.OrderNumber).toHaveBeenCalledWith({
            RequestedNumber: '+15551234567',
            Region: 'US',
            Label: 'Sage',
        });
        expect(result.IdentityValue).toBe('+15551234567');
        expect(result.Configuration).toEqual({ Carrier: true, OrderId: 'ord-1' });
    });

    it('allocates a carrier number when no RequestedValue is supplied', async () => {
        const carrier = fakeCarrier();
        const p = new StubAgentIdentityProvisioner({ Carrier: carrier });
        const result = await p.Provision(request({ IdentityType: 'PhoneNumber', RequestedValue: undefined }));
        expect(carrier.OrderNumber).toHaveBeenCalledWith({ Label: 'Sage' });
        expect(result.IdentityValue).toBe('+15550001111');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure request → payload mapping.
// ──────────────────────────────────────────────────────────────────────────────

describe('request → payload mapping (pure)', () => {
    describe('buildGraphMailboxPayload', () => {
        it('derives MailNickname from the local part and carries tenant/usage config', () => {
            expect(
                buildGraphMailboxPayload(
                    request({ Configuration: { TenantId: 'tid-1', UsageLocation: 'US' } }),
                ),
            ).toEqual({
                UserPrincipalName: 'sage@customer.com',
                MailNickname: 'sage',
                DisplayName: 'Sage',
                TenantId: 'tid-1',
                UsageLocation: 'US',
            });
        });
        it('defaults DisplayName to the address when none supplied', () => {
            expect(buildGraphMailboxPayload(request({ DisplayName: undefined })).DisplayName).toBe(
                'sage@customer.com',
            );
        });
        it('throws when RequestedValue is missing', () => {
            expect(() => buildGraphMailboxPayload(request({ RequestedValue: undefined }))).toThrow();
        });
    });

    describe('buildGoogleWorkspaceMailboxPayload', () => {
        it('derives Domain from the address when not supplied', () => {
            expect(buildGoogleWorkspaceMailboxPayload(request()).Domain).toBe('customer.com');
        });
        it('honors explicit Domain + OrgUnitPath config', () => {
            expect(
                buildGoogleWorkspaceMailboxPayload(
                    request({ Configuration: { Domain: 'corp.com', OrgUnitPath: '/agents' } }),
                ),
            ).toEqual({
                PrimaryEmail: 'sage@customer.com',
                DisplayName: 'Sage',
                Domain: 'corp.com',
                OrgUnitPath: '/agents',
            });
        });
        it('throws when RequestedValue is missing', () => {
            expect(() => buildGoogleWorkspaceMailboxPayload(request({ RequestedValue: undefined }))).toThrow();
        });
    });

    describe('buildCarrierNumberOrderPayload', () => {
        it('passes through requested number + region', () => {
            expect(
                buildCarrierNumberOrderPayload(
                    request({ IdentityType: 'PhoneNumber', RequestedValue: '+15551112222', Configuration: { Region: 'US-415' } }),
                ),
            ).toEqual({ RequestedNumber: '+15551112222', Region: 'US-415', Label: 'Sage' });
        });
        it('omits requested number when none supplied and falls back Label to AgentID', () => {
            expect(
                buildCarrierNumberOrderPayload(
                    request({ IdentityType: 'PhoneNumber', RequestedValue: undefined, DisplayName: undefined }),
                ),
            ).toEqual({ Label: 'agent-1' });
        });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// ApplyProvisionResultToIdentity field mapping.
// ──────────────────────────────────────────────────────────────────────────────

describe('ApplyProvisionResultToIdentity', () => {
    it('maps request + result onto the identity entity fields', () => {
        const identity = fakeIdentity();
        const req = request({ IdentityType: 'Email' });
        const result: AgentIdentityProvisionResult = {
            IdentityValue: 'sage@customer.com',
            DisplayName: 'Sage Bot',
            Configuration: { Directory: 'Graph', ObjectId: 'oid-9' },
        };
        ApplyProvisionResultToIdentity(identity, req, result);

        expect(identity.AgentID).toBe('agent-1');
        expect(identity.ProviderID).toBe('provider-1');
        expect(identity.IdentityType).toBe('Email');
        expect(identity.IdentityValue).toBe('sage@customer.com');
        expect(identity.DisplayName).toBe('Sage Bot');
        expect(identity.IsActive).toBe(true);
        expect(identity.Configuration).toBe(JSON.stringify({ Directory: 'Graph', ObjectId: 'oid-9' }));
    });

    it('falls back DisplayName to the request when the result omits it, and leaves Configuration null when absent', () => {
        const identity = fakeIdentity();
        ApplyProvisionResultToIdentity(identity, request({ DisplayName: 'Req Name' }), {
            IdentityValue: '+15550001111',
        });
        expect(identity.DisplayName).toBe('Req Name');
        expect(identity.Configuration).toBeNull();
    });

    it('sets DisplayName null when neither result nor request supplies one', () => {
        const identity = fakeIdentity();
        ApplyProvisionResultToIdentity(identity, request({ DisplayName: undefined }), {
            IdentityValue: 'sage@customer.com',
        });
        expect(identity.DisplayName).toBeNull();
    });
});
