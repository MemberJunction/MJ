import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';

import { MentionEditorComponent } from './components/mention/mention-editor.component';
import { MentionDropdownComponent } from './components/mention/mention-dropdown.component';
import { MessageInputBoxComponent } from './components/message/message-input-box.component';

/**
 * Module providing the generic message-composer components.
 *
 * Components:
 * - `<mj-mention-editor>` — ContentEditable editor with pluggable mention/command trigger
 *   chips (see `ComposerTriggerProvider`), attachment support, and ControlValueAccessor
 *   (works with `[(ngModel)]`). With no trigger providers supplied/registered it behaves
 *   as a plain text editor.
 * - `<mj-mention-dropdown>` — Autocomplete dropdown for mention suggestions
 * - `<mj-message-input-box>` — Send-button wrapper around the mention editor
 *
 * Usage:
 * ```typescript
 * import { ComposerModule } from '@memberjunction/ng-composer';
 *
 * @NgModule({ imports: [ComposerModule] })
 * export class MyModule {}
 * ```
 */
@NgModule({
  declarations: [
    MentionEditorComponent,
    MentionDropdownComponent,
    MessageInputBoxComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJEmptyStateComponent
  ],
  exports: [
    MentionEditorComponent,
    MentionDropdownComponent,
    MessageInputBoxComponent
  ]
})
export class ComposerModule { }
