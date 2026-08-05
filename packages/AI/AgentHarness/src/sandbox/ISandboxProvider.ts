import { HarnessNetworkPolicy, HarnessWorkspaceScope } from '../types.js';

/**
 * Identifies which workspace a run should get, and therefore how long its files live.
 *
 * Scope is the deciding field: `run` means a fresh directory nobody sees again, `agent` a shared
 * workspace across every run of that agent, `agent-user` one per agent per user — the default,
 * because it gives an agent continuity without letting one user's working files leak into another's
 * session.
 */
export interface WorkspaceKey {
    Scope: HarnessWorkspaceScope;
    AgentId: string;
    UserId?: string;
    RunId: string;
}

/** Runtime knobs a provider honours when provisioning. */
export interface SandboxConfig {
    NetworkPolicy: HarnessNetworkPolicy;
    /** Container image, for providers that have one. Ignored by the local provider. */
    Image?: string;
    /** How to handle two runs wanting the same durable workspace. */
    Concurrency?: 'queue' | 'fail' | 'fork';
}

/** A provisioned workspace. */
export interface SandboxHandle {
    WorkspacePath: string;
    Key: WorkspaceKey;
    /** True when the workspace is discarded on finalize rather than retained for the next run. */
    Ephemeral: boolean;
}

/**
 * Provisions and finalizes the filesystem a harness runs against.
 *
 * Kept deliberately small — two methods — because the interesting variation between a local
 * directory and a container is not the shape of the API, it is what `NetworkPolicy` can actually
 * enforce. The local provider can only honour it on a best-effort basis; a container provider
 * enforces it for real, which is why `mcp-only` is the recommended production posture and only
 * meaningful there.
 */
export interface ISandboxProvider {
    /** Provisions (or reattaches to) the workspace identified by `key`. */
    Provision(key: WorkspaceKey, config: SandboxConfig): Promise<SandboxHandle>;
    /**
     * Releases the workspace.
     *
     * Must be safe to call on every exit path including crash and cancellation, and must not throw —
     * a finalize that throws inside a failure path masks the original error with a cleanup error.
     */
    Finalize(handle: SandboxHandle, outcome: 'success' | 'failure' | 'cancelled'): Promise<void>;
}
