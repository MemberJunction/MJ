import { MJGlobal } from '@memberjunction/global';
import { BaseWorkHandler } from './BaseWorkHandler';

/**
 * A new instance of the handler registered under the key, or null. Uses GetRegistration rather than CreateInstance
 * because CreateInstance silently falls back to the (abstract) base class for unknown keys. ClassFactory keys match
 * trimmed and case-insensitively; every call returns a fresh instance because handlers may keep per-delivery state.
 */
export function ResolveWorkHandler(handlerKey: string): BaseWorkHandler | null {
    const key = handlerKey.trim();
    if (key === '') {
        return null;
    }
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseWorkHandler, key);
    if (!registration) {
        return null;
    }
    const handler: BaseWorkHandler = new registration.SubClass();
    return handler;
}

/** Answers "would ResolveWorkHandler return a handler?" without constructing one. */
export type WorkHandlerProbe = (handlerKey: string) => boolean;

/** True when a BaseWorkHandler subclass is registered under the key. Never instantiates the handler. */
export function IsWorkHandlerRegistered(handlerKey: string): boolean {
    const key = handlerKey.trim();
    return key !== '' && MJGlobal.Instance.ClassFactory.GetRegistration(BaseWorkHandler, key) != null;
}
