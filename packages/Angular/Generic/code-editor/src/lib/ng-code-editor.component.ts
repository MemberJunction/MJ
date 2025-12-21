import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  ViewEncapsulation,
  booleanAttribute,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { indentWithTab } from '@codemirror/commands';
import { LanguageDescription, indentUnit } from '@codemirror/language';
import { Annotation, Compartment, EditorState, Extension, StateEffect } from '@codemirror/state';
import { EditorView, highlightWhitespace, keymap, placeholder, lineNumbers, EditorView as EditorViewType } from '@codemirror/view';
import { basicSetup, minimalSetup } from 'codemirror';

// Import common language extensions
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { python } from '@codemirror/lang-python';
import { languages } from '@codemirror/language-data';

// Import toolbar configuration
import { ToolbarConfig, ToolbarButton, ToolbarButtonGroup, ToolbarActionEvent } from './toolbar-config';

export type Setup = 'basic' | 'minimal' | null;

export const External = Annotation.define<boolean>();

@Component({
  standalone: false,
  selector: 'mj-code-editor',
  templateUrl: './ng-code-editor.component.html',
  styleUrls: ['./ng-code-editor.component.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CodeEditorComponent),
      multi: true,
    },
  ],
})
export class CodeEditorComponent implements OnInit, OnDestroy, ControlValueAccessor {
  /**
   * EditorView's [root](https://codemirror.net/docs/ref/#view.EditorView.root).
   *
   * Don't support change dynamically!
   */
  @Input() root?: Document | ShadowRoot;

  /**
   * Whether focus on the editor after init.
   *
   * Don't support change dynamically!
   */
  @Input({ transform: booleanAttribute }) autoFocus = false;

  // Private backing fields
  private _value = '';
  private _disabled = false;
  private _readonly = false;
  private _placeholder = '';
  private _indentWithTab = false;
  private _indentUnit = '';
  private _lineWrapping = true;
  private _highlightWhitespace = false;
  private _language = '';
  private _setup: Setup = 'basic';
  private _customExtensionFactories: (() => Extension)[] = [];
  private _extensions: Extension[] = [];

  /** The editor's value. */
  @Input()
  get value(): string { return this._value; }
  set value(val: string) {
    this._value = val;
    if (this.view) {
      this.setValue(val);
    }
  }

  /** Whether the editor is disabled. */
  @Input({ transform: booleanAttribute })
  get disabled(): boolean { return this._disabled; }
  set disabled(val: boolean) {
    this._disabled = val;
    if (this.view) {
      this.setEditable(!val && !this._readonly);
    }
  }

  /** Whether the editor is readonly. */
  @Input({ transform: booleanAttribute })
  get readonly(): boolean { return this._readonly; }
  set readonly(val: boolean) {
    this._readonly = val;
    if (this.view) {
      this.setReadonly(val);
      // When readonly, also make it non-editable
      if (val) {
        this.setEditable(false);
      }
    }
  }

  /** The editor's placeholder. */
  @Input()
  get placeholder(): string { return this._placeholder; }
  set placeholder(val: string) {
    this._placeholder = val;
    if (this.view) {
      this.setPlaceholder(val);
    }
  }

  /** Whether indent with Tab key. */
  @Input({ transform: booleanAttribute })
  get indentWithTab(): boolean { return this._indentWithTab; }
  set indentWithTab(val: boolean) {
    this._indentWithTab = val;
    if (this.view) {
      this.setIndentWithTab(val);
    }
  }

  /** Should be a string consisting either entirely of the same whitespace character. */
  @Input()
  get indentUnit(): string { return this._indentUnit; }
  set indentUnit(val: string) {
    this._indentUnit = val;
    if (this.view) {
      this.setIndentUnit(val);
    }
  }

  /** Whether the editor wraps lines. */
  @Input({ transform: booleanAttribute })
  get lineWrapping(): boolean { return this._lineWrapping; }
  set lineWrapping(val: boolean) {
    this._lineWrapping = val;
    if (this.view) {
      this.setLineWrapping(val);
    }
  }

