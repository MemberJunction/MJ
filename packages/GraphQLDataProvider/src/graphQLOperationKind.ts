/**
 * Whether a GraphQL document's operation is a `mutation`.
 *
 * Used by the client transport to decide when a request may have written server-side, so the
 * provider's RunView dedup-linger entries must be dropped (see `ProviderBase.InvalidateRunViewDedupCache`).
 * A lexical check rather than a full `parse()`: it runs on every request, and MJ's documents are
 * single-operation. Comments are ignored; leading fragment definitions are skipped because the
 * first operation keyword wins. An anonymous `{ ... }` shorthand is a query.
 *
 * @param document - the GraphQL document text
 * @returns true when the (first) operation in the document is a mutation
 */
export function IsGraphQLMutation(document: string | null | undefined): boolean {
    if (!document) {
        return false;
    }
    const withoutComments = document.replace(/#[^\n\r]*/g, '');
    const trimmed = withoutComments.trimStart();
    if (trimmed.startsWith('{')) {
        return false;
    }
    const match = /\b(query|mutation|subscription)\b(?=\s*[\w$({@])/.exec(withoutComments);
    return match?.[1] === 'mutation';
}
