/**
 * MJ-specific parameter extensions for Computer Use engine.
 *
 * MJRunComputerUseParams extends the base RunComputerUseParams with
 * MJ-aware fields: prompt entity references, action references,
 * context user, and agent run linkage.
 *
 * MJDomainAuthBinding extends DomainAuthBinding with optional
 * CredentialEntity support — when Credential is provided, the
 * MJComputerUseEngine resolves it to a concrete AuthMethod
 * automatically based on the credential type.
 */

import { UserInfo } from '@memberjunction/core';
import { MJCredentialEntity as CredentialEntity } from '@memberjunction/core-entities';

import {
    RunComputerUseParams,
    DomainAuthBinding,
} from '@memberjunction/computer-use';

// ─── Prompt Entity Reference ──────────────────────────────────────
/**
 * Lightweight reference to an MJ AI Prompt entity.
 * At least one of PromptId or PromptName must be provided.
 *
 * Resolution happens inside MJComputerUseEngine.Run() — the engine
 * loads the full AIPromptEntityExtended from this ref, then uses it
 * for AIPromptRunner execution. This matches the ActionRef pattern
 * and keeps params serializable.
 */
export class PromptEntityRef {
    /** Prompt primary key. Takes precedence over PromptName if both set. */
    public PromptId?: string;
    /** Prompt name for lookup. Used if PromptId is not set. */
    public PromptName?: string;
}

// ─── Action Reference ─────────────────────────────────────────
/**
 * Identifies an MJ Action to expose as a tool to the controller LLM.
 * At least one of ActionId or ActionName must be provided.
 */
export class ActionRef {
    /** Action primary key. Takes precedence over ActionName if both set. */
    public ActionId?: string;
    /** Action name for lookup. Used if ActionId is not set. */
    public ActionName?: string;
}

// ─── MJ Run Params ────────────────────────────────────────────
/**
 * MJ-aware extension of RunComputerUseParams.
 *
 * Adds:
 * - Prompt entity references for controller and judge (resolved by engine, routed through AIPromptRunner)
 * - MJ Action references that get auto-wrapped as tools
 * - Context user for entity operations and audit logging
 * - Agent run ID for linking to the parent agent execution
 */
export class MJRunComputerUseParams extends RunComputerUseParams {
    /**
     * Reference to an MJ AI Prompt entity for the controller LLM.
     * When set, MJComputerUseEngine resolves this to a full AIPromptEntityExtended
     * and routes ExecuteControllerPrompt() through AIPromptRunner. This gives us:
     * - Template rendering (Nunjucks)
     * - Prompt run logging
     * - Model failover
     * - Token and cost tracking
     */
    public ControllerPromptRef?: PromptEntityRef;

    /**
     * Reference to an MJ AI Prompt entity for the judge LLM.
     * Same resolution and benefits as ControllerPromptRef.
     */
    public JudgePromptRef?: PromptEntityRef;

    /**
     * MJ Actions to expose as tools to the controller LLM.
     * Each action is auto-wrapped into a ComputerUseTool with:
     * - Schema derived from ActionParam metadata
     * - Handler that routes to ActionEngineBase.RunAction()
     */
    public Actions?: ActionRef[];

    /**
     * User context for all MJ entity operations.
     * Required on the server side for:
     * - Row-level security
     * - Permission checks
     * - Audit logging
     */
    public ContextUser?: UserInfo;

    /**
     * Parent agent run ID for linking prompt runs and media to the agent execution.
     * When set, all AIPromptRun records created during the run will have
     * their AgentRunID field set to this value.
     */
    public AgentRunId?: string;
}

// ─── MJ Domain Auth Binding ──────────────────────────────────
/**
 * MJ-aware auth binding that can resolve from MJ Credentials.
 *
 * Either Method OR Credential must be provided, not both.
 * When Credential is provided, MJComputerUseEngine resolves the
 * credential's CredentialType and auto-maps to the correct AuthMethod:
 *
 * | CredentialType Name            | Maps to              |
 * |-------------------------------|----------------------|
 * | API Key                       | APIKeyHeaderAuthMethod |
 * | Basic Auth                    | BasicAuthMethod       |
 * | OAuth2 Client Credentials     | OAuthClientCredentialsAuthMethod |
 * | API Key with Endpoint         | BearerTokenAuthMethod |
 *
 * The Credential's encrypted Values field is decrypted server-side
 * automatically by MJ's field-level encryption when the entity loads.
 */
export class MJDomainAuthBinding extends DomainAuthBinding {
    /**
     * Alternative to Method: resolve auth from an MJ CredentialEntity.
     * Uses the actual CredentialEntity from @memberjunction/core-entities.
     * If Credential is set, Method is ignored.
     */
    public Credential?: CredentialEntity;
}
