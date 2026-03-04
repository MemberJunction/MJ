import { MJGlobal } from '@memberjunction/global';
import type { MJIntegrationEntity } from '@memberjunction/core-entities';
import type { IIntegrationSourceType } from './entity-types.js';
import { BaseIntegrationConnector } from './BaseIntegrationConnector.js';

/**
 * Factory for resolving integration connectors using MJGlobal.ClassFactory.
 * Connectors register themselves via `@RegisterClass(BaseIntegrationConnector, 'DriverClassName')`.
 */
export class ConnectorFactory {
    /**
     * Resolves and instantiates the appropriate connector for an integration.
     * Looks up the DriverClass from the integration's source type and uses
     * MJGlobal.ClassFactory to create the connector instance.
     *
     * @param integration - The integration entity defining which external system to connect to
     * @param sourceTypes - Array of available integration source type entities
     * @returns An instance of the appropriate BaseIntegrationConnector subclass
     * @throws Error if no source type matches or no connector is registered for the driver class
     */
    public static Resolve(
        integration: MJIntegrationEntity,
        sourceTypes: IIntegrationSourceType[]
    ): BaseIntegrationConnector {
        const driverClass = ConnectorFactory.FindDriverClass(integration, sourceTypes);
        return ConnectorFactory.CreateConnectorInstance(driverClass);
    }

    /**
     * Finds the DriverClass name from the source types that matches the integration's ClassName.
     */
    private static FindDriverClass(
        integration: MJIntegrationEntity,
        sourceTypes: IIntegrationSourceType[]
    ): string {
        const className = integration.ClassName;
        if (!className) {
            throw new Error(
                `Integration "${integration.Name}" does not have a ClassName configured.`
            );
        }

        const sourceType = sourceTypes.find(st => st.DriverClass === className);
        if (!sourceType) {
            throw new Error(
                `No IntegrationSourceType found with DriverClass "${className}" for integration "${integration.Name}".`
            );
        }

        return sourceType.DriverClass;
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
