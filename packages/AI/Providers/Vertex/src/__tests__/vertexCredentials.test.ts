import { afterEach, describe, it, expect, vi } from 'vitest';
import {
    AssertVertexKeyFileAllowed,
    AssertVertexLiveHostAllowed,
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

/** The problem a key's Live fields raise, and the message, which must quote none of the value. */
function liveFieldProblem(fields: Record<string, unknown>): { Problem: string | null; Message: string } {
    try {
        ParseVertexAICredentials(JSON.stringify({ project: 'p1', ...fields }));
        return { Problem: null, Message: '' };
    } catch (error: unknown) {
        return error instanceof VertexCredentialsError ? { Problem: error.Problem, Message: error.message } : { Problem: 'not-a-credentials-error', Message: String(error) };
    }
}

describe('the Live socket fields: liveHost and liveApiVersion', () => {
    const read = (fields: Record<string, unknown>) => ParseVertexAICredentials(JSON.stringify({ project: 'p1', ...fields }));

    it('takes a host name, with or without a port, bare or as https:// or wss:// with nothing after the host', () => {
        const cases: Array<[string, string]> = [
            ['us-central1-aiplatform.googleapis.com', 'us-central1-aiplatform.googleapis.com'],
            ['Live.Example.COM', 'live.example.com'],
            ['wss://live.example.com', 'live.example.com'],
            ['https://live.example.com/', 'live.example.com'],
            ['live.example.com:8443', 'live.example.com:8443'],
            [' WSS://live.example.com:443 ', 'live.example.com:443'],
            ['localhost', 'localhost'],
        ];
        for (const [given, kept] of cases) {
            expect(read({ liveHost: given }).liveHost, given).toBe(kept);
        }
    });

    it('leaves the fields unset when they are absent, null or blank', () => {
        for (const value of [undefined, null, '', '   ']) {
            const creds = read({ liveHost: value, liveApiVersion: value });
            expect(creds.liveHost).toBeUndefined();
            expect(creds.liveApiVersion).toBeUndefined();
        }
    });

    it('refuses any other liveHost with invalid-live-host, and the message quotes none of it', () => {
        const bad: unknown[] = [
            'http://live.example.com',
            'ws://live.example.com',
            'ftp://live.example.com',
            'wss://live.example.com/ws',
            'live.example.com/x',
            'live.example.com?key=leak',
            'live.example.com#frag',
            'user@live.example.com',
            'wss://user:secretpw@live.example.com',
            '[::1]',
            'live..example.com',
            '-live.example.com',
            'live-.example.com',
            'live.example.com.',
            'live.example.com:0',
            'live.example.com:70000',
            'live.example.com:',
            'live example.com',
            `${'a'.repeat(64)}.example.com`,
            42,
            true,
            {},
        ];
        for (const value of bad) {
            const { Problem, Message } = liveFieldProblem({ liveHost: value });
            expect(Problem, String(value)).toBe('invalid-live-host');
            for (const fragment of ['secretpw', 'leak', 'frag', 'example.com', 'aaaa']) {
                expect(Message, String(value)).not.toContain(fragment);
            }
        }
    });

    it('takes an API version such as v1, v1beta1 or v1alpha, lower-cased', () => {
        for (const [given, kept] of [['v1', 'v1'], ['v1beta1', 'v1beta1'], ['V1Alpha', 'v1alpha'], [' v2 ', 'v2']]) {
            expect(read({ liveApiVersion: given }).liveApiVersion, given).toBe(kept);
        }
    });

    it('refuses any other liveApiVersion with invalid-live-api-version, quoting none of it', () => {
        for (const value of ['1', 'v1/../x', 'v1beta1/ws', 'version1', 'v', 'vbeta1', 'v1-beta1', 'v1 beta', 7, false]) {
            const { Problem, Message } = liveFieldProblem({ liveApiVersion: value });
            expect(Problem, String(value)).toBe('invalid-live-api-version');
            expect(Message).not.toContain('../x');
        }
    });
});

describe('AssertVertexLiveHostAllowed', () => {
    it('allows a key without a liveHost from anywhere, and a liveHost only in the environment key', () => {
        const plain = ParseVertexAICredentials(JSON.stringify({ project: 'p1', liveApiVersion: 'v1beta1' }));
        expect(() => AssertVertexLiveHostAllowed(plain, 'other')).not.toThrow();
        expect(() => AssertVertexLiveHostAllowed(plain, 'environment')).not.toThrow();
        const withHost = ParseVertexAICredentials(JSON.stringify({ project: 'p1', liveHost: 'live.internal.example.com' }));
        expect(() => AssertVertexLiveHostAllowed(withHost, 'environment')).not.toThrow();
    });

    it('refuses a liveHost in any other key (a token minted from the platform credential would go there), quoting no host', () => {
        const creds = ParseVertexAICredentials(JSON.stringify({ project: 'p1', liveHost: 'live.internal.example.com' }));
        let thrown: unknown = null;
        try {
            AssertVertexLiveHostAllowed(creds, 'other');
        } catch (error: unknown) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(VertexCredentialsError);
        const error = thrown as VertexCredentialsError;
        expect(error.Problem).toBe('live-host-not-allowed');
        expect(error.message).toContain('AI_VENDOR_API_KEY__');
        expect(error.message).not.toContain('internal.example.com');
    });
});

describe('a Google Cloud API key (apiKey)', () => {
    /** A stand-in key in the shape Google issues (AIza…, 39 characters): never a real one. */
    const API_KEY = 'AIzaStandInKeyNotReal0123456789abcdefgh';

    it('is a credential on its own: no project needed, and no location, since @google/genai sends an API key to the global endpoint', () => {
        const creds = ParseVertexAICredentials(JSON.stringify({ apiKey: API_KEY }));
        expect(creds.apiKey).toBe(API_KEY);
        expect(creds.project).toBe('');
        expect(creds.location).toBeUndefined();
    });

    it('takes the Live fields beside it, and trims spaces around the key', () => {
        const creds = ParseVertexAICredentials(JSON.stringify({ apiKey: ` ${API_KEY} `, liveApiVersion: 'v1beta1', liveHost: 'live.example.test' }));
        expect(creds.apiKey).toBe(API_KEY);
        expect(creds.liveApiVersion).toBe('v1beta1');
        expect(creds.liveHost).toBe('live.example.test');
    });

    it('leaves a blank apiKey out, so the key is read as any other shape', () => {
        expect(ParseVertexAICredentials(JSON.stringify({ apiKey: '  ', project: 'p1' })).apiKey).toBeUndefined();
        expect(liveFieldProblem({ apiKey: '' }).Problem).toBeNull(); // the helper adds a project
        expect(problemOf(JSON.stringify({ apiKey: '' }))).toBe('missing-project');
    });

    it('refuses an apiKey beside another credential (key file, service account, serviceAccountJson), quoting neither', () => {
        const others: Array<Record<string, unknown>> = [
            { keyFilePath: '/srv/secret-location/sa.json' },
            { type: 'service_account', private_key: STAND_IN_KEY, client_email: 'sa@x.iam.gserviceaccount.com' },
            { private_key: STAND_IN_KEY },
            { client_email: 'sa@x.iam.gserviceaccount.com' },
            { serviceAccountJson: JSON.stringify({ project_id: 'sa-project', private_key: STAND_IN_KEY }) },
        ];
        for (const other of others) {
            let thrown: unknown = null;
            try {
                ParseVertexAICredentials(JSON.stringify({ apiKey: API_KEY, ...other }));
            } catch (error: unknown) {
                thrown = error;
            }
            expect(thrown, JSON.stringify(Object.keys(other))).toBeInstanceOf(VertexCredentialsError);
            const error = thrown as VertexCredentialsError;
            expect(error.Problem).toBe('api-key-with-credentials');
            for (const secret of [API_KEY, 'secret-location', 'stand-in', 'sa@x']) {
                expect(error.message).not.toContain(secret);
            }
        }
    });

    it('with a project takes the regional route: the project, and the location as given or us-central1', () => {
        expect(ParseVertexAICredentials(JSON.stringify({ apiKey: API_KEY, project: 'p1' }))).toEqual({ project: 'p1', location: 'us-central1', apiKey: API_KEY });
        expect(ParseVertexAICredentials(JSON.stringify({ apiKey: API_KEY, project: 'p1', location: 'eu' }))).toEqual({ project: 'p1', location: 'eu', apiKey: API_KEY });
        // project_id wins over project, as in every other shape.
        expect(ParseVertexAICredentials(JSON.stringify({ apiKey: API_KEY, project: 'p1', project_id: 'p2' })).project).toBe('p2');
        const withLive = ParseVertexAICredentials(JSON.stringify({ apiKey: API_KEY, project: 'p1', liveApiVersion: 'V1BETA1', liveHost: 'wss://live.example.test' }));
        expect(withLive).toEqual({ project: 'p1', location: 'us-central1', apiKey: API_KEY, liveApiVersion: 'v1beta1', liveHost: 'live.example.test' });
    });

    it('refuses a location without a project (missing-project), quoting no key: the global route would ignore it', () => {
        const json = JSON.stringify({ apiKey: API_KEY, location: 'us-central1' });
        expect(problemOf(json)).toBe('missing-project');
        expect(() => ParseVertexAICredentials(json)).toThrow(/regional route needs "project"/);
        expect(() => ParseVertexAICredentials(json)).not.toThrow(API_KEY);
    });

    it('keeps nothing else from the key beside the apiKey', () => {
        const creds = ParseVertexAICredentials(JSON.stringify({ apiKey: API_KEY, project: 'p1', client_id: 'stray', note: 'stray' }));
        expect(Object.keys(creds).sort()).toEqual(['apiKey', 'location', 'project']);
    });

    it('refuses an apiKey that is not one: not text, or with spaces or control characters inside, quoting none of it', () => {
        for (const value of [42, true, {}, ['k'], 'AIza with blanks', 'AIza\r\nX-Injected: 1', `AIza${'x'.repeat(1100)}`]) {
            const json = JSON.stringify({ apiKey: value });
            expect(problemOf(json), String(value).slice(0, 20)).toBe('invalid-api-key');
            try {
                ParseVertexAICredentials(json);
            } catch (error: unknown) {
                expect(String(error)).not.toContain('Injected');
                expect(String(error)).not.toContain('blanks');
                expect(String(error)).not.toContain('xxxx');
            }
        }
    });
});
