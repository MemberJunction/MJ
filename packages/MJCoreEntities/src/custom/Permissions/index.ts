export * from './MJDashboardPermissionEntityExtended';
export * from './MJCollectionPermissionEntityExtended';
export * from './MJArtifactPermissionEntityExtended';
export * from './MJAccessControlRuleEntityExtended';
export * from './shareNotification';
export * from './BaseShareEntityExtended';

import { LoadMJDashboardPermissionEntityExtended } from './MJDashboardPermissionEntityExtended';
import { LoadMJCollectionPermissionEntityExtended } from './MJCollectionPermissionEntityExtended';
import { LoadMJArtifactPermissionEntityExtended } from './MJArtifactPermissionEntityExtended';
import { LoadMJAccessControlRuleEntityExtended } from './MJAccessControlRuleEntityExtended';

/**
 * Forces all extended permission entity classes to load so their @RegisterClass
 * decorators fire and override the generated entity classes in the ClassFactory.
 * Called from `@memberjunction/core-entities` barrel on package import.
 */
export function LoadPermissionEntityExtensions(): void {
    LoadMJDashboardPermissionEntityExtended();
    LoadMJCollectionPermissionEntityExtended();
    LoadMJArtifactPermissionEntityExtended();
    LoadMJAccessControlRuleEntityExtended();
}
