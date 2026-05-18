/**
 * Invariant 5 — Hierarchy validity.
 *
 * Verifies (per INTEGRATION-FRAMEWORK-REQUIREMENTS.md §7.1):
 *
 *   1. Every IO.ParentObjectName resolves to an existing IO in this
 *      metadata file (no orphan parent references).
 *   2. Every IO.ParentObjectIDFieldName resolves to an IOF on that IO
 *      whose RelatedIntegrationObjectID points to the parent IO.
 *   3. HierarchyPath (Configuration JSON, root-relative ancestor chain)
 *      is consistent with the ParentObjectName chain (no cycles, no
 *      breaks).
 *   4. TraversalOrder (metadata.fields.TraversalOrder, array of IO names)
 *      is a valid topological sort: every IO appears after all its
 *      ancestors.
 *
 * Failure modes caught:
 *   - Extractor declared `/orgs/{OrgID}/users` but never emitted an
 *     `orgs` IO (orphan parent reference)
 *   - HierarchyPath claims a chain that doesn't match the parent linkage
 *   - TraversalOrder out of order, missing entries, or contains a cycle
 *
 * @see INTEGRATION-FRAMEWORK-REQUIREMENTS.md §5.3 (traversal order computation)
 */
import type { MetadataFile, FailureDetail } from './types.js';

interface IOSummary {
    Name: string;
    ParentObjectName: string | null;
    ParentObjectIDFieldName: string | null;
    HierarchyPath: string[];
    Fields: Record<string, unknown>;
    IOFs: Array<{ Name: string; Fields: Record<string, unknown> }>;
}

