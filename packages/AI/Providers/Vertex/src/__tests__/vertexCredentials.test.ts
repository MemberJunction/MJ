import { afterEach, describe, it, expect, vi } from 'vitest';
import {
    AssertVertexKeyFileAllowed,
    ParseVertexAICredentials,
    VertexCredentialsError,
    VertexKeySourceOf,
} from '../vertexCredentials';

/** A stand-in private key: never a real one. */
const STAND_IN_KEY = '-----BEGIN PRIVATE KEY-----\nstand-in\n-----END PRIVATE KEY-----\n';

function problemOf(json: string): VertexCredentialsError['Problem'] | null {
    try {
        ParseVertexAICredentials(json);
        return null;
    } catch (error) {
        return error instanceof VertexCredentialsError ? error.Problem : null;
    }
}

describe('ParseVertexAICredentials', () => {
    it('reads Application Default Credentials: a project and a location', () => {
        const creds = ParseVertexAICredentials(JSON.stringify({ project: 'p1', location: 'us' }));
        expect(creds.project).toBe('p1');
        expect(creds.location).toBe('us');
    });

    it('defaults the location to us-central1', () => {
        expect(ParseVertexAICredentials(JSON.stringify({ project: 'p1' })).location).toBe('us-central1');
    });

    it('prefers project_id over project', () => {
        expect(ParseVertexAICredentials(JSON.stringify({ project: 'wrong', project_id: 'right' })).project).toBe('right');
    });

    it('merges a serviceAccountJson string, keeping the top-level project and location', () => {
        const serviceAccount = { type: 'service_account', project_id: 'sa-project', private_key: STAND_IN_KEY, client_email: 'sa@x' };
        const creds = ParseVertexAICredentials(
            JSON.stringify({ project: 'top', location: 'eu', serviceAccountJson: JSON.stringify(serviceAccount) })
        );
        // The service account's project_id wins over project afterwards, as VertexLLM has always done.
        expect(creds.project).toBe('sa-project');
        expect(creds.location).toBe('eu');
        expect(creds.private_key).toBe(STAND_IN_KEY);
        expect(creds.type).toBe('service_account');
    });

    it('takes the project from serviceAccountJson when the key has none', () => {
        const creds = ParseVertexAICredentials(JSON.stringify({ serviceAccountJson: JSON.stringify({ project_id: 'sa-project' }) }));
        expect(creds.project).toBe('sa-project');
        expect(creds.location).toBe('us-central1');
    });

    it('keeps a key-file path for the auth client to judge', () => {
        expect(ParseVertexAICredentials(JSON.stringify({ project: 'p1', keyFilePath: '/keys/sa.json' })).keyFilePath).toBe('/keys/sa.json');
    });

    it('refuses a key that is not JSON, keeping the message VertexLLM has always thrown', () => {
        expect(() => ParseVertexAICredentials('not json')).toThrow('Invalid Vertex AI credentials JSON');
        expect(problemOf('not json')).toBe('invalid-json');
    });

    it('refuses a serviceAccountJson that is not JSON', () => {
        const json = JSON.stringify({ project: 'p1', serviceAccountJson: '{oops' });
        expect(() => ParseVertexAICredentials(json)).toThrow('Invalid serviceAccountJson');
        expect(problemOf(json)).toBe('invalid-service-account-json');
    });

    it('refuses a key with no project', () => {
        const json = JSON.stringify({ location: 'us-central1' });
        expect(() => ParseVertexAICredentials(json)).toThrow('must include "project"');
        expect(problemOf(json)).toBe('missing-project');
    });
});

// Each case uses its own driver name: the platform caches environment keys by driver for the life of the process.
describe('VertexKeySourceOf', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('is the environment key when the key is AI_VENDOR_API_KEY__<driver>, byte for byte', () => {
        const key = JSON.stringify({ project: 'p1', keyFilePath: '/keys/sa.json' });
        vi.stubEnv('AI_VENDOR_API_KEY__VertexSourceProbeA', key);
        expect(VertexKeySourceOf('VertexSourceProbeA', key)).toBe('environment');
    });

    it('is another key when the text differs at all, even as the same JSON', () => {
        const key = JSON.stringify({ project: 'p1', keyFilePath: '/keys/sa.json' });
        vi.stubEnv('AI_VENDOR_API_KEY__VertexSourceProbeB', key);
        expect(VertexKeySourceOf('VertexSourceProbeB', JSON.stringify({ project: 'p1', keyFilePath: '/keys/sa.json' }, null, 1))).toBe('other');
        expect(VertexKeySourceOf('VertexSourceProbeB', JSON.stringify({ keyFilePath: '/keys/sa.json', project: 'p1' }))).toBe('other');
        expect(VertexKeySourceOf('VertexSourceProbeB', JSON.stringify({ project: 'p2', keyFilePath: '/keys/sa.json' }))).toBe('other');
    });

    it('is another key when it is a different driver\'s environment key', () => {
        const key = JSON.stringify({ project: 'p1', keyFilePath: '/keys/sa.json' });
        vi.stubEnv('AI_VENDOR_API_KEY__VertexSourceProbeC', key);
        expect(VertexKeySourceOf('VertexSourceProbeD', key)).toBe('other');
    });

    it('is another key when the driver has no environment key', () => {
        expect(VertexKeySourceOf('VertexSourceProbeNone', JSON.stringify({ project: 'p1' }))).toBe('other');
        expect(VertexKeySourceOf('VertexSourceProbeNone', '')).toBe('other');
    });
});

describe('AssertVertexKeyFileAllowed', () => {
    const SECRET_PATH = '/srv/secret-location/vertex-sa.json';

    it('allows a key without a key file, from anywhere', () => {
        const creds = ParseVertexAICredentials(JSON.stringify({ project: 'p1' }));
        expect(() => AssertVertexKeyFileAllowed(creds, 'other')).not.toThrow();
        expect(() => AssertVertexKeyFileAllowed(creds, 'environment')).not.toThrow();
    });

    it('allows a key file in the environment key', () => {
        const creds = ParseVertexAICredentials(JSON.stringify({ project: 'p1', keyFilePath: SECRET_PATH }));
        expect(() => AssertVertexKeyFileAllowed(creds, 'environment')).not.toThrow();
    });

    it('refuses a key file in any other key, naming the environment key and quoting no path', () => {
        const creds = ParseVertexAICredentials(JSON.stringify({ project: 'p1', keyFilePath: SECRET_PATH }));
        let thrown: unknown = null;
        try {
            AssertVertexKeyFileAllowed(creds, 'other');
        } catch (error: unknown) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(VertexCredentialsError);
        const error = thrown as VertexCredentialsError;
        expect(error.Problem).toBe('key-file-not-allowed');
        expect(error.message).toContain('AI_VENDOR_API_KEY__');
        expect(error.message).not.toContain('secret-location');
        expect(error.message).not.toContain('vertex-sa.json');
    });
});