  /** Whether highlight the whitespace. */
  @Input({ transform: booleanAttribute })
  get highlightWhitespace(): boolean { return this._highlightWhitespace; }
  set highlightWhitespace(val: boolean) {
    this._highlightWhitespace = val;
    if (this.view) {
      this.setHighlightWhitespace(val);
    }
  }

  /**
   * An array of language descriptions for known
   * [language-data](https://github.com/codemirror/language-data/blob/main/src/language-data.ts).
   *
   * Don't support change dynamically!
   */
  @Input() languages: LanguageDescription[] = languages;

  /** The editor's language. You should set the `languages` prop at first. */
  @Input()
  get language(): string { return this._language; }
  set language(val: string) {
    this._language = val;
    if (this.view) {
      this.setLanguage(val);
    }
  }

  /**
   * The editor's built-in setup. The value can be set to
   * [`basic`](https://codemirror.net/docs/ref/#codemirror.basicSetup),
   * [`minimal`](https://codemirror.net/docs/ref/#codemirror.minimalSetup) or `null`.
   */
  @Input()
  get setup(): Setup { return this._setup; }
  set setup(val: Setup) {
    this._setup = val;
    if (this.view) {
      this.setExtensions(this._getAllExtensions());
    }
  }

  /**
   * Custom extension factories that can be provided by the parent component.
   * These functions will be called when initializing the editor to get the extensions.
   */
  @Input()
  get customExtensionFactories(): (() => Extension)[] { return this._customExtensionFactories; }
  set customExtensionFactories(val: (() => Extension)[]) {
    this._customExtensionFactories = val;
    if (this.view) {
      this.setExtensions(this._getAllExtensions());
    }
  }

  /**
   * It will be appended to the root
   * [extensions](https://codemirror.net/docs/ref/#state.EditorStateConfig.extensions).
   */
  @Input()
  get extensions(): Extension[] { return this._extensions; }
  set extensions(val: Extension[]) {
    this._extensions = val;
    if (this.view) {
      this.setExtensions(this._getAllExtensions());
    }
  }

  /** Event emitted when the editor's value changes. */
  @Output() change = new EventEmitter<string>();

  /** Event emitted when focus on the editor. */
  @Output() focus = new EventEmitter<void>();

  /** Event emitted when the editor has lost focus. */
  @Output() blur = new EventEmitter<void>();

  /** 
   * Toolbar configuration. Defaults to disabled.
   * Set enabled: true to show the toolbar.
   */
  @Input() toolbar: ToolbarConfig = { enabled: false };

  /** Event emitted when a toolbar button is clicked */
  @Output() toolbarAction = new EventEmitter<ToolbarActionEvent>();

  /** Reference to the editor content container */
  @ViewChild('editorContent', { static: true }) editorContent!: ElementRef;

  private _onChange: (value: string) => void = () => {};
  private _onTouched: () => void = () => {};

  constructor(private _elementRef: ElementRef<Element>) {}

  /**
   * The instance of [EditorView](https://codemirror.net/docs/ref/#view.EditorView).
   */
  view?: EditorView;

  private _updateListener = EditorView.updateListener.of((vu) => {
    if (vu.docChanged && !vu.transactions.some((tr) => tr.annotation(External))) {
      const value = vu.state.doc.toString();
      this._onChange(value);
      this.change.emit(value);
    }
  });

  // Extension compartments can be used to make a configuration dynamic.
  // https://codemirror.net/docs/ref/#state.Compartment
  private _editableConf = new Compartment();
  private _readonlyConf = new Compartment();
  private _themeConf = new Compartment();
  private _placeholderConf = new Compartment();
  private _indentWithTabConf = new Compartment();
  private _indentUnitConf = new Compartment();
  private _lineWrappingConf = new Compartment();
  private _highlightWhitespaceConf = new Compartment();
  private _languageConf = new Compartment();

