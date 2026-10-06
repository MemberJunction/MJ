import {
    BaseEntity,
    EntityFieldInfo,
    EntityPermissionType,
    Metadata,
    AuthorizationEvaluator,
    type AuthorizationInfo,
    type IEntityDataProvider,
    type IMetadataProvider,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJRecordChangeEntity } from '@memberjunction/core-entities';

/**
 * Server subclass for `MJ: Record Changes`.
 *
 * Implements §10.6 Comments annotation:
 * An update on a Record Change record is permitted ONLY when:
 * 1. The only dirty field being updated is `Comments`.
 * 2. The user holds the `Record Changes: Annotate` authorization (evaluated with ancestors).
 * 3. The entity's own Update permission allows it, as for any other entity. The authorization
 *    narrows who may annotate; it doesn't replace the role permission.
 *
 * Any other update is strictly forbidden to protect audit trail integrity.
 *
 * A create with a caller (`ActiveUser` set) of a record change whose `Source` is `Internal` and
 * whose `Type` is `Create` is refused for every caller. A null or undefined `Source` or `Type` counts
 * as `Internal` or `Create`, the defaults the database stores for it. Both are compared trimmed and
 * case-folded, as value-list validation compares them, so `'internal '` or `'create'` is refused too.
 * That is wider than the database CHECK (SQL Server ignores trailing spaces only), which is safe: the
 * extra values refused are ones the database would reject. Those rows are the platform's own record of
 * who created a record, which the database provider writes in SQL alongside each insert; other
 * code trusts them, for example to read who created a component. Other Internal types, such as the
 * `Snapshot` rows `SnapshotBuilder` writes for version labels, are left to the role permission.
 */
/** The entity's data provider when it also serves metadata (the server providers do). */
function asMetadataProvider(provider: IEntityDataProvider | null | undefined): Pick<IMetadataProvider, 'Authorizations'> | undefined {
    return provider && 'Authorizations' in provider && Array.isArray(provider.Authorizations)
        ? { Authorizations: provider.Authorizations as AuthorizationInfo[] }
        : undefined;
}

/** Authorizations from the entity's own provider, else from the global metadata. */
function authorizationsOf(provider: IEntityDataProvider | null | undefined): AuthorizationInfo[] {
    const md = asMetadataProvider(provider) ?? new Metadata();
    return md.Authorizations;
}

@RegisterClass(BaseEntity, 'MJ: Record Changes')
export class MJRecordChangeEntityServer extends MJRecordChangeEntity {
    public override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
        if (type === EntityPermissionType.Create && this.isCallerCreatingInternalRow()) {
            const msg = `Record Changes with Source 'Internal' and Type 'Create' are written by the platform and cannot be created through the API.`;
            if (throwError) throw new Error(msg);
            return false;
        }
        if (type === EntityPermissionType.Update) {
            const u = this.ActiveUser;
            if (!u) {
                throw new Error(
                    'No user set - either the context user for the entity object must be set, or the CurrentUser of the provider must be set'
                );
            }

            if (!this.EntityInfo.AllowUpdateAPI) {
                const msg = `Update API is disabled for ${this.EntityInfo.Name}`;
                if (throwError) throw new Error(msg);
                return false;
            }

            // Only Comments can be modified on an existing RecordChange
            const dirtyFields = this.Fields.filter((f) => f.Dirty);
            const isCommentsOnly = dirtyFields.length === 1 && dirtyFields[0].Name === 'Comments';
            if (!isCommentsOnly) {
                const msg = `Record Changes cannot be modified, except for Comments annotation.`;
                if (throwError) throw new Error(msg);
                return false;
            }

            // Must hold "Record Changes: Annotate" authorization (evaluated with ancestors)
            const authorizations = authorizationsOf(this.ProviderToUse);
            const auth = authorizations.find((a) => a.Name === 'Record Changes: Annotate');
            const evaluator = new AuthorizationEvaluator();
            const allowed = auth ? evaluator.UserCanExecuteWithAncestors(auth, u, authorizations) : false;

            if (!allowed) {
                if (throwError) {
                    this.ThrowPermissionError(u, type, null);
                }
                return false;
            }
        }

        return super.CheckPermissions(type, throwError);
    }

    /**
     * True for a new row with `Source` 'Internal' and `Type` 'Create', in any padding or casing, that a
     * caller is creating. A missing value counts as the database default.
     */
    private isCallerCreatingInternalRow(): boolean {
        if (this.IsSaved || !this.ActiveUser) return false;
        // These defaults mirror the ISNULL defaults in spCreateRecordChange.
        const source = this.Source ?? 'Internal';
        const type = this.Type ?? 'Create';
        return EntityFieldInfo.NormalizeValueListValue(source) === 'internal'
            && EntityFieldInfo.NormalizeValueListValue(type) === 'create';
    }
}
