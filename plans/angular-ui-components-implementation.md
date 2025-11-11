# Angular UI Components Implementation Guide

**Status:** NOT YET IMPLEMENTED
**Priority:** HIGH
**Location:** `packages/Angular/conversations/` (or appropriate location)

## Overview

This document provides detailed implementation guidance for the Angular UI components that render agent response forms and execute UI commands. The backend types and agent framework integration are **complete**. This is the final piece needed for end-to-end functionality.

## What's Already Done

✅ **Core Types** (`packages/AI/CorePlus/src/`):
- `response-forms.ts` - Form and question type definitions
- `ui-commands.ts` - Command type definitions
- `agent-types.ts` - Extended with new fields

✅ **Agent Framework** (`packages/AI/Agents/src/`):
- LoopAgentType parses new fields from AI responses
- BaseAgent propagates fields to ExecuteAgentResult
- All type-safe with full generics

✅ **Prompt Templates** (`metadata/prompts/templates/`):
- Loop Agent System Prompt with comprehensive examples
- Sage prompt with ambient assistant examples
- Agent Manager prompt with requirements gathering examples

## What Needs Implementation

### Component Structure

```
packages/Angular/conversations/src/lib/
├── components/
│   ├── form-question/
│   │   ├── form-question.component.ts
│   │   ├── form-question.component.html
│   │   └── form-question.component.scss
│   ├── simple-response-buttons/
│   │   ├── simple-response-buttons.component.ts
│   │   ├── simple-response-buttons.component.html
│   │   └── simple-response-buttons.component.scss
│   ├── agent-response-form/
│   │   ├── agent-response-form.component.ts
│   │   ├── agent-response-form.component.html
│   │   └── agent-response-form.component.scss
│   └── actionable-commands/
│       ├── actionable-commands.component.ts
│       ├── actionable-commands.component.html
│       └── actionable-commands.component.scss
└── services/
    └── ui-command-handler.service.ts
```

## 1. Form Question Component

**Purpose:** Renders individual question based on type

```typescript
// form-question.component.ts
import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormControl } from '@angular/forms';
import { FormQuestion } from '@memberjunction/ai-core-plus';

@Component({
  selector: 'mj-form-question',
  templateUrl: './form-question.component.html',
  styleUrls: ['./form-question.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FormQuestionComponent),
      multi: true
    }
  ]
})
export class FormQuestionComponent implements ControlValueAccessor {
  @Input() question: FormQuestion;
  @Input() control: FormControl;

  value: any;
  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  onValueChange(newValue: any): void {
    this.value = newValue;
    this.onChange(newValue);
    this.onTouched();
  }

  get questionType(): string {
    return this.question.type.type;
  }
}
```

