import { describe, it, expect } from 'vitest';
import { ClientError } from 'graphql-request';
import { SanitizeGraphQLError, ToSafeGraphQLError, SafeGraphQLError } from '../sanitizeGraphQLError';

/**
 * `GraphQLDataProvider.ExecuteGQL()` logs the error thrown by the underlying
 * graphql-request client. That error carries the originating request — variables
 * included — in three places at once: `request.variables`, the serialised copy
 * inside `message`, and the copy of `message` embedded in `stack`.
 *
 * These tests pin all three, and pin that the sanitiser closes all three without
 * costing the diagnostics the log exists to provide.
 */

/** A credential value standing in for anything secret a mutation might carry. */
const SECRET = 'sk-live-THIS-MUST-NEVER-REACH-A-LOG';

const QUERY = 'mutation Create($input: CreateInput!) { create(input: $input) { ID } }';

/** Builds the error `graphql-request` actually throws on a failed request. */
function buildClientError(code = 'TIMEOUT'): ClientError {
    return new ClientError(
        {
            errors: [{ message: 'Request timed out', extensions: { code } }],
            status: 500,
            headers: undefined as never,
        } as never,
        {
            query: QUERY,
            variables: { input: { Name: 'acme', CredentialValues: SECRET } },
        } as never,
    );
}

describe('the leak, characterised', () => {
    it('the secret is present in request.variables', () => {
        const err = buildClientError();
        expect(JSON.stringify(err.request.variables)).toContain(SECRET);
    });

    it('the secret is ALSO baked into the error message at construction', () => {
        // ClientError's constructor does JSON.stringify({response, request}) into `message`.
        expect(buildClientError().message).toContain(SECRET);
    });

    it('the secret is ALSO embedded in the stack, because V8 prepends the message', () => {
        expect(buildClientError().stack).toContain(SECRET);
    });

    it('stringifying the error re-emits it — the path LogError() takes', () => {
        // LogError does String(message) internally.
        expect(String(buildClientError())).toContain(SECRET);
    });

    it('a shallow-spread redaction of request.variables does NOT close it', () => {
        const err = buildClientError();
        const spreadRedacted = { ...err, request: { ...err.request, variables: '[REDACTED]' } };

        // The variables field is clean...
        expect(spreadRedacted.request.variables).toBe('[REDACTED]');
        // ...but `message` and `stack` are non-enumerable, so they are not copied at all —
        // the log loses its diagnostics, and the secret survives on the rethrown error.
        expect(Object.keys(spreadRedacted).sort()).toEqual(['request', 'response']);
        expect(err.message).toContain(SECRET);
    });
});

