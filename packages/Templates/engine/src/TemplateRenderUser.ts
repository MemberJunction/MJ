import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserInfo } from '@memberjunction/core';

/**
 * The user the current template render runs as. The template engine is a process-wide singleton,
 * and Nunjucks extensions are built once per environment, so neither may hold the render's user.
 * The engine runs every render inside {@link RunAsTemplateRenderUser}; an extension reads the user
 * back with {@link CurrentTemplateRenderUser} (through `TemplateExtensionBase.ContextUser`), and
 * every callback and promise the render starts sees the same user.
 *
 * The scope is held as an object so that a render with no user is still known to be a render
 * ({@link IsInsideTemplateRender}): its extensions then act for no user rather than falling back to
 * a user cached on the singleton by some other caller.
 */
interface TemplateRenderScope {
    User: UserInfo | undefined;
}
const renderScope = new AsyncLocalStorage<TemplateRenderScope>();

/** Runs `work` with `user` as the template render user for everything it does, sync or async. */
export function RunAsTemplateRenderUser<T>(user: UserInfo | undefined, work: () => T): T {
    return renderScope.run({ User: user }, work);
}

/** The user of the template render in progress, or undefined outside a render or for a render with no user. */
export function CurrentTemplateRenderUser(): UserInfo | undefined {
    return renderScope.getStore()?.User;
}

/** Whether a template render is in progress, whether or not it has a user. */
export function IsInsideTemplateRender(): boolean {
    return renderScope.getStore() !== undefined;
}
