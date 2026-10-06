import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { BuildContextUser, CloseConnectionPool, EnsureProviderInitialized } from '../../utils/open-app-context.js';

export interface WorkQueueCliSession {
    Provider: DatabaseProviderBase;
    User: UserInfo;
    Close(): Promise<void>;
}

/** The CLI's shared provider (SQL Server or PostgreSQL per config) and the system user. */
export async function OpenWorkQueueSession(): Promise<WorkQueueCliSession> {
    const provider = await EnsureProviderInitialized();
    const user = await BuildContextUser();
    return { Provider: provider, User: user, Close: CloseConnectionPool };
}
