import { describe, it, expect } from 'vitest';
import { IsEntityBlocked, IsIntegrationWriteAllowed, GetBlockedEntities } from '../AccessControl.js';

describe('AccessControl', () => {
    describe('IsEntityBlocked', () => {
        it('should block system entities', () => {
            expect(IsEntityBlocked('Users')).toBe(true);
            expect(IsEntityBlocked('Roles')).toBe(true);
            expect(IsEntityBlocked('MJ: Entities')).toBe(true);
            expect(IsEntityBlocked('MJ: Entity Fields')).toBe(true);
            expect(IsEntityBlocked('MJ: Encryption Keys')).toBe(true);
        });

        it('should not block custom entities', () => {
            expect(IsEntityBlocked('Contacts')).toBe(false);
            expect(IsEntityBlocked('HubSpot Deals')).toBe(false);
        });
    });

    describe('GetBlockedEntities', () => {
        it('should return the blocklist', () => {
            const blocked = GetBlockedEntities();
            expect(blocked.length).toBeGreaterThan(0);
            expect(blocked).toContain('Users');
        });
    });

    describe('IsIntegrationWriteAllowed', () => {
        it('should deny blocked entities regardless of schema', () => {
            const result = IsIntegrationWriteAllowed('Users', '__mj', [{ Name: 'IntegrationWriteAllowed', Value: 'true' }]);
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('blocklist');
        });

        it('should allow non-__mj schema entities', () => {
            const result = IsIntegrationWriteAllowed('Deal', 'hubspot', []);
            expect(result.Allowed).toBe(true);
            expect(result.Reason).toContain('custom schema');
        });

        it('should allow __mj entities with IntegrationWriteAllowed=true', () => {
            const result = IsIntegrationWriteAllowed('Contacts', '__mj', [{ Name: 'IntegrationWriteAllowed', Value: 'true' }]);
            expect(result.Allowed).toBe(true);
        });

        it('should deny __mj entities without IntegrationWriteAllowed setting', () => {
            const result = IsIntegrationWriteAllowed('Contacts', '__mj', []);
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('does not have IntegrationWriteAllowed');
        });

        it('should deny __mj entities with IntegrationWriteAllowed=false', () => {
            const result = IsIntegrationWriteAllowed('Contacts', '__mj', [{ Name: 'IntegrationWriteAllowed', Value: 'false' }]);
            expect(result.Allowed).toBe(false);
        });
    });
});
