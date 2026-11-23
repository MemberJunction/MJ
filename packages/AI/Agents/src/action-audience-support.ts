import { BaseAction } from '@memberjunction/actions';
import { MJGlobal } from '@memberjunction/global';

const actionSupportsAudienceCache = new WeakMap<object, boolean>();

/**
 * Checks via `ClassFactory.GetRegistration` whether a non-runtime action class declares
 * `SupportsAudience === true`, memoizing the result per registered `SubClass` so repeated
 * dispatches never construct throwaway `BaseAction` instances.
 */
export function ActionSupportsAudience(action: {
    Type?: string | null;
    DriverClass?: string | null;
    Name?: string | null;
}): boolean {
    if (action.Type === 'Runtime') {
        return false;
    }
    const driverKey = action.DriverClass || action.Name;
    if (!driverKey) {
        return false;
    }
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseAction, driverKey);
    const subClass: unknown = registration?.SubClass;
    if (typeof subClass !== 'function' || subClass === BaseAction) {
        return false;
    }
    const cached = actionSupportsAudienceCache.get(subClass);
    if (cached !== undefined) {
        return cached;
    }
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(BaseAction, driverKey);
    const supported = Boolean(instance && instance.constructor !== BaseAction && instance.SupportsAudience === true);
    actionSupportsAudienceCache.set(subClass, supported);
    return supported;
}
