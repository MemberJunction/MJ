import type { ITransportDriver } from '@memberjunction/work-queue-core';
import type { TransportRow } from '@memberjunction/work-queue-base';
import type { TransportDriverDeps } from './TransportDriverDeps';

/**
 * ClassFactory base for transport drivers. Register implementations with
 * @RegisterClass(BaseTransportDriverFactory, '<Transport.DriverClass>') — 'Database' here, 'AWS' in plan 07.
 */
export abstract class BaseTransportDriverFactory {
    public abstract Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver>;
}
