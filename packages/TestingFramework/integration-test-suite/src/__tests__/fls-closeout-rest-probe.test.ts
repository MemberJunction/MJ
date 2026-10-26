/**
 * IT134's REST checks skip when MJAPI has REST turned off. With GraphQL at the root path, a REST
 * URL that nothing mounted falls through to Apollo, which answers 400 rather than 404; that must
 * be read as "REST is not enabled" at once, not polled for two minutes as a key not yet honoured.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ClassifyRestProbe, RestBaseUrl } from '../checks/fls-closeout-client.checks';

/** The headers MJAPI's GraphQL route stamps on every response it serves. */
const graphQLHeaders = (): Headers => new Headers({ 'X-MJ-Cache-Seq': '7', 'X-MJ-Server-ID': 'srv-1' });

describe('ClassifyRestProbe', () => {
    it('is ready when REST answers 200', () => {
        expect(ClassifyRestProbe(200, new Headers())).toBe('ready');
    });

    it('is not enabled when nothing answers the REST path', () => {
        expect(ClassifyRestProbe(404, new Headers())).toBe('not-enabled');
    });

    it('REGRESSION: is not enabled when the GraphQL endpoint answered the REST path', () => {
        expect(ClassifyRestProbe(400, graphQLHeaders())).toBe('not-enabled');
    });

    it('retries a refusal from REST itself, as a freshly minted key may not be honoured yet', () => {
        expect(ClassifyRestProbe(401, new Headers())).toBe('retry');
        expect(ClassifyRestProbe(400, new Headers())).toBe('retry');
    });
});

describe('RestBaseUrl', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    function stubClient(graphQLUrl: string): void {
        vi.stubEnv('MJ_API_KEY', 'test-key');
        vi.stubEnv('MJAPI_URL', graphQLUrl);
        vi.stubEnv('MJAPI_REST_URL', '');
    }

    it('is the GraphQL origin plus /api/v1', () => {
        stubClient('http://mjapi.test:4100/');
        vi.stubEnv('MJAPI_BASE_PATH', '');
        expect(RestBaseUrl()).toBe('http://mjapi.test:4100/api/v1');
    });

    // MJAPI mounts REST at the origin-absolute /api/v1 even when every other route sits under
    // MJAPI_BASE_PATH, so prefixing the base path would build /api/api/v1.
    it('ignores MJAPI_BASE_PATH, because REST is mounted at the origin', () => {
        stubClient('http://mjapi.test:4100/api/graphql');
        vi.stubEnv('MJAPI_BASE_PATH', '/api');
        expect(RestBaseUrl()).toBe('http://mjapi.test:4100/api/v1');
    });

    it('uses MJAPI_REST_URL when it is set, without a trailing slash', () => {
        stubClient('http://mjapi.test:4100/');
        vi.stubEnv('MJAPI_REST_URL', 'https://rest.example.test/custom/v1/');
        expect(RestBaseUrl()).toBe('https://rest.example.test/custom/v1');
    });
});
