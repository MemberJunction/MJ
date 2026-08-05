import { EntityPermissionProvider } from './EntityPermissionProvider';
import { DashboardPermissionProvider } from './DashboardPermissionProvider';
import { ResourcePermissionProvider } from './ResourcePermissionProvider';
import { ApplicationRolePermissionProvider } from './ApplicationRolePermissionProvider';
import { ArtifactPermissionProvider } from './ArtifactPermissionProvider';
import { CollectionPermissionProvider } from './CollectionPermissionProvider';
import { AIAgentPermissionProvider } from './AIAgentPermissionProvider';
import { AISkillPermissionProvider } from './AISkillPermissionProvider';
import { QueryPermissionProvider } from './QueryPermissionProvider';
import { AccessControlRuleProvider } from './AccessControlRuleProvider';

export { EntityPermissionProvider } from './EntityPermissionProvider';
export { DashboardPermissionProvider } from './DashboardPermissionProvider';
export { ResourcePermissionProvider } from './ResourcePermissionProvider';
export { ApplicationRolePermissionProvider } from './ApplicationRolePermissionProvider';
export { ArtifactPermissionProvider } from './ArtifactPermissionProvider';
export { CollectionPermissionProvider } from './CollectionPermissionProvider';
export { AIAgentPermissionProvider } from './AIAgentPermissionProvider';
export { AISkillPermissionProvider } from './AISkillPermissionProvider';
export { QueryPermissionProvider } from './QueryPermissionProvider';
export { AccessControlRuleProvider } from './AccessControlRuleProvider';

/**
 * No-op function that MJCoreEntities's public-api calls to keep modern bundlers
 * (ESBuild, Vite) from eliminating the `@RegisterClass(PermissionProviderBase, …)`
 * side effects — without this, providers silently disappear in production bundles.
 */
export function LoadPermissionProviders(): void {
    const markers = [
        EntityPermissionProvider,
        DashboardPermissionProvider,
        ResourcePermissionProvider,
        ApplicationRolePermissionProvider,
        ArtifactPermissionProvider,
        CollectionPermissionProvider,
        AIAgentPermissionProvider,
        AISkillPermissionProvider,
        QueryPermissionProvider,
        AccessControlRuleProvider,
    ];
    if (markers.length < 0) {
        // unreachable — keeps the array reference alive
        console.log(markers);
    }
}
