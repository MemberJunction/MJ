import { createHash } from 'node:crypto';
import { EntityInfo, IMetadataProvider, Metadata } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import type {
    EntitySchemaReconciliation,
    PeerEntitySchemaFingerprint,
    PeerFieldSchemaFingerprint,
    PeerManifest,
    SchemaCompatibilityVerdict,
    SchemaFieldDiff,
    SchemaReconciliationPlan,
} from './types.js';

/**
 * Computes a deterministic, order-independent SHA-256 `PairingID` from two
 * MemberJunction instance UUIDs (`ComputePairingID(A, B) === ComputePairingID(B, A)`).
 */
export function ComputePairingID(instanceA: string, instanceB: string): string {
    const sorted = [NormalizeUUID(instanceA), NormalizeUUID(instanceB)].sort();
    return createHash('sha256')
        .update(`mj-peer-sync:${sorted[0]}:${sorted[1]}`)
        .digest('hex');
}

/**
 * Extracts deterministic structural schema fingerprints from local MemberJunction
 * metadata and reconciles them against a remote peer's schema fingerprints.
 */
export class SchemaPlanner {
    /**
     * Extracts `PeerEntitySchemaFingerprint` entries for the specified entity names
     * from the given `IMetadataProvider` (or `Metadata.Provider`).
     */
    public ExtractLocalSchemaFingerprints(
        entityNames: string[],
        provider?: IMetadataProvider
    ): PeerEntitySchemaFingerprint[] {
        const md = provider ?? Metadata.Provider;
        const results: PeerEntitySchemaFingerprint[] = [];

        for (const requestedName of entityNames) {
            const entityInfo = md.Entities.find(
                e => e.Name.toLowerCase() === requestedName.trim().toLowerCase()
            );
            if (!entityInfo) {
                continue;
            }
            results.push(this.BuildEntityFingerprint(entityInfo));
        }

        return results;
    }

    /**
     * Builds a `PeerEntitySchemaFingerprint` for a single `EntityInfo`.
     */
    public BuildEntityFingerprint(entityInfo: EntityInfo): PeerEntitySchemaFingerprint {
        const fields: PeerFieldSchemaFingerprint[] = (entityInfo.Fields ?? [])
            .map(f => ({
                Name: f.Name,
                Type: (f.Type ?? 'nvarchar').toLowerCase(),
                SQLFullType: f.SQLFullType ?? f.Type ?? 'nvarchar(max)',
                AllowsNull: f.AllowsNull !== false,
                MaxLength: f.MaxLength && f.MaxLength > 0 ? f.MaxLength : null,
                Precision: f.Precision && f.Precision > 0 ? f.Precision : null,
                Scale: f.Scale && f.Scale > 0 ? f.Scale : null,
                DefaultValue: f.DefaultValue ?? null,
                IsPrimaryKey: Boolean(f.IsPrimaryKey),
                IsVirtual: Boolean(f.IsVirtual),
                RelatedEntityName: f.RelatedEntity ? String(f.RelatedEntity) : null,
                RelatedEntityFieldName: f.RelatedEntityFieldName
                    ? String(f.RelatedEntityFieldName)
                    : null,
            }))
            .sort((a, b) => a.Name.localeCompare(b.Name));

        const fp: PeerEntitySchemaFingerprint = {
            EntityName: entityInfo.Name,
            SchemaName: entityInfo.SchemaName || '__mj',
            BaseTable: entityInfo.BaseTable,
            BaseView: entityInfo.BaseView,
            PrimaryKeyFieldNames: (entityInfo.PrimaryKeys ?? []).map(pk => pk.Name),
            TrackRecordChanges: Boolean(entityInfo.TrackRecordChanges),
            Fields: fields,
            FingerprintHash: '',
        };
        fp.FingerprintHash = this.ComputeEntityHash(fp);
        return fp;
    }

