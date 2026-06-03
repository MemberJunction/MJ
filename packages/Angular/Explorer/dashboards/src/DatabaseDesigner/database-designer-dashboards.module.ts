/**
 * DatabaseDesignerDashboardsModule
 *
 * Feature module for the Database Designer dashboard area.  Declares the main
 * dashboard component and its entity-list sub-component.  The wizard steps and
 * modify view are added in later phases (5c–5e) and will be declared here too.
 *
 * Lazy-loading entry point:  DashboardsModule (module.ts) imports this module
 * so MJExplorer can code-split it in the future without touching any other file.
 *
 * Slide-over panels use MjSlidePanelComponent from VersionsModule.
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    MJButtonDirective,
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJPageHeaderInteriorComponent,
    MJPageBodyInteriorComponent,
    MJPageSearchComponent,
    MJRefreshButtonComponent,
    MJStatBadgeComponent,
    MjSlidePanelComponent
} from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MarkdownModule } from '@memberjunction/ng-markdown';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { EntityRelationshipDiagramModule } from '@memberjunction/ng-entity-relationship-diagram';
import { AngularSplitModule } from 'angular-split';

import { DatabaseDesignerDashboardComponent } from './components/database-designer-dashboard.component';
import { EntityListComponent } from './components/entity-list.component';
import { WizardStepIndicatorComponent } from './components/shared/wizard-step-indicator.component';
import { EntityFieldsGridComponent } from './components/shared/entity-fields-grid.component';
import { EntityReviewPanelComponent } from './components/shared/entity-review-panel.component';
import { EntityPipelinePanelComponent } from './components/shared/entity-pipeline-panel.component';
import { DatabaseCreateWizardComponent } from './components/create-wizard/database-create-wizard.component';
import { StepBasicsComponent } from './components/create-wizard/steps/step-basics.component';
import { StepFieldsComponent } from './components/create-wizard/steps/step-fields.component';
import { StepRelationshipsComponent } from './components/create-wizard/steps/step-relationships.component';
import { StepReviewComponent } from './components/create-wizard/steps/step-review.component';
import { StepPipelineComponent } from './components/create-wizard/steps/step-pipeline.component';
import { DatabaseModifyComponent } from './components/modify/database-modify.component';
import { DatabasePreviewPaneComponent } from './components/shared/database-preview-pane.component';
import { DatabaseDesignerService } from './services/database-designer.service';

@NgModule({
    declarations: [
        DatabaseDesignerDashboardComponent,
        EntityListComponent,
        // Phase 5c: shared UI
        WizardStepIndicatorComponent,
        EntityFieldsGridComponent,
        EntityReviewPanelComponent,
        EntityPipelinePanelComponent,
        DatabasePreviewPaneComponent,
        // Phase 5d: wizard + steps
        DatabaseCreateWizardComponent,
        StepBasicsComponent,
        StepFieldsComponent,
        StepRelationshipsComponent,
        StepReviewComponent,
        StepPipelineComponent,
        // Phase 5e
        DatabaseModifyComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        MJButtonDirective,
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
        MJPageHeaderInteriorComponent,
        MJPageBodyInteriorComponent,
        MJPageSearchComponent,
        MJRefreshButtonComponent,
        MJStatBadgeComponent,
        MjSlidePanelComponent,
        SharedGenericModule,
        MarkdownModule,
        CodeEditorModule,
        EntityRelationshipDiagramModule,
        AngularSplitModule,
    ],
    providers: [
        DatabaseDesignerService,
    ],
    exports: [
        DatabaseDesignerDashboardComponent,
        EntityListComponent,
        WizardStepIndicatorComponent,
        EntityFieldsGridComponent,
        EntityReviewPanelComponent,
        EntityPipelinePanelComponent,
        DatabaseCreateWizardComponent,
    ],
})
export class DatabaseDesignerDashboardsModule {}