describe('SanitizeGraphQLError', () => {
    describe('closes every leak path', () => {
        it('emits no variables', () => {
            const safe = SanitizeGraphQLError(buildClientError());
            expect(safe.variables).toBe('[REDACTED]');
            expect(JSON.stringify(safe)).not.toContain(SECRET);
        });

        it('re-derives the message rather than reusing the upstream one', () => {
            const safe = SanitizeGraphQLError(buildClientError());
            expect(safe.message).toBe('Request timed out');
            expect(safe.message).not.toContain(SECRET);
        });

        it('strips the stack header line that embeds the message', () => {
            const safe = SanitizeGraphQLError(buildClientError());
            expect(safe.stackFrames).toBeDefined();
            expect(safe.stackFrames).not.toContain(SECRET);
            // Frames are retained — this is the diagnostic value the spread threw away.
            expect(safe.stackFrames).toContain('at ');
        });

        it('survives serialisation to a log sink without leaking', () => {
            // The realistic failure mode: a logger JSON-stringifies whatever it is given.
            expect(JSON.stringify(SanitizeGraphQLError(buildClientError()))).not.toContain(SECRET);
        });
    });

    describe('preserves the diagnostics the log exists for', () => {
        it('keeps status, GraphQL errors and the error code', () => {
            const safe = SanitizeGraphQLError(buildClientError('JWT_EXPIRED'));
            expect(safe.status).toBe(500);
            expect(safe.errors?.[0]?.message).toBe('Request timed out');
            expect(safe.code).toBe('JWT_EXPIRED');
        });

        it('keeps the query text, which is static and carries no values', () => {
            expect(SanitizeGraphQLError(buildClientError()).query).toBe(QUERY);
        });

        it('keeps message and stack, which the shallow spread silently dropped', () => {
            const safe = SanitizeGraphQLError(buildClientError());
            expect(safe.message).toBeTruthy();
            expect(safe.stackFrames).toBeTruthy();
        });

        it('falls back to the HTTP status when there are no GraphQL errors', () => {
            const safe = SanitizeGraphQLError({ response: { status: 502, errors: undefined } });
            expect(safe.message).toBe('GraphQL Error (Code: 502)');
        });
    });

    describe('keeps the redaction debuggable — shape, not data', () => {
        it('reports the variable structure with values replaced by types', () => {
            const safe = SanitizeGraphQLError(buildClientError());
            expect(safe.variableShape).toEqual({
                input: { Name: 'string', CredentialValues: 'string' },
            });
        });

        it('distinguishes an empty field from an absent one — the usual question', () => {
            const err = new ClientError(
                { errors: [{ message: 'bad' }], status: 400, headers: undefined as never } as never,
                { query: QUERY, variables: { input: { Name: '', Age: 0, Note: null } } } as never,
            );
            expect(SanitizeGraphQLError(err).variableShape).toEqual({
                input: { Name: 'string(empty)', Age: 'number', Note: 'null' },
            });
        });

        it('never reproduces a value at any depth', () => {
            const err = new ClientError(
                { errors: [{ message: 'bad' }], status: 400, headers: undefined as never } as never,
                { query: QUERY, variables: { a: { b: { c: { d: SECRET } } } } } as never,
            );
            expect(JSON.stringify(SanitizeGraphQLError(err).variableShape)).not.toContain(SECRET);
        });

        it('summarises arrays by length and element type, not contents', () => {
            const err = new ClientError(
                { errors: [{ message: 'bad' }], status: 400, headers: undefined as never } as never,
                { query: QUERY, variables: { keys: [SECRET, SECRET] } } as never,
            );
            const shape = SanitizeGraphQLError(err).variableShape as { keys: string };
            expect(shape.keys).toBe('array(2 × string)');
            expect(JSON.stringify(shape)).not.toContain(SECRET);
        });

        it('omits the shape entirely when the request carried no variables', () => {
            const err = new ClientError(
                { errors: [{ message: 'bad' }], status: 400, headers: undefined as never } as never,
                { query: QUERY } as never,
            );
            expect(SanitizeGraphQLError(err).variableShape).toBeUndefined();
        });
    });

    describe('the rethrown error — closing the class, not one log line', () => {
        /**
         * Sanitising the log statement inside ExecuteGQL leaves the rethrown error
         * loaded: ~178 call sites catch it, and `LogError(e)` — which stringifies —
         * appears 19 times in this package alone. These pin that what propagates is
         * safe no matter what a caller does with it.
         */
        it('carries the secret in NO field, however it is inspected', () => {
            const safe = ToSafeGraphQLError(buildClientError());

            expect(safe.message).not.toContain(SECRET);
            expect(safe.stack).not.toContain(SECRET);
            expect(String(safe)).not.toContain(SECRET);
            expect(JSON.stringify(safe)).not.toContain(SECRET);
        });

        it('survives the exact call that was still leaking: LogError-style String()', () => {
            // LogError does String(message) internally — the path that re-emitted the
            // payload from every caller that caught the rethrown error.
            expect(String(ToSafeGraphQLError(buildClientError()))).not.toContain(SECRET);
        });

        it('is still an Error, so existing catch/rethrow handling is unaffected', () => {
            const safe = ToSafeGraphQLError(buildClientError());
            expect(safe).toBeInstanceOf(Error);
            expect(safe).toBeInstanceOf(SafeGraphQLError);
        });

        it('preserves the name verbatim, so code branching on it keeps working', () => {
            // Note: ClientError never assigns `this.name`, so it inherits
            // Error.prototype.name — the upstream value really is 'Error'. The wrapper
            // copies whatever the original had rather than inventing a new name.
            const original = buildClientError();
            expect(ToSafeGraphQLError(original).name).toBe(original.name);
        });

        it('preserves response.errors and extensions.code — all any consumer reads', () => {
            // Verified against every downstream consumer: workspace-initializer,
            // Bootstrap initialization.service, and the DevTools graphql-console all
            // read response.errors and extensions.code, and nothing else.
            const safe = ToSafeGraphQLError(buildClientError('JWT_EXPIRED'));
            expect(safe.response?.errors?.[0]?.message).toBe('Request timed out');
            expect(safe.response?.errors?.[0]?.extensions?.['code']).toBe('JWT_EXPIRED');
            expect(safe.response?.status).toBe(500);
            expect(safe.code).toBe('JWT_EXPIRED');
        });

        it('preserves the query, which binds values but contains none', () => {
            expect(ToSafeGraphQLError(buildClientError()).request?.query).toBe(QUERY);
        });

        it('drops request.variables entirely', () => {
            const safe = ToSafeGraphQLError(buildClientError());
            expect((safe.request as Record<string, unknown>).variables).toBeUndefined();
        });

        it('drops response.data — a partial success could return decrypted values', () => {
            const err = new ClientError(
                {
                    data: { credential: { Values: SECRET } },
                    errors: [{ message: 'partial failure' }],
                    status: 200,
                    headers: undefined as never,
                } as never,
                { query: QUERY, variables: {} } as never,
            );
            const safe = ToSafeGraphQLError(err);
            expect((safe.response as Record<string, unknown>).data).toBeUndefined();
            expect(JSON.stringify(safe)).not.toContain(SECRET);
        });

        it('keeps the stack frames, so the error is still traceable', () => {
            const safe = ToSafeGraphQLError(buildClientError());
            expect(safe.stack).toContain('at ');
            // Header rebuilt from the sanitised message, not V8's original.
            expect(safe.stack).toContain('Request timed out');
            expect(safe.stack?.split('\n')[0]).not.toContain(SECRET);
        });

        it('retains the variable shape for debugging', () => {
            expect(ToSafeGraphQLError(buildClientError()).variableShape).toEqual({
                input: { Name: 'string', CredentialValues: 'string' },
            });
        });

        it('is idempotent — re-wrapping does not re-derive or degrade', () => {
            const once = ToSafeGraphQLError(buildClientError());
            expect(ToSafeGraphQLError(once)).toBe(once);
        });

        it('does not mutate the original, which the catch block still inspects', () => {
            const err = buildClientError('JWT_EXPIRED');
            ToSafeGraphQLError(err);
            expect(err.response.errors?.[0]?.extensions?.code).toBe('JWT_EXPIRED');
            expect(err.message).toContain(SECRET);
        });
    });

    describe('the developer opt-in', () => {
        it('withholds values by default — the flag must be explicit', () => {
            expect(SanitizeGraphQLError(buildClientError()).variables).toBe('[REDACTED]');
        });

        it('emits values verbatim when explicitly opted in', () => {
            const safe = SanitizeGraphQLError(buildClientError(), true);
            expect(safe.variables).toEqual({ input: { Name: 'acme', CredentialValues: SECRET } });
        });

        it('still sanitises message and stack even when opted in', () => {
            // The opt-in returns the variables a developer asked for; it does not
            // reinstate the unbounded upstream message/stack copies.
            const safe = SanitizeGraphQLError(buildClientError(), true);
            expect(safe.message).toBe('Request timed out');
            expect(safe.stackFrames).not.toContain(SECRET);
        });

        it('still reports shape when opted in, so the two never disagree', () => {
            const safe = SanitizeGraphQLError(buildClientError(), true);
            expect(safe.variableShape).toEqual({ input: { Name: 'string', CredentialValues: 'string' } });
        });
    });

    describe('leaves the rest of the system untouched', () => {
        it('does not mutate the error, so JWT-expiry detection still works', () => {
            const err = buildClientError('JWT_EXPIRED');
            SanitizeGraphQLError(err);

            // ExecuteGQL reads this exact path after logging, then rethrows `e` itself.
            expect(err.response.errors?.[0]?.extensions?.code).toBe('JWT_EXPIRED');
            expect(err.request.variables).toEqual({ input: { Name: 'acme', CredentialValues: SECRET } });
            expect(err.message).toContain(SECRET);
        });

        it('withholds contents of non-object throws rather than stringifying them', () => {
            // An arbitrary thrown value may itself be a payload.
            const safe = SanitizeGraphQLError(SECRET);
            expect(JSON.stringify(safe)).not.toContain(SECRET);
            expect(safe.message).toBe('Non-object value thrown; contents withheld');
        });

        it('handles a malformed error without throwing', () => {
            expect(() => SanitizeGraphQLError({})).not.toThrow();
            expect(() => SanitizeGraphQLError(null)).not.toThrow();
            expect(SanitizeGraphQLError(null).variables).toBe('[REDACTED]');
        });
    });
});
