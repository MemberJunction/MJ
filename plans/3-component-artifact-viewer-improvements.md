# Plan 3: Component Artifact Viewer Plugin Improvements

## Overview

This document outlines UX improvements to the **Component Artifact Viewer Plugin** for displaying interactive component artifacts with better access to metadata (functional requirements, data requirements, technical design, full spec).

**Scope**: Single plugin component enhancement
**Estimated Effort**: 2-3 days
**Risk Level**: Low (isolated plugin, no data changes)
**Dependencies**: None (independent of other plans)

**Related Plans**:
- [Plan 1: Data Migration](./1-conversation-artifact-data-migration.md) - Independent
- [Plan 2: Component Studio](./2-component-studio-improvements.md) - Independent

---

## Component Location

**Path**: `/packages/Angular/Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.ts`

**Purpose**: Displays Component-type artifacts in:
- Conversation messages
- Collection artifact cards
- Standalone artifact viewer
- Any context where artifacts are displayed

**Plugin System**: Part of artifact viewer plugin architecture
- `BaseArtifactViewerPluginComponent` - Base class
- Registered via `@RegisterClass` decorator
- Automatically selected when artifact type = 'Component'

---

## Current State

### Existing Features
- **Preview/Source Toggle**: Button to switch between rendered component and code
- **React Component Rendering**: Uses `mj-react-component` to render interactive components
- **Code Editor**: Shows TypeScript code with syntax highlighting
- **Copy Code**: Clipboard copy for source code
- **Error Handling**: Displays component errors with technical details

### Current UI
```
┌─────────────────────────────────────────────────┐
│ [Interactive Component]  [Source/Preview] [Copy]│ ← Toolbar
├─────────────────────────────────────────────────┤
│                                                 │
│         COMPONENT PREVIEW                       │
│         (or code editor if Source mode)         │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Problems
1. ❌ **Missing metadata access**: No way to view `functionalRequirements`, `dataRequirements`, `technicalDesign`, full spec
2. ❌ **Limited context**: Users can't understand what the component does or how it works
3. ❌ **No architecture info**: Technical design and data requirements hidden

**ComponentSpec Fields Available**:
```typescript
interface ComponentSpec {
  name: string;
  description: string;
  type: string;
  code: string;
  functionalRequirements: string;      // ❌ Not shown
  dataRequirements?: ComponentDataRequirements; // ❌ Not shown
  technicalDesign: string;             // ❌ Not shown
  properties?: ComponentProperty[];
  events?: ComponentEvent[];
  exampleUsage: string;
  // ... more fields
}
```

---

## Design Goals

### Primary Use Case (80%)
Users just want to **see the component run** - no extra UI chrome

### Secondary Use Case (20%)
Power users, architects, developers want to **understand the component**:
- What it's supposed to do (functional requirements)
- How it works (technical design)
- What data it needs (data requirements)
- Full component specification (JSON)
- Source code (already exists)

### Design Principle
**Progressive Disclosure**: Hide complexity until needed, but make it **one click away**

---

## Proposed Solution: Gear Menu + Side Panel

### Interaction Pattern

**Default State**: Component renders full-screen with minimal toolbar
```
┌─────────────────────────────────────────────────┐
│ [Interactive Component]              [⚙️]       │ ← Minimal toolbar
├─────────────────────────────────────────────────┤
│                                                 │
│         COMPONENT RENDERS HERE                  │
│         (100% of available space)               │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Gear Click**: Dropdown menu appears
```
┌─────────────────────────────────────────────────┐
│ [Interactive Component]              [⚙️ ▼]     │
│                                         ┌───────┐│
│                                         │📋 Code││
│         COMPONENT                       │📐 Func││
│         RENDERS                         │🔧 Tech││
│         HERE                            │💾 Data││
│                                         │{ }Spec││
│                                         └───────┘│
└─────────────────────────────────────────────────┘
```

