import { BaseEntity, EntitySaveOptions } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAISkillEntity } from '@memberjunction/core-entities';

/**
 * Server-side AISkill entity that defaults `CreatedByUserID` to the context user on
 * first save when the caller didn't set it explicitly.
 *
 * `CreatedByUserID` is NOT NULL with no DB default, and ownership drives the
 * open-by-default permission model (only the owner may Edit/Delete when no explicit
 * grants exist). Interactive paths (the skill form, `SkillImportExportService`) set it
 * from their context user by construction, but generic programmatic paths — the
 * `Create Record` action used by agents such as SkillSmith, Remote Operations,
 * scripts — have no natural place to inject it. Defaulting here keeps every server
 * save path working and correctly attributes ownership to the acting user.
 */
@RegisterClass(BaseEntity, 'MJ: AI Skills')
export class MJAISkillEntityServer extends MJAISkillEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.IsSaved && !this.CreatedByUserID && this.ContextCurrentUser) {
            this.CreatedByUserID = this.ContextCurrentUser.ID;
        }
        return super.Save(options);
    }
}
