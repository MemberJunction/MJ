/**
 * Grouping for the "Prior Artifacts Created by This Agent" block fed to the Check Sage Intent
 * prompt.
 *
 * PURE (no Angular, no entities, no provider) so the ordering contract below is unit-testable
 * without the service's DI — same reason `conversation-detail-window.ts` and `date-jump.ts`
 * live out here rather than on their consumers.
 */

/** The version fields the grouping needs. Structural, so the RunView row type satisfies it. */
export interface AgentArtifactVersionRow {
    ID: string;
    ArtifactID: string;
    VersionNumber: number;
    Name: string | null;
}

/** The artifact fields the prompt prints. */
export interface AgentArtifactRow {
    ID: string;
    Name: string;
    Type: string;
}

/**
 * One artifact an agent produced in this conversation, with its versions newest-first.
 *
 * Deliberately narrower than the array-scan shape it replaces, which also carried `runId`,
 * `artifactDescription`, `versionDescription` and `createdAt` — none of which the intent
 * prompt ever read. Dropping them is what lets the caller resolve this without joining back
 * to agent runs, turning a four-table reconstruction into two reads.
 */
export interface AgentArtifactSummary {
    artifactId: string;
    artifactName: string;
    artifactType: string;
    /** Newest first, so `versions[0]` is the latest. */
    versions: Array<{ versionId: string; versionNumber: number; versionName: string | null }>;
}

/**
 * Folds versions into per-artifact summaries.
 *
 * NO SORT, and that is deliberate rather than an omission. The caller reads versions
 * `__mj_CreatedAt DESC`, so inserting in arrival order leaves each artifact's versions
 * newest-first AND leaves the Map ordered by whichever artifact was touched most recently —
 * which is exactly what the explicit sort in the array-scan version used to compute. The
 * assumption is load-bearing and invisible, so it is pinned by tests.
 *
 * @param versions - Artifact versions, newest first
 * @param artifactsById - The artifact rows behind those versions
 */
export function GroupVersionsByArtifact(
    versions: readonly AgentArtifactVersionRow[],
    artifactsById: ReadonlyMap<string, AgentArtifactRow>
): AgentArtifactSummary[] {
    const byArtifact = new Map<string, AgentArtifactSummary>();

    for (const version of versions) {
        const artifact = artifactsById.get(version.ArtifactID);
        if (!artifact) {
            // Mirrors the stored query's INNER JOIN semantics. A version can outlive the
            // artifact row the caller can read; emitting a summary with an undefined name
            // would put the string "undefined" straight into the classifier prompt.
            continue;
        }
        let summary = byArtifact.get(version.ArtifactID);
        if (!summary) {
            summary = {
                artifactId: version.ArtifactID,
                artifactName: artifact.Name,
                artifactType: artifact.Type,
                versions: []
            };
            byArtifact.set(version.ArtifactID, summary);
        }
        summary.versions.push({
            versionId: version.ID,
            versionNumber: version.VersionNumber,
            versionName: version.Name
        });
    }
    return [...byArtifact.values()];
}