export function CheckHierarchyValidity(metadata: MetadataFile): { Status: 'Pass' | 'Fail'; Failures: FailureDetail[] } {
    const failures: FailureDetail[] = [];

    const ios = metadata.relatedEntities?.['MJ: Integration Objects'] ?? [];
    if (ios.length === 0) {
        // No IOs → nothing to check. Trivial pass.
        return { Status: 'Pass', Failures: [] };
    }

    // Build IO summary with Configuration-JSON unwrapping
    const summaries: IOSummary[] = ios.map((io) => {
        const fields = io.fields as Record<string, unknown>;
        const config = parseConfigurationJSON(fields['Configuration']);
        const hierarchyPath = Array.isArray(config?.['HierarchyPath'])
            ? (config['HierarchyPath'] as unknown[]).filter((v): v is string => typeof v === 'string')
            : [];
        return {
            Name: io.fields.Name,
            ParentObjectName: typeof fields['ParentObjectName'] === 'string' && fields['ParentObjectName'] !== ''
                ? (fields['ParentObjectName'] as string)
                : null,
            ParentObjectIDFieldName: typeof fields['ParentObjectIDFieldName'] === 'string' && fields['ParentObjectIDFieldName'] !== ''
                ? (fields['ParentObjectIDFieldName'] as string)
                : null,
            HierarchyPath: hierarchyPath,
            Fields: fields,
            IOFs: (io.relatedEntities?.['MJ: Integration Object Fields'] ?? []).map((iof) => ({
                Name: iof.fields.Name,
                Fields: iof.fields as Record<string, unknown>,
            })),
        };
    });
    const byName = new Map<string, IOSummary>(summaries.map((s) => [s.Name, s]));

    // (1) Every ParentObjectName resolves to a real IO
    for (const s of summaries) {
        if (s.ParentObjectName === null) continue;
        if (!byName.has(s.ParentObjectName)) {
            failures.push({
                InvariantNumber: 5,
                Severity: 'Error',
                Failure: `IO '${s.Name}' declares ParentObjectName='${s.ParentObjectName}' but no IO with that Name exists in metadata.`,
                Location: `metadata.IO[${s.Name}].ParentObjectName`,
                SuggestedFix: `Either emit the parent IO from the extractor (it was likely missed in the catalog walk), or clear ParentObjectName on '${s.Name}'.`,
            });
        }
    }

    // (2) Every ParentObjectIDFieldName resolves to an IOF on its IO whose
    // RelatedIntegrationObjectID points to the parent IO. The RelatedIntegrationObjectID
    // is an @lookup reference (not a UUID at validation time), so we compare by Name.
    for (const s of summaries) {
        if (!s.ParentObjectIDFieldName) continue;
        const targetIOF = s.IOFs.find((iof) => iof.Name === s.ParentObjectIDFieldName);
        if (!targetIOF) {
            failures.push({
                InvariantNumber: 5,
                Severity: 'Error',
                Failure: `IO '${s.Name}' declares ParentObjectIDFieldName='${s.ParentObjectIDFieldName}' but no IOF with that Name exists on '${s.Name}'.`,
                Location: `metadata.IO[${s.Name}].ParentObjectIDFieldName`,
                SuggestedFix: `Verify the extractor emitted an IOF row with Name='${s.ParentObjectIDFieldName}' on IO '${s.Name}'. If the field exists in the source under a different name, update ParentObjectIDFieldName.`,
            });
            continue;
        }
        if (s.ParentObjectName === null) {
            failures.push({
                InvariantNumber: 5,
                Severity: 'Error',
                Failure: `IO '${s.Name}' declares ParentObjectIDFieldName='${s.ParentObjectIDFieldName}' but ParentObjectName is not set.`,
                Location: `metadata.IO[${s.Name}]`,
                SuggestedFix: `Set ParentObjectName on '${s.Name}' to match the parent IO this field references, OR clear ParentObjectIDFieldName.`,
            });
            continue;
        }
        const relatedRef = targetIOF.Fields['RelatedIntegrationObjectID'];
        if (relatedRef == null || relatedRef === '') {
            failures.push({
                InvariantNumber: 5,
                Severity: 'Error',
                Failure: `IO '${s.Name}' ParentObjectIDFieldName points to IOF '${s.ParentObjectIDFieldName}' but that IOF has no RelatedIntegrationObjectID — the FK linkage is missing.`,
                Location: `metadata.IO[${s.Name}].IOF[${s.ParentObjectIDFieldName}].RelatedIntegrationObjectID`,
                SuggestedFix: `Set IOF '${s.ParentObjectIDFieldName}'.RelatedIntegrationObjectID to an @lookup reference for parent IO '${s.ParentObjectName}'.`,
            });
        } else if (typeof relatedRef === 'string' && !relatedRef.includes(s.ParentObjectName)) {
            // Lookup references typically include the target Name; if the parent's Name isn't present,
            // we can't confirm the FK points where the parent claim says it does.
            failures.push({
                InvariantNumber: 5,
                Severity: 'Warning',
                Failure: `IO '${s.Name}' ParentObjectIDFieldName='${s.ParentObjectIDFieldName}' references IO '${s.ParentObjectName}', but the IOF's RelatedIntegrationObjectID ('${relatedRef.slice(0, 100)}') does not appear to reference that IO by name.`,
                Location: `metadata.IO[${s.Name}].IOF[${s.ParentObjectIDFieldName}].RelatedIntegrationObjectID`,
                SuggestedFix: `Verify the @lookup reference actually targets parent IO '${s.ParentObjectName}'; update if it points elsewhere.`,
            });
        }
    }

    // (3) HierarchyPath consistency: walk parent chain, ensure it matches HierarchyPath.
    for (const s of summaries) {
        const walked: string[] = [];
        let cursor: string | null = s.ParentObjectName;
        const seen = new Set<string>([s.Name]);
        while (cursor !== null) {
            if (seen.has(cursor)) {
                failures.push({
                    InvariantNumber: 5,
                    Severity: 'Error',
                    Failure: `IO '${s.Name}' has a parent-chain cycle through '${cursor}'.`,
                    Location: `metadata.IO[${s.Name}].ParentObjectName`,
                    SuggestedFix: `A parent-chain cycle is a vendor-data-model contradiction; surface in extractor output and resolve before re-emitting.`,
                });
                break;
            }
            seen.add(cursor);
            walked.unshift(cursor);
            const parent = byName.get(cursor);
            cursor = parent?.ParentObjectName ?? null;
        }
        if (s.HierarchyPath.length > 0) {
            // Compare walked vs declared. They should be equal (order matters: root → immediate parent).
            const expected = walked.join('→');
            const declared = s.HierarchyPath.join('→');
            if (expected !== declared) {
                failures.push({
                    InvariantNumber: 5,
                    Severity: 'Warning',
                    Failure: `IO '${s.Name}' HierarchyPath does not match parent chain. Declared: [${declared}]. Walked: [${expected}].`,
                    Location: `metadata.IO[${s.Name}].Configuration.HierarchyPath`,
                    SuggestedFix: `Re-emit HierarchyPath from the extractor; the value should be the ancestor chain in root-first order.`,
                });
            }
        }
    }

    // (4) TraversalOrder valid topological sort
    const traversalOrder = Array.isArray(metadata.fields['TraversalOrder'])
        ? (metadata.fields['TraversalOrder'] as unknown[]).filter((v): v is string => typeof v === 'string')
        : null;
    if (traversalOrder !== null && traversalOrder.length > 0) {
        // Every IO should appear exactly once
        const orderSet = new Set(traversalOrder);
        if (orderSet.size !== traversalOrder.length) {
            failures.push({
                InvariantNumber: 5,
                Severity: 'Error',
                Failure: `metadata.fields.TraversalOrder contains duplicates.`,
                Location: 'metadata.fields.TraversalOrder',
                SuggestedFix: `Each IO should appear exactly once in TraversalOrder.`,
            });
        }
        const missingFromOrder = summaries.filter((s) => !orderSet.has(s.Name)).map((s) => s.Name);
        if (missingFromOrder.length > 0) {
            failures.push({
                InvariantNumber: 5,
                Severity: 'Error',
                Failure: `metadata.fields.TraversalOrder is missing ${missingFromOrder.length} IOs: ${missingFromOrder.slice(0, 5).join(', ')}${missingFromOrder.length > 5 ? '...' : ''}.`,
                Location: 'metadata.fields.TraversalOrder',
                SuggestedFix: `TraversalOrder must include every IO. Re-compute via topological sort over ParentObjectName edges.`,
            });
        }
        const unknownInOrder = traversalOrder.filter((name) => !byName.has(name));
        if (unknownInOrder.length > 0) {
            failures.push({
                InvariantNumber: 5,
                Severity: 'Error',
                Failure: `metadata.fields.TraversalOrder contains ${unknownInOrder.length} entries that don't match any IO: ${unknownInOrder.slice(0, 5).join(', ')}.`,
                Location: 'metadata.fields.TraversalOrder',
                SuggestedFix: `Remove unknown entries; TraversalOrder should be drawn from emitted IO Names.`,
            });
        }
        // Topological-sort validity: every IO's parent (if any) appears BEFORE it.
        const positionByName = new Map<string, number>();
        traversalOrder.forEach((name, idx) => positionByName.set(name, idx));
        for (const s of summaries) {
            if (s.ParentObjectName === null) continue;
            const myPos = positionByName.get(s.Name);
            const parentPos = positionByName.get(s.ParentObjectName);
            if (myPos === undefined || parentPos === undefined) continue;
            if (parentPos > myPos) {
                failures.push({
                    InvariantNumber: 5,
                    Severity: 'Error',
                    Failure: `TraversalOrder violates topological order: '${s.Name}' (position ${myPos}) appears BEFORE its parent '${s.ParentObjectName}' (position ${parentPos}).`,
                    Location: 'metadata.fields.TraversalOrder',
                    SuggestedFix: `Re-compute topological sort; parents must precede children.`,
                });
            }
        }
    } else if (summaries.some((s) => s.ParentObjectName !== null)) {
        // Hierarchy declared but TraversalOrder absent
        failures.push({
            InvariantNumber: 5,
            Severity: 'Warning',
            Failure: `metadata.fields.TraversalOrder is missing/empty but ${summaries.filter((s) => s.ParentObjectName !== null).length} IOs declare a ParentObjectName.`,
            Location: 'metadata.fields.TraversalOrder',
            SuggestedFix: `Compute TraversalOrder via topological sort over ParentObjectName edges and emit as root-level array.`,
        });
    }

    const hardErrors = failures.filter((f) => f.Severity === 'Error');
    return { Status: hardErrors.length === 0 ? 'Pass' : 'Fail', Failures: failures };
}

function parseConfigurationJSON(raw: unknown): Record<string, unknown> | null {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    if (typeof raw !== 'string') return null;
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return null;
    }
}
