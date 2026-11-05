export * from './BaseGraphEdgeProvider';
export * from './providers/AlternateBaseViewEdgeProvider';
export * from './providers/EntityMetadataEdgeProvider';
export * from './providers/QueryMetadataEdgeProvider';
export * from './providers/ForeignKeyEdgeProvider';
export * from './providers/JoinEntityEdgeProvider';
export * from './providers/QueryEdgeProvider';
export * from './providers/RecordLinkEdgeProvider';

import { LoadAlternateBaseViewEdgeProvider } from './providers/AlternateBaseViewEdgeProvider';
import { LoadEntityMetadataEdgeProvider } from './providers/EntityMetadataEdgeProvider';
import { LoadQueryMetadataEdgeProvider } from './providers/QueryMetadataEdgeProvider';
import { LoadForeignKeyEdgeProvider } from './providers/ForeignKeyEdgeProvider';
import { LoadJoinEntityEdgeProvider } from './providers/JoinEntityEdgeProvider';
import { LoadQueryEdgeProvider } from './providers/QueryEdgeProvider';
import { LoadRecordLinkEdgeProvider } from './providers/RecordLinkEdgeProvider';

/**
 * Tree-shaking anchor that registers all built-in {@link BaseGraphEdgeProvider} subclasses
 * with `@memberjunction/global` `ClassFactory`.
 */
export function LoadGraphEdgeProviders(): void {
    LoadAlternateBaseViewEdgeProvider();
    LoadEntityMetadataEdgeProvider();
    LoadQueryMetadataEdgeProvider();
    LoadForeignKeyEdgeProvider();
    LoadJoinEntityEdgeProvider();
    LoadQueryEdgeProvider();
    LoadRecordLinkEdgeProvider();
}
