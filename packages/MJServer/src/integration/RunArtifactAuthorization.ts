/**
 * @fileoverview Who may read an integration run artifact.
 *
 * A security boundary, kept in its own module so the rule is stated once, testable on its own, and
 * not buried among a resolver's several thousand lines.
 */
import { IntegrationProgressReader } from '@memberjunction/integration-progress-artifacts';
import type { IntegrationRunManifest } from '@memberjunction/integration-progress-artifacts';

/**
 * Answers "may the calling user read this one connection?".
 *
 * Supplied by the resolver, which implements it as a `RunView` on `MJ: Company Integrations` under
 * the CALLER's context — so the data provider applies the same row-level security it applies to
 * every other user-context read, and no row coming back means unauthorized.
 */
export type CompanyIntegrationReadCheck = (companyIntegrationID: string) => Promise<boolean>;

/** The verdict, carrying the connection that blocked it so a denial can name it. */
export interface RunArtifactAuthorizationResult {
    Authorized: boolean;
    /** The first connection the caller could not read. Absent when the run has no identity at all. */
    DeniedCompanyIntegrationID?: string;
}

/**
 * Authorizes a caller for a run artifact against EVERY connection the run touched.
 *
 * ── The rule ───────────────────────────────────────────────────────────────────────────────────
 * A run is readable only if the caller is authorized for ALL of its connections. Not any — all.
 *
 * Most runs touch exactly one connection and the rule collapses to the obvious check. But a schema
 * update (RSU) run is a BATCH: the pipeline takes N inputs, and those inputs may legitimately
 * belong to different connectors. A run artifact is one undivided event stream — its migration
 * descriptions, affected table names and error messages interleave every connection in the batch,
 * and there is no mechanism to serve a caller a partial view of it. "Authorized for any one of
 * them" would therefore hand connection A's schema-change descriptions to a user who only holds
 * rights on connection B. AND is the only rule that cannot leak; a cross-tenant batch simply
 * becomes readable to nobody but a caller holding rights to both, which is the correct conservative
 * answer rather than a silent disclosure.
 *
 * A run with NO connection identity is denied: non-tenant-scoped artifacts are not exposed through
 * the per-company endpoints, and that must not change as a side effect of runs gaining a set.
 *
 * Short-circuits on the first denial, so an unauthorized caller cannot use the number of permission
 * lookups to probe which connections a run covers.
 */
export async function AuthorizeRunArtifact(
    manifest: IntegrationRunManifest,
    canReadCompanyIntegration: CompanyIntegrationReadCheck
): Promise<RunArtifactAuthorizationResult> {
    // Reads the SET, not the singular field: a batch spanning connections leaves the singular field
    // deliberately empty, and testing only that would make such a run look connection-less — and so
    // unreadable to everyone, including its rightful owner.
    const companyIntegrationIDs = IntegrationProgressReader.CompanyIntegrationIDsFor(manifest);
    if (companyIntegrationIDs.length === 0) {
        return { Authorized: false };
    }
    for (const companyIntegrationID of companyIntegrationIDs) {
        if (!await canReadCompanyIntegration(companyIntegrationID)) {
            return { Authorized: false, DeniedCompanyIntegrationID: companyIntegrationID };
        }
    }
    return { Authorized: true };
}
