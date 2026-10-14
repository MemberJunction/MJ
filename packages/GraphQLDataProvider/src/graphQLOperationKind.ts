/**
 * Whether a GraphQL document's operation is a `mutation`.
 *
 * Used by the client transport to decide when a request may have written server-side, so the
 * provider's RunView dedup-linger entries must be dropped (see `ProviderBase.InvalidateRunViewDedupCache`).
 * A small lexical scan rather than a full `parse()`: it runs on every request. Only TOP-LEVEL tokens
 * count — everything inside a selection set, argument list or list value is skipped, as are comments
 * and string literals — so a field named `query` inside a leading fragment, or a keyword inside a
 * string argument, can never be mistaken for the operation keyword. Fragment definitions are
 * skipped; the first operation definition decides. An anonymous `{ ... }` shorthand is a query.
 *
 * @param document - the GraphQL document text
 * @returns true when the (first) operation in the document is a mutation
 */
export function IsGraphQLMutation(document: string | null | undefined): boolean {
    return FirstGraphQLOperationKind(document) === 'mutation';
}

/** The kind of a GraphQL operation definition. */
export type GraphQLOperationKind = 'query' | 'mutation' | 'subscription';

/**
 * The kind of the first operation definition in a GraphQL document, read from top-level tokens only.
 *
 * @param document - the GraphQL document text
 * @returns the first operation's kind, or null when the document holds no operation
 */
export function FirstGraphQLOperationKind(document: string | null | undefined): GraphQLOperationKind | null {
    if (!document) {
        return null;
    }
    let depth = 0;
    let inFragment = false;
    let i = 0;
    const n = document.length;
    while (i < n) {
        const c = document[i];
        if (c === '#') {
            while (i < n && document[i] !== '\n' && document[i] !== '\r') i++;
            continue;
        }
        if (c === '"') {
            i = skipString(document, i);
            continue;
        }
        if (c === '{' || c === '(' || c === '[') {
            if (c === '{' && depth === 0 && !inFragment) {
                return 'query'; // anonymous shorthand operation
            }
            depth++;
            i++;
            continue;
        }
        if (c === '}' || c === ')' || c === ']') {
            depth = Math.max(0, depth - 1);
            if (c === '}' && depth === 0) {
                inFragment = false; // a top-level selection set closed: its definition is complete
            }
            i++;
            continue;
        }
        if (depth === 0 && isNameStart(c)) {
            const start = i;
            while (i < n && isNameContinue(document[i])) i++;
            const word = document.slice(start, i);
            if (!inFragment) {
                if (word === 'query' || word === 'mutation' || word === 'subscription') {
                    return word;
                }
                if (word === 'fragment') {
                    inFragment = true;
                }
            }
            continue;
        }
        i++;
    }
    return null;
}

function skipString(document: string, start: number): number {
    const n = document.length;
    if (document.startsWith('"""', start)) {
        let i = start + 3;
        while (i < n) {
            if (document[i] === '\\' && document.startsWith('"""', i + 1)) {
                i += 4;
                continue;
            }
            if (document.startsWith('"""', i)) {
                return i + 3;
            }
            i++;
        }
        return n;
    }
    let i = start + 1;
    while (i < n) {
        const c = document[i];
        if (c === '\\') {
            i += 2;
            continue;
        }
        if (c === '"' || c === '\n' || c === '\r') {
            return i + 1;
        }
        i++;
    }
    return n;
}

function isNameStart(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isNameContinue(c: string): boolean {
    return isNameStart(c) || (c >= '0' && c <= '9');
}