    /**
     * Computes a canonical SHA-256 fingerprint hash for a `PeerEntitySchemaFingerprint`.
     */
    public ComputeEntityHash(fp: PeerEntitySchemaFingerprint): string {
        const canonicalFields = [...fp.Fields]
            .filter(f => !f.IsVirtual && !f.Name.startsWith('__mj_'))
            .sort((a, b) => a.Name.toLowerCase().localeCompare(b.Name.toLowerCase()))
            .map(f => ({
                Name: f.Name.toLowerCase(),
                TypeFamily: this.normalizeTypeFamily(f.Type),
                AllowsNull: f.AllowsNull,
                MaxLength: f.MaxLength,
                Precision: f.Precision,
                Scale: f.Scale,
                IsPrimaryKey: f.IsPrimaryKey,
            }));

        const payload = JSON.stringify({
            EntityName: fp.EntityName.toLowerCase(),
            PrimaryKeys: [...fp.PrimaryKeyFieldNames].map(k => k.toLowerCase()).sort(),
            Fields: canonicalFields,
        });

        return createHash('sha256').update(payload).digest('hex');
    }

    /**
     * Compares local and remote schema fingerprints and builds a full
     * `SchemaReconciliationPlan` classifying each entity and the overall pairing.
     */
    public BuildReconciliationPlan(
        localManifest: PeerManifest,
        remoteManifest: PeerManifest,
        localSchemas: PeerEntitySchemaFingerprint[],
        remoteSchemas: PeerEntitySchemaFingerprint[]
    ): SchemaReconciliationPlan {
        const pairingID = ComputePairingID(
            localManifest.InstanceID,
            remoteManifest.InstanceID
        );

        const coreVersionCompatible = this.areMajorVersionsCompatible(
            localManifest.MJCoreVersion,
            remoteManifest.MJCoreVersion
        );

        const localByLower = new Map<string, PeerEntitySchemaFingerprint>();
        for (const l of localSchemas) {
            localByLower.set(l.EntityName.toLowerCase(), l);
        }

        const remoteByLower = new Map<string, PeerEntitySchemaFingerprint>();
        for (const r of remoteSchemas) {
            remoteByLower.set(r.EntityName.toLowerCase(), r);
        }

        const allEntityKeys = new Set<string>([
            ...localByLower.keys(),
            ...remoteByLower.keys(),
        ]);

        const entityResults: EntitySchemaReconciliation[] = [];
        const autoEvolvableEntities: string[] = [];
        const blockedEntities: string[] = [];

        for (const key of allEntityKeys) {
            const localEnt = localByLower.get(key) ?? null;
            const remoteEnt = remoteByLower.get(key) ?? null;
            const entityName =
                localEnt?.EntityName ?? remoteEnt?.EntityName ?? key;

            const result = this.reconcileSingleEntity(
                entityName,
                localEnt,
                remoteEnt,
                coreVersionCompatible
            );
            entityResults.push(result);

            if (result.Verdict === 'AutoEvolvable') {
                autoEvolvableEntities.push(entityName);
            } else if (
                result.Verdict === 'IncompatibleType' ||
                result.Verdict === 'IncompatibleConstraint' ||
                result.Verdict === 'CoreVersionMismatch'
            ) {
                blockedEntities.push(entityName);
            }
        }

        let overallVerdict: SchemaCompatibilityVerdict = 'Identical';
        if (!coreVersionCompatible) {
            overallVerdict = 'CoreVersionMismatch';
        } else if (entityResults.some(r => r.Verdict === 'IncompatibleType')) {
            overallVerdict = 'IncompatibleType';
        } else if (entityResults.some(r => r.Verdict === 'IncompatibleConstraint')) {
            overallVerdict = 'IncompatibleConstraint';
        } else if (entityResults.some(r => r.Verdict === 'AutoEvolvable')) {
            overallVerdict = 'AutoEvolvable';
        } else if (entityResults.some(r => r.Verdict === 'CompatibleSuperset')) {
            overallVerdict = 'CompatibleSuperset';
        }

        return {
            PairingID: pairingID,
            LocalInstanceID: localManifest.InstanceID,
            RemoteInstanceID: remoteManifest.InstanceID,
            CoreVersionCompatible: coreVersionCompatible,
            OverallVerdict: overallVerdict,
            EntityResults: entityResults,
            AutoEvolvableEntities: autoEvolvableEntities,
            BlockedEntities: blockedEntities,
        };
    }

