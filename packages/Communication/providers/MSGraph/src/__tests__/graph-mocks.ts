/**
 * Shared scaffolding for the MS Graph provider's unit tests.
 *
 * Not a test file — no `.test.` in the name, so the runner does not collect it.
 *
 * WHY A FACTORY RATHER THAN READY-MADE OBJECTS. `vi.mock` is hoisted above every import, so a mock
 * factory cannot close over a normal module-level binding. Each test file calls these from inside
 * `vi.hoisted(...)`, which runs in that same pre-import phase, and gets its OWN recorder — shared
 * state between files would leak assertions across suites.
 */
import { vi, type Mock } from 'vitest';

/** One request the provider made, as the chain recorded it. */
export type GraphCall = {
    path: string;
    query?: Record<string, string>;
    filter?: string;
    orderby?: string;
    top?: number;
    headers: Record<string, string>;
};

/**
 * Spelled out rather than inferred. This package compiles its tests, and an inferred return here
 * names a `@vitest/spy` path inside `node_modules/.pnpm/...`, which `tsc` rejects as non-portable
 * (TS2742) because that path is not stable across installs.
 */
export type GraphApiMock = {
    calls: GraphCall[];
    setResponse: (response: unknown, throws?: Error | null) => void;
    mockGraphApi: Mock;
};

/**
 * A stand-in for the Graph client's fluent request builder that records what was ASKED, not merely
 * what the fake chose to return.
 *
 * Every builder method returns the same `chain`, and any method NOT implemented here returns
 * `undefined` so the next link in the chain throws. That is deliberate: adding a link in the provider
 * — a new `.header()`, a `.select()` — must fail loudly here rather than vanish from the query while
 * the tests stay green.
 */
export function createGraphApiMock(): GraphApiMock {
    const calls: GraphCall[] = [];
    const state: { response: unknown; throws: Error | null } = { response: { value: [] }, throws: null };

    const setResponse = (response: unknown, throws: Error | null = null) => {
        state.response = response;
        state.throws = throws;
    };

    const mockGraphApi = vi.fn().mockImplementation((path: string) => {
        const call: GraphCall = { path, headers: {} };
        calls.push(call);
        const chain = {
            query(q: Record<string, string>) {
                call.query = q;
                return chain;
            },
            filter(f: string) {
                call.filter = f;
                return chain;
            },
            orderby(o: string) {
                call.orderby = o;
                return chain;
            },
            header(name: string, value: string) {
                call.headers[name] = value;
                return chain;
            },
            top(n: number) {
                call.top = n;
                return chain;
            },
            get: async () => {
                if (state.throws) throw state.throws;
                return state.response;
            },
            post: async () => ({}),
        };
        return chain;
    });

    return { calls, setResponse, mockGraphApi };
}

/** The `@memberjunction/communication-types` surface these tests need, minus the real package. */
export function communicationTypesMock() {
    return {
        BaseCommunicationProvider: class {
            getSupportedOperations() {
                return [];
            }
        },
        resolveCredentialValue: (requestVal: string | undefined, envVal: string | undefined, disableFallback: boolean) => {
            if (requestVal) return requestVal;
            if (!disableFallback && envVal) return envVal;
            return undefined;
        },
        validateRequiredCredentials: (creds: Record<string, unknown>, required: string[], provider: string) => {
            for (const key of required) {
                if (!creds[key]) throw new Error(`${provider}: Missing required credential: ${key}`);
            }
        },
    };
}

/** The env values the provider reads at construction. */
export const GRAPH_TEST_ENV: Record<string, string> = {
    AZURE_CLIENT_ID: 'env-client-id',
    AZURE_CLIENT_SECRET: 'env-client-secret',
    AZURE_TENANT_ID: 'env-tenant-id',
    AZURE_ACCOUNT_EMAIL: 'test@example.com',
    AZURE_ACCOUNT_ID: 'env-user-id',
    AZURE_AAD_ENDPOINT: 'https://login.microsoftonline.com',
    AZURE_GRAPH_ENDPOINT: 'https://graph.microsoft.com',
};

/** `env-var`'s chained shape, backed by {@link GRAPH_TEST_ENV}. */
export function envVarMock(overrides: Record<string, string> = {}) {
    const envMap = { ...GRAPH_TEST_ENV, ...overrides };
    return {
        default: { get: (key: string) => ({ default: (def: string) => ({ asString: () => envMap[key] ?? def }) }) },
    };
}