**Template (form-question.component.html):**
```html
<div class="form-question" [class.required]="question.required">
  <label [for]="question.id" class="question-label">
    {{ question.label }}
    <span *ngIf="question.required" class="required-marker">*</span>
  </label>

  <!-- Text inputs -->
  <input
    *ngIf="questionType === 'text' || questionType === 'email'"
    [id]="question.id"
    [type]="questionType"
    [placeholder]="question.type.placeholder"
    [maxlength]="question.type.maxLength"
    [formControl]="control"
    class="form-input"
  />

  <textarea
    *ngIf="questionType === 'textarea'"
    [id]="question.id"
    [placeholder]="question.type.placeholder"
    [maxlength]="question.type.maxLength"
    [formControl]="control"
    class="form-textarea"
    rows="4"
  ></textarea>

  <!-- Number inputs -->
  <kendo-numerictextbox
    *ngIf="questionType === 'number' || questionType === 'currency'"
    [formControl]="control"
    [min]="question.type.min"
    [max]="question.type.max"
    [format]="questionType === 'currency' ? 'c2' : 'n0'"
  ></kendo-numerictextbox>

  <!-- Date inputs -->
  <kendo-datepicker
    *ngIf="questionType === 'date'"
    [formControl]="control"
  ></kendo-datepicker>

  <kendo-datetimepicker
    *ngIf="questionType === 'datetime'"
    [formControl]="control"
  ></kendo-datetimepicker>

  <!-- Choice inputs -->
  <div *ngIf="questionType === 'buttongroup'" class="button-group">
    <button
      *ngFor="let option of question.type.options"
      kendoButton
      [icon]="option.icon"
      [toggleable]="true"
      [selected]="control.value === option.value"
      (click)="control.setValue(option.value)"
    >
      {{ option.label }}
    </button>
  </div>

  <kendo-radiogroup
    *ngIf="questionType === 'radio'"
    [formControl]="control"
    [data]="question.type.options"
    textField="label"
    valueField="value"
  ></kendo-radiogroup>

  <kendo-dropdownlist
    *ngIf="questionType === 'dropdown'"
    [formControl]="control"
    [data]="question.type.options"
    textField="label"
    valueField="value"
  ></kendo-dropdownlist>

  <kendo-multiselect
    *ngIf="questionType === 'checkbox'"
    [formControl]="control"
    [data]="question.type.options"
    textField="label"
    valueField="value"
  ></kendo-multiselect>

  <!-- Help text -->
  <div *ngIf="question.helpText" class="help-text">
    {{ question.helpText }}
  </div>

  <!-- Validation errors -->
  <div *ngIf="control.invalid && control.touched" class="error-text">
    <span *ngIf="control.errors?.['required']">This field is required</span>
    <span *ngIf="control.errors?.['maxlength']">
      Maximum length is {{ question.type.maxLength }} characters
    </span>
  </div>
</div>
```

## 2. Simple Response Buttons Component

**Purpose:** Renders button group for single-question simple choices

```typescript
// simple-response-buttons.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormQuestion } from '@memberjunction/ai-core-plus';

@Component({
  selector: 'mj-simple-response-buttons',
  templateUrl: './simple-response-buttons.component.html',
  styleUrls: ['./simple-response-buttons.component.scss']
})
export class SimpleResponseButtonsComponent {
  @Input() question: FormQuestion;
  @Output() select = new EventEmitter<any>();

  get options() {
    return (this.question.type as any).options || [];
  }

  onSelect(value: any): void {
    this.select.emit(value);
  }
}
```

**Template:**
```html
<div class="simple-response-buttons">
  <p *ngIf="question.label" class="question-label">{{ question.label }}</p>
  <div class="button-group">
    <button
      *ngFor="let option of options"
      kendoButton
      [icon]="option.icon"
      (click)="onSelect(option.value)"
      class="response-button"
    >
      {{ option.label }}
    </button>
  </div>
  <p *ngIf="question.helpText" class="help-text">{{ question.helpText }}</p>
</div>
```

## 3. Agent Response Form Component

**Purpose:** Renders full form with validation

```typescript
// agent-response-form.component.ts
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { AgentResponseForm } from '@memberjunction/ai-core-plus';

@Component({
  selector: 'mj-agent-response-form',
  templateUrl: './agent-response-form.component.html',
  styleUrls: ['./agent-response-form.component.scss']
})
export class AgentResponseFormComponent implements OnInit {
  @Input() form: AgentResponseForm;
  @Output() submit = new EventEmitter<Record<string, any>>();
  @Output() cancel = new EventEmitter<void>();

  formGroup: FormGroup;

  ngOnInit(): void {
    this.buildFormGroup();
  }

  private buildFormGroup(): void {
    const controls: Record<string, FormControl> = {};

    for (const question of this.form.questions) {
      const validators = [];

      if (question.required) {
        validators.push(Validators.required);
      }

      if (question.type.type === 'text' || question.type.type === 'textarea') {
        if (question.type.maxLength) {
          validators.push(Validators.maxLength(question.type.maxLength));
        }
      }

      if (question.type.type === 'email') {
        validators.push(Validators.email);
      }

      controls[question.id] = new FormControl(question.defaultValue, validators);
    }

    this.formGroup = new FormGroup(controls);
  }

  onSubmit(): void {
    if (this.formGroup.valid) {
      this.submit.emit(this.formGroup.value);
    } else {
      this.formGroup.markAllAsTouched();
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
```

