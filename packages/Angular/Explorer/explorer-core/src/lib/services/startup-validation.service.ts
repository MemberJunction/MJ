import { Injectable } from '@angular/core';
import { Metadata, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { SystemValidationService } from './system-validation.service';

/**
 * Service that performs validation checks during application startup
 */
@Injectable({
  providedIn: 'root'
})
export class StartupValidationService {
  constructor(private validationService: SystemValidationService) { }

  /**
   * Optional explicit metadata provider. Set via `setProvider()` from a caller
   * with provider context (e.g. the shell). Falls back to `Metadata.Provider`
   * when not set, which is fine for single-provider apps.
   */
  private _provider: IMetadataProvider | null = null;

  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }
  
  /**
   * Runs all validation checks
   */
  public validateSystemSetup(): void {
    this.validateUserRoles();
    // Add more validation checks here as needed
  }
  
  /**
   * Directly adds a validation issue for no user roles
   * This is used when we detect the missing roles error during GraphQL setup
   */
  public addNoRolesValidationIssue(): void {
    this.validationService.addIssue({
      id: 'no-user-roles',
      message: 'Missing User Roles - Cannot Access Application',
      severity: 'error',
      details: 'Your account does not have any roles assigned, which is required to use the application. This is preventing the system from loading core resources and metadata.',
      help: 'Please contact your system administrator to have appropriate roles assigned to your account. At minimum, a "UI" role is required.'
    });
  }

  /**
   * Validates that the current user has at least one role assigned
   */
  private validateUserRoles(): void {
    try {
      const md = this.Provider;
      const currentUser = md.CurrentUser;
      
      if (!currentUser) {
        console.log('StartupValidationService: No current user found');
        this.validationService.addIssue({
          id: 'user-not-found',
          message: 'User account not found',
          severity: 'error',
          details: 'Your user account could not be found in the system.',
          help: 'Contact your system administrator to ensure your account is properly set up.'
        });
        return;
      }
      
      if (!currentUser.UserRoles || currentUser.UserRoles.length === 0) {
        console.log('StartupValidationService: No user roles found, adding validation issue');
        this.validationService.addIssue({
          id: 'no-user-roles',
          message: 'No roles assigned to your account',
          severity: 'error',
          details: 'Your user account does not have any roles assigned. This will prevent you from accessing most functionality.',
          help: 'Contact your system administrator to have appropriate roles assigned to your account.'
        });
      }
    } catch (err) {
      console.error('StartupValidationService: Error during user role validation', err);
      this.validationService.addIssue({
        id: 'user-roles-check-failed',
        message: 'Failed to check user roles',
        severity: 'error',
        details: 'An error occurred while checking your user roles.',
        help: 'Try refreshing the page. If the problem persists, contact your system administrator.'
      });
    }
  }
}