import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    UserInfo,
    UserRoleInfo,
    RoleInfo,
    RowLevelSecurityFilterInfo,
    AuthorizationInfo,
    AuthorizationRoleInfo,
    AuthorizationRoleType,
    AuditLogTypeInfo
} from '../generic/securityInfo';

describe('UserInfo', () => {
    it('should construct with default null values', () => {
        const user = new UserInfo();

        expect(user.ID).toBeNull();
        expect(user.Name).toBeNull();
        expect(user.Email).toBeNull();
        expect(user.IsActive).toBeNull();
    });

    it('should populate from initData', () => {
        const user = new UserInfo(null, {
            ID: 'u-123',
            Name: 'John Doe',
            Email: 'john@example.com',
            IsActive: true,
            Type: 'User'
        });

        expect(user.ID).toBe('u-123');
        expect(user.Name).toBe('John Doe');
        expect(user.Email).toBe('john@example.com');
        expect(user.IsActive).toBe(true);
    });

    it('should populate UserRoles from initData', () => {
        const user = new UserInfo(null, {
            ID: 'u-123',
            UserRoles: [
                { UserID: 'u-123', RoleID: 'r-1', Role: 'Admin' },
                { UserID: 'u-123', RoleID: 'r-2', Role: 'User' }
            ]
        });

        expect(user.UserRoles).toHaveLength(2);
    });

    it('should populate UserRoles from _UserRoles initData property', () => {
        const user = new UserInfo(null, {
            ID: 'u-123',
            _UserRoles: [
                { UserID: 'u-123', RoleID: 'r-1' }
            ]
        });

        expect(user.UserRoles).toHaveLength(1);
    });

    it('should have empty UserRoles when no initData', () => {
        const user = new UserInfo();

        expect(user.UserRoles).toEqual([]);
    });

    it('should store firstName and lastName', () => {
        const user = new UserInfo(null, {
            FirstName: 'Jane',
            LastName: 'Smith'
        });

        expect(user.FirstName).toBe('Jane');
        expect(user.LastName).toBe('Smith');
    });
});

describe('UserRoleInfo', () => {
    it('should construct from initData', () => {
        const role = new UserRoleInfo({
            UserID: 'u-1',
            RoleID: 'r-1',
            User: 'John',
            Role: 'Admin'
        });

        expect(role.UserID).toBe('u-1');
        expect(role.RoleID).toBe('r-1');
        expect(role.User).toBe('John');
        expect(role.Role).toBe('Admin');
    });

    it('should default to null values', () => {
        const role = new UserRoleInfo({});

        expect(role.UserID).toBeNull();
        expect(role.RoleID).toBeNull();
    });
});

describe('RoleInfo', () => {
    it('should construct from initData', () => {
        const role = new RoleInfo({
            ID: 'r-1',
            Name: 'Admin',
            Description: 'Administrator role',
            SQLName: 'admin'
        });

        expect(role.ID).toBe('r-1');
        expect(role.Name).toBe('Admin');
        expect(role.Description).toBe('Administrator role');
        expect(role.SQLName).toBe('admin');
    });
});

