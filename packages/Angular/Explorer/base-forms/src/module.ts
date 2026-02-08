import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';

import { SectionLoaderComponent } from './lib/section-loader-component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';

// Markdown
import { MarkdownModule } from '@memberjunction/ng-markdown';
import { ExplorerEntityDataGridComponent } from './lib/explorer-entity-data-grid.component';

// New forms package (provides mj-form-field, mj-collapsible-panel, mj-form-toolbar, mj-record-form-container)
import { MjFormsModule } from '@memberjunction/ng-forms';

@NgModule({
  declarations: [
    SectionLoaderComponent,
    ExplorerEntityDataGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJTabStripModule,
    RecordChangesModule,
    LinkDirectivesModule,
    ContainerDirectivesModule,
    MemberJunctionSharedModule,
    CodeEditorModule,
    MarkdownModule,
    EntityViewerModule,
    MjFormsModule
  ],
  exports: [
    SectionLoaderComponent,
    ExplorerEntityDataGridComponent,
    MjFormsModule
  ]
})
export class BaseFormsModule { }