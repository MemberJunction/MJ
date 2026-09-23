import { NgModule } from '@angular/core';
import { RecordClonePanelComponent } from './record-clone-panel.component';
import { RecordCloneToolbarPanel } from './record-clone-toolbar-panel.component';
import { CloneScopeControlsComponent } from './clone-scope-controls.component';
import { ClonePlanTreeComponent } from './clone-plan-tree.component';
import { CloneValuesComponent } from './clone-values.component';
import { CloneReviewComponent } from './clone-review.component';
import { CloneProgressComponent } from './clone-progress.component';
import { CloneResultComponent } from './clone-result.component';
import { CloneLineageChipComponent } from './clone-lineage-chip.component';

@NgModule({
    imports: [
        RecordClonePanelComponent,
        RecordCloneToolbarPanel,
        CloneScopeControlsComponent,
        ClonePlanTreeComponent,
        CloneValuesComponent,
        CloneReviewComponent,
        CloneProgressComponent,
        CloneResultComponent,
        CloneLineageChipComponent,
    ],
    exports: [
        RecordClonePanelComponent,
        RecordCloneToolbarPanel,
        CloneScopeControlsComponent,
        ClonePlanTreeComponent,
        CloneValuesComponent,
        CloneReviewComponent,
        CloneProgressComponent,
        CloneResultComponent,
        CloneLineageChipComponent,
    ],
})
export class RecordCloneModule {}
