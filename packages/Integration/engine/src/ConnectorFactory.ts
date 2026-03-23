import { MJGlobal } from '@memberjunction/global';
import type { MJIntegrationEntity } from '@memberjunction/core-entities';
import { BaseIntegrationConnector } from './BaseIntegrationConnector.js';

/**
 * Factory for resolving integration connectors using MJGlobal.ClassFactory.
 * Connectors register themselves via `@RegisterClass(BaseIntegrationConnector, 'DriverClassName')`.
 *
 * Resolution uses the `ClassName` field on the Integration entity directly —
 * IntegrationSourceType is a general category (SaaS API, Database, File Feed)
 * and is NOT used for connector lookup.
 */
export class ConnectorFactory {
    /**
     * Resolves and instantiates the appropriate connector for an integration.
     * Uses `integration.ClassName` to look up the registered connector class
     * in MJGlobal.ClassFactory.
     *
     * @param integration - The integration entity defining which external system to connect to
     * @returns An instance of the appropriate BaseIntegrationConnector subclass
     * @throws Error if ClassName is missing or no connector is registered for it
     */
    public static Resolve(
        integration: MJIntegrationEntity
    ): BaseIntegrationConnector {
        const className = integration.ClassName;
        if (!className) {
            throw new Error(
                `Integration "${integration.Name}" does not have a ClassName configured.`
            );
        }

        return ConnectorFactory.CreateConnectorInstance(className);
    }

    /**
     * Creates a connector instance via MJGlobal.ClassFactory.
     * First verifies a registration exists to avoid falling back to the abstract base class.
     */
    private static CreateConnectorInstance(driverClass: string): BaseIntegrationConnector {
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseIntegrationConnector,
            driverClass
        );

        if (!registration) {
            throw new Error(
                `No connector registered for driver class "${driverClass}". ` +
                `Ensure a class is decorated with @RegisterClass(BaseIntegrationConnector, '${driverClass}').`
            );
        }

        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseIntegrationConnector>(
            BaseIntegrationConnector,
            driverClass
        );

        return instance!;
    }
}