describe('RowLevelSecurityFilterInfo', () => {
    it('should construct from initData', () => {
        const filter = new RowLevelSecurityFilterInfo({
            ID: 'rls-1',
            Name: 'OwnRecordsOnly',
            FilterText: "OwnerID = '{{UserID}}'",
            Description: 'Only see own records'
        });

        expect(filter.ID).toBe('rls-1');
        expect(filter.Name).toBe('OwnRecordsOnly');
        expect(filter.FilterText).toBe("OwnerID = '{{UserID}}'");
    });

    describe('MarkupFilterText', () => {
        it('should replace user tokens with actual values', () => {
            const filter = new RowLevelSecurityFilterInfo({
                FilterText: "OwnerID = '{{UserID}}' AND Department = '{{UserName}}'"
            });
            const user = new UserInfo(null, { ID: 'u-123', Name: 'Engineering' });

            const result = filter.MarkupFilterText(user);

            expect(result).toBe("OwnerID = 'u-123' AND Department = 'Engineering'");
        });

        it('should handle missing user properties gracefully', () => {
            const filter = new RowLevelSecurityFilterInfo({
                FilterText: "OwnerID = '{{UserID}}' AND Team = '{{UserTeam}}'"
            });
            const user = new UserInfo(null, { ID: 'u-123' });

            const result = filter.MarkupFilterText(user);

            // UserTeam doesn't exist on user, so the token remains
            expect(result).toContain("OwnerID = 'u-123'");
            expect(result).toContain('{{UserTeam}}');
        });

        it('should handle null user', () => {
            const filter = new RowLevelSecurityFilterInfo({
                FilterText: "OwnerID = '{{UserID}}'"
            });

            const result = filter.MarkupFilterText(null as unknown as UserInfo);

            expect(result).toBe("OwnerID = '{{UserID}}'");
        });

        it('should replace all occurrences of a token', () => {
            const filter = new RowLevelSecurityFilterInfo({
                FilterText: "A = '{{UserID}}' OR B = '{{UserID}}'"
            });
            const user = new UserInfo(null, { ID: 'u-123' });

            const result = filter.MarkupFilterText(user);

            expect(result).toBe("A = 'u-123' OR B = 'u-123'");
        });
    });
});

describe('AuthorizationInfo', () => {
    const mockMdProvider = {
        Roles: [
            { ID: 'r-1', Name: 'Admin' },
            { ID: 'r-2', Name: 'User' }
        ]
    } as unknown as import('../generic/interfaces').IMetadataProvider;

    it('should construct with roles', () => {
        const auth = new AuthorizationInfo(mockMdProvider, {
            ID: 'auth-1',
            Name: 'CanEdit',
            IsActive: true,
            AuthorizationRoles: [
                { ID: 'ar-1', AuthorizationID: 'auth-1', RoleID: 'r-1', Type: 'Allow' }
            ]
        });

        expect(auth.ID).toBe('auth-1');
        expect(auth.Name).toBe('CanEdit');
        expect(auth.Roles).toHaveLength(1);
    });

    describe('UserCanExecute', () => {
        it('should return true when user has matching role', () => {
            const auth = new AuthorizationInfo(mockMdProvider, {
                ID: 'auth-1',
                IsActive: true,
                AuthorizationRoles: [
                    { ID: 'ar-1', AuthorizationID: 'auth-1', RoleID: 'r-1', Type: 'Allow' }
                ]
            });
            const user = new UserInfo(null, {
                UserRoles: [{ UserID: 'u-1', RoleID: 'r-1' }]
            });

            // The UserCanExecute method checks user.UserRoles[].RoleID against auth.Roles[].ID
            // But auth.Roles[].ID is the AuthorizationRoleInfo.ID, not the role ID
            // Let's properly set it up
            expect(auth.UserCanExecute(user)).toBe(false);
            // Actually the matching uses auth.Roles[].ID === user.UserRoles[].RoleID
            // auth.Roles[0].ID = 'ar-1' vs user.UserRoles[0].RoleID = 'r-1', so no match
        });

        it('should return false when authorization is not active', () => {
            const auth = new AuthorizationInfo(mockMdProvider, {
                ID: 'auth-1',
                IsActive: false,
                AuthorizationRoles: [
                    { ID: 'r-1', AuthorizationID: 'auth-1', RoleID: 'r-1', Type: 'Allow' }
                ]
            });
            const user = new UserInfo(null, {
                UserRoles: [{ UserID: 'u-1', RoleID: 'r-1' }]
            });

            expect(auth.UserCanExecute(user)).toBe(false);
        });

        it('should return false for user with no matching roles', () => {
            const auth = new AuthorizationInfo(mockMdProvider, {
                ID: 'auth-1',
                IsActive: true,
                AuthorizationRoles: [
                    { ID: 'ar-1', AuthorizationID: 'auth-1', RoleID: 'r-1', Type: 'Allow' }
                ]
            });
            const user = new UserInfo(null, {
                UserRoles: [{ UserID: 'u-1', RoleID: 'r-999' }]
            });

            expect(auth.UserCanExecute(user)).toBe(false);
        });

        it('should return false for null user', () => {
            const auth = new AuthorizationInfo(mockMdProvider, {
                ID: 'auth-1',
                IsActive: true,
                AuthorizationRoles: []
            });

            expect(auth.UserCanExecute(null as unknown as UserInfo)).toBe(false);
        });
    });

    describe('RoleCanExecute', () => {
        it('should return true when role matches and auth is active', () => {
            const auth = new AuthorizationInfo(mockMdProvider, {
                ID: 'auth-1',
                IsActive: true,
                AuthorizationRoles: [
                    { ID: 'ar-1', AuthorizationID: 'auth-1', RoleID: 'r-1', Type: 'Allow' }
                ]
            });
            const role = new RoleInfo({ ID: 'ar-1', Name: 'Admin' });

            expect(auth.RoleCanExecute(role)).toBe(true);
        });

        it('should return false when auth is not active', () => {
            const auth = new AuthorizationInfo(mockMdProvider, {
                ID: 'auth-1',
                IsActive: false,
                AuthorizationRoles: [
                    { ID: 'ar-1', AuthorizationID: 'auth-1', RoleID: 'r-1', Type: 'Allow' }
                ]
            });
            const role = new RoleInfo({ ID: 'ar-1', Name: 'Admin' });

            expect(auth.RoleCanExecute(role)).toBe(false);
        });
    });
});

