import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ClusterScatterComponent } from './cluster-scatter.component';
import { ClusterConfigPanelComponent } from './cluster-config-panel.component';
import { MJEntityCardComponent } from '@memberjunction/ng-entity-card';

@NgModule({
    declarations: [
        ClusterScatterComponent,
        ClusterConfigPanelComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        MJEntityCardComponent,
    ],
    exports: [
        ClusterScatterComponent,
        ClusterConfigPanelComponent,
    ],
})
export class ClusteringModule {}
