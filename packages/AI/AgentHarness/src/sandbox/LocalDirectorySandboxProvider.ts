import { existsSync, realpathSync, statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { delimiter, dirname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { LogError } from '@memberjunction/core';
import { ISandboxProvider, SandboxConfig, SandboxHandle, WorkspaceKey } from './ISandboxProvider.js';
import { ChildProcessExecutor } from './ChildProcessExecutor.js';

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
    public readonly Name = 'local' as const;
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
    public async Provision(key: WorkspaceKey, config: SandboxConfig): Promise<SandboxHandle> {
        if (config.workspace?.mode === 'attach') {
            return this.provisionAttachedWorkspace(key, config);
        }

        const workspacePath = join(this.rootPath, this.buildRelativePath(key));
        await mkdir(workspacePath, { recursive: true });
        return {
            Provider: 'local',
            WorkspacePath: workspacePath,
            HostWorkspacePath: workspacePath,
            Key: key,
            Ephemeral: key.Scope === 'run',
            // Runs directly on the MJAPI host. The workspace path is a host path here, which is the
            // one case where it is also safe to touch with `fs` — see the note on SandboxHandle.
            Executor: new ChildProcessExecutor(workspacePath),
        };
    }

    /**
     * Attaches to an existing host directory instead of provisioning an isolated temp directory.
     *
     * Fails closed unless explicit allowed roots are configured via `config.workspace.allowedRoots`
     * or `MJ_HARNESS_ALLOWED_WORKSPACE_ROOTS` and every resolved path stays inside them.
     */
    private provisionAttachedWorkspace(key: WorkspaceKey, config: SandboxConfig): SandboxHandle {
        const wsConfig = config.workspace ?? {};
        const canonicalRoots = this.resolveAllowedRoots(wsConfig.allowedRoots);
        if (canonicalRoots.length === 0) {
            throw new Error(
                'LocalDirectorySandboxProvider attach mode requires at least one existing allowed root via ' +
                    'sandbox.workspace.allowedRoots or MJ_HARNESS_ALLOWED_WORKSPACE_ROOTS.',
            );
        }

        const rawTarget = (config.resolvedWorkspacePath ?? wsConfig.path ?? '').trim();
        if (!rawTarget) {
            throw new Error(
                'LocalDirectorySandboxProvider attach mode requires a non-empty workspace path ' +
                    `(sandbox.workspace.path or payload field '${wsConfig.pathFromPayload ?? 'none'}').`,
            );
        }

        const realTarget = this.validateDirectoryInsideRoots(rawTarget, canonicalRoots, 'workspace path');
        if (wsConfig.requireGitRepo !== false && !existsSync(join(realTarget, '.git'))) {
            throw new Error(`Attached workspace '${realTarget}' is not a git repository (.git missing).`);
        }

        const rawExtras = config.resolvedAdditionalDirectories ?? wsConfig.additionalDirectories ?? [];
        const resolvedExtras: string[] = [];
        const seenExtras = new Set<string>([realTarget]);
        const targetParent = dirname(realTarget);
        for (const rawEntry of rawExtras) {
            const expanded = rawEntry.trim() === '${parentDir}' ? targetParent : rawEntry.trim();
            if (!expanded) {
                continue;
            }
            const realExtra = this.validateDirectoryInsideRoots(expanded, canonicalRoots, 'additional directory');
            if (!seenExtras.has(realExtra)) {
                seenExtras.add(realExtra);
                resolvedExtras.push(realExtra);
            }
        }

        return {
            Provider: 'local',
            WorkspacePath: realTarget,
            HostWorkspacePath: realTarget,
            AdditionalDirectories: resolvedExtras,
            Key: key,
            // Attached host directories must never be deleted on finalize regardless of workspaceScope.
            Ephemeral: false,
            Executor: new ChildProcessExecutor(realTarget),
        };
    }

    /** Resolves and canonicalizes configured allowed workspace roots + env roots. */
    private resolveAllowedRoots(configuredRoots?: string[]): string[] {
        const envRaw = process.env.MJ_HARNESS_ALLOWED_WORKSPACE_ROOTS ?? '';
        const envRoots = envRaw
            .split(/[,\n]/)
            .flatMap((part) => (delimiter === ':' ? part.split(delimiter) : [part]))
            .map((entry) => entry.trim())
            .filter(Boolean);

        const combined = [...(configuredRoots ?? []).map((r) => r.trim()).filter(Boolean), ...envRoots];
        const canonical: string[] = [];
        const seen = new Set<string>();
        for (const root of combined) {
            if (!existsSync(root)) {
                continue;
            }
            const real = realpathSync(root);
            if (statSync(real).isDirectory() && !seen.has(real)) {
                seen.add(real);
                canonical.push(real);
            }
        }
        return canonical;
    }

    /** Verifies a directory exists and its canonical realpath resides inside at least one allowed root. */
    private validateDirectoryInsideRoots(candidatePath: string, canonicalRoots: string[], label: string): string {
        if (!existsSync(candidatePath)) {
            throw new Error(`Attached ${label} does not exist: '${candidatePath}'.`);
        }
        const realPath = realpathSync(candidatePath);
        if (!statSync(realPath).isDirectory()) {
            throw new Error(`Attached ${label} is not a directory: '${realPath}'.`);
        }
        const inside = canonicalRoots.some((root) =>
            root === sep ? true : realPath === root || realPath.startsWith(root + sep),
        );
        if (!inside) {
            throw new Error(
                `Attached ${label} '${realPath}' falls outside allowed workspace roots [${canonicalRoots.join(', ')}].`,
            );
        }
        return realPath;
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
