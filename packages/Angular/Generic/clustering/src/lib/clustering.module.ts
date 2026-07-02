import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ClusterScatterComponent } from './cluster-scatter.component';
import { ClusterConfigPanelComponent } from './cluster-config-panel.component';
import { ClusterViewRendererComponent } from './view-type/cluster-view-renderer.component';
import { ClusterViewPropSheetComponent } from './view-type/cluster-view-prop-sheet.component';
import { LoadClusterViewType } from './view-type/cluster-view-type';
import { MJEntityCardComponent } from '@memberjunction/ng-entity-card';
import { MJEmptyStateComponent, MJAccordionModule } from '@memberjunction/ng-ui-components';

@NgModule({
    declarations: [
        ClusterScatterComponent,
        ClusterConfigPanelComponent,
        ClusterViewRendererComponent,
        ClusterViewPropSheetComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        MJEntityCardComponent,
        MJEmptyStateComponent,
        MJAccordionModule,
    ],
    exports: [
        ClusterScatterComponent,
        ClusterConfigPanelComponent,
        ClusterViewRendererComponent,
        ClusterViewPropSheetComponent,
    ],
})
export class ClusteringModule {
    constructor() {
        // Guarantee the Cluster view-type descriptor's @RegisterClass runs whenever the
        // clustering feature loads (ng-clustering sets sideEffects:false). App-wide
        // registration is also covered by the generated ng-bootstrap class manifest.
        LoadClusterViewType();
    }
}
