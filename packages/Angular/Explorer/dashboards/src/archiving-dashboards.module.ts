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
export class ArchivingDashboardsModule {
    constructor() {
        // Ensure tree-shaking prevention loaders are called
        LoadArchiveConfigResource();
        LoadArchiveRunsResource();
    }
}