  private _getAllExtensions() {
    const allExtensions: Extension[] = [
      this._updateListener,

      this._editableConf.of([]),
      this._readonlyConf.of([]),
      this._themeConf.of([]),
      this._placeholderConf.of([]),
      this._indentWithTabConf.of([]),
      this._indentUnitConf.of([]),
      this._lineWrappingConf.of([]),
      this._highlightWhitespaceConf.of([]),
      this._languageConf.of([]),

      this._setup === 'basic' ? basicSetup : this._setup === 'minimal' ? minimalSetup : [],

      // Add line wrapping support
      this._lineWrapping ? EditorView.lineWrapping : [],

      // Add built-in language support if no custom language is loaded
      this._getBuiltInLanguageExtension(),

      ...this._extensions,
    ];

    // Add custom extensions from factories
    for (const factory of this._customExtensionFactories) {
      try {
        allExtensions.push(factory());
      } catch (error) {
        console.error('Error loading custom extension:', error);
      }
    }

    return allExtensions;
  }

  /**
   * Get built-in language extension if the language matches a known one
   */
  private _getBuiltInLanguageExtension(language?: string): Extension {
    const lang = (language || this._language).toLowerCase();
    switch (lang) {
      case 'json':
        return json();
      case 'javascript':
      case 'js':
        return javascript({
          typescript: false,
          jsx: true, // Enable JSX support for JavaScript files
        });
      case 'typescript':
      case 'ts':
        return javascript({
          typescript: true,
          jsx: true, // Enable JSX support for TypeScript files
        });  
      case 'sql':
        return sql();
      case 'python':
      case 'py':
        return python();
      default:
        return [];
    }
  }


  /**
   * Get toolbar groups for rendering
   */
  get toolbarGroups(): ToolbarButtonGroup[] {
    if (!this.toolbar?.enabled) return [];
    
    if (this.toolbar.groups) {
      return this.toolbar.groups;
    }
    
    // Single group from buttons array
    if (this.toolbar.buttons) {
      return [{
        id: 'default',
        buttons: this.toolbar.buttons,
        separator: false
      }];
    }
    
    return [];
  }

  /**
   * Handle toolbar button click
   */
  handleButtonClick(button: ToolbarButton): void {
    if (!this.view) return;
    
    if (button.handler) {
      // Execute the button's handler
      const result = button.handler(this.view);
      
      // Handle async handlers
      if (result instanceof Promise) {
        result.catch(err => {
          console.error(`Toolbar button "${button.id}" handler error:`, err);
        });
      }
    }
    
    // Emit the toolbar action event
    this.toolbarAction.emit({
      buttonId: button.id,
      editor: this.view
    });
  }

  /**
   * Check if a group is the last one (for separator logic)
   */
  isLastGroup(group: ToolbarButtonGroup): boolean {
    const groups = this.toolbarGroups;
    return groups.indexOf(group) === groups.length - 1;
  }

