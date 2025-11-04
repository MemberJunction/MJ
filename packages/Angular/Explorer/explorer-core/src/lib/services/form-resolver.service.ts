import { Injectable } from '@angular/core';
import { Metadata, RunView, EntityInfo, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { FormResolutionResult, FormImplementationType } from '../models/form-resolution.models';
import { ComponentSpec } from '@memberjunction/interactivecomponents';

/**
 * Service that resolves which form component implementation to use for a given entity.
 * Resolution order:
 * 1. Interactive Component (from EntityForm metadata) - User scope → Role scope → Global scope, by Priority DESC
 * 2. Code-based (@RegisterClass with BaseFormComponent)
 * 3. Generated (default fallback, always available)
 */
@Injectable({
  providedIn: 'root'
})
export class FormResolverService {
  private md: Metadata;

  constructor() {
    this.md = new Metadata();
  }

  /**
   * Resolves the appropriate form component for a given entity
   * @param entityName The entity name to resolve form for
   * @param currentUser The current user context (for user/role-specific forms)
   * @returns Form resolution result with component type and details
   */
  public async resolveFormComponent(
    entityName: string,
    currentUser?: UserInfo
  ): Promise<FormResolutionResult> {
    // Get entity info
    const entity = this.md.Entities.find(e => e.Name === entityName);
    if (!entity) {
      throw new Error(`Entity '${entityName}' not found in metadata`);
    }

    // Use CurrentUser from metadata if not provided
    const user = currentUser || this.md.CurrentUser;

    // Step 1: Check for Interactive Component forms (EntityForm table)
    const interactiveResult = await this.checkForInteractiveForm(entity, user);
    if (interactiveResult) {
      return interactiveResult;
    }

    // Step 2: Check for Code-based form (@RegisterClass)
    const codeBasedResult = this.checkForCodeBasedForm(entity);
    if (codeBasedResult) {
      return codeBasedResult;
    }

    // Step 3: Fallback to Generated form (always available)
    return this.getGeneratedFormResult(entity);
  }

  /**
   * Check for Interactive Component form in EntityForm metadata
   */
  private async checkForInteractiveForm(
    entity: EntityInfo,
    user: UserInfo
  ): Promise<FormResolutionResult | null> {
    try {
      const rv = new RunView();

      // Build filter to find active forms for this entity with proper scope priority
      // Order by: User scope first, then Role scope, then Global scope
      // Within each scope, order by Priority DESC (higher priority wins)
      const filter = `
        EntityID='${entity.ID}'
        AND Status='Active'
        AND (
          (Scope='User' AND UserID='${user.ID}')
          OR (Scope='Role' AND RoleID IN (${this.getUserRoleIds(user)}))
          OR (Scope='Global' AND UserID IS NULL AND RoleID IS NULL)
        )
      `.trim();

      const result = await rv.RunView({
        EntityName: 'Entity Forms',
        ExtraFilter: filter,
        OrderBy: `
          CASE
            WHEN Scope='User' THEN 1
            WHEN Scope='Role' THEN 2
            ELSE 3
          END,
          Priority DESC
        `.trim(),
        ResultType: 'simple'
      }, user);

      if (result.Success && result.Results && result.Results.length > 0) {
        // Take the first result (highest priority after scope-based sorting)
        const topForm = result.Results[0];

        // Parse the ComponentSpec JSON
        const componentSpec: ComponentSpec = JSON.parse(topForm.ComponentSpec);

        return {
          type: 'Interactive',
          componentSpec: componentSpec,
          entityFormId: topForm.ID,
          entityId: entity.ID,
          entityName: entity.Name,
          priority: topForm.Priority,
          scope: topForm.Scope
        };
      }
    } catch (error) {
      // Log error but don't fail - fall through to next resolution method
      console.error(`Error checking for interactive form for entity '${entity.Name}':`, error);
    }

    return null;
  }

  /**
   * Check for Code-based form using ClassFactory (@RegisterClass)
   */
  private checkForCodeBasedForm(entity: EntityInfo): FormResolutionResult | null {
    try {
      const formReg = MJGlobal.Instance.ClassFactory.GetRegistration(
        BaseFormComponent,
        entity.Name
      );

      if (formReg && formReg.SubClass) {
        return {
          type: 'CodeBased',
          componentClass: formReg.SubClass,
          entityId: entity.ID,
          entityName: entity.Name
        };
      }
    } catch (error) {
      // Log error but don't fail - fall through to next resolution method
      console.error(`Error checking for code-based form for entity '${entity.Name}':`, error);
    }

    return null;
  }

  /**
   * Get Generated form result (fallback, always available)
   */
  private getGeneratedFormResult(entity: EntityInfo): FormResolutionResult {
    return {
      type: 'Generated',
      entityId: entity.ID,
      entityName: entity.Name
    };
  }

  /**
   * Helper to get comma-separated list of user role IDs for SQL IN clause
   */
  private getUserRoleIds(user: UserInfo): string {
    if (!user.UserRoles || user.UserRoles.length === 0) {
      return "''"; // Return empty string in quotes if no roles
    }
    return user.UserRoles.map(role => `'${role.RoleID}'`).join(',');
  }
}
