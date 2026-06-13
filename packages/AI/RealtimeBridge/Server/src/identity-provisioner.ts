import { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';

/**
 * A request to provision a tenant calendar/mailbox (or telephony) identity for an agent on a bridge
 * provider — "give Sage a real `sage@customer.com` mailbox the customer's own directory."
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §5 ("the agent as a first-class identity in
 * the customer's tenant").
 */
export interface AgentIdentityProvisionRequest {
    /** The agent to provision an identity for (`AIAgent.ID`). */
    AgentID: string;

    /** The bridge provider the identity lives on (`AIBridgeProvider.ID`). */
    ProviderID: string;

    /**
     * The kind of identity to provision. `Email` → a tenant calendar mailbox (the headline
     * invite/calendar method); `PhoneNumber` → a DID for inbound telephony; `AccountID` → a platform
     * account handle. Matches `AIBridgeAgentIdentity.IdentityType`.
     */
    IdentityType: 'Email' | 'PhoneNumber' | 'AccountID';

    /**
     * The requested identity value when the caller already knows it (e.g. a desired mailbox address
     * the admin pre-created). When omitted, the production provisioner allocates one (a mailbox in the
     * tenant, a number from the carrier pool) and returns it.
     */
    RequestedValue?: string;

    /** A human-friendly display name for the identity (e.g. the agent's name). */
    DisplayName?: string;

    /** Free-form provider-specific provisioning hints (tenant id, OU, number region, …). */
    Configuration?: Record<string, unknown>;
}

/**
 * The result of a provisioning request — the concrete identity that was created/claimed.
 */
export interface AgentIdentityProvisionResult {
    /** The provisioned identity value (the mailbox address / phone number / account id). */
    IdentityValue: string;

    /** The display name set on the identity. */
    DisplayName?: string;

    /**
     * Provider-specific result detail to persist on the identity's `Configuration` (the external
     * object id of the created mailbox, the credential reference, the carrier order id, …). Never
     * contains a raw secret — secrets go through MJ's credential system and are referenced by id.
     */
    Configuration?: Record<string, unknown>;
}

/**
 * The **identity-provisioning seam** — provisions a tenant mailbox/calendar (or telephony) identity
 * for an agent on a provider. This is a *documented seam*, not a built integration: the schema
 * (`AIBridgeAgentIdentity`) already holds the *result*, so all this interface does is define the shape
 * production wires to Microsoft Graph admin / Google Workspace Admin SDK / a telephony carrier API.
 *
 * Kept deliberately thin (one method) — over-building here is explicitly out of scope; the value is
 * the clean boundary + the TODO marking where the real admin APIs bind.
 */
export interface IAgentIdentityProvisioner {
    /**
     * Provisions an identity for an agent and returns the concrete value (+ provider detail). The
     * caller persists the result onto an {@link MJAIBridgeAgentIdentityEntity} (see
     * {@link ApplyProvisionResultToIdentity}); this method does NOT write the row itself, keeping the
     * provisioner free of MJ entity concerns.
     *
     * @param request What to provision.
     * @returns The provisioned identity detail.
     * @throws On provisioning failure (the production binding surfaces admin-API errors here).
     */
    Provision(request: AgentIdentityProvisionRequest): Promise<AgentIdentityProvisionResult>;
}

/**
 * The error a not-yet-bound {@link IAgentIdentityProvisioner} throws — distinct type so a host can
 * detect "provisioning not wired" vs. a genuine admin-API failure.
 */
export class IdentityProvisionerNotBoundError extends Error {
    constructor(target: string) {
        super(
            `Agent identity provisioner for '${target}' is not bound. ` +
                `Production wires the ${target} admin API (Microsoft Graph / Google Workspace Admin / ` +
                `telephony carrier); the schema already holds the result.`,
        );
        this.name = 'IdentityProvisionerNotBoundError';
    }
}

/**
 * **Production-binding stub** {@link IAgentIdentityProvisioner}.
 *
 * Provisioning a real tenant mailbox/calendar (or a DID) is a delegated-admin operation against the
 * customer's directory — Microsoft Graph (`/users` + mailbox + calendar permissions), Google
 * Workspace Admin SDK, or a telephony carrier's number-ordering API — gated by admin consent and
 * minimal scopes, with the credential stored in MJ's credential system and referenced (never inline)
 * by the provider/identity `Configuration`.
 *
 * Because that handshake is a per-deployment, governed flow (see the architecture's open sub-question
 * on the provisioning handshake), this stub throws {@link IdentityProvisionerNotBoundError} until a
 * host binds the real admin API. The seam + the schema are what's in scope now.
 *
 * @remarks **TODO (production):** implement against Microsoft Graph / Google Workspace Admin SDK /
 * the telephony carrier API per the request's `IdentityType` + provider; resolve the admin credential
 * from the provider `Configuration` via the credential system; return the created mailbox/number.
 */
export class StubAgentIdentityProvisioner implements IAgentIdentityProvisioner {
    /** @inheritdoc */
    public async Provision(
        request: AgentIdentityProvisionRequest,
    ): Promise<AgentIdentityProvisionResult> {
        // TODO(production): bind the directory/carrier admin API for request.IdentityType + provider,
        // resolve the admin credential from provider Configuration, and allocate the identity.
        throw new IdentityProvisionerNotBoundError(this.targetLabel(request.IdentityType));
    }

    /** Maps an identity type to the admin surface label used in the not-bound error. */
    private targetLabel(identityType: AgentIdentityProvisionRequest['IdentityType']): string {
        switch (identityType) {
            case 'PhoneNumber':
                return 'telephony carrier';
            case 'AccountID':
                return 'platform account';
            case 'Email':
            default:
                return 'calendar/mailbox directory';
        }
    }
}

/**
 * Applies a {@link AgentIdentityProvisionResult} onto a (new or existing)
 * {@link MJAIBridgeAgentIdentityEntity} from the original request — the small bridge between the
 * provisioning seam (which returns plain data) and the MJ entity layer (which the caller saves). Pure
 * field-mapping; the caller owns `NewRecord()`/`Save()` so this stays provider-free and testable.
 *
 * @param identity The identity entity to populate (already `NewRecord()`'d for an insert).
 * @param request The original provisioning request (carries `AgentID` / `ProviderID` / `IdentityType`).
 * @param result The provisioning result to apply.
 */
export function ApplyProvisionResultToIdentity(
    identity: MJAIBridgeAgentIdentityEntity,
    request: AgentIdentityProvisionRequest,
    result: AgentIdentityProvisionResult,
): void {
    identity.AgentID = request.AgentID;
    identity.ProviderID = request.ProviderID;
    identity.IdentityType = request.IdentityType;
    identity.IdentityValue = result.IdentityValue;
    identity.DisplayName = result.DisplayName ?? request.DisplayName ?? null;
    identity.IsActive = true;
    if (result.Configuration) {
        identity.Configuration = JSON.stringify(result.Configuration);
    }
}
