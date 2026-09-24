import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ArchiveManagerModule } from '@memberjunction/ng-archive-manager';
import {
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent
} from '@memberjunction/ng-ui-components';

import {
    ArchiveConfigResourceComponent,
    LoadArchiveConfigResource
} from './Archiving/components/archive-config-resource.component';
import {
    ArchiveRunsResourceComponent,
    LoadArchiveRunsResource
} from './Archiving/components/archive-runs-resource.component';

/**
 * ArchivingDashboardsModule -- Archiving feature area: configuration admin
 * and run history viewer, lazy-loaded when the user navigates to the
 * Archiving application.
 */
@NgModule({
    declarations: [
        ArchiveConfigResourceComponent,
        ArchiveRunsResourceComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        SharedGenericModule,
        ArchiveManagerModule,
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
    ],
    exports: [
        ArchiveConfigResourceComponent,
        ArchiveRunsResourceComponent,
    ],
})
export class ArchivingDashboardsModule {}

// Tree-shaking prevention at MODULE SCOPE — must run on file evaluation, not on
// NgModule instantiation, because the lazy resource path builds components with
// `createComponent(reg.SubClass)` and never instantiates this module. See the
// longer explanation in `ai-dashboards.module.ts`, where a constructor-scoped
// loader let `FeaturePipelinesResource` get tree-shaken out of its chunk entirely.
LoadArchiveConfigResource();
LoadArchiveRunsResource();
