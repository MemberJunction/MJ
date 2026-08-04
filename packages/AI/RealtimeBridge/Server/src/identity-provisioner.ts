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

// ──────────────────────────────────────────────────────────────────────────────
// Injected admin surfaces + PURE request→payload mapping. Production wires these
// over Microsoft Graph admin / Google Workspace Admin SDK / a telephony carrier API
// (all optionalDependencies, loaded only when a provider is configured); tests
// inject fakes. NO admin-SDK types leak through these surfaces.
// ──────────────────────────────────────────────────────────────────────────────

/** The Microsoft Graph `POST /users` create-mailbox payload (the subset we construct). */
export interface GraphCreateMailboxPayload {
    /** The mailbox UPN/address to create (`user.userPrincipalName` + `mailNickname`). */
    UserPrincipalName: string;
    /** The mailbox local part (`mailNickname`) derived from the address. */
    MailNickname: string;
    /** The display name shown in the directory + on calendar invites. */
    DisplayName: string;
    /** The Azure tenant id the mailbox is created in, when supplied via request `Configuration.TenantId`. */
    TenantId?: string;
    /** The directory OU/usage-location hint, when supplied via request `Configuration.UsageLocation`. */
    UsageLocation?: string;
}

/** The Google Workspace Admin `directory.users.insert` create-mailbox payload (the subset we construct). */
export interface GoogleWorkspaceCreateMailboxPayload {
    /** The primary email to create (`primaryEmail`). */
    PrimaryEmail: string;
    /** The display name (`name.fullName`). */
    DisplayName: string;
    /** The Workspace customer/domain the mailbox belongs to, from `Configuration.Domain`. */
    Domain?: string;
    /** The org unit path, when supplied via `Configuration.OrgUnitPath`. */
    OrgUnitPath?: string;
}

/** The telephony-carrier number-order payload (the subset we construct). */
export interface CarrierNumberOrderPayload {
    /** The desired E.164 number when the caller pre-selected one (`RequestedValue`); else carrier allocates. */
    RequestedNumber?: string;
    /** The region/area hint for allocation (`Configuration.Region`, e.g. `US`, `US-415`). */
    Region?: string;
    /** The label the carrier records against the number (the agent display name). */
    Label: string;
}

/** What {@link IGraphAdminLike.CreateMailbox} resolves to — the created mailbox address + directory id. */
export interface GraphCreateMailboxResult {
    /** The provisioned mailbox address (the identity value). */
    UserPrincipalName: string;
    /** The Graph directory object id of the created user. */
    ObjectId: string;
}

/** What {@link IGoogleWorkspaceAdminLike.CreateMailbox} resolves to — the created address + directory id. */
export interface GoogleWorkspaceCreateMailboxResult {
    /** The provisioned primary email (the identity value). */
    PrimaryEmail: string;
    /** The Workspace directory user id of the created user. */
    UserId: string;
}

/** What {@link ITelephonyCarrierLike.OrderNumber} resolves to — the allocated number + carrier order id. */
export interface CarrierNumberOrderResult {
    /** The provisioned E.164 phone number (the identity value). */
    PhoneNumber: string;
    /** The carrier's order/reference id for the allocation. */
    OrderId: string;
}

/**
 * The minimal Microsoft Graph admin surface for mailbox provisioning. A production wiring implements
 * this over `@microsoft/microsoft-graph-client` (`Client.api('/users').post(...)`) with an admin
 * credential resolved from the provider `Configuration`. NO Graph SDK types leak through.
 */
export interface IGraphAdminLike {
    /** Creates a tenant mailbox/calendar user; resolves the created address + directory object id. */
    CreateMailbox(payload: GraphCreateMailboxPayload): Promise<GraphCreateMailboxResult>;
}

/**
 * The minimal Google Workspace Admin surface for mailbox provisioning. A production wiring implements
 * this over `googleapis` (`admin.users.insert(...)`) with an admin credential resolved from the
 * provider `Configuration`. NO googleapis types leak through.
 */
export interface IGoogleWorkspaceAdminLike {
    /** Creates a Workspace mailbox/calendar user; resolves the created address + directory user id. */
    CreateMailbox(payload: GoogleWorkspaceCreateMailboxPayload): Promise<GoogleWorkspaceCreateMailboxResult>;
}

/**
 * The minimal telephony-carrier surface for DID provisioning. A production wiring implements this over
 * the carrier's number-ordering API (e.g. Twilio `incomingPhoneNumbers.create`) with a credential
 * resolved from the provider `Configuration`. NO carrier SDK types leak through.
 */
