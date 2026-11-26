/**
 * Source guard: resolvers and generic server modules must resolve the calling session user via
 * `GetUserFromPayload(userPayload)` (which returns the per-request stamped `userPayload.userRecord`),
 * NEVER by re-looking up the session user from `UserCache` by email or ID.
 *
 * Why this matters (PR #6958 Item 1):
 * Per-request session markers — impersonation sessions (`impersonationByUser`), `ImpersonationContext`,
 * `MagicLinkScope`, `WidgetGuestContext`, and `TenantContext` — are stamped on the cloned per-request
 * `UserInfo` (`userPayload.userRecord`). Re-resolving the session user directly from `UserCache` drops
 * those per-request markers and risks bypassing scope-limited, guest, or impersonation guards.
 *
 * Deliberate, documented exemptions (non-session-user lookups):
 * - `generic/ResolverBase.ts`: owns `GetUserFromPayload`, which prefers `userPayload.userRecord` and
 *   only falls back to `UserCache` when a caller omits `userRecord`.
 * - `resolvers/EntityPermissionResolver.ts`: `@RequireSystemUser` admin query that inspects an
 *   explicit target `UserEmail` argument (not the calling session user).
 * - `resolvers/UserImpersonationResolver.ts`: cross-checks a target user's cached roles against the
 *   live DB role list during `MJStartUserImpersonation` (not the calling session user).
 * - `generic/OrphanedConversationDetailReconciler.ts`: background reconciler indexing conversation
 *   owners from `UserCache.Instance.Users` (not an authenticated request handler).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const SRC_ROOT = path.resolve(__dirname, '..');
const SCANNED_DIRS = ['resolvers', 'generic'] as const;

/** Files explicitly allowed to touch `UserCache.Users` / `UserCache.UserByID` / `UserCache.UserByName`. */
const ALLOWED_USER_CACHE_LOOKUP_FILES = new Set<string>([
    'generic/ResolverBase.ts',
    'resolvers/EntityPermissionResolver.ts',
    'resolvers/UserImpersonationResolver.ts',
    'generic/OrphanedConversationDetailReconciler.ts',
]);

function walkTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walkTsFiles(fullPath));
        } else if (
            entry.isFile() &&
            entry.name.endsWith('.ts') &&
            !entry.name.endsWith('.test.ts') &&
            !entry.name.endsWith('.spec.ts') &&
            !entry.name.endsWith('.d.ts')
        ) {
            out.push(fullPath);
        }
    }
    return out;
}

/**
 * Returns true if the property-access chain starts with `UserCache` (either `UserCache.<member>` or
 * `UserCache.Instance.<member>`) and reads `.Users`, `.UserByID`, `.UserByName`, or `.UserByEmail`.
 * Deliberately permits `UserCache.Instance.GetSystemUser()` and `UserCache.Instance.Refresh(...)`.
 */
function forbiddenUserCacheMember(node: ts.PropertyAccessExpression): string | null {
    const member = node.name.text;
    if (member !== 'Users' && member !== 'UserByID' && member !== 'UserByName' && member !== 'UserByEmail') {
        return null;
    }

    const base = node.expression;
    if (ts.isIdentifier(base) && base.text === 'UserCache') {
        return `UserCache.${member}`;
    }
    if (
        ts.isPropertyAccessExpression(base) &&
        base.name.text === 'Instance' &&
        ts.isIdentifier(base.expression) &&
        base.expression.text === 'UserCache'
    ) {
        return `UserCache.Instance.${member}`;
    }
    return null;
}

describe('SessionUserResolutionCompliance — no direct UserCache session-user lookups in resolvers/ or generic/', () => {
    it('fails if any resolver or generic module reads UserCache.Users / UserByID / UserByName outside the explicit allowlist', () => {
        const violations: string[] = [];

        for (const relDir of SCANNED_DIRS) {
            const absDir = path.join(SRC_ROOT, relDir);
            for (const filePath of walkTsFiles(absDir)) {
                const relPath = path.relative(SRC_ROOT, filePath).replace(/\\/g, '/');
                if (ALLOWED_USER_CACHE_LOOKUP_FILES.has(relPath)) {
                    continue;
                }

                const content = fs.readFileSync(filePath, 'utf8');
                if (!content.includes('UserCache')) {
                    continue;
                }

                const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
                const visit = (node: ts.Node): void => {
                    if (ts.isPropertyAccessExpression(node)) {
                        const hit = forbiddenUserCacheMember(node);
                        if (hit) {
                            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
                            violations.push(
                                `${relPath}:${line + 1} uses ${hit} — use this.GetUserFromPayload(userPayload) instead so per-request session markers (impersonation, magic-link, guest, tenant) are preserved.`
                            );
                        }
                    }
                    ts.forEachChild(node, visit);
                };
                visit(sourceFile);
            }
        }

        expect(
            violations,
            `Found forbidden UserCache session-user lookup(s):\n${violations.join('\n')}`
        ).toEqual([]);
    });
});
