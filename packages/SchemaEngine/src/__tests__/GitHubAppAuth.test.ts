import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildAppJwt,
  installationTokenRequest,
  mintInstallationToken,
  readGitHubAppCredentials,
  readPrivateKey,
} from '../GitHubAppAuth';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

const b64urlToJson = (segment: string) =>
  JSON.parse(Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'));

describe('readGitHubAppCredentials — the names the deploy writes', () => {
  it('reads the three GITHUB_APP_* variables', () => {
    const creds = readGitHubAppCredentials({ GITHUB_APP_ID: '123', GITHUB_APP_INSTALLATION_ID: '456', GITHUB_APP_PRIVATE_KEY: PEM });
    expect(creds).toEqual({ appId: '123', installationId: '456', privateKey: PEM });
  });

  it('is null when any of the three is missing — never a half credential', () => {
    expect(readGitHubAppCredentials({ GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: PEM })).toBeNull();
    expect(readGitHubAppCredentials({ GITHUB_APP_INSTALLATION_ID: '456', GITHUB_APP_PRIVATE_KEY: PEM })).toBeNull();
    expect(readGitHubAppCredentials({ GITHUB_APP_ID: '123', GITHUB_APP_INSTALLATION_ID: '456' })).toBeNull();
    expect(readGitHubAppCredentials({})).toBeNull();
  });

  it('turns an escaped inline key back into a PEM', () => {
    const escaped = PEM.replace(/\n/g, '\\n');
    expect(readPrivateKey({ GITHUB_APP_PRIVATE_KEY: escaped })).toBe(PEM);
  });

  it('prefers a key file over the inline value, and is null when the file is unreadable', () => {
    expect(readPrivateKey({ GITHUB_APP_PRIVATE_KEY_PATH: '/nonexistent/key.pem', GITHUB_APP_PRIVATE_KEY: PEM })).toBeNull();
  });
});

describe('buildAppJwt', () => {
  it('is an RS256 JWT issued by the App, 60 s in the past and valid for 10 minutes', () => {
    const jwt = buildAppJwt('123', PEM, 1_700_000_000);
    const [h, p, s] = jwt.split('.');
    expect(b64urlToJson(h)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(b64urlToJson(p)).toEqual({ iat: 1_700_000_000 - 60, exp: 1_700_000_000 + 600, iss: '123' });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${h}.${p}`);
    const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    expect(verifier.verify(publicKey, sig)).toBe(true);
  });
});

describe('installationTokenRequest — scoped to the one repository', () => {
  it('names the repository and only the permissions a commit + PR needs', () => {
    const r = installationTokenRequest('456', 'prod-5af5ca79');
    expect(r.url).toBe('POST /app/installations/456/access_tokens');
    expect(r.body.repositories).toEqual(['prod-5af5ca79']);
    expect(r.body.permissions).toEqual({ contents: 'write', pull_requests: 'write', metadata: 'read' });
  });
});

describe('mintInstallationToken', () => {
  it('sends the JWT as a bearer and returns the installation token', async () => {
    const calls: Array<{ route: string; params: Record<string, unknown> }> = [];
    const requester = {
      request: async (route: string, params: Record<string, unknown>) => {
        calls.push({ route, params });
        return { data: { token: 'ghs_scoped' } };
      },
    };
    const token = await mintInstallationToken(requester, { appId: '123', installationId: '456', privateKey: PEM }, 'repo-a', 1_700_000_000);
    expect(token).toBe('ghs_scoped');
    expect(calls).toHaveLength(1);
    expect(calls[0].route).toBe('POST /app/installations/456/access_tokens');
    expect(calls[0].params.repositories).toEqual(['repo-a']);
    const headers = calls[0].params.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('fails loudly, without echoing a secret, when GitHub returns no token', async () => {
    const requester = { request: async () => ({ data: {} }) };
    await expect(
      mintInstallationToken(requester, { appId: '123', installationId: '456', privateKey: PEM }, 'repo-a'),
    ).rejects.toThrow(/installation 456 returned no access token for repository "repo-a"/);
  });
});

describe('RuntimeSchemaManager.createOctokit — pinned from source', () => {
  const SRC = readFileSync(join(__dirname, '..', 'RuntimeSchemaManager.ts'), 'utf-8');
  it('falls back to the GitHub App when no plain token is set', () => {
    expect(SRC).toMatch(/private async createOctokit\(\): Promise<Octokit>/);
    expect(SRC).toMatch(/readGitHubAppCredentials\(/);
    expect(SRC).toMatch(/mintInstallationToken\(/);
  });
  it('names both credential shapes in the error a bare environment produces', () => {
    expect(SRC).toMatch(/GITHUB_TOKEN\/GH_TOKEN, or GITHUB_APP_ID \+ GITHUB_APP_INSTALLATION_ID \+ GITHUB_APP_PRIVATE_KEY/);
  });
  it('awaits the now-async factory at its one call site', () => {
    expect(SRC).toMatch(/const octokit = await this\.createOctokit\(\);/);
    expect(SRC).not.toMatch(/const octokit = this\.createOctokit\(\);/);
  });
});
