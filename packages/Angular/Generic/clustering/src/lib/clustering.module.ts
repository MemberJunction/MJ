import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ClusterScatterComponent } from './cluster-scatter.component';
import { ClusterConfigPanelComponent } from './cluster-config-panel.component';

@NgModule({
    declarations: [
        ClusterScatterComponent,
        ClusterConfigPanelComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
    ],
    exports: [
        ClusterScatterComponent,
        ClusterConfigPanelComponent,
    ],
})
export class ClusteringModule {}
