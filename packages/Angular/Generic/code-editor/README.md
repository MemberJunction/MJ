# @memberjunction/ng-code-editor

A powerful and flexible code editor component for Angular applications in the MemberJunction framework, built on top of CodeMirror 6.

## Overview

The `@memberjunction/ng-code-editor` package provides a feature-rich code editing experience with syntax highlighting, form integration, and extensive customization options. It seamlessly integrates with Angular's reactive forms and template-driven forms, making it ideal for applications that require code editing capabilities.

## Features

- **Syntax Highlighting**: Support for 150+ programming languages via `@codemirror/language-data`
- **Form Integration**: Full support for `ngModel`, `formControlName`, and `ControlValueAccessor`
- **Reactive Configuration**: All editor properties can be changed dynamically at runtime
- **Accessibility**: Built-in keyboard navigation and screen reader support
- **Line Wrapping**: Optional automatic line wrapping for long lines
- **Whitespace Visualization**: Option to highlight tabs, spaces, and line breaks
- **Customizable Indentation**: Configure tab behavior and indent units
- **Multiple Setup Modes**: Choose between basic, minimal, or custom editor setups
- **Extension Support**: Add custom CodeMirror extensions for advanced functionality
- **TypeScript Support**: Full type safety with TypeScript declarations

## Installation

```bash
npm install @memberjunction/ng-code-editor
```

### Peer Dependencies

This package requires Angular 21 or higher:
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2

## Getting Started

### 1. Import the Module

```typescript
import { CodeEditorModule } from '@memberjunction/ng-code-editor';

@NgModule({
  imports: [
    CodeEditorModule,
    // other imports
  ],
  // ...
})
export class AppModule { }
```

### 2. Basic Usage

```html
<mj-code-editor
  [value]="code"
  [language]="'javascript'"
  [placeholder]="'// Enter your code here...'"
  (change)="onCodeChange($event)">
</mj-code-editor>
```

```typescript
export class MyComponent {
  code = 'console.log("Hello, world!");';
  
  onCodeChange(newCode: string) {
    console.log('Code changed:', newCode);
  }
}
```

## Usage Examples

### Template-Driven Forms with NgModel

```typescript
import { Component } from '@angular/core';
import { languages } from '@codemirror/language-data';

@Component({
  selector: 'app-template-form',
  template: `
    <div class="editor-container">
      <mj-code-editor
        [(ngModel)]="code"
        name="code"
        [languages]="languages"
        [language]="'typescript'"
        [lineWrapping]="true"
        [highlightWhitespace]="showWhitespace"
        [indentWithTab]="true"
        [placeholder]="'// Start typing your TypeScript code...'"
        (focus)="onFocus()"
        (blur)="onBlur()">
      </mj-code-editor>
      
      <div class="controls">
        <label>
          <input type="checkbox" [(ngModel)]="showWhitespace">
          Show whitespace
        </label>
      </div>
    </div>
  `
})
export class TemplateFormComponent {
  code = '';
  languages = languages;
  showWhitespace = false;
  
  onFocus() {
    console.log('Editor focused');
  }
  
  onBlur() {
    console.log('Editor blurred');
  }
}
```

### Reactive Forms

```typescript
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { languages } from '@codemirror/language-data';

@Component({
  selector: 'app-reactive-form',
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <mj-code-editor
        formControlName="query"
        [languages]="languages"
        [language]="'sql'"
        [placeholder]="'SELECT * FROM ...'"
        [readonly]="isExecuting"
        [setup]="'basic'"
        [lineWrapping]="true">
      </mj-code-editor>
      
      <div class="form-errors" *ngIf="form.get('query')?.errors && form.get('query')?.touched">
        <p *ngIf="form.get('query')?.errors?.['required']">Query is required</p>
      </div>
      
      <button type="submit" [disabled]="form.invalid || isExecuting">
        Execute Query
      </button>
    </form>
  `
})
export class ReactiveFormComponent implements OnInit {
  form!: FormGroup;
  languages = languages;
  isExecuting = false;
  
  constructor(private fb: FormBuilder) {}
  
  ngOnInit() {
    this.form = this.fb.group({
      query: ['', [Validators.required, this.sqlValidator]]
    });
  }
  
  sqlValidator(control: any) {
    const value = control.value;
    if (value && !value.toLowerCase().includes('select')) {
      return { invalidSql: true };
    }
    return null;
  }
  
