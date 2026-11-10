export * from './BaseGraphEdgeProvider';
export * from './GraphExpansion';
export * from './GraphEngine';
export * from './providers/ForeignKeyEdgeProvider';
export * from './providers/JoinEntityEdgeProvider';
export * from './providers/QueryEdgeProvider';
export * from './providers/RecordLinkEdgeProvider';
export * from './providers/EntityMetadataEdgeProvider';
export * from './providers/QueryMetadataEdgeProvider';
export * from './providers/AlternateBaseViewEdgeProvider';

import { LoadForeignKeyEdgeProvider } from './providers/ForeignKeyEdgeProvider';
import { LoadJoinEntityEdgeProvider } from './providers/JoinEntityEdgeProvider';
import { LoadQueryEdgeProvider } from './providers/QueryEdgeProvider';
import { LoadRecordLinkEdgeProvider } from './providers/RecordLinkEdgeProvider';
import { LoadEntityMetadataEdgeProvider } from './providers/EntityMetadataEdgeProvider';
import { LoadQueryMetadataEdgeProvider } from './providers/QueryMetadataEdgeProvider';
import { LoadAlternateBaseViewEdgeProvider } from './providers/AlternateBaseViewEdgeProvider';

/**
 * Tree-shaking anchor registering all 7 built-in {@link BaseGraphEdgeProvider} subclasses.
 */
export function LoadGraphEdgeProviders(): void {
    LoadForeignKeyEdgeProvider();
    LoadJoinEntityEdgeProvider();
    LoadQueryEdgeProvider();
    LoadRecordLinkEdgeProvider();
    LoadEntityMetadataEdgeProvider();
    LoadQueryMetadataEdgeProvider();
    LoadAlternateBaseViewEdgeProvider();
}
