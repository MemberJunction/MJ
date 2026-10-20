import { MJGlobal } from '@memberjunction/global';
import { BaseArchiveDriver } from './BaseArchiveDriver';
import { DefaultArchiveDriver } from './DefaultArchiveDriver';

/**
 * Resolves an archive driver by its registered class name via ClassFactory.
 * Returns a `DefaultArchiveDriver` when no class name is given, the registered driver
 * when the name resolves, and `null` when the name is not registered.
 */
export function ResolveArchiveDriver(driverClassName: string | null): BaseArchiveDriver | null {
    if (!driverClassName) {
        return new DefaultArchiveDriver();
    }
    const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseArchiveDriver>(BaseArchiveDriver, driverClassName);
    return result.Resolved ? result.Instance : null;
}