  onSubmit() {
    if (this.form.valid) {
      this.isExecuting = true;
      // Execute query...
      setTimeout(() => this.isExecuting = false, 2000);
    }
  }
}
```

### Dynamic Language Switching

```typescript
import { Component, OnInit } from '@angular/core';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

@Component({
  selector: 'app-multi-language-editor',
  template: `
    <div class="language-selector">
      <select [(ngModel)]="selectedLanguage" (change)="onLanguageChange()">
        <option *ngFor="let lang of availableLanguages" [value]="lang.name">
          {{ lang.name }}
        </option>
      </select>
    </div>
    
    <mj-code-editor
      [(ngModel)]="code"
      [languages]="languages"
      [language]="selectedLanguage"
      [setup]="'basic'"
      [indentUnit]="getIndentUnit()">
    </mj-code-editor>
  `
})
export class MultiLanguageEditorComponent implements OnInit {
  code = '';
  languages = languages;
  availableLanguages: LanguageDescription[] = [];
  selectedLanguage = 'JavaScript';
  
  ngOnInit() {
    // Filter to show only common languages
    this.availableLanguages = this.languages.filter(lang => 
      ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'HTML', 'CSS', 'SQL'].includes(lang.name)
    );
  }
  
  onLanguageChange() {
    // Update code sample based on language
    const samples: Record<string, string> = {
      'JavaScript': 'function greet(name) {\n  return `Hello, ${name}!`;\n}',
      'Python': 'def greet(name):\n    return f"Hello, {name}!"',
      'Java': 'public String greet(String name) {\n    return "Hello, " + name + "!";\n}',
      'SQL': 'SELECT name, email\nFROM users\nWHERE active = true;'
    };
    
    this.code = samples[this.selectedLanguage] || '// Start coding...';
  }
  
  getIndentUnit() {
    // Python uses 4 spaces, others use 2
    return this.selectedLanguage === 'Python' ? '    ' : '  ';
  }
}
```

### Custom Extensions and Themes

```typescript
import { Component } from '@angular/core';
import { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';

@Component({
  selector: 'app-custom-editor',
  template: `
    <mj-code-editor
      [(ngModel)]="code"
      [extensions]="customExtensions"
      [setup]="'minimal'"
      [placeholder]="'// Custom configured editor'">
    </mj-code-editor>
  `
})
export class CustomEditorComponent {
  code = '';
  
  customExtensions: Extension[] = [
    oneDark,  // Add One Dark theme
    keymap.of(defaultKeymap),  // Add default keybindings
    // Add more custom extensions as needed
  ];
}
```

### Accessing the EditorView Instance

```typescript
import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { CodeEditorComponent } from '@memberjunction/ng-code-editor';

@Component({
  selector: 'app-advanced-editor',
  template: `
    <mj-code-editor
      #editor
      [(ngModel)]="code"
      [language]="'javascript'">
    </mj-code-editor>
    
    <button (click)="insertTextAtCursor()">Insert Comment</button>
    <button (click)="selectAll()">Select All</button>
  `
})
export class AdvancedEditorComponent implements AfterViewInit {
  @ViewChild('editor') editor!: CodeEditorComponent;
  code = '';
  
  ngAfterViewInit() {
    // Access the CodeMirror EditorView instance
    const view = this.editor.view;
    if (view) {
      console.log('Editor state:', view.state);
    }
  }
  
  insertTextAtCursor() {
    const view = this.editor.view;
    if (view) {
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: '// TODO: ' }
      });
    }
  }
  
  selectAll() {
    const view = this.editor.view;
    if (view) {
      view.dispatch({
        selection: { anchor: 0, head: view.state.doc.length }
      });
    }
  }
}
```

## API Reference

### Component Selector
`mj-code-editor`

### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `value` | `string` | `''` | The editor's content |
| `disabled` | `boolean` | `false` | Disables the editor (no editing allowed) |
| `readonly` | `boolean` | `false` | Makes the editor read-only (selection allowed) |
| `placeholder` | `string` | `''` | Placeholder text shown when editor is empty |
| `indentWithTab` | `boolean` | `false` | Whether Tab key indents instead of focusing next element |
| `indentUnit` | `string` | `''` | String used for indentation (e.g., `'  '` for 2 spaces) |
| `lineWrapping` | `boolean` | `false` | Whether long lines wrap to next line |
| `highlightWhitespace` | `boolean` | `false` | Whether to visually highlight whitespace characters |
| `languages` | `LanguageDescription[]` | `[]` | Array of available language descriptions (static) |
| `language` | `string` | `''` | Current language for syntax highlighting |
| `setup` | `'basic' \| 'minimal' \| null` | `'basic'` | Built-in editor setup configuration |
| `extensions` | `Extension[]` | `[]` | Additional CodeMirror extensions |
| `autoFocus` | `boolean` | `false` | Whether to focus editor on initialization (static) |
| `root` | `Document \| ShadowRoot` | `undefined` | Custom root for the editor (static) |

**Note**: Inputs marked as "static" cannot be changed after initialization.

### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `change` | `EventEmitter<string>` | Emits when editor content changes |
| `focus` | `EventEmitter<void>` | Emits when editor gains focus |
| `blur` | `EventEmitter<void>` | Emits when editor loses focus |

### Public Methods

| Method | Parameters | Description |
|--------|------------|-------------|
| `setValue` | `value: string` | Programmatically set editor content |
| `setExtensions` | `value: Extension[]` | Replace all editor extensions |
| `setEditable` | `value: boolean` | Toggle editor's editable state |
| `setReadonly` | `value: boolean` | Toggle editor's readonly state |
| `setPlaceholder` | `value: string` | Update placeholder text |
| `setIndentWithTab` | `value: boolean` | Toggle Tab key indentation |
| `setIndentUnit` | `value: string` | Set indentation string |
| `setLineWrapping` | `value: boolean` | Toggle line wrapping |
| `setHighlightWhitespace` | `value: boolean` | Toggle whitespace highlighting |
| `setLanguage` | `lang: string` | Change syntax highlighting language |

### Public Properties

| Property | Type | Description |
|----------|------|-------------|
| `view` | `EditorView \| undefined` | The underlying CodeMirror EditorView instance |

## Setup Modes

The `setup` input accepts three values:

- **`'basic'`** (default): Includes the full CodeMirror basic setup with line numbers, fold gutters, search, brackets matching, etc.
- **`'minimal'`**: Includes only essential features like undo/redo history and basic keymaps
- **`null`**: No built-in setup, allowing complete customization via extensions

## Working with Languages

To enable syntax highlighting, you must:

1. Import language descriptions from `@codemirror/language-data`
2. Pass them to the `languages` input
3. Set the desired language via the `language` input

```typescript
import { languages } from '@codemirror/language-data';

