import { describe, it, expect, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseIntegrationConnector } from '../BaseIntegrationConnector.js';
import { ConnectorFactory } from '../ConnectorFactory.js';
import type { MJIntegrationEntity } from '@memberjunction/core-entities';
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

// Helper to create mock integration entity
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

describe('ConnectorFactory', () => {
    describe('Resolve', () => {
        it('should return a connector instance for a registered ClassName', () => {
            const integration = createMockIntegration('MockConnector');

            const connector = ConnectorFactory.Resolve(integration);
            expect(connector).toBeInstanceOf(BaseIntegrationConnector);
        });

        it('should throw when integration has no ClassName', () => {
            const integration = createMockIntegration(null);

            expect(() => ConnectorFactory.Resolve(integration))
                .toThrow('does not have a ClassName configured');
        });

        it('should throw when the ClassName is not registered in ClassFactory', () => {
            const integration = createMockIntegration('UnregisteredConnector');

            expect(() => ConnectorFactory.Resolve(integration))
                .toThrow('No connector registered for driver class "UnregisteredConnector"');
        });
    });
});
