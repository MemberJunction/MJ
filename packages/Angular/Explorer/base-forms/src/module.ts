import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI Angular imports
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';

import { SectionLoaderComponent } from './lib/section-loader-component';
import { MJFormField } from './lib/base-field-component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';

// Markdown
import { MarkdownModule } from '@memberjunction/ng-markdown';
import { MJLinkField } from './lib/link-field.component';
import { FormSectionControlsComponent } from './lib/form-section-controls.component';
import { CollapsiblePanelComponent } from './lib/collapsible-panel.component';
import { ExplorerEntityDataGridComponent } from './lib/explorer-entity-data-grid.component';

 
@NgModule({
  declarations: [
    SectionLoaderComponent,
    MJFormField,
    MJLinkField,
    FormSectionControlsComponent,
    CollapsiblePanelComponent,
    ExplorerEntityDataGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJTabStripModule,
    RecordChangesModule,
    ButtonsModule,
    InputsModule,
    DateInputsModule,
    DropDownsModule,
    LinkDirectivesModule,
    DialogsModule,
    IndicatorsModule,
    ContainerDirectivesModule,
    MemberJunctionSharedModule,
    CodeEditorModule,
    MarkdownModule,
    EntityViewerModule
  ],
  exports: [
    SectionLoaderComponent,
    MJFormField,
    MJLinkField,
    FormSectionControlsComponent,
    CollapsiblePanelComponent,
    ExplorerEntityDataGridComponent
  ]
})
export class BaseFormsModule { }