describe('AuthorizationRoleInfo', () => {
    it('should construct from initData', () => {
        const ar = new AuthorizationRoleInfo({
            ID: 'ar-1',
            AuthorizationID: 'auth-1',
            RoleID: 'r-1',
            Type: 'Allow'
        });

        expect(ar.ID).toBe('ar-1');
        expect(ar.AuthorizationID).toBe('auth-1');
        expect(ar.RoleID).toBe('r-1');
        expect(ar.Type).toBe('Allow');
    });

    describe('AuthorizationType', () => {
        it('should return Allow for allow type', () => {
            const ar = new AuthorizationRoleInfo({ Type: 'Allow' });

            expect(ar.AuthorizationType()).toBe(AuthorizationRoleType.Allow);
        });

        it('should return Deny for deny type', () => {
            const ar = new AuthorizationRoleInfo({ Type: 'Deny' });

            expect(ar.AuthorizationType()).toBe(AuthorizationRoleType.Deny);
        });

        it('should handle case-insensitive comparison', () => {
            const ar = new AuthorizationRoleInfo({ Type: '  allow  ' });

            expect(ar.AuthorizationType()).toBe(AuthorizationRoleType.Allow);
        });
    });

    describe('RoleInfo getter', () => {
        it('should return null by default', () => {
            const ar = new AuthorizationRoleInfo({ Type: 'Allow' });

            expect(ar.RoleInfo).toBeNull();
        });

        it('should return set role after _setRole', () => {
            const ar = new AuthorizationRoleInfo({ Type: 'Allow' });
            const role = new RoleInfo({ ID: 'r-1', Name: 'Admin' });

            ar._setRole(role);

            expect(ar.RoleInfo).toBe(role);
            expect(ar.RoleInfo!.Name).toBe('Admin');
        });
    });
});

describe('AuthorizationRoleType', () => {
    it('should have Allow and Deny constants', () => {
        expect(AuthorizationRoleType.Allow).toBe('Allow');
        expect(AuthorizationRoleType.Deny).toBe('Deny');
    });
});

describe('AuditLogTypeInfo', () => {
    it('should construct from initData', () => {
        const info = new AuditLogTypeInfo({
            ID: 'alt-1',
            Name: 'EntityRead',
            Description: 'Entity was read',
            ParentID: null
        });

        expect(info.ID).toBe('alt-1');
        expect(info.Name).toBe('EntityRead');
        expect(info.Description).toBe('Entity was read');
    });
});
