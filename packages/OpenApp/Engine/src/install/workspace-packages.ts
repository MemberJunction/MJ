/**
 * Checks that an Open App's npm packages are projects of the consumer workspace. Used for apps
 * whose package versions are written as `workspace:*`, before the install changes anything.
 */
import { execFile } from 'node:child_process';
import { ResolveInstallRoot, type PackageManagerType } from './package-manager.js';

/** Result of {@link CheckWorkspacePackages}. */
export interface WorkspacePackageCheck {
    /** True when every package is a workspace project */
    Success: boolean;
    /** The packages that are not workspace projects */
    Missing: string[];
    /** Why the check failed */
    ErrorMessage?: string;
}

/** Workspace package names, or why they could not be listed. */
type WorkspaceListing = { Names: Set<string> } | { ErrorMessage: string };

const LIST_TIMEOUT_MS = 60_000;
const LIST_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/**
 * Asks the package manager which projects the workspace has, and reports the packages that are
 * not among them. Runs where the package install runs: the repository root, or the parent of an
 * `mj dev workspace` the repository is a member of.
 *
 * @param packageNames - npm package names the app declares
 * @param repoRoot - Absolute path of the repository root
 * @param packageManager - Package manager to use; detected from the lockfile when omitted
 */
export async function CheckWorkspacePackages(
    packageNames: string[],
    repoRoot: string,
    packageManager?: PackageManagerType,
): Promise<WorkspacePackageCheck> {
    if (packageNames.length === 0) {
        return { Success: true, Missing: [] };
    }
    const root = ResolveInstallRoot(repoRoot, packageManager);
    const listing = await ListWorkspacePackageNames(root.Root, root.PackageManager);
    if ('ErrorMessage' in listing) {
        return { Success: false, Missing: [], ErrorMessage: listing.ErrorMessage };
    }
    const missing = packageNames.filter((name) => !listing.Names.has(name));
    if (missing.length === 0) {
        return { Success: true, Missing: [] };
    }
    return { Success: false, Missing: missing, ErrorMessage: DescribeMissingPackages(missing, root.Root, root.PackageManager) };
}

async function ListWorkspacePackageNames(root: string, packageManager: PackageManagerType): Promise<WorkspaceListing> {
    switch (packageManager) {
        case 'pnpm': {
            const output = await RunListCommand('pnpm', ['ls', '-r', '--depth', '-1', '--json'], root);
            return 'Stdout' in output ? ParseNames(() => ParsePnpmListing(output.Stdout), 'pnpm') : output;
        }
        case 'yarn': {
            const output = await RunListCommand('yarn', ['workspaces', 'list', '--json'], root);
            return 'Stdout' in output ? ParseNames(() => ParseYarnListing(output.Stdout), 'yarn') : output;
        }
        default:
            return {
                ErrorMessage: `A local Open App writes its package versions as 'workspace:*', which ${packageManager} cannot install. `
                    + `Use pnpm or yarn for this repository. Nothing has been changed.`,
            };
    }
}

/** Runs a package-manager listing command and returns its stdout. */
function RunListCommand(command: string, args: string[], cwd: string): Promise<{ Stdout: string } | { ErrorMessage: string }> {
    const isWindows = process.platform === 'win32';
    const file = isWindows ? `${command}.cmd` : command;
    return new Promise((resolvePromise) => {
        // The arguments are fixed strings, so the shell Windows needs for a `.cmd` shim cannot be fed input.
        execFile(file, args, { cwd, timeout: LIST_TIMEOUT_MS, maxBuffer: LIST_MAX_BUFFER_BYTES, shell: isWindows, windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                const detail = stderr.trim() ? ` (${stderr.trim().split('\n')[0]})` : '';
                resolvePromise({ ErrorMessage: `Could not list the ${command} workspace packages in ${cwd}: ${error.message}${detail}. Nothing has been changed.` });
                return;
            }
            resolvePromise({ Stdout: stdout });
        });
    });
}

/** Turns a listing parser's throw into a failure that names the package manager. */
function ParseNames(parse: () => string[], packageManager: PackageManagerType): WorkspaceListing {
    try {
        return { Names: new Set(parse()) };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { ErrorMessage: `Could not read the ${packageManager} workspace listing: ${message}. Nothing has been changed.` };
    }
}

/** Names from `pnpm ls -r --depth -1 --json`: a JSON array with one entry per project. */
function ParsePnpmListing(stdout: string): string[] {
    const projects: Array<{ name?: string }> = JSON.parse(stdout);
    return projects.map((p) => p.name).filter((name): name is string => typeof name === 'string');
}

/** Names from `yarn workspaces list --json`: one JSON object per line. */
function ParseYarnListing(stdout: string): string[] {
    return stdout
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line): { name?: string } => JSON.parse(line))
        .map((w) => w.name)
        .filter((name): name is string => typeof name === 'string');
}

function DescribeMissingPackages(missing: string[], root: string, packageManager: PackageManagerType): string {
    const workspaceFile = packageManager === 'pnpm' ? 'pnpm-workspace.yaml' : "the 'workspaces' field of package.json";
    return `These app packages are not projects in the ${packageManager} workspace at ${root}: ${missing.join(', ')}. `
        + `A local Open App installs its packages as 'workspace:*', so each one must be a workspace project. `
        + `Add their folders to ${workspaceFile} (for example 'openapps/*/packages/*') and retry. Nothing has been changed.`;
}
