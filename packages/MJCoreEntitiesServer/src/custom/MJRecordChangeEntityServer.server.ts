import {
    BaseEntity,
    EntityPermissionType,
    Metadata,
    AuthorizationEvaluator,
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
 */
@RegisterClass(BaseEntity, 'MJ: Record Changes')
export class MJRecordChangeEntityServer extends MJRecordChangeEntity {
    public override CheckPermissions(type: EntityPermissionType, throwError: boolean): boolean {
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
            const md = (this.ProviderToUse as unknown as IMetadataProvider | undefined) ?? new Metadata();
            const auth = md.Authorizations.find((a) => a.Name === 'Record Changes: Annotate');
            const evaluator = new AuthorizationEvaluator();
            const allowed = auth ? evaluator.UserCanExecuteWithAncestors(auth, u, md.Authorizations) : false;

            if (!allowed) {
                if (throwError) {
                    this.ThrowPermissionError(u, type, null);
                }
                return false;
            }
        }

        return super.CheckPermissions(type, throwError);
    }
}