**Template:**
```html
<div class="agent-response-form">
  <h3 *ngIf="form.title">{{ form.title }}</h3>
  <p *ngIf="form.description">{{ form.description }}</p>

  <form [formGroup]="formGroup" (ngSubmit)="onSubmit()">
    <div class="form-questions">
      <mj-form-question
        *ngFor="let question of form.questions"
        [question]="question"
        [control]="formGroup.get(question.id)"
      ></mj-form-question>
    </div>

    <div class="form-actions">
      <button kendoButton (click)="onCancel()" *ngIf="form.cancelLabel || form.title">
        {{ form.cancelLabel || 'Cancel' }}
      </button>
      <button kendoButton themeColor="primary" type="submit">
        {{ form.submitLabel || 'Submit' }}
      </button>
    </div>
  </form>
</div>
```

## 4. Actionable Commands Component

**Purpose:** Renders command buttons

```typescript
// actionable-commands.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ActionableCommand } from '@memberjunction/ai-core-plus';

@Component({
  selector: 'mj-actionable-commands',
  template: `
    <div class="actionable-commands">
      <button
        *ngFor="let cmd of commands"
        kendoButton
        [icon]="cmd.icon"
        (click)="commandClick.emit(cmd)"
        class="action-command"
      >
        {{ cmd.label }}
      </button>
    </div>
  `,
  styles: [`
    .actionable-commands {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
      flex-wrap: wrap;
    }
  `]
})
export class ActionableCommandsComponent {
  @Input() commands: ActionableCommand[];
  @Output() commandClick = new EventEmitter<ActionableCommand>();
}
```

## 5. UI Command Handler Service

**Purpose:** Execute commands

```typescript
// ui-command-handler.service.ts
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AutomaticCommand, ActionableCommand } from '@memberjunction/ai-core-plus';

@Injectable({ providedIn: 'root' })
export class UICommandHandler {
  constructor(
    private router: Router,
    // Inject other needed services: NotificationService, DataRefreshService, etc.
  ) {}

  async executeAutomaticCommands(commands: AutomaticCommand[]): Promise<void> {
    for (const command of commands) {
      await this.executeAutomaticCommand(command);
    }
  }

  async executeActionableCommand(command: ActionableCommand): Promise<void> {
    switch (command.type) {
      case 'open:resource':
        await this.handleOpenResource(command);
        break;
      case 'open:url':
        this.handleOpenURL(command);
        break;
    }
  }

  private async executeAutomaticCommand(command: AutomaticCommand): Promise<void> {
    switch (command.type) {
      case 'refresh:data':
        await this.handleRefreshData(command);
        break;
      case 'notification':
        this.handleNotification(command);
        break;
    }
  }

  private async handleOpenResource(cmd: any): Promise<void> {
    switch (cmd.resourceType) {
      case 'Record':
        this.router.navigate(['/record', cmd.resourceId], {
          queryParams: { mode: cmd.mode || 'view' }
        });
        break;
      case 'Dashboard':
        this.router.navigate(['/dashboard', cmd.resourceId]);
        break;
      case 'Report':
        this.router.navigate(['/report', cmd.resourceId]);
        break;
      case 'Form':
        this.router.navigate(['/form', cmd.resourceId]);
        break;
    }
  }

  private handleOpenURL(cmd: any): void {
    window.open(cmd.url, cmd.newTab !== false ? '_blank' : '_self');
  }

  private async handleRefreshData(cmd: any): Promise<void> {
    if (cmd.scope === 'entity' && cmd.entityNames) {
      // Trigger entity refresh
      // this.dataRefreshService.refreshEntities(cmd.entityNames);
    } else if (cmd.scope === 'cache' && cmd.cacheName) {
      // Trigger cache refresh
      // this.cacheService.refresh(cmd.cacheName);
    }
  }

  private handleNotification(cmd: any): void {
    // this.notificationService.show(cmd.message, cmd.severity);
  }
}
```

