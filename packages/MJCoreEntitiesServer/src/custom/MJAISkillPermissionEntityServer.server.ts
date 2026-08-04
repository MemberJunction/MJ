import { BaseEntity, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAISkillPermissionEntity } from '@memberjunction/core-entities';

/**
 * Server-side AISkillPermission entity enforcing the grantee-exclusivity invariant:
 * **exactly one** of `UserID` / `RoleID` must be set — never both, never neither.
 *
 * This mirrors the generated `MJAIAgentPermissionEntity.ValidateRoleIDAndUserIDExclusive`
 * rule (which AIAgentPermission gets from a DB-authored, LLM-generated table-level
 * validation baked into the shared entity). We enforce it here as a **version-controlled,
 * deterministic** server-side gate so the invariant holds on every server save path
 * (`Save()` calls `Validate()` and the ClassFactory resolves this higher-priority subclass
 * server-side) without depending on non-deterministic LLM codegen. The sharing UI sets a
 * single grantee per row by construction, so this is the integrity backstop for any other
 * write path (Remote Operations, scripts, imports).
 */
@RegisterClass(BaseEntity, 'MJ: AI Skill Permissions')
export class MJAISkillPermissionEntityServer extends MJAISkillPermissionEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const hasRole = this.RoleID != null;
        const hasUser = this.UserID != null;
        if ((hasRole && hasUser) || (!hasRole && !hasUser)) {
            result.Errors.push(new ValidationErrorInfo(
                'RoleID/UserID',
                'You must specify either a Role or a User, but not both and not neither.',
                `RoleID: ${this.RoleID}, UserID: ${this.UserID}`,
                ValidationErrorType.Failure
            ));
        }
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }
}
