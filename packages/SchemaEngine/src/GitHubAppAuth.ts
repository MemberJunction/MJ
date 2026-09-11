/**
 * GitHub App authentication for the RSU's commit-and-PR step.
 *
 * The step used to accept exactly one credential: a token in GITHUB_TOKEN / GH_TOKEN. Every
 * MJ Central workspace is deployed with the platform's GitHub App instead — GITHUB_APP_ID,
 * GITHUB_APP_INSTALLATION_ID and GITHUB_APP_PRIVATE_KEY are written into the process environment
 * by the deploy, labelled for this very purpose — and those names are the ones the feedback
 * resolver already reads. The RSU never looked at them, so on every such workspace the step ended
 * "GitHub token not found", the pipeline shrugged (the step is non-fatal by design) and the
 * migration and generated code it had just produced existed only on the box, where the next
 * deploy discards them (sandbox 2026-09-11, MJ-RUN-30).
 *
 * No new dependency: the App JWT is an RS256 signature over two base64url segments, which
 * node:crypto signs, and the exchange is one REST call the Octokit instance can make itself.
 * The installation token is SCOPED to the one repository the RSU commits to — an App installed
 * on an organisation can reach every repository in it, and a token minted on a customer's box
 * must not.
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export interface GitHubAppCredentials {
  appId: string;
  installationId: string;
  /** PEM, with real newlines. */
  privateKey: string;
}

/** The environment names the platform deploy writes and the feedback resolver reads. */
export function readGitHubAppCredentials(env: NodeJS.ProcessEnv = process.env): GitHubAppCredentials | null {
  const appId = (env.GITHUB_APP_ID ?? '').trim();
  const installationId = (env.GITHUB_APP_INSTALLATION_ID ?? '').trim();
  if (!appId || !installationId) {
    return null;
  }
  const privateKey = readPrivateKey(env);
  if (!privateKey) {
    return null;
  }
  return { appId, installationId, privateKey };
}

/**
 * The key from a file path first, then inline. An inline key arrives with its newlines escaped
 * (`\n` as two characters) when it was set through a shell or an app-settings form; a PEM with
 * literal backslash-n never parses, so they are turned back into newlines here.
 */
export function readPrivateKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const keyPath = (env.GITHUB_APP_PRIVATE_KEY_PATH ?? '').trim();
  if (keyPath) {
    const resolved = keyPath.startsWith('~/') ? resolve(homedir(), keyPath.slice(2)) : resolve(keyPath);
    try {
      return readFileSync(resolved, 'utf-8');
    } catch {
      return null;
    }
  }
  const inline = env.GITHUB_APP_PRIVATE_KEY ?? '';
  if (!inline.trim()) {
    return null;
  }
  return inline.replace(/\\n/g, '\n');
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * A GitHub App JWT: RS256 over `{alg,typ}.{iat,exp,iss}`.
 *
 * Issued 60 s in the past to absorb clock skew between this box and GitHub, and valid for the
 * maximum GitHub allows (10 minutes) — it is used exactly once, to mint the installation token.
 */
export function buildAppJwt(appId: string, privateKey: string, nowSeconds: number = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 600, iss: appId }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = base64url(signer.sign(privateKey));
  return `${header}.${payload}.${signature}`;
}

/** The minimum an RSU commit + PR needs, on the one repository it targets. */
export function installationTokenRequest(installationId: string, repo: string): {
  url: string;
  body: { repositories: string[]; permissions: Record<string, string> };
} {
  return {
    url: `POST /app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    body: {
      repositories: [repo],
      permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
    },
  };
}

/** The slice of an Octokit instance the mint needs, so a test can hand in a stub. */
export interface AppTokenRequester {
  request(route: string, params: Record<string, unknown>): Promise<{ data: { token?: string } }>;
}

/**
 * Exchange the App JWT for an installation access token scoped to `repo`.
 * Returns the token; throws with a message that names what was missing, never one that echoes a secret.
 */
export async function mintInstallationToken(
  requester: AppTokenRequester,
  creds: GitHubAppCredentials,
  repo: string,
  nowSeconds?: number,
): Promise<string> {
  const jwt = buildAppJwt(creds.appId, creds.privateKey, nowSeconds);
  const { url, body } = installationTokenRequest(creds.installationId, repo);
  const res = await requester.request(url, {
    ...body,
    headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json' },
  });
  const token = res?.data?.token;
  if (!token) {
    throw new Error(`GitHub App installation ${creds.installationId} returned no access token for repository "${repo}"`);
  }
  return token;
}
