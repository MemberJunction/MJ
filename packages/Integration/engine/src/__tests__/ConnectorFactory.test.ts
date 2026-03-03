import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { BaseIntegrationConnector } from '../BaseIntegrationConnector.js';
import { ConnectorFactory } from '../ConnectorFactory.js';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationEntity,
    MJIntegrationSourceTypeEntity,
} from '@memberjunction/core-entities';
import type {
    ConnectionTestResult,
    ExternalObjectSchema,
    ExternalFieldSchema,
    FetchContext,
    FetchBatchResult,
} from '../BaseIntegrationConnector.js';

// --- Mock Connector ---
@RegisterClass(BaseIntegrationConnector, 'MockConnector')
class MockConnector extends BaseIntegrationConnector {
    public async TestConnection(): Promise<ConnectionTestResult> {
        return { Success: true, Message: 'OK' };
    }
    public async DiscoverObjects(): Promise<ExternalObjectSchema[]> {
        return [];
    }
    public async DiscoverFields(): Promise<ExternalFieldSchema[]> {
        return [];
    }
    public async FetchChanges(_ctx: FetchContext): Promise<FetchBatchResult> {
        return { Records: [], HasMore: false };
    }
}

// Helpers to create mock entities
function createMockIntegration(className: string | null): MJIntegrationEntity {
    return {
        Name: 'TestIntegration',
        ClassName: className,
        Get: vi.fn((field: string) => {
            if (field === 'ID') return 'int-1';
            if (field === 'ClassName') return className;
            return null;
        }),
    } as unknown as MJIntegrationEntity;
}

function createMockSourceTypes(driverClasses: string[]): MJIntegrationSourceTypeEntity[] {
    return driverClasses.map(dc => ({
        DriverClass: dc,
        Name: dc,
        Status: 'Active' as const,
    } as unknown as MJIntegrationSourceTypeEntity));
}

describe('ConnectorFactory', () => {
    describe('Resolve', () => {
        it('should return a connector instance for a registered driver class', () => {
            const integration = createMockIntegration('MockConnector');
            const sourceTypes = createMockSourceTypes(['MockConnector']);

            const connector = ConnectorFactory.Resolve(integration, sourceTypes);
            expect(connector).toBeInstanceOf(BaseIntegrationConnector);
        });

        it('should throw when integration has no ClassName', () => {
            const integration = createMockIntegration(null);
            const sourceTypes = createMockSourceTypes(['MockConnector']);

            expect(() => ConnectorFactory.Resolve(integration, sourceTypes))
                .toThrow('does not have a ClassName configured');
        });

        it('should throw when no source type matches the ClassName', () => {
            const integration = createMockIntegration('UnknownDriver');
            const sourceTypes = createMockSourceTypes(['MockConnector']);

            expect(() => ConnectorFactory.Resolve(integration, sourceTypes))
                .toThrow('No IntegrationSourceType found with DriverClass "UnknownDriver"');
        });

        it('should throw when the driver class is not registered in ClassFactory', () => {
            const integration = createMockIntegration('UnregisteredConnector');
            const sourceTypes = createMockSourceTypes(['UnregisteredConnector']);

            expect(() => ConnectorFactory.Resolve(integration, sourceTypes))
                .toThrow('No connector registered for driver class "UnregisteredConnector"');
        });
    });
});
