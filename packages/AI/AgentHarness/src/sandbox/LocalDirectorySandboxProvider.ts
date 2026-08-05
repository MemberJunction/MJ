import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LogError } from '@memberjunction/core';
import { ISandboxProvider, SandboxConfig, SandboxHandle, WorkspaceKey } from './ISandboxProvider.js';

/**
 * Phase-1 sandbox: a scoped directory on the MJ server's own filesystem.
 *
 * ## What this does and does not protect against
 *
 * It gives each run a workspace of the right lifetime and keeps agents out of each other's files.
 * It does **not** contain the harness process: a determined harness can read outside its workspace,
 * and `NetworkPolicy` is advisory here because nothing intercepts the process's sockets. Real
 * enforcement needs the container provider, and `mcp-only` is the recommended production posture
 * precisely because it is the one that can actually be enforced.
 *
 * Saying so plainly matters more than the code: an operator who believes `networkPolicy: 'none'`
 * is enforced by this provider has a false sense of containment, which is worse than knowing the
 * boundary is soft.
 */
export class LocalDirectorySandboxProvider implements ISandboxProvider {
    private readonly rootPath: string;

    /**
     * @param rootPath Directory under which all workspaces are created. Defaults to a folder in the
     *                 OS temp dir, which is fine for `run` scope but should be pointed somewhere
     *                 durable when using `agent` or `agent-user` scopes, since temp dirs get swept.
     */
    public constructor(rootPath?: string) {
        this.rootPath = rootPath ?? join(tmpdir(), 'mj-agent-harness');
    }

    /** @inheritdoc */
    public async Provision(key: WorkspaceKey, _config: SandboxConfig): Promise<SandboxHandle> {
        const workspacePath = join(this.rootPath, this.buildRelativePath(key));
        await mkdir(workspacePath, { recursive: true });
        return {
            WorkspacePath: workspacePath,
            Key: key,
            Ephemeral: key.Scope === 'run',
        };
    }

    /** @inheritdoc */
    public async Finalize(handle: SandboxHandle, _outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
        if (!handle.Ephemeral) {
            // Durable scopes keep their files — that is the whole point of them.
            return;
        }
        try {
            await rm(handle.WorkspacePath, { recursive: true, force: true });
        } catch (e) {
            // Never rethrow from finalize: it runs on failure and cancellation paths, where throwing
            // would replace the real error with a cleanup error and lose the diagnosis.
            LogError(`Failed to remove harness workspace ${handle.WorkspacePath}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Maps a workspace key to a path whose shape makes the scope obvious on disk.
     *
     * Run-scoped paths include the run id so they are unique; durable paths deliberately do not, so
     * the same agent (and user) reattaches to the same directory next time.
     */
    private buildRelativePath(key: WorkspaceKey): string {
        switch (key.Scope) {
            case 'run':
                return join('run', key.RunId);
            case 'agent':
                return join('agent', key.AgentId);
            case 'agent-user':
                return join('agent-user', key.AgentId, key.UserId ?? 'no-user');
        }
    }
}