    private reconcileSingleEntity(
        entityName: string,
        localEnt: PeerEntitySchemaFingerprint | null,
        remoteEnt: PeerEntitySchemaFingerprint | null,
        coreVersionCompatible: boolean
    ): EntitySchemaReconciliation {
        const diffs: SchemaFieldDiff[] = [];

        if (!coreVersionCompatible) {
            diffs.push({
                Kind: 'CoreVersionMismatch',
                EntityName: entityName,
                FieldName: null,
                LocalField: null,
                RemoteField: null,
                IsBreaking: true,
                IsAutoEvolvable: false,
                Message: `Major MemberJunction Core version mismatch prevents safe sync of '${entityName}'.`,
            });
            return {
                EntityName: entityName,
                Verdict: 'CoreVersionMismatch',
                LocalFingerprintHash: localEnt?.FingerprintHash ?? null,
                RemoteFingerprintHash: remoteEnt?.FingerprintHash ?? null,
                Diffs: diffs,
            };
        }

        if (!localEnt && remoteEnt) {
            const isCore = remoteEnt.SchemaName.toLowerCase() === '__mj';
            diffs.push({
                Kind: 'MissingLocalEntity',
                EntityName: entityName,
                FieldName: null,
                LocalField: null,
                RemoteField: null,
                IsBreaking: isCore,
                IsAutoEvolvable: !isCore,
                Message: `Entity '${entityName}' exists on remote peer but is missing locally.`,
            });
            return {
                EntityName: entityName,
                Verdict: isCore ? 'CoreVersionMismatch' : 'AutoEvolvable',
                LocalFingerprintHash: null,
                RemoteFingerprintHash: remoteEnt.FingerprintHash,
                Diffs: diffs,
            };
        }

        if (localEnt && !remoteEnt) {
            const isCore = localEnt.SchemaName.toLowerCase() === '__mj';
            diffs.push({
                Kind: 'MissingRemoteEntity',
                EntityName: entityName,
                FieldName: null,
                LocalField: null,
                RemoteField: null,
                IsBreaking: isCore,
                IsAutoEvolvable: !isCore,
                Message: `Entity '${entityName}' exists locally but is missing on remote peer.`,
            });
            return {
                EntityName: entityName,
                Verdict: isCore ? 'CoreVersionMismatch' : 'AutoEvolvable',
                LocalFingerprintHash: localEnt.FingerprintHash,
                RemoteFingerprintHash: null,
                Diffs: diffs,
            };
        }

        const local = localEnt!;
        const remote = remoteEnt!;

        const localHash = this.ComputeEntityHash(local);
        const remoteHash = this.ComputeEntityHash(remote);
        if (localHash === remoteHash) {
            return {
                EntityName: entityName,
                Verdict: 'Identical',
                LocalFingerprintHash: localHash,
                RemoteFingerprintHash: remoteHash,
                Diffs: [],
            };
        }

        const localFields = new Map<string, PeerFieldSchemaFingerprint>();
        for (const f of local.Fields) {
            if (!f.IsVirtual && !f.Name.startsWith('__mj_')) {
                localFields.set(f.Name.toLowerCase(), f);
            }
        }

        const remoteFields = new Map<string, PeerFieldSchemaFingerprint>();
        for (const f of remote.Fields) {
            if (!f.IsVirtual && !f.Name.startsWith('__mj_')) {
                remoteFields.set(f.Name.toLowerCase(), f);
            }
        }

        for (const [key, rField] of remoteFields.entries()) {
            const lField = localFields.get(key);
            if (!lField) {
                const requiresNonNullWithoutDefault =
                    !rField.AllowsNull &&
                    (rField.DefaultValue === null || rField.DefaultValue === '') &&
                    !rField.IsPrimaryKey;

                diffs.push({
                    Kind: requiresNonNullWithoutDefault
                        ? 'IncompatibleConstraint'
                        : 'MissingLocalField',
                    EntityName: entityName,
                    FieldName: rField.Name,
                    LocalField: null,
                    RemoteField: rField,
                    IsBreaking: requiresNonNullWithoutDefault,
                    IsAutoEvolvable: !requiresNonNullWithoutDefault,
                    Message: requiresNonNullWithoutDefault
                        ? `Remote field '${entityName}.${rField.Name}' is NOT NULL with no default and is missing locally.`
                        : `Remote optional field '${entityName}.${rField.Name}' is not present locally.`,
                });
                continue;
            }

            const localFamily = this.normalizeTypeFamily(lField.Type);
            const remoteFamily = this.normalizeTypeFamily(rField.Type);
            if (localFamily !== remoteFamily) {
                diffs.push({
                    Kind: 'IncompatibleType',
                    EntityName: entityName,
                    FieldName: rField.Name,
                    LocalField: lField,
                    RemoteField: rField,
                    IsBreaking: true,
                    IsAutoEvolvable: false,
                    Message:
                        `Field '${entityName}.${rField.Name}' has incompatible types: ` +
                        `local '${lField.SQLFullType}' (${localFamily}) vs remote '${rField.SQLFullType}' (${remoteFamily}).`,
                });
                continue;
            }

            if (
                localFamily === 'string' &&
                lField.MaxLength != null &&
                rField.MaxLength != null &&
                rField.MaxLength > lField.MaxLength
            ) {
                diffs.push({
                    Kind: 'TypeWidening',
                    EntityName: entityName,
                    FieldName: rField.Name,
                    LocalField: lField,
                    RemoteField: rField,
                    IsBreaking: false,
                    IsAutoEvolvable: true,
                    Message:
                        `Field '${entityName}.${rField.Name}' is narrower locally (${lField.MaxLength}) ` +
                        `than on remote peer (${rField.MaxLength}).`,
                });
            }
        }

        for (const [key, lField] of localFields.entries()) {
            if (!remoteFields.has(key)) {
                const requiresNonNullWithoutDefault =
                    !lField.AllowsNull &&
                    (lField.DefaultValue === null || lField.DefaultValue === '') &&
                    !lField.IsPrimaryKey;

                diffs.push({
                    Kind: requiresNonNullWithoutDefault
                        ? 'IncompatibleConstraint'
                        : 'MissingRemoteField',
                    EntityName: entityName,
                    FieldName: lField.Name,
                    LocalField: lField,
                    RemoteField: null,
                    IsBreaking: requiresNonNullWithoutDefault,
                    IsAutoEvolvable: !requiresNonNullWithoutDefault,
                    Message: requiresNonNullWithoutDefault
                        ? `Local field '${entityName}.${lField.Name}' is NOT NULL with no default and is missing on remote peer.`
                        : `Local optional field '${entityName}.${lField.Name}' is not present on remote peer.`,
                });
            }
        }

        let verdict: SchemaCompatibilityVerdict = 'Identical';
        if (diffs.some(d => d.Kind === 'IncompatibleType')) {
            verdict = 'IncompatibleType';
        } else if (diffs.some(d => d.Kind === 'IncompatibleConstraint')) {
            verdict = 'IncompatibleConstraint';
        } else if (diffs.some(d => d.Kind === 'TypeWidening')) {
            verdict = 'AutoEvolvable';
        } else if (diffs.length > 0) {
            verdict = 'CompatibleSuperset';
        }

        return {
            EntityName: entityName,
            Verdict: verdict,
            LocalFingerprintHash: localHash,
            RemoteFingerprintHash: remoteHash,
            Diffs: diffs,
        };
    }

