import { describe, it, expect } from 'vitest';
import type {
    ActionableCommand,
    OpenResourceCommand,
    OpenURLCommand,
    AutomaticCommand,
    RefreshDataCommand,
    ShowNotificationCommand,
    ResourceType,
    CacheName
} from '../ui-commands';

describe('OpenResourceCommand', () => {
    it('should create a record command with all fields', () => {
        const cmd: OpenResourceCommand = {
            type: 'open:resource',
            label: 'Open Customer Record',
            icon: 'fa-user',
            resourceType: 'Record',
            entityName: 'Customers',
            resourceId: 'cust-123',
            mode: 'view'
        };

        expect(cmd.type).toBe('open:resource');
        expect(cmd.label).toBe('Open Customer Record');
        expect(cmd.icon).toBe('fa-user');
        expect(cmd.resourceType).toBe('Record');
        expect(cmd.entityName).toBe('Customers');
        expect(cmd.resourceId).toBe('cust-123');
        expect(cmd.mode).toBe('view');
    });

    it('should work without optional fields', () => {
        const cmd: OpenResourceCommand = {
            type: 'open:resource',
            label: 'Open Report',
            resourceType: 'Report',
            resourceId: 'rpt-789'
        };

        expect(cmd.type).toBe('open:resource');
        expect(cmd.icon).toBeUndefined();
        expect(cmd.entityName).toBeUndefined();
        expect(cmd.mode).toBeUndefined();
        expect(cmd.parameters).toBeUndefined();
    });

    it('should support all resource types', () => {
        const types: ResourceType[] = ['Record', 'Dashboard', 'Report', 'Form', 'View'];

        types.forEach(resourceType => {
            const cmd: OpenResourceCommand = {
                type: 'open:resource',
                label: `Open ${resourceType}`,
                resourceType,
                resourceId: 'id-1'
            };
            expect(cmd.resourceType).toBe(resourceType);
        });
    });
});

describe('OpenURLCommand', () => {
    it('should create a URL command with all fields', () => {
        const cmd: OpenURLCommand = {
            type: 'open:url',
            label: 'Visit Website',
            icon: 'fa-external-link',
            url: 'https://example.com',
            newTab: true
        };

        expect(cmd.type).toBe('open:url');
        expect(cmd.label).toBe('Visit Website');
        expect(cmd.icon).toBe('fa-external-link');
        expect(cmd.url).toBe('https://example.com');
        expect(cmd.newTab).toBe(true);
    });

    it('should default newTab to undefined when not specified', () => {
        const cmd: OpenURLCommand = {
            type: 'open:url',
            label: 'Open Link',
            url: 'https://example.com'
        };

        expect(cmd.newTab).toBeUndefined();
    });
});

describe('RefreshDataCommand', () => {
    it('should create entity scope refresh command', () => {
        const cmd: RefreshDataCommand = {
            type: 'refresh:data',
            scope: 'entity',
            entityNames: ['Customers', 'Contacts']
        };

        expect(cmd.type).toBe('refresh:data');
        expect(cmd.scope).toBe('entity');
        expect(cmd.entityNames).toEqual(['Customers', 'Contacts']);
    });

    it('should create cache scope refresh command', () => {
        const cmd: RefreshDataCommand = {
            type: 'refresh:data',
            scope: 'cache',
            cacheName: 'AI'
        };

        expect(cmd.type).toBe('refresh:data');
        expect(cmd.scope).toBe('cache');
        expect(cmd.cacheName).toBe('AI');
    });
});

describe('ShowNotificationCommand', () => {
    it('should create notification with all fields', () => {
        const cmd: ShowNotificationCommand = {
            type: 'notification',
            message: 'Operation complete',
            severity: 'success',
            duration: 5000
        };

        expect(cmd.type).toBe('notification');
        expect(cmd.message).toBe('Operation complete');
        expect(cmd.severity).toBe('success');
        expect(cmd.duration).toBe(5000);
    });

    it('should work with only required fields', () => {
        const cmd: ShowNotificationCommand = {
            type: 'notification',
            message: 'Something happened'
        };

        expect(cmd.type).toBe('notification');
        expect(cmd.message).toBe('Something happened');
        expect(cmd.severity).toBeUndefined();
        expect(cmd.duration).toBeUndefined();
    });
});