// In your component
languages = languages;  // All 150+ languages
// or filter to specific languages
languages = languages.filter(lang => 
  ['JavaScript', 'TypeScript', 'Python'].includes(lang.name)
);
```

Language matching is case-insensitive and supports aliases. For example, "javascript", "JavaScript", "js" all work for JavaScript.

## Integration with MemberJunction

This component integrates seamlessly with other MemberJunction packages:

- **Form Integration**: Works with MJ's form generation and validation systems
- **Container Directives**: Uses `@memberjunction/ng-container-directives` for advanced template composition
- **Entity Management**: Can be used in entity forms for code-type fields

### Example: Using in Entity Forms

```typescript
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@Component({
  template: `
    <mj-code-editor
      [value]="record.CodeField"
      (change)="updateRecord('CodeField', $event)"
      [language]="'sql'"
      [readonly]="!this.EditMode">
    </mj-code-editor>
  `
})
export class CustomEntityFormComponent extends BaseFormComponent {
  updateRecord(field: string, value: any) {
    this.record[field] = value;
    this.RecordChanged = true;
  }
}
```

## Performance Considerations

- The editor uses CodeMirror 6's efficient document model for handling large files
- Language loading is lazy - languages are only loaded when selected
- Use `'minimal'` setup for better performance with many editor instances
- Consider virtual scrolling for very large documents (via custom extensions)

## Build and Development

This package uses Angular CLI for building:

```bash
# Build the package
npm run build

# The built package will be in ./dist
```

## Browser Support

Supports all modern browsers that CodeMirror 6 supports:
- Chrome/Edge (latest)
- Firefox (latest)  
- Safari (latest)

## License

ISC

## Contributing

This component is part of the MemberJunction framework. For contribution guidelines, please refer to the main MemberJunction repository.

## Troubleshooting

### Common Issues

1. **No syntax highlighting**: Ensure you've provided the `languages` input and set a valid `language` name
2. **Form validation not working**: Make sure to import `FormsModule` or `ReactiveFormsModule` in your module
3. **Custom extensions not applying**: Extensions are applied in order - ensure no conflicts with the `setup` mode
4. **Performance issues with large files**: Consider using `'minimal'` setup and adding only necessary extensions