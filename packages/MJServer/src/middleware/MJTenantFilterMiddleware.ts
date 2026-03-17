/**
 * MJ's built-in multi-tenancy middleware.
 *
 * Registers with key 'mj:tenantFilter' so that downstream layers (e.g., BCSaaS)
 * can replace it by registering with the same key at higher ClassFactory priority.
 *
 * Conditionally enabled via configInfo.multiTenancy?.enabled.
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from './BaseServerMiddleware.js';
import { configInfo } from '../config.js';
import { createTenantMiddleware, createTenantPreRunViewHook, createTenantPreSaveHook } from '../multiTenancy/index.js';
import type { RequestHandler } from 'express';
import type { RunViewParams, UserInfo, BaseEntity } from '@memberjunction/core';

@RegisterClass(BaseServerMiddleware, 'mj:tenantFilter')
export class MJTenantFilterMiddleware extends BaseServerMiddleware {
    get Label(): string { return 'mj:tenantFilter'; }

    /**
     * Only active when multiTenancy is enabled in config.
     */
    get Enabled(): boolean {
        return configInfo.multiTenancy?.enabled ?? false;
    }

    GetPostAuthMiddleware(): RequestHandler[] {
        return [createTenantMiddleware(configInfo.multiTenancy!)];
    }

    PreRunView(params: RunViewParams, contextUser: UserInfo | undefined): RunViewParams | Promise<RunViewParams> {
        return createTenantPreRunViewHook(configInfo.multiTenancy!)(params, contextUser);
    }

    PreSave(entity: BaseEntity, contextUser: UserInfo | undefined): boolean | string | Promise<boolean | string> {
        return createTenantPreSaveHook(configInfo.multiTenancy!)(entity, contextUser);
    }
}