export interface ITelephonyCarrierLike {
    /** Orders/allocates an inbound DID; resolves the allocated E.164 number + the carrier order id. */
    OrderNumber(payload: CarrierNumberOrderPayload): Promise<CarrierNumberOrderResult>;
}

/** Reads a string field from a request `Configuration` blob, or `undefined`. */
function readConfigString(
    config: Record<string, unknown> | undefined,
    key: string,
): string | undefined {
    const value = config?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * **Pure** mapping of a provisioning request to the Graph create-mailbox payload. Derives the
 * `MailNickname` from the local part of the requested address. Throws when no `RequestedValue` is
 * supplied — a Graph mailbox must be created at a known address (Graph does not allocate one).
 */
export function buildGraphMailboxPayload(
    request: AgentIdentityProvisionRequest,
): GraphCreateMailboxPayload {
    const address = request.RequestedValue?.trim();
    if (!address) {
        throw new Error(
            'buildGraphMailboxPayload: AgentIdentityProvisionRequest.RequestedValue (the mailbox address) ' +
                'is required for Graph mailbox provisioning — Graph creates a user at a known UPN.',
        );
    }
    const tenantId = readConfigString(request.Configuration, 'TenantId');
    const usageLocation = readConfigString(request.Configuration, 'UsageLocation');
    return {
        UserPrincipalName: address,
        MailNickname: address.split('@')[0],
        DisplayName: request.DisplayName ?? address,
        ...(tenantId ? { TenantId: tenantId } : {}),
        ...(usageLocation ? { UsageLocation: usageLocation } : {}),
    };
}

/**
 * **Pure** mapping of a provisioning request to the Google Workspace create-mailbox payload. Throws
 * when no `RequestedValue` is supplied — a Workspace user is created at a known primary email.
 */
export function buildGoogleWorkspaceMailboxPayload(
    request: AgentIdentityProvisionRequest,
): GoogleWorkspaceCreateMailboxPayload {
    const address = request.RequestedValue?.trim();
    if (!address) {
        throw new Error(
            'buildGoogleWorkspaceMailboxPayload: AgentIdentityProvisionRequest.RequestedValue (the primary ' +
                'email) is required for Google Workspace mailbox provisioning.',
        );
    }
    const domain = readConfigString(request.Configuration, 'Domain') ?? address.split('@')[1];
    const orgUnitPath = readConfigString(request.Configuration, 'OrgUnitPath');
    return {
        PrimaryEmail: address,
        DisplayName: request.DisplayName ?? address,
        ...(domain ? { Domain: domain } : {}),
        ...(orgUnitPath ? { OrgUnitPath: orgUnitPath } : {}),
    };
}

/**
 * **Pure** mapping of a provisioning request to the carrier number-order payload. A DID is allocatable
 * by the carrier, so `RequestedValue` is optional (when omitted, the carrier picks from its pool).
 */
export function buildCarrierNumberOrderPayload(
    request: AgentIdentityProvisionRequest,
): CarrierNumberOrderPayload {
    const requestedNumber = request.RequestedValue?.trim();
    const region = readConfigString(request.Configuration, 'Region');
    return {
        ...(requestedNumber ? { RequestedNumber: requestedNumber } : {}),
        ...(region ? { Region: region } : {}),
        Label: request.DisplayName ?? request.AgentID,
    };
}

/** The injected admin surfaces a {@link StubAgentIdentityProvisioner} binds. All optional. */
export interface AgentIdentityProvisionerOptions {
    /** The Microsoft Graph admin surface — bound when Graph (`Email`) provisioning is configured. */
    Graph?: IGraphAdminLike;
    /** The Google Workspace Admin surface — bound when Workspace (`Email`) provisioning is configured. */
    GoogleWorkspace?: IGoogleWorkspaceAdminLike;
    /** The telephony-carrier surface — bound when carrier (`PhoneNumber`) provisioning is configured. */
    Carrier?: ITelephonyCarrierLike;
    /**
     * Which mailbox directory to use for `IdentityType='Email'` when both Graph and Workspace are bound.
     * Defaults to `'Graph'`. A host with only one mailbox surface bound need not set this.
     */
    EmailDirectory?: 'Graph' | 'GoogleWorkspace';
}

/**
 * **Provisioner over injected admin surfaces.** Implements {@link IAgentIdentityProvisioner} for the
 * §1e identity types — Graph mailbox/`Email`, Google Workspace `Email`, and the telephony carrier
 * `PhoneNumber` path — each over an injected admin surface so the package builds + unit-tests with no
 * admin-SDK install and no network. Pure request→payload mapping lives in the `build*Payload` helpers;
 * this class only routes by `IdentityType`, calls the surface, and shapes the
 * {@link AgentIdentityProvisionResult} the existing {@link ApplyProvisionResultToIdentity} consumes.
 *
 * When the surface required for a request's `IdentityType` is **not** bound, it preserves the original
 * seam behavior — throwing {@link IdentityProvisionerNotBoundError} so a misconfigured deployment fails
 * loudly rather than silently never provisioning. Constructing it with no options reproduces the prior
 * "throws for every type" stub exactly.
 *
 * @remarks **TODO (production):** bind `@microsoft/microsoft-graph-client` / `googleapis` / the carrier
 * SDK (all optionalDependencies), resolve the admin credential from the provider `Configuration` via
 * MJ's credential system, and inject them as the {@link AgentIdentityProvisionerOptions} surfaces.
 */
export class StubAgentIdentityProvisioner implements IAgentIdentityProvisioner {
    private readonly graph?: IGraphAdminLike;
    private readonly googleWorkspace?: IGoogleWorkspaceAdminLike;
    private readonly carrier?: ITelephonyCarrierLike;
    private readonly emailDirectory: 'Graph' | 'GoogleWorkspace';

    /**
     * @param options The injected admin surfaces. Omit any (or all) to preserve the not-bound seam
     *   behavior for that identity type.
     */
    constructor(options: AgentIdentityProvisionerOptions = {}) {
        this.graph = options.Graph;
        this.googleWorkspace = options.GoogleWorkspace;
        this.carrier = options.Carrier;
        this.emailDirectory = options.EmailDirectory ?? 'Graph';
    }

    /** @inheritdoc */
    public async Provision(
        request: AgentIdentityProvisionRequest,
    ): Promise<AgentIdentityProvisionResult> {
        switch (request.IdentityType) {
            case 'Email':
                return this.provisionMailbox(request);
            case 'PhoneNumber':
                return this.provisionPhoneNumber(request);
            case 'AccountID':
            default:
                // Platform account handles are not auto-provisioned (no admin API in scope); stays a seam.
                throw new IdentityProvisionerNotBoundError(this.targetLabel(request.IdentityType));
        }
    }

    /** Routes `Email` provisioning to whichever mailbox directory is configured/bound. */
    private async provisionMailbox(
        request: AgentIdentityProvisionRequest,
    ): Promise<AgentIdentityProvisionResult> {
        if (this.emailDirectory === 'GoogleWorkspace' || (!this.graph && this.googleWorkspace)) {
            return this.provisionGoogleWorkspaceMailbox(request);
        }
        return this.provisionGraphMailbox(request);
    }

    /** Provisions a Graph mailbox over the injected Graph admin surface. */
    private async provisionGraphMailbox(
        request: AgentIdentityProvisionRequest,
    ): Promise<AgentIdentityProvisionResult> {
        if (!this.graph) {
            throw new IdentityProvisionerNotBoundError(this.targetLabel('Email'));
        }
        const payload = buildGraphMailboxPayload(request);
        const result = await this.graph.CreateMailbox(payload);
        return {
            IdentityValue: result.UserPrincipalName,
            DisplayName: payload.DisplayName,
            Configuration: { Directory: 'Graph', ObjectId: result.ObjectId },
        };
    }

    /** Provisions a Google Workspace mailbox over the injected Workspace admin surface. */
    private async provisionGoogleWorkspaceMailbox(
        request: AgentIdentityProvisionRequest,
    ): Promise<AgentIdentityProvisionResult> {
        if (!this.googleWorkspace) {
            throw new IdentityProvisionerNotBoundError(this.targetLabel('Email'));
        }
        const payload = buildGoogleWorkspaceMailboxPayload(request);
        const result = await this.googleWorkspace.CreateMailbox(payload);
        return {
            IdentityValue: result.PrimaryEmail,
            DisplayName: payload.DisplayName,
            Configuration: { Directory: 'GoogleWorkspace', UserId: result.UserId },
        };
    }

    /** Provisions a DID over the injected telephony-carrier surface. */
    private async provisionPhoneNumber(
        request: AgentIdentityProvisionRequest,
    ): Promise<AgentIdentityProvisionResult> {
        if (!this.carrier) {
            throw new IdentityProvisionerNotBoundError(this.targetLabel('PhoneNumber'));
        }
        const payload = buildCarrierNumberOrderPayload(request);
        const result = await this.carrier.OrderNumber(payload);
        return {
            IdentityValue: result.PhoneNumber,
            ...(request.DisplayName ? { DisplayName: request.DisplayName } : {}),
            Configuration: { Carrier: true, OrderId: result.OrderId },
        };
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
