// Dashboard Part Renderers - Base Class
export * from './base-dashboard-part';

// Runtime Part Components
export * from './weburl-part.component';
export * from './view-part.component';
export * from './query-part.component';
export * from './artifact-part.component';

// Tree-shaking prevention
import { LoadWebURLPart } from './weburl-part.component';
import { LoadViewPart } from './view-part.component';
import { LoadQueryPart } from './query-part.component';
import { LoadArtifactPart } from './artifact-part.component';

export function LoadAllDashboardParts() {
    LoadWebURLPart();
    LoadViewPart();
    LoadQueryPart();
    LoadArtifactPart();
}