  ngOnInit(): void {
    this.view = new EditorView({
      root: this.root,
      parent: this.editorContent.nativeElement, // Use ViewChild reference
      state: EditorState.create({ doc: this._value, extensions: this._getAllExtensions() }),
    });

    if (this.autoFocus) {
      this.view?.focus();
    }

    this.view?.contentDOM.addEventListener('focus', () => {
      this._onTouched();
      this.focus.emit();
    });

    this.view?.contentDOM.addEventListener('blur', () => {
      this._onTouched();
      this.blur.emit();
    });

    // Apply initial configuration values
    // These are already set via setters if the properties were bound before ngOnInit
    // But we need to ensure they're applied if set via direct property assignment
    this.setEditable(!this._disabled && !this._readonly);
    this.setReadonly(this._readonly);
    this.setPlaceholder(this._placeholder);
    this.setIndentWithTab(this._indentWithTab);
    this.setIndentUnit(this._indentUnit);
    this.setLineWrapping(this._lineWrapping);
    this.setHighlightWhitespace(this._highlightWhitespace);
    this.setLanguage(this._language);
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  writeValue(value: string): void {
    if (this.view) {
      this.setValue(value);
    }
  }

  registerOnChange(fn: (value: string) => void) {
    this._onChange = fn;
  }

  registerOnTouched(fn: () => void) {
    this._onTouched = fn;
  }

  setDisabledState(isDisabled: boolean) {
    this.disabled = isDisabled;
  }

  /** Sets editor's value. */
  setValue(value: string) {
    if (!this.view) return;
    
    // Prevent unnecessary updates
    const currentValue = this.view.state.doc.toString();
    if (currentValue === value) return;
    
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: value },
      annotations: [External.of(true)] // Mark as external change to prevent change event
    });
  }

  private _dispatchEffects(effects: StateEffect<any> | readonly StateEffect<any>[]) {
    return this.view?.dispatch({ effects });
  }

  /** Sets the root extensions of the editor. */
  setExtensions(value: Extension[]) {
    this._dispatchEffects(StateEffect.reconfigure.of(value));
  }

  /** Sets editor's editable state. */
  setEditable(value: boolean) {
    this._dispatchEffects(this._editableConf.reconfigure(EditorView.editable.of(value)));
  }

  /** Sets editor's readonly state. */
  setReadonly(value: boolean) {
    this._dispatchEffects(this._readonlyConf.reconfigure(EditorState.readOnly.of(value)));
  }

  /** Sets editor's placeholder. */
  setPlaceholder(value: string) {
    this._dispatchEffects(this._placeholderConf.reconfigure(value ? placeholder(value) : []));
  }

  /** Sets editor' indentWithTab. */
  setIndentWithTab(value: boolean) {
    this._dispatchEffects(this._indentWithTabConf.reconfigure(value ? keymap.of([indentWithTab]) : []));
  }

  /** Sets editor's indentUnit. */
  setIndentUnit(value: string) {
    this._dispatchEffects(this._indentUnitConf.reconfigure(value ? indentUnit.of(value) : []));
  }

  /** Sets editor's lineWrapping. */
  setLineWrapping(value: boolean) {
    this._dispatchEffects(this._lineWrappingConf.reconfigure(value ? EditorView.lineWrapping : []));
  }

  /** Sets editor's highlightWhitespace. */
  setHighlightWhitespace(value: boolean) {
    this._dispatchEffects(this._highlightWhitespaceConf.reconfigure(value ? highlightWhitespace() : []));
  }

  /** Sets editor's language dynamically. */
  setLanguage(lang: string) {
    if (!lang) {
      return;
    }
    
    // Check if it's a built-in language first
    const lowerLang = lang.toLowerCase();
    const builtInLanguages = ['json', 'javascript', 'js', 'typescript', 'ts', 'sql', 'python', 'py'];
    
    if (builtInLanguages.includes(lowerLang)) {
      // For built-in languages, get the extension and reconfigure
      const extension = this._getBuiltInLanguageExtension(lang);
      if (extension) {
        this._dispatchEffects(this._languageConf.reconfigure(extension));
        return;
      }
    }
    
    // For other languages, use dynamic loading
    if (this.languages.length === 0) {
      if (this.view) {
        console.error('No supported languages. Please set the `languages` prop at first.');
      }
      return;
    }
    const langDesc = this._findLanguage(lang);
    langDesc?.load().then((lang) => {
      this._dispatchEffects(this._languageConf.reconfigure([lang]));
    });
  }

  /** Find the language's extension by its name. Case insensitive. */
  private _findLanguage(name: string) {
    for (const lang of this.languages) {
      for (const alias of [lang.name, ...lang.alias]) {
        if (name.toLowerCase() === alias.toLowerCase()) {
          return lang;
        }
      }
    }
    console.error('Language not found:', name);
    console.info('Supported language names:', this.languages.map((lang) => lang.name).join(', '));
    return null;
  }
}
