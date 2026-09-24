import { RegisterClass } from '@memberjunction/global';
import type { ITransportDriver } from '@memberjunction/work-queue-core';
import { DATABASE_DRIVER_CLASS } from '@memberjunction/work-queue-base';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { BaseTransportDriverFactory } from '../BaseTransportDriverFactory';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { DatabaseTransportDriver } from './DatabaseTransportDriver';

@RegisterClass(BaseTransportDriverFactory, DATABASE_DRIVER_CLASS)
export class DatabaseTransportDriverFactory extends BaseTransportDriverFactory {
    /** The Database transport has no per-transport configuration: the row only selects this factory. */
    public async Create(_transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> {
        return new DatabaseTransportDriver(deps.Executor, deps);
    }
}
