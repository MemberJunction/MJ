# Code Editor Component

A feature-rich code editor component for Angular applications in the MemberJunction framework, based on CodeMirror 6.

## Features

- **Syntax Highlighting**: Support for multiple programming languages
- **Rich Text Editing**: Advanced code editing capabilities
- **Theming**: Customizable appearance
- **Form Integration**: Works as a form control with NgModel and ReactiveForm support
- **Reactive Configuration**: Dynamic configuration of editor properties
- **Accessibility**: Keyboard navigation and screen reader support
- **Line Wrapping**: Optional wrapping of long lines
- **Whitespace Highlighting**: Optional visualization of whitespace
- **Indent Control**: Customizable indentation behavior

## Installation

```bash
npm install @memberjunction/ng-code-editor
```

## Usage

### Import the Module

```typescript
import { CodeEditorModule } from '@memberjunction/ng-code-editor';

@NgModule({
  imports: [
    CodeEditorModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<mj-code-editor
  [value]="myCode"
  [language]="'typescript'"
  [placeholder]="'Enter your code here...'"
  (change)="onCodeChange($event)">
</mj-code-editor>
```

### With Language Support

```typescript
import { Component, OnInit } from '@angular/core';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

@Component({
  selector: 'app-code-editor-demo',
  template: `
    <mj-code-editor
      [(ngModel)]="code"
      [language]="selectedLanguage"
      [languages]="supportedLanguages"
      [lineWrapping]="true"
      [highlightWhitespace]="true"
      [indentWithTab]="true">
    </mj-code-editor>
    
    <select [(ngModel)]="selectedLanguage">
      <option *ngFor="let lang of languageNames" [value]="lang">{{lang}}</option>
    </select>
  `
})
export class CodeEditorDemoComponent implements OnInit {
  code = 'function hello() {\n  console.log("Hello world!");\n}';
  selectedLanguage = 'typescript';
  supportedLanguages: LanguageDescription[] = [];
  languageNames: string[] = [];

  ngOnInit() {
    // Load available languages
    this.supportedLanguages = languages;
    this.languageNames = this.supportedLanguages.map(lang => lang.name);
  }
}
```

### As a Form Control

```typescript
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { languages } from '@codemirror/language-data';

@Component({
  selector: 'app-code-form',
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <label for="code">SQL Query:</label>
      <mj-code-editor
        formControlName="code"
        [languages]="languages"
        [language]="'sql'"
        [placeholder]="'Enter SQL query...'"
        [readonly]="isReadonly"
        [highlightWhitespace]="true">
      </mj-code-editor>
      
      <button type="submit" [disabled]="form.invalid">Run Query</button>
    </form>
  `
})
export class CodeFormComponent {
  form: FormGroup;
  languages = languages;
  isReadonly = false;
  
  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      code: ['SELECT * FROM users', Validators.required]
    });
  }
  
  onSubmit() {
    if (this.form.valid) {
      console.log('Running query:', this.form.get('code')!.value);
      // Process the code
    }
  }
}
```

## API Reference

### Inputs

- `value`: string - The editor's value
- `disabled`: boolean - Whether the editor is disabled
- `readonly`: boolean - Whether the editor is readonly
- `placeholder`: string - The editor's placeholder text
- `indentWithTab`: boolean - Whether indent with Tab key
- `indentUnit`: string - String for indentation (e.g., '  ' for 2 spaces)
- `lineWrapping`: boolean - Whether the editor wraps lines
- `highlightWhitespace`: boolean - Whether to highlight whitespace characters
- `languages`: LanguageDescription[] - Array of language descriptions
- `language`: string - The editor's language name
- `setup`: 'basic' | 'minimal' | null - The editor's built-in setup
- `extensions`: Extension[] - Additional CodeMirror extensions
- `autoFocus`: boolean - Whether to focus on the editor after init
- `root`: Document | ShadowRoot - EditorView's root element

### Outputs

- `change`: EventEmitter<string> - Emitted when the editor's value changes
- `focus`: EventEmitter<void> - Emitted when the editor is focused
- `blur`: EventEmitter<void> - Emitted when the editor loses focus

### Methods

- `setValue(value: string)`: Sets the editor's value
- `setExtensions(value: Extension[])`: Sets the root extensions of the editor
- `setEditable(value: boolean)`: Sets the editor's editable state
- `setReadonly(value: boolean)`: Sets the editor's readonly state
- `setPlaceholder(value: string)`: Sets the editor's placeholder
- `setIndentWithTab(value: boolean)`: Sets the editor's indentWithTab option
- `setIndentUnit(value: string)`: Sets the editor's indentUnit option
- `setLineWrapping(value: boolean)`: Sets the editor's lineWrapping option
- `setHighlightWhitespace(value: boolean)`: Sets the editor's highlightWhitespace option
- `setLanguage(lang: string)`: Sets the editor's language dynamically

## Dependencies

- `codemirror`: The core CodeMirror 6 library
- `@codemirror/language-data`: Language support for various programming languages
- `@codemirror/merge`: For merge view functionality
- `@memberjunction/ng-container-directives`: For container directives

## Styling

The component inherits CodeMirror's default styling and can be customized using CSS. The component doesn't apply any encapsulation to its styles, allowing for easy theme customization.