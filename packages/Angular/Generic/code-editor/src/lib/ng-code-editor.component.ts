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
import { HighlightStyle, LanguageDescription, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { Annotation, Compartment, EditorState, Extension, StateEffect } from '@codemirror/state';
import { EditorView, highlightWhitespace, keymap, placeholder, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { basicSetup, minimalSetup } from 'codemirror';

// Import common language extensions
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { python } from '@codemirror/lang-python';
import { languages } from '@codemirror/language-data';

// Import toolbar configuration
import { ToolbarConfig, ToolbarButton, ToolbarButtonGroup, ToolbarActionEvent } from './toolbar-config';

// Import composition token extension for SQL highlighting
import { CompositionTokenExtension, CompositionTokenClickEvent, CompositionTokenResolver, CompositionTokenInfo } from './composition-token-extension';

// Import QueryEngine for default hover resolution
import { QueryEngine } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

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
export class CodeEditorComponent extends BaseAngularComponent implements OnInit, OnDestroy, ControlValueAccessor {
  /**
   * EditorView's [root](https://codemirror.net/docs/ref/#view.EditorView.root).
   *
   * Don't support change dynamically!
   */
  @Input() Root?: Document | ShadowRoot;

  /** @deprecated Use {@link Root}. */
  @Input() set root(value: Document | ShadowRoot | undefined) {
    this.Root = value;
  }
  /** @deprecated Use {@link Root}. */
  get root(): Document | ShadowRoot | undefined {
    return this.Root;
  }

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
      this.SetValue(val);
    }
  }

  /** Whether the editor is disabled. */
  @Input({ transform: booleanAttribute })
  get disabled(): boolean { return this._disabled; }
  set disabled(val: boolean) {
    this._disabled = val;
    if (this.view) {
      this.SetEditable(!val && !this._readonly);
    }
  }

  /** Whether the editor is readonly. */
  @Input({ transform: booleanAttribute })
  get readonly(): boolean { return this._readonly; }
  set readonly(val: boolean) {
    this._readonly = val;
    if (this.view) {
      this.SetReadonly(val);
      // When readonly, also make it non-editable
      if (val) {
        this.SetEditable(false);
      }
    }
  }

  /** The editor's placeholder. */
  @Input()
  get placeholder(): string { return this._placeholder; }
  set placeholder(val: string) {
    this._placeholder = val;
    if (this.view) {
      this.SetPlaceholder(val);
    }
  }

  /** Whether indent with Tab key. */
  @Input({ transform: booleanAttribute })
  get indentWithTab(): boolean { return this._indentWithTab; }
  set indentWithTab(val: boolean) {
    this._indentWithTab = val;
    if (this.view) {
      this.SetIndentWithTab(val);
    }
  }

  /** Should be a string consisting either entirely of the same whitespace character. */
  @Input()
  get indentUnit(): string { return this._indentUnit; }
  set indentUnit(val: string) {
    this._indentUnit = val;
    if (this.view) {
      this.SetIndentUnit(val);
    }
  }

  /** Whether the editor wraps lines. */
  @Input({ transform: booleanAttribute })
  get lineWrapping(): boolean { return this._lineWrapping; }
  set lineWrapping(val: boolean) {
    this._lineWrapping = val;
    if (this.view) {
      this.SetLineWrapping(val);
    }
  }

  /** Whether highlight the whitespace. */
  @Input({ transform: booleanAttribute })
  get highlightWhitespace(): boolean { return this._highlightWhitespace; }
  set highlightWhitespace(val: boolean) {
    this._highlightWhitespace = val;
    if (this.view) {
      this.SetHighlightWhitespace(val);
    }
  }

  /**
   * An array of language descriptions for known
   * [language-data](https://github.com/codemirror/language-data/blob/main/src/language-data.ts).
   *
   * Don't support change dynamically!
   */
  @Input() Languages: LanguageDescription[] = languages;

  /** @deprecated Use {@link Languages}. */
  @Input() set languages(value: LanguageDescription[]) {
    this.Languages = value;
  }
  /** @deprecated Use {@link Languages}. */
  get languages(): LanguageDescription[] {
    return this.Languages;
  }

  /** The editor's language. You should set the `languages` prop at first. */
  @Input()
  get language(): string { return this._language; }
  set language(val: string) {
    this._language = val;
    if (this.view) {
      this.SetLanguage(val);
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
      this.SetExtensions(this._getAllExtensions());
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
      this.SetExtensions(this._getAllExtensions());
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
      this.SetExtensions(this._getAllExtensions());
    }
  }

  /** Event emitted when the editor's value changes. */
  @Output() Change = new EventEmitter<string>();

  /**
   * @deprecated Use {@link Change}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (change) keeps working. Must stay AFTER Change: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() change = this.Change;

  /** Event emitted when focus on the editor. */
  @Output() Focus = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Focus}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (focus) keeps working. Must stay AFTER Focus: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() focus = this.Focus;

  /** Event emitted when the editor has lost focus. */
  @Output() Blur = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Blur}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (blur) keeps working. Must stay AFTER Blur: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() blur = this.Blur;

  /** 
   * Toolbar configuration. Defaults to disabled.
   * Set enabled: true to show the toolbar.
   */
  @Input() Toolbar: ToolbarConfig = { enabled: false };

  /** @deprecated Use {@link Toolbar}. */
  @Input() set toolbar(value: ToolbarConfig) {
    this.Toolbar = value;
  }
  /** @deprecated Use {@link Toolbar}. */
  get toolbar(): ToolbarConfig {
    return this.Toolbar;
  }

  /** Event emitted when a toolbar button is clicked */
  @Output() ToolbarAction = new EventEmitter<ToolbarActionEvent>();

  /**
   * @deprecated Use {@link ToolbarAction}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (toolbarAction) keeps working. Must stay AFTER ToolbarAction: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() toolbarAction = this.ToolbarAction;

  /** Event emitted when a {{query:"..."}} composition token is clicked in SQL mode */
  @Output() CompositionTokenClick = new EventEmitter<CompositionTokenClickEvent>();

  /** Reference to the editor content container */
  @ViewChild('editorContent', { static: true }) editorContent!: ElementRef;

  private _onChange: (value: string) => void = () => {};
  private _onTouched: () => void = () => {};

  constructor(private _elementRef: ElementRef<Element>) { super(); }

  /**
   * The instance of [EditorView](https://codemirror.net/docs/ref/#view.EditorView).
   */
  view?: EditorView;

  private _updateListener = EditorView.updateListener.of((vu) => {
    if (vu.docChanged && !vu.transactions.some((tr) => tr.annotation(External))) {
      const value = vu.state.doc.toString();
      this._onChange(value);
      this.Change.emit(value);
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

  /**
   * Creates the CodeMirror EditorView.theme() extension using MJ semantic design tokens.
   * CSS custom properties (var(--mj-*)) are used directly so the theme adapts
   * automatically when dark mode toggles [data-theme="dark"].
   */
  private _buildMjTheme(): Extension {
    return EditorView.theme({
      '&': {
        backgroundColor: 'var(--mj-bg-surface)',
        color: 'var(--mj-text-primary)',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-scroller': {
        fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
        fontSize: 'var(--mj-text-sm)',
      },
      '.cm-content': {
        minHeight: '100%',
        color: 'var(--mj-text-primary)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--mj-bg-surface-sunken)',
        borderRight: '1px solid var(--mj-border-default)',
        color: 'var(--mj-text-muted)',
      },
      '.cm-gutter.cm-lineNumbers .cm-gutterElement': {
        color: 'var(--mj-text-muted)',
      },
      '.cm-activeLineGutter, .cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--mj-brand-primary) 8%, transparent)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--mj-text-primary)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: 'color-mix(in srgb, var(--mj-brand-primary) 30%, transparent)',
      },
      '.cm-selectionMatch': {
        backgroundColor: 'color-mix(in srgb, var(--mj-brand-primary) 15%, transparent)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'color-mix(in srgb, var(--mj-status-warning) 30%, transparent)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'color-mix(in srgb, var(--mj-status-warning) 50%, transparent)',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--mj-bg-surface-sunken)',
        border: '1px solid var(--mj-border-default)',
        color: 'var(--mj-text-muted)',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--mj-bg-surface-elevated, var(--mj-bg-surface))',
        border: '1px solid var(--mj-border-default)',
        color: 'var(--mj-text-primary)',
      },
      '.cm-tooltip-autocomplete': {
        '& > ul > li[aria-selected]': {
          backgroundColor: 'color-mix(in srgb, var(--mj-brand-primary) 15%, transparent)',
          color: 'var(--mj-text-primary)',
        },
      },
      '.cm-panels': {
        backgroundColor: 'var(--mj-bg-surface-sunken)',
        color: 'var(--mj-text-primary)',
      },
      '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid var(--mj-border-default)',
      },
      '.cm-panels.cm-panels-bottom': {
        borderTop: '1px solid var(--mj-border-default)',
      },
    });
  }

  /**
   * Creates the syntax highlighting extension using MJ-aware colors.
   * These colors are chosen to be readable on both light and dark MJ surfaces.
   */
  private _buildMjHighlightStyle(): Extension {
    const mjHighlight = HighlightStyle.define([
      { tag: tags.keyword, color: 'var(--mj-syntax-keyword, #c678dd)' },
      { tag: tags.operator, color: 'var(--mj-syntax-keyword, #c678dd)' },
      { tag: tags.string, color: 'var(--mj-syntax-string, #98c379)' },
      { tag: tags.number, color: 'var(--mj-syntax-number, #d19a66)' },
      { tag: tags.bool, color: 'var(--mj-syntax-number, #d19a66)' },
      { tag: tags.null, color: 'var(--mj-syntax-number, #d19a66)' },
      { tag: tags.atom, color: 'var(--mj-syntax-number, #d19a66)' },
      { tag: tags.propertyName, color: 'var(--mj-syntax-property, #61afef)' },
      { tag: tags.variableName, color: 'var(--mj-syntax-variable, #e06c75)' },
      { tag: tags.definition(tags.variableName), color: 'var(--mj-syntax-variable, #e06c75)' },
      { tag: tags.function(tags.variableName), color: 'var(--mj-syntax-function, #61afef)' },
      { tag: tags.typeName, color: 'var(--mj-syntax-type, #e5c07b)' },
      { tag: tags.className, color: 'var(--mj-syntax-type, #e5c07b)' },
      { tag: tags.comment, color: 'var(--mj-text-disabled)', fontStyle: 'italic' },
      { tag: tags.lineComment, color: 'var(--mj-text-disabled)', fontStyle: 'italic' },
      { tag: tags.blockComment, color: 'var(--mj-text-disabled)', fontStyle: 'italic' },
      { tag: tags.meta, color: 'var(--mj-text-muted)' },
      { tag: tags.link, color: 'var(--mj-brand-primary)', textDecoration: 'underline' },
      { tag: tags.heading, color: 'var(--mj-text-primary)', fontWeight: 'bold' },
      { tag: tags.emphasis, fontStyle: 'italic' },
      { tag: tags.strong, fontWeight: 'bold' },
      { tag: tags.punctuation, color: 'var(--mj-text-secondary)' },
      { tag: tags.bracket, color: 'var(--mj-text-secondary)' },
      { tag: tags.tagName, color: 'var(--mj-syntax-keyword, #c678dd)' },
      { tag: tags.attributeName, color: 'var(--mj-syntax-property, #61afef)' },
      { tag: tags.attributeValue, color: 'var(--mj-syntax-string, #98c379)' },
    ]);
    return syntaxHighlighting(mjHighlight);
  }

  private _getAllExtensions() {
    const allExtensions: Extension[] = [
      this._updateListener,

      this._editableConf.of([]),
      this._readonlyConf.of([]),
      this._themeConf.of([this._buildMjTheme(), this._buildMjHighlightStyle()]),
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

      // Add composition token highlighting for SQL mode
      ...(this._language.toLowerCase() === 'sql'
        ? CompositionTokenExtension({
            OnTokenClick: (event) => this.CompositionTokenClick.emit(event),
            OnTokenHover: (fullPath) => this.resolveCompositionToken(fullPath)
          })
        : []),

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
  get ToolbarGroups(): ToolbarButtonGroup[] {
    if (!this.Toolbar?.enabled) return [];
    
    if (this.Toolbar.groups) {
      return this.Toolbar.groups;
    }
    
    // Single group from buttons array
    if (this.Toolbar.buttons) {
      return [{
        id: 'default',
        buttons: this.Toolbar.buttons,
        separator: false
      }];
    }
    
    return [];
  }

  /** @deprecated Use {@link ToolbarGroups}. */
  get toolbarGroups(): ToolbarButtonGroup[] {
    return this.ToolbarGroups;
  }

  /**
   * Handle toolbar button click
   */
  HandleButtonClick(button: ToolbarButton): void {
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
    this.ToolbarAction.emit({
      buttonId: button.id,
      editor: this.view
    });
  }

  /** @deprecated Use {@link HandleButtonClick}. */
  handleButtonClick(button: ToolbarButton): void {
    return this.HandleButtonClick(button);
  }

  /**
   * Resolves a composition token path to query metadata for the hover tooltip.
   * Uses Metadata.Provider.Queries to look up the referenced query.
   */
  private resolveCompositionToken(fullPath: string): CompositionTokenInfo | null {
    try {
      const allQueries = QueryEngine.Instance.Queries;
      const segments = fullPath.split('/').map(s => s.trim()).filter(s => s.length > 0);
      if (segments.length === 0) return null;

      const queryName = segments[segments.length - 1];
      const categorySegments = segments.slice(0, -1);

      // First try: exact match on Name + CategoryPath
      let query = allQueries.find(q => {
        if (q.Name !== queryName) return false;
        if (categorySegments.length === 0) return true;
        const expectedPath = categorySegments.join('/');
        return q.CategoryPath === expectedPath;
      });

      // Second try: match on Name alone (ignore category) if no exact match
      if (!query) {
        query = allQueries.find(q => q.Name === queryName);
      }

      if (!query) return null;

      return {
        Name: query.Name,
        Description: query.Description ?? undefined,
        Status: query.Status,
        Category: query.CategoryPath ? query.CategoryPath.replace(/\//g, ' / ') : undefined,
        HasParameters: query.QueryParameters.length > 0,
        Reusable: query.Reusable
      };
    } catch (e) {
      console.warn('[composition-token] Error resolving token:', e);
      return null;
    }
  }

  /**
   * Check if a group is the last one (for separator logic)
   */
  IsLastGroup(group: ToolbarButtonGroup): boolean {
    const groups = this.ToolbarGroups;
    return groups.indexOf(group) === groups.length - 1;
  }

  /** @deprecated Use {@link IsLastGroup}. */
  isLastGroup(group: ToolbarButtonGroup): boolean {
    return this.IsLastGroup(group);
  }

  ngOnInit(): void {
    this.view = new EditorView({
      root: this.Root,
      parent: this.editorContent.nativeElement, // Use ViewChild reference
      state: EditorState.create({ doc: this._value, extensions: this._getAllExtensions() }),
    });

    if (this.autoFocus) {
      this.view?.focus();
    }

    this.view?.contentDOM.addEventListener('focus', () => {
      this._onTouched();
      this.Focus.emit();
    });

    this.view?.contentDOM.addEventListener('blur', () => {
      this._onTouched();
      this.Blur.emit();
    });

    // Apply initial configuration values
    // These are already set via setters if the properties were bound before ngOnInit
    // But we need to ensure they're applied if set via direct property assignment
    this.SetEditable(!this._disabled && !this._readonly);
    this.SetReadonly(this._readonly);
    this.SetPlaceholder(this._placeholder);
    this.SetIndentWithTab(this._indentWithTab);
    this.SetIndentUnit(this._indentUnit);
    this.SetLineWrapping(this._lineWrapping);
    this.SetHighlightWhitespace(this._highlightWhitespace);
    this.SetLanguage(this._language);
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  writeValue(value: string): void {
    if (this.view) {
      this.SetValue(value);
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
  SetValue(value: string) {
    if (!this.view) return;
    
    // Prevent unnecessary updates
    const currentValue = this.view.state.doc.toString();
    if (currentValue === value) return;
    
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: value },
      annotations: [External.of(true)] // Mark as external change to prevent change event
    });
  }

  /** @deprecated Use {@link SetValue}. */
  setValue(value: string) {
    return this.SetValue(value);
  }

  private _dispatchEffects(effects: StateEffect<any> | readonly StateEffect<any>[]) {
    return this.view?.dispatch({ effects });
  }

  /** Sets the root extensions of the editor. */
  SetExtensions(value: Extension[]) {
    this._dispatchEffects(StateEffect.reconfigure.of(value));
  }

  /** @deprecated Use {@link SetExtensions}. */
  setExtensions(value: Extension[]) {
    return this.SetExtensions(value);
  }

  /** Sets editor's editable state. */
  SetEditable(value: boolean) {
    this._dispatchEffects(this._editableConf.reconfigure(EditorView.editable.of(value)));
  }

  /** @deprecated Use {@link SetEditable}. */
  setEditable(value: boolean) {
    return this.SetEditable(value);
  }

  /** Sets editor's readonly state. */
  SetReadonly(value: boolean) {
    this._dispatchEffects(this._readonlyConf.reconfigure(EditorState.readOnly.of(value)));
  }

  /** @deprecated Use {@link SetReadonly}. */
  setReadonly(value: boolean) {
    return this.SetReadonly(value);
  }

  /** Sets editor's placeholder. */
  SetPlaceholder(value: string) {
    this._dispatchEffects(this._placeholderConf.reconfigure(value ? placeholder(value) : []));
  }

  /** @deprecated Use {@link SetPlaceholder}. */
  setPlaceholder(value: string) {
    return this.SetPlaceholder(value);
  }

  /** Sets editor' indentWithTab. */
  SetIndentWithTab(value: boolean) {
    this._dispatchEffects(this._indentWithTabConf.reconfigure(value ? keymap.of([indentWithTab]) : []));
  }

  /** @deprecated Use {@link SetIndentWithTab}. */
  setIndentWithTab(value: boolean) {
    return this.SetIndentWithTab(value);
  }

  /** Sets editor's indentUnit. */
  SetIndentUnit(value: string) {
    this._dispatchEffects(this._indentUnitConf.reconfigure(value ? indentUnit.of(value) : []));
  }

  /** @deprecated Use {@link SetIndentUnit}. */
  setIndentUnit(value: string) {
    return this.SetIndentUnit(value);
  }

  /** Sets editor's lineWrapping. */
  SetLineWrapping(value: boolean) {
    this._dispatchEffects(this._lineWrappingConf.reconfigure(value ? EditorView.lineWrapping : []));
  }

  /** @deprecated Use {@link SetLineWrapping}. */
  setLineWrapping(value: boolean) {
    return this.SetLineWrapping(value);
  }

  /** Sets editor's highlightWhitespace. */
  SetHighlightWhitespace(value: boolean) {
    this._dispatchEffects(this._highlightWhitespaceConf.reconfigure(value ? highlightWhitespace() : []));
  }

  /** @deprecated Use {@link SetHighlightWhitespace}. */
  setHighlightWhitespace(value: boolean) {
    return this.SetHighlightWhitespace(value);
  }

  /** Sets editor's language dynamically. */
  SetLanguage(lang: string) {
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
    if (this.Languages.length === 0) {
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

  /** @deprecated Use {@link SetLanguage}. */
  setLanguage(lang: string) {
    return this.SetLanguage(lang);
  }

  /** Find the language's extension by its name. Case insensitive. */
  private _findLanguage(name: string) {
    const wanted = name.toLowerCase();
    for (const lang of this.Languages) {
      for (const alias of [lang.name, ...lang.alias]) {
        if (wanted === alias.toLowerCase()) {
          return lang;
        }
      }
    }

    // Fall back to the file extensions CodeMirror lists for each language. Several names in common
    // use are registered there rather than as an alias — 'jinja2', for instance, is one of Jinja's
    // extensions (["j2", "jinja", "jinja2"]) while its only matchable name is "Jinja", so asking for
    // the name everyone writes returned null and the editor silently lost syntax highlighting.
    //
    // Deliberately a FALLBACK and not part of the loop above: it runs only when nothing matched by
    // name or alias, so it can turn a miss into a hit but can never change a match that already
    // resolved. That matters because short extensions ('r', 'md', 'ts') would otherwise be able to
    // outrank another language's real name.
    for (const lang of this.Languages) {
      if (lang.extensions.some((ext) => wanted === ext.toLowerCase())) {
        return lang;
      }
    }

    console.error('Language not found:', name);
    console.info('Supported language names:', this.Languages.map((lang) => lang.name).join(', '));
    return null;
  }
}
