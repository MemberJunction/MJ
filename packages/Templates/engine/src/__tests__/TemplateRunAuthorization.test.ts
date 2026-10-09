import { describe, it, expect } from 'vitest';
import { EntityInfo, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { GetTemplateRunRefusal } from '../operations/TemplateRunAuthorization';

const UI_ROLE_ID = '0b9b7b55-0000-4000-8000-0000000000a1';
const OTHER_ROLE_ID = '0b9b7b55-0000-4000-8000-0000000000a2';

/** An entity whose read permission is granted to the given roles. */
function entityReadableBy(name: string, roleIds: string[]): EntityInfo {
    const entityId = `entity-${name}`;
    return new EntityInfo({
        ID: entityId, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: `vw${name}`, IncludeInAPI: true,
        EntityPermissions: roleIds.map((roleId, index) => ({
            ID: `${entityId}-permission-${index}`, EntityID: entityId, RoleID: roleId,
            CanCreate: false, CanRead: true, CanUpdate: false, CanDelete: false, Type: 'Allow',
        })),
    });
}

/** Entity metadata looked up by name, as a provider serves it. */
function metadataWith(...entities: EntityInfo[]) {
    return {
        EntityByName: (name: string): EntityInfo | undefined =>
            entities.find((e) => e.Name.trim().toLowerCase() === name.trim().toLowerCase()),
    };
}

function makeUser(roleIds: string[]): UserInfo {
    const userId = '0b9b7b55-0000-4000-8000-0000000000b1';
    return new UserInfo(null, {
        ID: userId, Name: 'Template Runner', Email: 'runner@example.com',
        UserRoles: roleIds.map((roleId) => new UserRoleInfo({ UserID: userId, RoleID: roleId })),
    });
}

const READABLE = metadataWith(
    entityReadableBy('MJ: Templates', [UI_ROLE_ID]),
    entityReadableBy('MJ: Template Contents', [UI_ROLE_ID]),
);

describe('GetTemplateRunRefusal', () => {
    it('allows a user who can read templates and their content', () => {
        expect(GetTemplateRunRefusal(makeUser([UI_ROLE_ID]), READABLE)).toBeNull();
    });

    it('refuses when there is no principal', () => {
        expect(GetTemplateRunRefusal(undefined, READABLE)).toBe('Unable to determine current user');
        expect(GetTemplateRunRefusal(null, READABLE)).toBe('Unable to determine current user');
    });

    it('refuses an anonymous magic-link or widget guest, whatever roles the session carries', () => {
        const guest = makeUser([UI_ROLE_ID]);
        guest.IsMagicLinkAnonymous = true;
        expect(GetTemplateRunRefusal(guest, READABLE)).toBe('Running templates is not permitted for scope-limited sessions');
    });

    it.each([
        ['a ResourceID', { ResourceID: '0b9b7b55-0000-4000-8000-0000000000d1' }],
        ['only a ResourceType', { ResourceType: 'Dashboards' }],
    ])('refuses a magic-link session scoped by %s', (_label, scope) => {
        const scoped = makeUser([UI_ROLE_ID]);
        scoped.MagicLinkScope = scope;
        expect(GetTemplateRunRefusal(scoped, READABLE)).toBe('Running templates is not permitted for scope-limited sessions');
    });

    it('does not treat an empty scope object as scope-limited', () => {
        const user = makeUser([UI_ROLE_ID]);
        user.MagicLinkScope = {};
        expect(GetTemplateRunRefusal(user, READABLE)).toBeNull();
    });

    it('refuses a user whose roles do not grant read on MJ: Templates', () => {
        expect(GetTemplateRunRefusal(makeUser([OTHER_ROLE_ID]), READABLE)).toBe('You do not have permission to read MJ: Templates');
    });

    it('refuses a user who can read templates but not template content', () => {
        const metadata = metadataWith(
            entityReadableBy('MJ: Templates', [UI_ROLE_ID]),
            entityReadableBy('MJ: Template Contents', [OTHER_ROLE_ID]),
        );
        expect(GetTemplateRunRefusal(makeUser([UI_ROLE_ID]), metadata)).toBe('You do not have permission to read MJ: Template Contents');
    });

    it('fails closed when the template entities are not in the metadata', () => {
        expect(GetTemplateRunRefusal(makeUser([UI_ROLE_ID]), metadataWith())).toBe('You do not have permission to read MJ: Templates');
    });

    it('fails closed when there is no metadata provider', () => {
        expect(GetTemplateRunRefusal(makeUser([UI_ROLE_ID]), null)).toBe('You do not have permission to read MJ: Templates');
    });
});
