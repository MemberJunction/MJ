import { describe, it, expect, vi } from 'vitest';

type ResponseMiddleware = (response: unknown) => void;
const captured: { middleware?: ResponseMiddleware } = {};

vi.mock('graphql-request', () => ({
    gql: (strings: TemplateStringsArray) => strings.join(''),
    GraphQLClient: class {
        constructor(_url: string, options?: { responseMiddleware?: ResponseMiddleware }) {
            captured.middleware = options?.responseMiddleware;
        }
        public setHeader(): void {}
    },
}));

import { GraphQLDataProvider, RegisterResponseHeaderObserver } from '../graphQLDataProvider';

/** Exposes the protected client factory. */
class TestProvider extends GraphQLDataProvider {
    public BuildClient(): void {
        this.CreateNewGraphQLClient('http://localhost/graphql', 'token', 'session-1', '');
    }
}

describe('RegisterResponseHeaderObserver', () => {
    it('calls the observer with the headers of each GraphQL response until unsubscribed', () => {
        new TestProvider().BuildClient();
        const seen: Array<string | null> = [];
        const unsubscribe = RegisterResponseHeaderObserver((headers) => seen.push(headers.get('x-mj-diagnostic-trigger')));

        captured.middleware?.({ headers: new Headers({ 'X-MJ-Diagnostic-Trigger': 'session-42' }) });
        unsubscribe();
        captured.middleware?.({ headers: new Headers({ 'X-MJ-Diagnostic-Trigger': 'session-43' }) });

        expect(seen).toEqual(['session-42']);
    });

    it('reads the headers of a failed response carried on the error', () => {
        new TestProvider().BuildClient();
        const seen: Array<string | null> = [];
        const unsubscribe = RegisterResponseHeaderObserver((headers) => seen.push(headers.get('x-mj-diagnostic-trigger')));

        const clientError = Object.assign(new Error('GraphQL error'), {
            response: { headers: new Headers({ 'X-MJ-Diagnostic-Trigger': 'session-44' }) },
        });
        captured.middleware?.(clientError);
        unsubscribe();

        expect(seen).toEqual(['session-44']);
    });
});