    private normalizeTypeFamily(sqlType: string): string {
        const t = sqlType.trim().toLowerCase();
        if (t === 'uniqueidentifier' || t === 'uuid') return 'uuid';
        if (t === 'bit' || t === 'bool' || t === 'boolean') return 'boolean';
        if (
            t === 'nvarchar' ||
            t === 'varchar' ||
            t === 'nchar' ||
            t === 'char' ||
            t === 'text' ||
            t === 'ntext'
        ) {
            return 'string';
        }
        if (
            t === 'int' ||
            t === 'integer' ||
            t === 'smallint' ||
            t === 'tinyint' ||
            t === 'bigint'
        ) {
            return 'integer';
        }
        if (
            t === 'decimal' ||
            t === 'numeric' ||
            t === 'float' ||
            t === 'real' ||
            t === 'money' ||
            t === 'smallmoney' ||
            t === 'double precision'
        ) {
            return 'number';
        }
        if (t.includes('date') || t.includes('time') || t.startsWith('timestamp')) {
            return 'datetime';
        }
        return t;
    }

    private areMajorVersionsCompatible(versionA: string, versionB: string): boolean {
        const majorA = parseInt(versionA.trim().split('.')[0] ?? '', 10);
        const majorB = parseInt(versionB.trim().split('.')[0] ?? '', 10);
        if (Number.isNaN(majorA) || Number.isNaN(majorB)) {
            return true;
        }
        return majorA === majorB;
    }
}
