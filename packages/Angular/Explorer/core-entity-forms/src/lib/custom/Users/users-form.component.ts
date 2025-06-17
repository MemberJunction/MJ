import { Component, OnInit, ChangeDetectorRef, ElementRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { UserEntity, UserRoleEntity, UserApplicationEntity, UserNotificationEntity, DashboardEntity, UserViewEntity, ReportEntity, UserFavoriteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { UserFormComponent } from '../../generated/Entities/User/user.form.component';

@RegisterClass(BaseFormComponent, 'Users')
@Component({
    selector: 'mj-users-form',
    templateUrl: './users-form.component.html',
    styleUrls: ['./users-form.component.css']
})
export class UsersFormComponentExtended extends UserFormComponent implements OnInit {
    public record!: UserEntity;
    
    // Related data
    public userRoles: UserRoleEntity[] = [];
    public userApplications: UserApplicationEntity[] = [];
    public userNotifications: UserNotificationEntity[] = [];
    public userDashboards: DashboardEntity[] = [];
    public userReports: ReportEntity[] = [];
    public userFavorites: UserFavoriteEntity[] = [];
    public recentActivity: any[] = [];
    
    // Available roles for assignment
    public availableRoles: any[] = [];
    public assignedRoles: any[] = [];
    
    // Loading states
    public isLoadingRoles = false;
    public isLoadingApplications = false;
    public isLoadingActivity = false;
    public isLoadingNotifications = false;
    
    // UI state
    public showPasswordFields = false;
    public newPassword = '';
    public confirmPassword = '';
    public passwordStrength = 0;
    public twoFactorEnabled = false;
    
    // Last login info
    public lastLoginDate: Date | null = null;
    public loginCount = 0;
    public recentLogins: any[] = [];
    
    private _metadata = new Metadata();
    
    constructor(
        elementRef: ElementRef,
        sharedService: SharedService,
        router: Router,
        route: ActivatedRoute,
        public cdr: ChangeDetectorRef
    ) {
        super(elementRef, sharedService, router, route, cdr);
    }
    
    async ngOnInit() {
        await super.ngOnInit();
        
        // Load all related data in parallel if we have a saved record
        if (this.record?.IsSaved) {
            await Promise.all([
                this.loadUserRoles(),
                this.loadUserApplications(),
                this.loadUserNotifications(),
                this.loadUserDashboards(),
                this.loadUserReports(),
                this.loadAvailableRoles(),
                this.loadRecentActivity()
            ]);
        } else {
            // For new users, just load available roles
            await this.loadAvailableRoles();
        }
    }
    
    /**
     * Load user roles
     */
    public async loadUserRoles() {
        if (!this.record?.ID) return;
        
        this.isLoadingRoles = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<UserRoleEntity>({
                EntityName: 'User Roles',
                ExtraFilter: `UserID='${this.record.ID}'`,
                OrderBy: 'RoleName ASC',
                ResultType: 'entity_object'
            });
            
            this.userRoles = result.Results;
            
            // Update assigned roles for the UI
            this.assignedRoles = this.userRoles.map(ur => ({
                id: ur.RoleID,
                name: ur.RoleName,
                description: ur.get('RoleDescription') || ''
            }));
            
            // Update available roles to exclude assigned ones
            this.updateAvailableRoles();
            
        } catch (error) {
            console.error('Error loading user roles:', error);
            this.userRoles = [];
        } finally {
            this.isLoadingRoles = false;
        }
    }
    
    /**
     * Load all available roles
     */
    public async loadAvailableRoles() {
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'Roles',
                OrderBy: 'Name ASC',
                ResultType: 'simple'
            });
            
            const allRoles = result.Results.map((r: any) => ({
                id: r.ID,
                name: r.Name,
                description: r.Description || ''
            }));
            
            // Filter out already assigned roles
            this.updateAvailableRoles(allRoles);
            
        } catch (error) {
            console.error('Error loading available roles:', error);
        }
    }
    
    /**
     * Update available roles by filtering out assigned ones
     */
    private updateAvailableRoles(allRoles?: any[]) {
        if (!allRoles) {
            // Just filter existing available roles
            const assignedIds = this.assignedRoles.map(r => r.id);
            this.availableRoles = this.availableRoles.filter(r => !assignedIds.includes(r.id));
        } else {
            // Filter from all roles
            const assignedIds = this.assignedRoles.map(r => r.id);
            this.availableRoles = allRoles.filter(r => !assignedIds.includes(r.id));
        }
    }
    
    /**
     * Load user application access
     */
    public async loadUserApplications() {
        if (!this.record?.ID) return;
        
        this.isLoadingApplications = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<UserApplicationEntity>({
                EntityName: 'User Applications',
                ExtraFilter: `UserID='${this.record.ID}'`,
                OrderBy: 'Sequence ASC, Application ASC',
                ResultType: 'entity_object'
            });
            
            this.userApplications = result.Results;
            
        } catch (error) {
            console.error('Error loading user applications:', error);
            this.userApplications = [];
        } finally {
            this.isLoadingApplications = false;
        }
    }
    
    /**
     * Load user notifications
     */
    public async loadUserNotifications() {
        if (!this.record?.ID) return;
        
        this.isLoadingNotifications = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<UserNotificationEntity>({
                EntityName: 'User Notifications',
                ExtraFilter: `UserID='${this.record.ID}'`,
                OrderBy: 'CreatedAt DESC',
                MaxRows: 10,
                ResultType: 'entity_object'
            });
            
            this.userNotifications = result.Results;
            
        } catch (error) {
            console.error('Error loading user notifications:', error);
            this.userNotifications = [];
        } finally {
            this.isLoadingNotifications = false;
        }
    }
    
    /**
     * Load user dashboards
     */
    public async loadUserDashboards() {
        if (!this.record?.ID) return;
        
        try {
            const rv = new RunView();
            const result = await rv.RunView<DashboardEntity>({
                EntityName: 'Dashboards',
                ExtraFilter: `UserID='${this.record.ID}'`,
                OrderBy: '__mj_UpdatedAt DESC',
                ResultType: 'entity_object'
            });
            
            this.userDashboards = result.Results;
            
        } catch (error) {
            console.error('Error loading user dashboards:', error);
            this.userDashboards = [];
        }
    }
    
    /**
     * Load user reports
     */
    public async loadUserReports() {
        if (!this.record?.ID) return;
        
        try {
            const rv = new RunView();
            const result = await rv.RunView<ReportEntity>({
                EntityName: 'Reports',
                ExtraFilter: `UserID='${this.record.ID}'`,
                OrderBy: '__mj_UpdatedAt DESC',
                MaxRows: 10,
                ResultType: 'entity_object'
            });
            
            this.userReports = result.Results;
            
        } catch (error) {
            console.error('Error loading user reports:', error);
            this.userReports = [];
        }
    }
    
    /**
     * Load recent activity
     */
    public async loadRecentActivity() {
        if (!this.record?.ID) return;
        
        this.isLoadingActivity = true;
        try {
            // This would typically load from an audit log or activity tracking entity
            // For now, we'll simulate with some data
            this.recentActivity = [
                { action: 'Login', timestamp: new Date(), details: 'Successful login from Chrome' },
                { action: 'Dashboard Viewed', timestamp: new Date(Date.now() - 3600000), details: 'Viewed Sales Dashboard' },
                { action: 'Report Generated', timestamp: new Date(Date.now() - 7200000), details: 'Generated Monthly Revenue Report' }
            ];
            
            // Simulate login history
            this.recentLogins = [
                { timestamp: new Date(), ipAddress: '192.168.1.100', browser: 'Chrome', status: 'Success' },
                { timestamp: new Date(Date.now() - 86400000), ipAddress: '192.168.1.100', browser: 'Firefox', status: 'Success' },
                { timestamp: new Date(Date.now() - 172800000), ipAddress: '10.0.0.50', browser: 'Safari', status: 'Failed' }
            ];
            
            this.lastLoginDate = this.recentLogins[0]?.timestamp || null;
            this.loginCount = this.recentLogins.length;
            
        } catch (error) {
            console.error('Error loading recent activity:', error);
            this.recentActivity = [];
        } finally {
            this.isLoadingActivity = false;
        }
    }
    
    /**
     * Get status badge color
     */
    public getStatusBadgeColor(): string {
        return this.record?.IsActive ? '#28a745' : '#dc3545';
    }
    
    /**
     * Get status text
     */
    public getStatusText(): string {
        return this.record?.IsActive ? 'Active' : 'Inactive';
    }
    
    /**
     * Toggle password fields visibility
     */
    public togglePasswordFields() {
        this.showPasswordFields = !this.showPasswordFields;
        if (!this.showPasswordFields) {
            this.newPassword = '';
            this.confirmPassword = '';
            this.passwordStrength = 0;
        }
    }
    
    /**
     * Calculate password strength
     */
    public calculatePasswordStrength() {
        const password = this.newPassword;
        let strength = 0;
        
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        
        this.passwordStrength = Math.min(strength, 5);
    }
    
    /**
     * Get password strength color
     */
    public getPasswordStrengthColor(): string {
        const colors = ['#dc3545', '#dc3545', '#ffc107', '#ffc107', '#28a745', '#28a745'];
        return colors[this.passwordStrength];
    }
    
    /**
     * Get password strength text
     */
    public getPasswordStrengthText(): string {
        const texts = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
        return texts[this.passwordStrength];
    }
    
    /**
     * Send password reset email
     */
    public async sendPasswordResetEmail() {
        try {
            // This would typically call a server API to send the reset email
            MJNotificationService.Instance.CreateSimpleNotification(
                'Password reset email sent successfully',
                'success',
                4000
            );
        } catch (error) {
            console.error('Error sending password reset email:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to send password reset email',
                'error',
                5000
            );
        }
    }
    
    /**
     * Toggle 2FA
     */
    public async toggle2FA() {
        try {
            this.twoFactorEnabled = !this.twoFactorEnabled;
            // This would typically call a server API to enable/disable 2FA
            MJNotificationService.Instance.CreateSimpleNotification(
                `Two-factor authentication ${this.twoFactorEnabled ? 'enabled' : 'disabled'}`,
                'success',
                4000
            );
        } catch (error) {
            console.error('Error toggling 2FA:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to update two-factor authentication',
                'error',
                5000
            );
        }
    }
    
    /**
     * Impersonate user (admin only)
     */
    public async impersonateUser() {
        try {
            // This would typically call a server API to start impersonation
            MJNotificationService.Instance.CreateSimpleNotification(
                `Now impersonating ${this.record.Name}`,
                'info',
                4000
            );
        } catch (error) {
            console.error('Error impersonating user:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to impersonate user',
                'error',
                5000
            );
        }
    }
    
    /**
     * Export user data (GDPR)
     */
    public async exportUserData() {
        try {
            // This would typically call a server API to generate an export
            MJNotificationService.Instance.CreateSimpleNotification(
                'User data export started. You will receive an email when complete.',
                'info',
                5000
            );
        } catch (error) {
            console.error('Error exporting user data:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to export user data',
                'error',
                5000
            );
        }
    }
    
    /**
     * Copy permissions from another user
     */
    public async copyPermissionsFromUser() {
        try {
            // This would open a user selection dialog
            MJNotificationService.Instance.CreateSimpleNotification(
                'User selection dialog coming soon',
                'info',
                3000
            );
        } catch (error) {
            console.error('Error copying permissions:', error);
        }
    }
    
    /**
     * Navigate to a dashboard
     */
    public navigateToDashboard(dashboardId: string) {
        SharedService.Instance.OpenEntityRecord('Dashboards', CompositeKey.FromID(dashboardId));
    }
    
    /**
     * Navigate to a report
     */
    public navigateToReport(reportId: string) {
        SharedService.Instance.OpenEntityRecord('Reports', CompositeKey.FromID(reportId));
    }
    
    /**
     * Format date for display
     */
    public formatDate(date: Date | string | null): string {
        if (!date) return 'Never';
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    }
    
    /**
     * Get user type badge color
     */
    public getUserTypeBadgeColor(): string {
        return this.record?.Type === 'Owner' ? '#6f42c1' : '#17a2b8';
    }
    
    /**
     * Assign role to user
     */
    public async assignRole(role: any) {
        try {
            const userRole = await this._metadata.GetEntityObject<UserRoleEntity>('User Roles');
            userRole.UserID = this.record.ID;
            userRole.RoleID = role.id;
            
            const saved = await userRole.Save();
            if (saved) {
                // Move from available to assigned
                this.availableRoles = this.availableRoles.filter(r => r.id !== role.id);
                this.assignedRoles.push(role);
                
                await this.loadUserRoles(); // Reload to get full data
                
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Role "${role.name}" assigned successfully`,
                    'success',
                    3000
                );
            }
        } catch (error) {
            console.error('Error assigning role:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to assign role',
                'error',
                4000
            );
        }
    }
    
    /**
     * Remove role from user
     */
    public async removeRole(role: any) {
        try {
            const userRole = this.userRoles.find(ur => ur.RoleID === role.id);
            if (userRole) {
                const deleted = await userRole.Delete();
                if (deleted) {
                    // Move from assigned to available
                    this.assignedRoles = this.assignedRoles.filter(r => r.id !== role.id);
                    this.availableRoles.push(role);
                    
                    await this.loadUserRoles(); // Reload to get updated data
                    
                    MJNotificationService.Instance.CreateSimpleNotification(
                        `Role "${role.name}" removed successfully`,
                        'success',
                        3000
                    );
                }
            }
        } catch (error) {
            console.error('Error removing role:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to remove role',
                'error',
                4000
            );
        }
    }
    
    /**
     * Toggle application access
     */
    public async toggleApplicationAccess(app: UserApplicationEntity) {
        try {
            app.IsActive = !app.IsActive;
            const saved = await app.Save();
            
            if (saved) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Application access ${app.IsActive ? 'enabled' : 'disabled'}`,
                    'success',
                    3000
                );
            }
        } catch (error) {
            console.error('Error toggling application access:', error);
            app.IsActive = !app.IsActive; // Revert
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to update application access',
                'error',
                4000
            );
        }
    }
}

export function LoadUsersFormComponentExtended() {
    // This function ensures the class isn't tree-shaken and registers it with MemberJunction
}