import { HarnessNetworkPolicy, HarnessWorkspaceScope } from '../types.js';
import { SandboxExecutor } from './SandboxExecutor.js';

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
    /** CPU quota in cores (`--cpus <n>`) for container providers. Ignored by the local provider. */
    Cpus?: number;
    /** Hard memory limit in megabytes (`--memory <n>m`) for container providers. Ignored by the local provider. */
    MemoryMb?: number;
    /** Maximum number of processes/threads (`--pids-limit <n>`) inside the container. Ignored by the local provider. */
    PidsLimit?: number;
    /** Size of `/dev/shm` in megabytes (`--shm-size <n>m`) for container providers (required by Chromium). Ignored by the local provider. */
    ShmSizeMb?: number;
    /** Mount the container's root filesystem read-only with a writable `/tmp` tmpfs (`--read-only --tmpfs /tmp:rw,size=256m`). Ignored by the local provider. */
    ReadOnlyRoot?: boolean;
    /** UID/GID (`--user <uid:gid>`) to run container processes as so bind-mounted files match host ownership. Ignored by the local provider. */
    User?: string;
    /** Drop all Linux capabilities and forbid privilege escalation (`--cap-drop ALL --security-opt no-new-privileges`). Ignored by the local provider. */
    DropCapabilities?: boolean;
}

/** A provisioned workspace, and the means of running commands inside it. */
export interface SandboxHandle {
    /**
     * Workspace path AS THE HARNESS SEES IT.
     *
     * For the local provider that is a host path. For a container provider it is the path inside the
     * container, which is generally NOT the host path the workspace was created at — the two are
     * connected by a mount the provider set up. Code that passes this to a harness process is
     * correct; code that opens it with `fs` on the MJAPI host is only correct for the local provider,
     * and that distinction is why the field is documented rather than just named.
     */
    WorkspacePath: string;
    /**
     * Host-filesystem directory backing {@link WorkspacePath}, for callers on the MJAPI host that need
     * to stage request files or collect output artifacts across the bind mount.
     */
    HostWorkspacePath?: string;
    Key: WorkspaceKey;
    /** True when the workspace is discarded on finalize rather than retained for the next run. */
    Ephemeral: boolean;
    /**
     * Runs harness processes inside this sandbox.
     *
     * The reason process placement lives on the HANDLE rather than in the adapter: an adapter that
     * called `spawn()` directly would always run on the MJAPI host, which in production means an
     * autonomous agent executing shell commands inside the API container with its network reach and
     * cloud credentials. Routing every process through the provider's executor is what makes
     * `provider: 'docker'` mean something.
     */
    Executor: SandboxExecutor;
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