## 6. Integration with Conversation Component

**Update existing conversation component:**

```typescript
// In your conversation component
import { ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { UICommandHandler } from './services/ui-command-handler.service';

export class ConversationComponent {
  currentResponseForm: AgentResponseForm | null = null;
  currentActionableCommands: ActionableCommand[] | null = null;

  constructor(
    private commandHandler: UICommandHandler
  ) {}

  async onAgentResult(result: ExecuteAgentResult): Promise<void> {
    // Execute automatic commands immediately
    if (result.automaticCommands?.length) {
      await this.commandHandler.executeAutomaticCommands(result.automaticCommands);
    }

    // Show response form if present
    if (result.responseForm) {
      this.currentResponseForm = result.responseForm;
    }

    // Show actionable commands
    if (result.actionableCommands?.length) {
      this.currentActionableCommands = result.actionableCommands;
    }
  }

  isSimpleChoice(form: AgentResponseForm): boolean {
    return (
      form.questions.length === 1 &&
      !form.title &&
      ['buttongroup', 'radio'].includes(form.questions[0].type.type)
    );
  }

  onFormSubmit(answers: Record<string, any>): void {
    // Send answers as chat message
    this.sendMessage({
      role: 'user',
      content: JSON.stringify(answers),
      metadata: { type: 'form_response' }
    });
    this.currentResponseForm = null;
  }

  onSimpleChoiceSelect(value: any): void {
    // Send simple value as message
    this.sendMessage({
      role: 'user',
      content: typeof value === 'string' ? value : JSON.stringify(value)
    });
    this.currentResponseForm = null;
  }

  async onCommandClick(cmd: ActionableCommand): Promise<void> {
    await this.commandHandler.executeActionableCommand(cmd);
  }
}
```

**Template integration:**
```html
<!-- In conversation template -->

<!-- Simple response buttons -->
<mj-simple-response-buttons
  *ngIf="currentResponseForm && isSimpleChoice(currentResponseForm)"
  [question]="currentResponseForm.questions[0]"
  (select)="onSimpleChoiceSelect($event)"
></mj-simple-response-buttons>

<!-- Full response form -->
<mj-agent-response-form
  *ngIf="currentResponseForm && !isSimpleChoice(currentResponseForm)"
  [form]="currentResponseForm"
  (submit)="onFormSubmit($event)"
  (cancel)="currentResponseForm = null"
></mj-agent-response-form>

<!-- Actionable commands -->
<mj-actionable-commands
  *ngIf="currentActionableCommands"
  [commands]="currentActionableCommands"
  (commandClick)="onCommandClick($event)"
></mj-actionable-commands>
```

## Testing Checklist

- [ ] Simple button choice renders correctly
- [ ] Full forms render with all question types
- [ ] Form validation works (required fields, max length, email format)
- [ ] Simple choice submission sends correct value
- [ ] Full form submission sends all answers
- [ ] Actionable commands execute navigation correctly
- [ ] Automatic commands refresh data/show notifications
- [ ] Mobile responsive layout
- [ ] Keyboard navigation works
- [ ] Screen reader accessibility

## Styling Considerations

- Use existing MJ design system colors and spacing
- Ensure buttons match Kendo theme
- Form inputs should be consistent with existing forms
- Mobile-first responsive design
- Clear visual hierarchy (title → questions → actions)

## Next Steps

1. Create component files in appropriate package
2. Add components to module declarations
3. Implement UICommandHandler service with real service dependencies
4. Update conversation component to use new components
5. Test with existing agents (Sage, Agent Manager)
6. Add to Explorer if needed

## Notes

- The backend is 100% ready - agents can return these structures now
- UI just needs to render them and send responses back
- Start with simple buttons, then add full forms, then commands
- Incremental implementation is fine - partial functionality is better than none