describe('ActionableCommand discriminated union', () => {
    it('should discriminate open:resource commands', () => {
        const cmd: ActionableCommand = {
            type: 'open:resource',
            label: 'Open Record',
            resourceType: 'Record',
            resourceId: 'r-1'
        };

        expect(cmd.type).toBe('open:resource');
        if (cmd.type === 'open:resource') {
            expect(cmd.resourceType).toBe('Record');
            expect(cmd.resourceId).toBe('r-1');
        }
    });

    it('should discriminate open:url commands', () => {
        const cmd: ActionableCommand = {
            type: 'open:url',
            label: 'Open Link',
            url: 'https://example.com'
        };

        expect(cmd.type).toBe('open:url');
        if (cmd.type === 'open:url') {
            expect(cmd.url).toBe('https://example.com');
        }
    });
});

describe('AutomaticCommand discriminated union', () => {
    it('should discriminate refresh:data commands', () => {
        const cmd: AutomaticCommand = {
            type: 'refresh:data',
            scope: 'cache',
            cacheName: 'Core'
        };

        expect(cmd.type).toBe('refresh:data');
        if (cmd.type === 'refresh:data') {
            expect(cmd.scope).toBe('cache');
            expect(cmd.cacheName).toBe('Core');
        }
    });

    it('should discriminate notification commands', () => {
        const cmd: AutomaticCommand = {
            type: 'notification',
            message: 'Done'
        };

        expect(cmd.type).toBe('notification');
        if (cmd.type === 'notification') {
            expect(cmd.message).toBe('Done');
        }
    });
});

describe('JSON round-trip serialization', () => {
    it('should round-trip OpenResourceCommand through JSON', () => {
        const original: OpenResourceCommand = {
            type: 'open:resource',
            label: 'View Sales Dashboard',
            icon: 'fa-chart-line',
            resourceType: 'Dashboard',
            resourceId: 'dash-456'
        };

        const json = JSON.stringify(original);
        const restored: OpenResourceCommand = JSON.parse(json);

        expect(restored.type).toBe(original.type);
        expect(restored.label).toBe(original.label);
        expect(restored.icon).toBe(original.icon);
        expect(restored.resourceType).toBe(original.resourceType);
        expect(restored.resourceId).toBe(original.resourceId);
    });

    it('should round-trip OpenURLCommand through JSON', () => {
        const original: OpenURLCommand = {
            type: 'open:url',
            label: 'Visit Docs',
            url: 'https://docs.example.com',
            newTab: true
        };

        const json = JSON.stringify(original);
        const restored: OpenURLCommand = JSON.parse(json);

        expect(restored.type).toBe(original.type);
        expect(restored.url).toBe(original.url);
        expect(restored.newTab).toBe(original.newTab);
    });

    it('should round-trip a mixed commands array through JSON', () => {
        const actionable: ActionableCommand[] = [
            {
                type: 'open:resource',
                label: 'Open Record',
                resourceType: 'Record',
                entityName: 'Users',
                resourceId: 'u-1',
                mode: 'edit'
            },
            {
                type: 'open:url',
                label: 'Visit Site',
                url: 'https://example.com',
                newTab: true
            }
        ];
        const automatic: AutomaticCommand[] = [
            {
                type: 'refresh:data',
                scope: 'entity',
                entityNames: ['Users']
            },
            {
                type: 'notification',
                message: 'Record saved',
                severity: 'success',
                duration: 3000
            }
        ];

        const payload = { actionableCommands: actionable, automaticCommands: automatic };
        const json = JSON.stringify(payload);
        const restored = JSON.parse(json) as typeof payload;

        expect(restored.actionableCommands).toHaveLength(2);
        expect(restored.actionableCommands[0].type).toBe('open:resource');
        expect(restored.actionableCommands[1].type).toBe('open:url');
        expect(restored.automaticCommands).toHaveLength(2);
        expect(restored.automaticCommands[0].type).toBe('refresh:data');
        expect(restored.automaticCommands[1].type).toBe('notification');
    });
});
