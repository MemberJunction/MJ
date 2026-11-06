import { MJGlobal } from '@memberjunction/global';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';

/** Identity of everything that shapes a driver instance; a change rebuilds the cached driver. */
export function DriverCacheKey(transport: TransportRow): string {
    return JSON.stringify([transport.DriverClass, transport.Configuration ?? '', transport.CredentialID ?? '', transport.Status]);
}

/** Resolves the registered factory for a transport DriverClass, naming the known keys when it is missing. */
export function ResolveDriverFactory(driverClass: string): BaseTransportDriverFactory {
    const resolution = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, driverClass);
    if (resolution.Resolved && resolution.Instance) {
        return resolution.Instance;
    }
    const keys = Array.from(new Set(
        MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseTransportDriverFactory)
            .map(r => r.Key)
            .filter((k): k is string => k != null),
    )).sort();
    const known = keys.length > 0 ? keys.map(k => `'${k}'`).join(', ') : '(none)';
    throw new WorkQueueConfigurationError(
        `No work-queue transport driver is registered for DriverClass '${driverClass}'. Registered: ${known}. ` +
        'Add the driver package to the server and regenerate the class-registration manifest.',
    );
}
