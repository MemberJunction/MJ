/**
 * Type declarations for Angular packages that may not have dist/ built yet.
 * These are only needed for compilation — at runtime, the actual packages
 * will be resolved by the consuming application's bundler.
 *
 * This file is intentionally permissive: the generated manifest imports classes
 * by name purely to prevent tree-shaking. Type correctness is not required here.
 */

declare module '@memberjunction/ng-explorer-core' {
    export const ArtifactResource: unknown;
    export const ChatCollectionsResource: unknown;
    export const ChatConversationsResource: unknown;
    export const ChatTasksResource: unknown;
    export const DashboardResource: unknown;
    export const EntityRecordResource: unknown;
    export const ListDetailResource: unknown;
    export const NotificationsResource: unknown;
    export const QueryResource: unknown;
    export const SearchResultsResource: unknown;
    export const UserViewResource: unknown;
}