**Menu Item Click**: Side panel slides in (60/40 split)
```
┌───────────────────────┬─────────────────────────┐
│                       │ [×] Code                │
│                       ├─────────────────────────┤
│                       │ ```tsx                  │
│   COMPONENT           │ export const MyComp...  │
│   RENDERS             │ const [state, set...    │
│   (60% width)         │ return (                │
│                       │   <div>...</div>        │
│                       │ )                       │
│                       │ ```                     │
│                       │                         │
│                       │ [Copy Code]             │
└───────────────────────┴─────────────────────────┘
```

---

## Technical Implementation

### Updated Template

```html
<div class="component-artifact-viewer" [ngClass]="cssClass">
  <!-- Toolbar -->
  <div class="component-toolbar">
    <div class="toolbar-left">
      <div class="component-badge">
        <i class="fas fa-cube"></i> Interactive Component
      </div>
    </div>

    <div class="toolbar-right">
      <!-- Gear Menu Dropdown -->
      <div class="gear-menu" [class.open]="gearMenuOpen">
        <button class="btn-gear"
                (click)="toggleGearMenu()"
                [title]="'View component details'">
          <i class="fas fa-cog"></i>
        </button>

        @if (gearMenuOpen) {
          <div class="gear-dropdown" (clickOutside)="gearMenuOpen = false">
            <button class="gear-item" (click)="showPanel('code')">
              <i class="fas fa-code"></i>
              <span>View Code</span>
              <span class="shortcut">C</span>
            </button>

            <button class="gear-item" (click)="showPanel('functional')">
              <i class="fas fa-clipboard-list"></i>
              <span>Functional Requirements</span>
              <span class="shortcut">F</span>
            </button>

            <button class="gear-item" (click)="showPanel('technical')">
              <i class="fas fa-wrench"></i>
              <span>Technical Design</span>
              <span class="shortcut">T</span>
            </button>

            <button class="gear-item" (click)="showPanel('data')">
              <i class="fas fa-database"></i>
              <span>Data Requirements</span>
              <span class="shortcut">D</span>
            </button>

            <button class="gear-item" (click)="showPanel('spec')">
              <i class="fas fa-file-code"></i>
              <span>Full Spec (JSON)</span>
              <span class="shortcut">S</span>
            </button>
          </div>
        }
      </div>
    </div>
  </div>

  <!-- Content Area with Slide-Out Panel -->
  <div class="component-content-wrapper">
    <!-- Component Preview (dynamic width) -->
    <div class="component-preview-section"
         [style.width]="sidePanelOpen ? '60%' : '100%'"
         [style.transition]="'width 0.3s ease'">
      <div class="component-preview">
        @if (hasError) {
          <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Component Error</h3>
            <p>{{ errorMessage }}</p>
            @if (errorDetails) {
              <details>
                <summary>Technical Details</summary>
                <pre>{{ errorDetails }}</pre>
              </details>
            }
          </div>
        } @else {
          @if (component) {
            <mj-react-component
              #reactComponent
              [component]="component"
              (componentEvent)="onComponentEvent($event)"
              (stateChange)="onStateChange($event)"
              (openEntityRecord)="onOpenEntityRecord($event)">
            </mj-react-component>
          } @else {
            <div class="error-state">
              <i class="fas fa-exclamation-circle"></i>
              <h3>No Component Loaded</h3>
              <p>The component data is missing or invalid.</p>
            </div>
          }
        }
      </div>
    </div>

    <!-- Metadata Side Panel (slides in/out) -->
    <div class="metadata-panel"
         [class.open]="sidePanelOpen"
         [style.width]="sidePanelOpen ? '40%' : '0'"
         [style.transition]="'width 0.3s ease'">

      @if (sidePanelOpen) {
        <div class="panel-header">
          <h4>
            <i [class]="getPanelIcon(activePanelType)"></i>
            {{ getPanelTitle(activePanelType) }}
          </h4>
          <button class="btn-close" (click)="closePanel()" [title]="'Close panel (Esc)'">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="panel-content">
          @switch (activePanelType) {
            @case ('code') {
              <div class="code-panel">
                <mj-code-editor
                  [(ngModel)]="componentCode"
                  [language]="'typescript'"
                  [readonly]="true"
                  style="width: 100%; height: 100%;">
                </mj-code-editor>
                <div class="panel-actions">
                  <button kendoButton (click)="copyCode()">
                    <i class="fas fa-copy"></i> Copy Code
                  </button>
                </div>
              </div>
            }

            @case ('functional') {
              <div class="markdown-panel">
                <div class="markdown-content" [innerHTML]="functionalRequirementsHTML"></div>
              </div>
            }

            @case ('technical') {
              <div class="markdown-panel">
                <div class="markdown-content" [innerHTML]="technicalDesignHTML"></div>
              </div>
            }

            @case ('data') {
              <div class="data-requirements-panel">
                @if (dataRequirements) {
                  @if (dataRequirements.requiredEntities && dataRequirements.requiredEntities.length > 0) {
                    <div class="section">
                      <h5><i class="fas fa-table"></i> Required Entities</h5>
                      <ul class="entity-list">
                        @for (entity of dataRequirements.requiredEntities; track entity) {
                          <li>{{ entity }}</li>
                        }
                      </ul>
                    </div>
                  }

                  @if (dataRequirements.queries && dataRequirements.queries.length > 0) {
                    <div class="section">
                      <h5><i class="fas fa-search"></i> Queries</h5>
                      @for (query of dataRequirements.queries; track query.name) {
                        <div class="query-item">
                          <div class="query-header">
                            <strong>{{ query.name }}</strong>
                            @if (query.description) {
                              <span class="query-desc">{{ query.description }}</span>
                            }
                          </div>
                          <pre class="query-code">{{ query.definition }}</pre>
                        </div>
                      }
                    </div>
                  }

                  @if (dataRequirements.staticData && dataRequirements.staticData.length > 0) {
                    <div class="section">
                      <h5><i class="fas fa-file-alt"></i> Static Data</h5>
                      @for (data of dataRequirements.staticData; track data.name) {
                        <div class="static-data-item">
                          <strong>{{ data.name }}</strong>
                          @if (data.description) {
                            <p>{{ data.description }}</p>
                          }
                        </div>
                      }
                    </div>
                  }
                } @else {
                  <div class="empty-state">
                    <i class="fas fa-info-circle"></i>
                    <p>No data requirements specified</p>
                  </div>
                }
              </div>
            }

            @case ('spec') {
              <div class="spec-panel">
                <mj-code-editor
                  [(ngModel)]="fullSpecJSON"
                  [language]="'json'"
                  [readonly]="true"
                  style="width: 100%; height: calc(100% - 50px);">
                </mj-code-editor>
                <div class="panel-actions">
                  <button kendoButton (click)="copySpec()">
                    <i class="fas fa-copy"></i> Copy Spec
                  </button>
                </div>
              </div>
            }
          }
        </div>
      }
    </div>
  </div>
</div>
```

### TypeScript Implementation

```typescript
import { Component, ViewChild, AfterViewInit, HostListener } from '@angular/core';
import { DomSanitizer, SafeHtml, SecurityContext } from '@angular/platform-browser';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { MJReactComponent } from '@memberjunction/ng-react';
import { BuildComponentCompleteCode, ComponentSpec, ComponentDataRequirements } from '@memberjunction/interactive-component-types';
import { marked } from 'marked';

@Component({
  selector: 'mj-component-artifact-viewer',
  templateUrl: './component-artifact-viewer.component.html',
  styleUrls: ['./component-artifact-viewer.component.scss']
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'ComponentArtifactViewerPlugin')
export class ComponentArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements AfterViewInit {
  @ViewChild('reactComponent') reactComponent?: MJReactComponent;

  // Component data
  public component: ComponentSpec | null = null;
  public componentCode: string = "";
  public componentName: string = '';

  // Error state
  public hasError = false;
  public errorMessage = '';
  public errorDetails = '';

  // Gear menu state
  public gearMenuOpen = false;
  public sidePanelOpen = false;
  public activePanelType: 'code' | 'functional' | 'technical' | 'data' | 'spec' | null = null;

  // Processed metadata content
  public functionalRequirementsHTML: SafeHtml = '';
  public technicalDesignHTML: SafeHtml = '';
  public fullSpecJSON = '';
  public dataRequirements: ComponentDataRequirements | null = null;

  constructor(
    private adapter: AngularAdapterService,
    private sanitizer: DomSanitizer
  ) {
    super();
  }

  async ngOnInit(): Promise<void> {
    // Extract component spec
    if (this.artifactVersion.Content) {
      this.component = SafeJSONParse(this.artifactVersion.Content) as ComponentSpec;
    } else {
      throw new Error('Artifact content is empty');
    }

    // Extract component parts
    this.extractComponentParts();

    // Pre-process markdown content (async)
    await this.preprocessMetadata();

    // Initialize Angular adapter
    try {
      await this.adapter.initialize();
    } catch (error) {
      console.error('Failed to initialize Angular adapter:', error);
      this.hasError = true;
      this.errorMessage = 'Failed to initialize component runtime';
      this.errorDetails = error instanceof Error ? error.message : String(error);
    }
  }

  async ngAfterViewInit(): Promise<void> {
    // Component initialization happens automatically via mj-react-component
  }

  // Keyboard shortcuts
  @HostListener('document:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent) {
    // Only handle if not typing in an input
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'c':
        if (!this.sidePanelOpen || this.activePanelType !== 'code') {
          this.showPanel('code');
          event.preventDefault();
        }
        break;
      case 'f':
        if (!this.sidePanelOpen || this.activePanelType !== 'functional') {
          this.showPanel('functional');
          event.preventDefault();
        }
        break;
      case 't':
        if (!this.sidePanelOpen || this.activePanelType !== 'technical') {
          this.showPanel('technical');
          event.preventDefault();
        }
        break;
      case 'd':
        if (!this.sidePanelOpen || this.activePanelType !== 'data') {
          this.showPanel('data');
          event.preventDefault();
        }
        break;
      case 's':
        if (!this.sidePanelOpen || this.activePanelType !== 'spec') {
          this.showPanel('spec');
          event.preventDefault();
        }
        break;
      case 'escape':
        if (this.sidePanelOpen) {
          this.closePanel();
          event.preventDefault();
        } else if (this.gearMenuOpen) {
          this.gearMenuOpen = false;
          event.preventDefault();
        }
        break;
      case 'g':
        this.toggleGearMenu();
        event.preventDefault();
        break;
    }
  }

  private extractComponentParts(): void {
    if (this.component?.name) {
      this.componentName = this.component.name;
    }
    if (this.component?.code) {
      this.componentCode = BuildComponentCompleteCode(this.component);
    }
  }

  private async preprocessMetadata(): Promise<void> {
    // Process functional requirements markdown
    if (this.component?.functionalRequirements) {
      const functionalHTML = await marked.parse(this.component.functionalRequirements);
      this.functionalRequirementsHTML = this.sanitizer.sanitize(SecurityContext.HTML, functionalHTML) || '';
    }

    // Process technical design markdown
    if (this.component?.technicalDesign) {
      const technicalHTML = await marked.parse(this.component.technicalDesign);
      this.technicalDesignHTML = this.sanitizer.sanitize(SecurityContext.HTML, technicalHTML) || '';
    }

    // Prepare full spec JSON
    this.fullSpecJSON = JSON.stringify(this.component, null, 2);

    // Store data requirements
    this.dataRequirements = this.component?.dataRequirements || null;
  }

  // Gear menu actions
  toggleGearMenu() {
    this.gearMenuOpen = !this.gearMenuOpen;
  }

  showPanel(type: 'code' | 'functional' | 'technical' | 'data' | 'spec') {
    this.activePanelType = type;
    this.sidePanelOpen = true;
    this.gearMenuOpen = false; // Close dropdown after selection
  }

  closePanel() {
    this.sidePanelOpen = false;
    this.activePanelType = null;
  }

  getPanelIcon(type: string | null): string {
    switch (type) {
      case 'code': return 'fas fa-code';
      case 'functional': return 'fas fa-clipboard-list';
      case 'technical': return 'fas fa-wrench';
      case 'data': return 'fas fa-database';
      case 'spec': return 'fas fa-file-code';
      default: return 'fas fa-info-circle';
    }
  }

  getPanelTitle(type: string | null): string {
    switch (type) {
      case 'code': return 'Component Code';
      case 'functional': return 'Functional Requirements';
      case 'technical': return 'Technical Design';
      case 'data': return 'Data Requirements';
      case 'spec': return 'Full Component Specification';
      default: return 'Details';
    }
  }

  // Copy actions
  async copyCode() {
    try {
      await navigator.clipboard.writeText(this.componentCode);
      // TODO: Show toast notification
      console.log('✅ Code copied to clipboard');
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }

  async copySpec() {
    try {
      await navigator.clipboard.writeText(this.fullSpecJSON);
      // TODO: Show toast notification
      console.log('✅ Spec copied to clipboard');
    } catch (err) {
      console.error('Failed to copy spec:', err);
    }
  }

  // Component plugin overrides
  public override get isShowingElevatedDisplay(): boolean {
    return true;
  }

  public override get parentShouldShowRawContent(): boolean {
    return true;
  }

  // Component event handlers
  onComponentEvent(event: any): void {
    if (event.type === 'error') {
      this.hasError = true;
      this.errorMessage = event.payload?.error || 'An unknown error occurred';
      this.errorDetails = event.payload?.errorInfo || event.payload?.stackTrace || '';
      console.error('Component error:', event.payload);
    } else {
      console.log('Component event:', event.type, event.payload);
    }
  }

  onStateChange(event: any): void {
    console.log('Component state change:', event);
  }

  onOpenEntityRecord(event: { entityName: string; key: any }): void {
    console.log('Open entity record requested:', event);
    // Handled by parent component
  }
}
```

### Styling (SCSS)

```scss
.component-artifact-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
}

// Toolbar
.component-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  flex-shrink: 0;
}

.component-badge {
  padding: 6px 12px;
  background: #28a745;
  color: white;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;

  i {
    font-size: 12px;
  }
}

// Gear menu
.gear-menu {
  position: relative;
}

.btn-gear {
  padding: 6px 10px;
  background: white;
  border: 1px solid #ced4da;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #e9ecef;
    border-color: #adb5bd;
  }

  i {
    font-size: 14px;
    color: #495057;
  }
}

.gear-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 280px;
  padding: 4px 0;
}

.gear-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
  color: #212529;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f8f9fa;
  }

  i {
    width: 20px;
    text-align: center;
    color: #6c757d;
    font-size: 14px;
  }

  span:first-of-type {
    flex: 1;
  }

  .shortcut {
    font-size: 11px;
    color: #6c757d;
    background: #e9ecef;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: monospace;
  }
}

// Content wrapper
.component-content-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.component-preview-section {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: white;
}

.component-preview {
  flex: 1;
  overflow: auto;
  padding: 20px;
}

// Metadata panel
.metadata-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 2px solid #dee2e6;
  background: #f8f9fa;

  &.open {
    // Visible
  }

  &:not(.open) {
    opacity: 0;
    pointer-events: none;
  }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #dee2e6;
  flex-shrink: 0;

  h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #212529;
    display: flex;
    align-items: center;
    gap: 8px;

    i {
      color: #6c757d;
    }
  }

  .btn-close {
    padding: 4px 8px;
    background: none;
    border: none;
    cursor: pointer;
    color: #6c757d;
    transition: color 0.2s;

    &:hover {
      color: #212529;
    }

    i {
      font-size: 14px;
    }
  }
}

.panel-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.panel-actions {
  padding: 12px;
  background: white;
  border-top: 1px solid #dee2e6;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

// Markdown panels
.markdown-panel {
  .markdown-content {
    background: white;
    padding: 20px;
    border-radius: 6px;
    line-height: 1.6;

    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 12px;
      color: #212529;

      &:first-child {
        margin-top: 0;
      }
    }

    p {
      margin-bottom: 12px;
    }

    ul, ol {
      margin-bottom: 12px;
      padding-left: 24px;
    }

    code {
      background: #f1f3f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 13px;
    }

    pre {
      background: #f1f3f5;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin-bottom: 12px;

      code {
        background: none;
        padding: 0;
      }
    }
  }
}

// Data requirements panel
.data-requirements-panel {
  background: white;
  padding: 20px;
  border-radius: 6px;

  .section {
    margin-bottom: 24px;

    &:last-child {
      margin-bottom: 0;
    }

    h5 {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 600;
      color: #212529;
      display: flex;
      align-items: center;
      gap: 8px;

      i {
        color: #6c757d;
      }
    }
  }

  .entity-list {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
      padding: 8px 12px;
      background: #f8f9fa;
      border-left: 3px solid #0d6efd;
      margin-bottom: 6px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
    }
  }

  .query-item {
    margin-bottom: 16px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;

    &:last-child {
      margin-bottom: 0;
    }

    .query-header {
      margin-bottom: 8px;

      strong {
        display: block;
        font-size: 14px;
        color: #212529;
        margin-bottom: 4px;
      }

      .query-desc {
        font-size: 13px;
        color: #6c757d;
      }
    }

    .query-code {
      background: #212529;
      color: #f8f9fa;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: monospace;
      font-size: 12px;
      margin: 0;
    }
  }

  .static-data-item {
    margin-bottom: 12px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;

    strong {
      display: block;
      font-size: 14px;
      color: #212529;
      margin-bottom: 4px;
    }

    p {
      margin: 0;
      font-size: 13px;
      color: #6c757d;
    }
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #6c757d;

    i {
      font-size: 32px;
      margin-bottom: 12px;
      display: block;
    }
  }
}

// Error state
.error-state {
  padding: 40px 20px;
  text-align: center;
  color: #dc3545;

  i {
    font-size: 48px;
    margin-bottom: 16px;
  }

  h3 {
    margin: 0 0 12px;
    font-size: 20px;
    font-weight: 600;
  }

  p {
    margin: 0 0 12px;
    color: #6c757d;
  }

  details {
    margin-top: 16px;
    text-align: left;
    background: #f8f9fa;
    padding: 12px;
    border-radius: 4px;

    summary {
      cursor: pointer;
      font-weight: 600;
      color: #495057;
    }

    pre {
      margin-top: 8px;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-size: 12px;
      color: #212529;
    }
  }
}

// Responsive: On mobile, use bottom sheet instead of side panel
@media (max-width: 768px) {
  .component-content-wrapper {
    flex-direction: column;
  }

  .component-preview-section {
    width: 100% !important;
    height: 50%;
  }

  .metadata-panel {
    width: 100% !important;
    height: 50%;
    border-left: none;
    border-top: 2px solid #dee2e6;

    &:not(.open) {
      height: 0;
    }
  }
}
```

---

## Implementation Plan

### Phase 1: UI Structure (1 day)
- [ ] Add gear menu button to toolbar
- [ ] Create dropdown menu with all options
- [ ] Add slide-out panel structure
- [ ] Wire up open/close logic
- [ ] Add panel header with close button

### Phase 2: Metadata Processing (0.5 days)
- [ ] Pre-process markdown (functional, technical)
- [ ] Sanitize HTML output
- [ ] Format data requirements display
- [ ] Generate full spec JSON
- [ ] Handle missing metadata gracefully

### Phase 3: Panel Content (1 day)
- [ ] Code panel (reuse existing editor)
- [ ] Functional requirements (markdown render)
- [ ] Technical design (markdown render)
- [ ] Data requirements (structured display)
- [ ] Full spec (JSON editor)

### Phase 4: Polish & Interactions (0.5 days)
- [ ] Keyboard shortcuts (C, F, T, D, S, Esc, G)
- [ ] Copy buttons with clipboard API
- [ ] Smooth animations (panel slide)
- [ ] Click outside to close dropdown
- [ ] Responsive mobile layout

### Testing (0.5 days)
- [ ] Test all metadata panels
- [ ] Test keyboard shortcuts
- [ ] Test on mobile/tablet
- [ ] Test with missing metadata
- [ ] Test copy functionality

**Total: 2-3 days**

---

## Testing Checklist

- [ ] Gear menu opens/closes
- [ ] Each menu item opens correct panel
- [ ] Panel slides smoothly
- [ ] Component resizes to 60% width
- [ ] Close button works
- [ ] Esc key closes panel
- [ ] Keyboard shortcuts work (C, F, T, D, S, G)
- [ ] Markdown renders correctly
- [ ] Data requirements display properly
- [ ] Code editor shows TypeScript
- [ ] JSON editor shows full spec
- [ ] Copy buttons work
- [ ] Click outside closes dropdown
- [ ] Mobile uses bottom sheet layout
- [ ] No errors with missing metadata

---

## Files to Modify

| File | Changes |
|------|---------|
| `component-artifact-viewer.component.ts` | Add gear menu logic, panel state, metadata processing |
| **NEW**: `component-artifact-viewer.component.html` | Extract template from inline to separate file |
| **NEW**: `component-artifact-viewer.component.scss` | Extract styles from inline to separate file |

**Note**: Currently this component uses inline template/styles. We'll need to extract them to separate files for maintainability.

---

## Success Criteria

- ✅ Users can view component with no UI overhead (default state)
- ✅ One-click access to all component metadata
- ✅ Functional requirements rendered as formatted markdown
- ✅ Technical design rendered as formatted markdown
- ✅ Data requirements displayed in structured format
- ✅ Full spec viewable as formatted JSON
- ✅ Code viewable with syntax highlighting (already works)
- ✅ Copy buttons work for code and spec
- ✅ Keyboard shortcuts work for power users
- ✅ Responsive on mobile (bottom sheet)
- ✅ No regressions in component rendering

---

## Alternative Considered: Bottom Sheet

**Pros**:
- Component stays full-width
- More mobile-friendly
- Can be draggable

**Cons**:
- Covers part of component
- Less space for metadata (height-constrained)
- Can't see component + metadata simultaneously

**Decision**: Use **side panel** for desktop, **bottom sheet** for mobile (responsive)

---

**Document Version**: 1.0
**Last Updated**: 2025-01-21
**Implementation Status**: ⏳ Pending Review
