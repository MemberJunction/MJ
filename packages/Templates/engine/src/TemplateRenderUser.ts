import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserInfo } from '@memberjunction/core';

/**
 * The user the current template render runs as. The template engine is a process-wide singleton,
 * and Nunjucks extensions are built once per environment, so neither may hold the render's user.
 * The engine runs every render inside {@link RunAsTemplateRenderUser}; an extension reads the user
 * back with {@link CurrentTemplateRenderUser} (through `TemplateExtensionBase.ContextUser`), and
 * every callback and promise the render starts sees the same user.
 */
const renderUser = new AsyncLocalStorage<UserInfo | undefined>();

/** Runs `work` with `user` as the template render user for everything it does, sync or async. */
export function RunAsTemplateRenderUser<T>(user: UserInfo | undefined, work: () => T): T {
    return renderUser.run(user, work);
}

/** The user of the template render in progress, or undefined outside a render. */
export function CurrentTemplateRenderUser(): UserInfo | undefined {
    return renderUser.getStore();
}
