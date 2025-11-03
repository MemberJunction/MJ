# Interactive Forms and Dashboards - Complete Implementation Plan

**Date:** 2025-11-03
**Branch:** `claude/form-design-011CUkyixvnUcdT9oHLPP7WR`
**Status:** IMPLEMENTATION IN PROGRESS

---

## Executive Summary

This document provides a complete implementation plan for extending MemberJunction's forms and dashboards with **Interactive Components** as a third implementation type. This enables AI agents to generate custom forms and dashboards via conversation, stored as metadata-driven ComponentSpec JSON.

**Key Architecture Decision:** Store ComponentSpec JSON directly in tables (not Component table references) to support local, embedded, and registry-based components.

---

## Table of Contents

1. [Database Schema](#database-schema)
2. [Architecture Overview](#architecture-overview)
3. [Resolution Logic](#resolution-logic)
4. [Angular Components](#angular-components)
5. [Services](#services)
6. [Integration Points](#integration-points)
7. [Migration Script](#migration-script)
8. [Implementation Checklist](#implementation-checklist)
9. [Testing Plan](#testing-plan)
10. [AI Agent Integration](#ai-agent-integration)

---

## Database Schema

### New Table: `__mj.EntityForm`

**Purpose:** Registers Interactive Component forms for entities with priority-based resolution

```sql
CREATE TABLE [__mj].[EntityForm] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [EntityID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [ComponentSpec] NVARCHAR(MAX) NOT NULL,
    [Priority] INT NOT NULL DEFAULT 0,
    [Scope] NVARCHAR(20) NOT NULL DEFAULT 'Global',
    [RoleID] UNIQUEIDENTIFIER NULL,
    [UserID] UNIQUEIDENTIFIER NULL,
    [IsDefault] BIT NOT NULL DEFAULT 0,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [PK_EntityForm] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_EntityForm_Entity] FOREIGN KEY ([EntityID])
        REFERENCES [__mj].[Entity]([ID]),
    CONSTRAINT [FK_EntityForm_Role] FOREIGN KEY ([RoleID])
        REFERENCES [__mj].[Role]([ID]),
    CONSTRAINT [FK_EntityForm_User] FOREIGN KEY ([UserID])
        REFERENCES [__mj].[User]([ID]),
    CONSTRAINT [CK_EntityForm_Scope] CHECK ([Scope] IN ('Global', 'Role', 'User')),
    CONSTRAINT [CK_EntityForm_Status] CHECK ([Status] IN ('Active', 'Inactive', 'Deprecated')),
    CONSTRAINT [CK_EntityForm_ScopeValidation] CHECK (
        ([Scope] = 'Global' AND [RoleID] IS NULL AND [UserID] IS NULL) OR
        ([Scope] = 'Role' AND [RoleID] IS NOT NULL AND [UserID] IS NULL) OR
        ([Scope] = 'User' AND [UserID] IS NOT NULL)
    )
);

-- Indexes for performance
CREATE NONCLUSTERED INDEX [IX_EntityForm_EntityID] ON [__mj].[EntityForm]([EntityID]);
CREATE NONCLUSTERED INDEX [IX_EntityForm_Scope_Priority] ON [__mj].[EntityForm]([EntityID], [Scope], [Priority] DESC);
CREATE NONCLUSTERED INDEX [IX_EntityForm_RoleID] ON [__mj].[EntityForm]([RoleID]) WHERE [RoleID] IS NOT NULL;
CREATE NONCLUSTERED INDEX [IX_EntityForm_UserID] ON [__mj].[EntityForm]([UserID]) WHERE [UserID] IS NOT NULL;
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| ID | UNIQUEIDENTIFIER | Primary key |
| EntityID | UNIQUEIDENTIFIER | FK to Entity - which entity this form is for |
| Name | NVARCHAR(100) | Display name (e.g., "Enhanced Customer Form") |
| Description | NVARCHAR(MAX) | Optional description of form features |
| **ComponentSpec** | NVARCHAR(MAX) | JSON string containing ComponentSpec (can reference local, embedded, or registry components) |
| Priority | INT | Higher = preferred when multiple forms match (default: 0) |
| Scope | NVARCHAR(20) | 'Global', 'Role', or 'User' |
| RoleID | UNIQUEIDENTIFIER | FK to Role (required if Scope='Role') |
| UserID | UNIQUEIDENTIFIER | FK to User (required if Scope='User') |
| IsDefault | BIT | Is this the default form for this scope? |
| Status | NVARCHAR(20) | 'Active', 'Inactive', 'Deprecated' |

### Extend Existing Table: `__mj.Dashboard`

**Purpose:** Add support for Interactive Component dashboards

```sql
-- Add ComponentSpec column
ALTER TABLE [__mj].[Dashboard]
ADD [ComponentSpec] NVARCHAR(MAX) NULL;

-- Add check constraint for Type field (if not already exists)
ALTER TABLE [__mj].[Dashboard]
ADD CONSTRAINT [CK_Dashboard_Type] CHECK ([Type] IN ('Config', 'Code', 'Dynamic Code', 'Interactive'));

-- Add validation: ComponentSpec required if Type='Interactive'
ALTER TABLE [__mj].[Dashboard]
ADD CONSTRAINT [CK_Dashboard_ComponentSpec] CHECK (
    ([Type] = 'Interactive' AND [ComponentSpec] IS NOT NULL) OR
    ([Type] != 'Interactive')
);

-- Index for performance
CREATE NONCLUSTERED INDEX [IX_Dashboard_Type] ON [__mj].[Dashboard]([Type]);
```

**New Dashboard Field:**

| Field | Type | Description |
|-------|------|-------------|
| **ComponentSpec** | NVARCHAR(MAX) | JSON string containing ComponentSpec (required when Type='Interactive') |

### ComponentSpec JSON Format

Both EntityForm and Dashboard store ComponentSpec as JSON:

```json
{
  "name": "EnhancedCustomerForm",
  "location": "embedded",
  "type": "form",
  "code": "function EnhancedCustomerForm({ record, metadata, editMode, mjGlobal, emit }) { ... }",
  "properties": [
    { "name": "record", "type": "object", "required": true },
    { "name": "metadata", "type": "object", "required": true }
  ],
  "events": [
    { "name": "save", "parameters": ["data: object"] },
    { "name": "cancel", "parameters": [] }
  ],
  "libraries": [
    { "name": "react", "version": "^18.0.0" }
  ]
}
```

Or reference a registry component:

```json
{
  "name": "CustomerForm",
  "location": "registry",
  "registry": "MemberJunction Registry",
  "namespace": "forms/customers",
  "version": "1.0.0",
  "type": "form"
}
```

---

## Architecture Overview

### Three Implementation Types

**Forms:**
1. **Generated** (Type 1) - CodeGen auto-generated forms
2. **Code** (Type 2) - Custom Angular components via @RegisterClass
3. **Interactive** (Type 3) - Interactive Components from EntityForm table *(new)*

**Dashboards:**
1. **Config** (Type 1) - JSON-based grid layout
2. **Code** (Type 2) - Custom Angular components via @RegisterClass
3. **Interactive** (Type 3) - Interactive Components from Dashboard.ComponentSpec *(new)*

### Resolution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     User Opens Entity/Dashboard              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              FormResolver / DashboardResolver                │
│                                                               │
│  1. Check for Interactive Components (EntityForm/Dashboard)  │
│     - User-specific (Scope='User', UserID=current)           │
│     - Role-specific (Scope='Role', RoleID IN user roles)     │
│     - Global (Scope='Global')                                │
│     → Use highest priority match                             │
│                                                               │
│  2. Check for Code-based (@RegisterClass)                    │
│     → Use if priority > 1 (custom, not generated)            │
│                                                               │
│  3. Fallback to Generated/Config                             │
│     → Use default implementation                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Component Creation                          │
│                                                               │
│  Interactive: InteractiveFormComponent wrapper               │
│               → MJReactComponent → React rendering           │
│                                                               │
│  Code: Direct Angular component instantiation                │
│                                                               │
│  Generated/Config: Standard form/dashboard component         │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow for Interactive Components

```
Angular Component (Form/Dashboard)
    ↓ passes props
MJReactComponent (wrapper)
    ↓ loads ComponentSpec from JSON
ComponentManager.loadComponent(spec)
    ↓ compile if needed
ComponentCompiler (Babel)
    ↓ cache in registry
ComponentRegistry
    ↓ create React root
React Component Rendering
    ↓ receives MJ utilities
Runtime Environment (mjGlobal, emit, etc.)
    ↓ emits events back
Angular Component (handles events)
```

---

## Resolution Logic

### FormResolverService

```typescript
@Injectable({ providedIn: 'root' })
export class FormResolverService {

  async resolveFormComponent(
    entityName: string,
    currentUser: UserInfo
  ): Promise<FormResolutionResult> {

    // Step 1: Check for Interactive Component forms
    const entity = Metadata.Provider.Entities.find(e => e.Name === entityName);
    if (!entity) {
      throw new Error(`Entity not found: ${entityName}`);
    }

    const rv = new RunView();
    const result = await rv.RunView<EntityFormEntity>({
      EntityName: 'Entity Forms',
      ExtraFilter: `
        EntityID='${entity.ID}'
        AND Status='Active'
        AND (
          (Scope='User' AND UserID='${currentUser.ID}')
          OR (Scope='Role' AND RoleID IN (
            SELECT RoleID FROM [__mj].[UserRole] WHERE UserID='${currentUser.ID}'
          ))
          OR (Scope='Global')
        )
      `,
      OrderBy: `
        CASE
          WHEN Scope='User' THEN 1
          WHEN Scope='Role' THEN 2
          ELSE 3
        END,
        Priority DESC
      `,
      ResultType: 'entity_object'
    }, currentUser);

    if (result.Success && result.Results && result.Results.length > 0) {
      const topForm = result.Results[0];
      const spec = JSON.parse(topForm.ComponentSpec);

      return {
        type: 'Interactive',
        componentSpec: spec,
        source: `EntityForm: ${topForm.Name}`
      };
    }

    // Step 2: Check for Code-based custom forms
    const codeReg = MJGlobal.Instance.ClassFactory.GetRegistration(
      BaseFormComponent,
      entityName
    );

    if (codeReg && codeReg.Priority > 1) {
      return {
        type: 'Code',
        componentClass: codeReg.SubClass,
        source: `@RegisterClass: ${codeReg.SubClass.name}`
      };
    }

    // Step 3: Fallback to generated form
    if (codeReg) {
      return {
        type: 'Generated',
        componentClass: codeReg.SubClass,
        source: 'Generated form'
      };
    }

    throw new Error(`No form found for entity: ${entityName}`);
  }
}
```

### DashboardResolverService

```typescript
@Injectable({ providedIn: 'root' })
export class DashboardResolverService {

  async resolveDashboardComponent(
    dashboard: DashboardEntity,
    currentUser: UserInfo
  ): Promise<DashboardResolutionResult> {

    // Step 1: Check if Type='Interactive'
    if (dashboard.Type === 'Interactive') {
      if (!dashboard.ComponentSpec) {
        throw new Error('Dashboard Type is Interactive but ComponentSpec is null');
      }

      const spec = JSON.parse(dashboard.ComponentSpec);

      return {
        type: 'Interactive',
        componentSpec: spec,
        source: `Dashboard: ${dashboard.Name}`
      };
    }

    // Step 2: Check if Type='Code'
    if (dashboard.Type === 'Code') {
      if (!dashboard.DriverClass) {
        throw new Error('Dashboard Type is Code but DriverClass is null');
      }

      const classInfo = MJGlobal.Instance.ClassFactory.GetRegistration(
        BaseDashboard,
        dashboard.DriverClass
      );

      return {
        type: 'Code',
        componentClass: classInfo.SubClass,
        source: `@RegisterClass: ${dashboard.DriverClass}`
      };
    }

    // Step 3: Fallback to Config-based
    return {
      type: 'Config',
      componentClass: SingleDashboardComponent,
      source: 'Config-based dashboard'
    };
  }
}
```

---

## Angular Components

### InteractiveFormComponent

**Location:** `packages/Angular/Explorer/base-forms/src/lib/interactive-form.component.ts`

```typescript
import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { BaseFormComponent } from './base-form-component';
import { BaseEntity } from '@memberjunction/core';
import { ComponentSpec } from '@memberjunction/interactive-components';

/**
 * Wrapper component that renders Interactive Component forms
 * Extends BaseFormComponent to maintain compatibility with form system
 */
@Component({
  selector: 'mj-interactive-form',
  template: `
    <div class="interactive-form-container">
      <mj-react-component
        *ngIf="componentSpec"
        [componentSpec]="componentSpec"
        [data]="formData"
        (eventEmitted)="onFormEvent($event)"
        (loadComplete)="onLoadComplete()"
        (error)="onError($event)">
      </mj-react-component>

      <div *ngIf="loading" class="loading-overlay">
        <span class="k-icon k-i-loading"></span>
        Loading form...
      </div>
    </div>
  `,
  styles: [`
    .interactive-form-container {
      position: relative;
      width: 100%;
      height: 100%;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.8);
      z-index: 1000;
    }

    .loading-overlay .k-icon {
      font-size: 32px;
      margin-right: 10px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `]
})
export class InteractiveFormComponent extends BaseFormComponent implements OnInit, OnDestroy {
  @Input() componentSpec!: ComponentSpec;
  @Input() override record!: BaseEntity;

  public loading: boolean = true;
  private originalRecordData: any = null;

  ngOnInit(): void {
    // Store original record data for dirty tracking
    this.originalRecordData = { ...this.record.GetAll() };
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  /**
   * Prepare data to pass to React component
   */
  public get formData(): any {
    return {
      record: this.record.GetAll(),  // Plain object with all field values
      metadata: this.getEntityMetadata(),
      editMode: this.EditMode,
      currentUser: this.currentUser,
      recordDirty: this.isRecordDirty()
    };
  }

  /**
   * Get entity metadata for the form
   */
  private getEntityMetadata(): any {
    const entity = this.record.GetEntityObject();
    return {
      entityName: entity.EntityInfo.Name,
      fields: entity.EntityInfo.Fields.map(f => ({
        name: f.Name,
        displayName: f.DisplayName,
        type: f.Type,
        required: f.AllowsNull === false,
        description: f.Description
      }))
    };
  }

  /**
   * Check if record has been modified
   */
  private isRecordDirty(): boolean {
    if (!this.originalRecordData) return false;

    const currentData = this.record.GetAll();
    return Object.keys(currentData).some(
      key => currentData[key] !== this.originalRecordData[key]
    );
  }

  /**
   * Handle events from React component
   */
  public onFormEvent(event: any): void {
    switch (event.name) {
      case 'save':
        this.handleSave(event.data);
        break;

      case 'cancel':
        this.handleCancel();
        break;

      case 'fieldChanged':
        this.handleFieldChange(event.data.fieldName, event.data.value);
        break;

      case 'delete':
        this.handleDelete();
        break;

      default:
        console.log('Unhandled form event:', event);
    }
  }

  /**
   * Handle save request from React component
   */
  private async handleSave(data: any): Promise<void> {
    try {
      // Update record from form data
      Object.keys(data).forEach(key => {
        if (this.record.hasOwnProperty(key)) {
          this.record.Set(key, data[key]);
        }
      });

      // Call base form save logic
      const saved = await this.InternalSaveRecord();

      if (saved) {
        // Update original data after successful save
        this.originalRecordData = { ...this.record.GetAll() };

        // Emit saved event
        this.recordSaved.emit(this.record);
      }
    } catch (error) {
      console.error('Error saving interactive form:', error);
      this.onError(error);
    }
  }

  /**
   * Handle cancel request from React component
   */
  private handleCancel(): void {
    // Revert record to original data
    if (this.originalRecordData) {
      Object.keys(this.originalRecordData).forEach(key => {
        this.record.Set(key, this.originalRecordData[key]);
      });
    }

    this.recordCancelled.emit();
  }

  /**
   * Handle field change from React component
   */
  private handleFieldChange(fieldName: string, value: any): void {
    if (this.record.hasOwnProperty(fieldName)) {
      this.record.Set(fieldName, value);
      this.recordChanged.emit(this.record);
    }
  }

  /**
   * Handle delete request from React component
   */
  private async handleDelete(): Promise<void> {
    // Confirm with user
    if (!confirm(`Are you sure you want to delete this ${this.record.GetEntityObject().EntityInfo.Name}?`)) {
      return;
    }

    try {
      const deleted = await this.record.Delete();
      if (deleted) {
        this.recordDeleted.emit(this.record);
      }
    } catch (error) {
      console.error('Error deleting record:', error);
      this.onError(error);
    }
  }

  /**
   * Handle component load complete
   */
  public onLoadComplete(): void {
    this.loading = false;
  }

  /**
   * Handle errors from React component
   */
  public onError(error: any): void {
    this.loading = false;
    console.error('Interactive form error:', error);
    // Could show error notification here
  }
}
```

### InteractiveDashboardComponent

**Location:** `packages/Angular/Explorer/dashboards/src/generic/interactive-dashboard.component.ts`

```typescript
import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { BaseDashboard } from './base-dashboard';
import { DashboardConfig } from '../models/dashboard-config';
import { ComponentSpec } from '@memberjunction/interactive-components';

/**
 * Wrapper component that renders Interactive Component dashboards
 * Extends BaseDashboard to maintain compatibility with dashboard system
 */
@Component({
  selector: 'mj-interactive-dashboard',
  template: `
    <div class="interactive-dashboard-container">
      <mj-react-component
        *ngIf="componentSpec"
        [componentSpec]="componentSpec"
        [data]="dashboardData"
        (eventEmitted)="onDashboardEvent($event)"
        (loadComplete)="onLoadComplete()"
        (error)="onError($event)">
      </mj-react-component>

      <div *ngIf="loading" class="loading-overlay">
        <span class="k-icon k-i-loading"></span>
        Loading dashboard...
      </div>
    </div>
  `,
  styles: [`
    .interactive-dashboard-container {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: auto;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.8);
      z-index: 1000;
    }

    .loading-overlay .k-icon {
      font-size: 32px;
      margin-right: 10px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `]
})
export class InteractiveDashboardComponent extends BaseDashboard implements OnInit, OnDestroy {
  @Input() componentSpec!: ComponentSpec;
  @Input() override Config!: DashboardConfig;

  public loading: boolean = true;

  ngOnInit(): void {
    // Dashboard initialization handled by React component
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  /**
   * Prepare data to pass to React component
   */
  public get dashboardData(): any {
    return {
      config: this.Config?.dashboard?.GetAll(),
      userState: this.Config?.userState,
      currentUser: this.currentUser,
      scope: this.Config?.dashboard?.Scope,
      applicationId: this.Config?.dashboard?.ApplicationID
    };
  }

  /**
   * Initialize dashboard (required by BaseDashboard)
   */
  public initDashboard(): void {
    // React component handles its own initialization
    // This is called by TabbedDashboardComponent lifecycle
  }

  /**
   * Load dashboard data (required by BaseDashboard)
   */
  public loadData(): void {
    // React component handles its own data loading
    // This is called when dashboard is refreshed
  }

  /**
   * Handle visibility changes (called by TabbedDashboardComponent)
   */
  public override SetVisible(visible: boolean): void {
    super.SetVisible(visible);

    if (visible) {
      // Dashboard became visible - could trigger data refresh in React component
      this.onDashboardEvent({ name: 'visibility', data: { visible: true } });
    }
  }

  /**
   * Handle events from React component
   */
  public onDashboardEvent(event: any): void {
    switch (event.name) {
      case 'userStateChanged':
        this.UserStateChanged.emit(event.data);
        break;

      case 'openRecord':
        this.OpenEntityRecord.emit({
          EntityName: event.data.entityName,
          RecordPKey: event.data.recordId
        });
        break;

      case 'error':
        this.Error.emit(new Error(event.data.message));
        break;

      case 'interaction':
        this.Interaction.emit(event.data);
        break;

      case 'refresh':
        // Dashboard requested data refresh
        this.loadData();
        break;

      default:
        console.log('Unhandled dashboard event:', event);
    }
  }

  /**
   * Handle component load complete
   */
  public onLoadComplete(): void {
    this.loading = false;
    this.LoadingComplete.emit();
  }

  /**
   * Handle errors from React component
   */
  public onError(error: any): void {
    this.loading = false;
    this.Error.emit(error);
  }

  /**
   * Refresh dashboard (called externally)
   */
  public override Refresh(): void {
    // Trigger refresh in React component via event
    this.onDashboardEvent({ name: 'refresh', data: {} });
  }
}
```

---

## Services

### Supporting Types

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/models/form-resolution-result.ts`

```typescript
import { ComponentSpec } from '@memberjunction/interactive-components';

export type FormResolutionType = 'Interactive' | 'Code' | 'Generated';

export interface FormResolutionResult {
  type: FormResolutionType;
  componentSpec?: ComponentSpec;
  componentClass?: any;
  source: string;
}
```

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/models/dashboard-resolution-result.ts`

```typescript
import { ComponentSpec } from '@memberjunction/interactive-components';

export type DashboardResolutionType = 'Interactive' | 'Code' | 'Config';

export interface DashboardResolutionResult {
  type: DashboardResolutionType;
  componentSpec?: ComponentSpec;
  componentClass?: any;
  source: string;
}
```

### FormResolverService (Full Implementation)

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/services/form-resolver.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { EntityFormEntity } from '@memberjunction/core-entities';
import { FormResolutionResult } from '../models/form-resolution-result';

@Injectable({ providedIn: 'root' })
export class FormResolverService {

  constructor() {}

  /**
   * Resolves which form component to use for an entity
   * Priority: User-specific > Role-specific > Global > Code-based > Generated
   */
  public async resolveFormComponent(
    entityName: string,
    currentUser: UserInfo
  ): Promise<FormResolutionResult> {

    try {
      // Step 1: Find entity
      const entity = Metadata.Provider.Entities.find(e => e.Name === entityName);
      if (!entity) {
        throw new Error(`Entity not found: ${entityName}`);
      }

      // Step 2: Check for Interactive Component forms
      const interactiveForm = await this.findInteractiveForm(entity.ID, currentUser);
      if (interactiveForm) {
        return interactiveForm;
      }

      // Step 3: Check for Code-based custom forms
      const codeForm = this.findCodeBasedForm(entityName);
      if (codeForm) {
        return codeForm;
      }

      // Step 4: Fallback to generated form
      return this.findGeneratedForm(entityName);

    } catch (error) {
      console.error('Error resolving form component:', error);
      throw error;
    }
  }

  /**
   * Find Interactive Component form from EntityForm table
   */
  private async findInteractiveForm(
    entityId: string,
    currentUser: UserInfo
  ): Promise<FormResolutionResult | null> {

    try {
      const rv = new RunView();
      const result = await rv.RunView<EntityFormEntity>({
        EntityName: 'Entity Forms',
        ExtraFilter: `
          EntityID='${entityId}'
          AND Status='Active'
          AND (
            (Scope='User' AND UserID='${currentUser.ID}')
            OR (Scope='Role' AND RoleID IN (
              SELECT RoleID FROM [__mj].[UserRole] WHERE UserID='${currentUser.ID}'
            ))
            OR (Scope='Global')
          )
        `,
        OrderBy: `
          CASE
            WHEN Scope='User' THEN 1
            WHEN Scope='Role' THEN 2
            ELSE 3
          END,
          Priority DESC
        `,
        ResultType: 'entity_object'
      }, currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        const topForm = result.Results[0];

        try {
          const spec = JSON.parse(topForm.ComponentSpec);

          return {
            type: 'Interactive',
            componentSpec: spec,
            source: `EntityForm: ${topForm.Name} (${topForm.Scope}, Priority: ${topForm.Priority})`
          };
        } catch (parseError) {
          console.error('Error parsing ComponentSpec JSON:', parseError, topForm.ComponentSpec);
          // Continue to next resolution method
        }
      }
    } catch (error) {
      console.error('Error querying Entity Forms:', error);
      // Continue to next resolution method
    }

    return null;
  }

  /**
   * Find code-based form via ClassFactory
   */
  private findCodeBasedForm(entityName: string): FormResolutionResult | null {
    try {
      const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
        BaseFormComponent,
        entityName
      );

      if (registration && registration.Priority > 1) {
        // Priority > 1 indicates custom form (not generated)
        return {
          type: 'Code',
          componentClass: registration.SubClass,
          source: `@RegisterClass: ${registration.SubClass.name} (Priority: ${registration.Priority})`
        };
      }
    } catch (error) {
      console.error('Error checking ClassFactory:', error);
    }

    return null;
  }

  /**
   * Find generated form (fallback)
   */
  private findGeneratedForm(entityName: string): FormResolutionResult {
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
      BaseFormComponent,
      entityName
    );

    if (!registration) {
      throw new Error(`No form registration found for entity: ${entityName}`);
    }

    return {
      type: 'Generated',
      componentClass: registration.SubClass,
      source: `Generated form: ${registration.SubClass.name}`
    };
  }
}
```

### DashboardResolverService (Full Implementation)

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/services/dashboard-resolver.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-dashboards';
import { DashboardEntity } from '@memberjunction/core-entities';
import { SingleDashboardComponent } from '../single-dashboard/single-dashboard.component';
import { DashboardResolutionResult } from '../models/dashboard-resolution-result';

@Injectable({ providedIn: 'root' })
export class DashboardResolverService {

  constructor() {}

  /**
   * Resolves which dashboard component to use
   * Based on Dashboard.Type field: Interactive > Code > Config
   */
  public async resolveDashboardComponent(
    dashboard: DashboardEntity,
    currentUser: UserInfo
  ): Promise<DashboardResolutionResult> {

    try {
      // Step 1: Check if Type='Interactive'
      if (dashboard.Type === 'Interactive') {
        return this.resolveInteractiveDashboard(dashboard);
      }

      // Step 2: Check if Type='Code'
      if (dashboard.Type === 'Code') {
        return this.resolveCodeBasedDashboard(dashboard);
      }

      // Step 3: Fallback to Config-based
      return this.resolveConfigBasedDashboard(dashboard);

    } catch (error) {
      console.error('Error resolving dashboard component:', error);
      throw error;
    }
  }

  /**
   * Resolve Interactive Component dashboard
   */
  private resolveInteractiveDashboard(dashboard: DashboardEntity): DashboardResolutionResult {
    if (!dashboard.ComponentSpec) {
      throw new Error(`Dashboard Type is 'Interactive' but ComponentSpec is null: ${dashboard.Name}`);
    }

    try {
      const spec = JSON.parse(dashboard.ComponentSpec);

      return {
        type: 'Interactive',
        componentSpec: spec,
        source: `Interactive Dashboard: ${dashboard.Name}`
      };
    } catch (parseError) {
      throw new Error(`Error parsing ComponentSpec JSON for dashboard ${dashboard.Name}: ${parseError}`);
    }
  }

  /**
   * Resolve code-based dashboard
   */
  private resolveCodeBasedDashboard(dashboard: DashboardEntity): DashboardResolutionResult {
    if (!dashboard.DriverClass) {
      throw new Error(`Dashboard Type is 'Code' but DriverClass is null: ${dashboard.Name}`);
    }

    try {
      const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
        BaseDashboard,
        dashboard.DriverClass
      );

      if (!registration) {
        throw new Error(`No ClassFactory registration found for DriverClass: ${dashboard.DriverClass}`);
      }

      return {
        type: 'Code',
        componentClass: registration.SubClass,
        source: `@RegisterClass: ${dashboard.DriverClass}`
      };
    } catch (error) {
      throw new Error(`Error resolving code-based dashboard ${dashboard.Name}: ${error}`);
    }
  }

  /**
   * Resolve config-based dashboard (fallback)
   */
  private resolveConfigBasedDashboard(dashboard: DashboardEntity): DashboardResolutionResult {
    return {
      type: 'Config',
      componentClass: SingleDashboardComponent,
      source: `Config-based dashboard: ${dashboard.Name}`
    };
  }
}
```

---

## Integration Points

### Update SingleRecordComponent

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/single-record/single-record.component.ts`

**Changes needed:**

```typescript
import { FormResolverService } from '../services/form-resolver.service';
import { InteractiveFormComponent } from '@memberjunction/ng-base-forms';
import { ComponentSpec } from '@memberjunction/interactive-components';

export class SingleRecordComponent {
  constructor(
    // ... existing dependencies
    private formResolver: FormResolverService
  ) {}

  public async LoadForm(primaryKey: CompositeKey, entityName: string) {
    try {
      // Step 1: Resolve which form to use
      const formResolution = await this.formResolver.resolveFormComponent(
        entityName,
        this.currentUser
      );

      console.log('Form resolution:', formResolution.source);

      // Step 2: Load the entity record
      const record = await this.metadata.GetEntityObject<BaseEntity>(
        entityName,
        this.currentUser
      );

      if (primaryKey.HasValue) {
        await record.InnerLoad(primaryKey);
      } else {
        record.NewRecord();
      }

      // Step 3: Create component based on resolution type
      let componentRef: ComponentRef<BaseFormComponent>;

      if (formResolution.type === 'Interactive') {
        // Create Interactive form wrapper
        componentRef = this.viewContainer.createComponent(InteractiveFormComponent);
        componentRef.instance.componentSpec = formResolution.componentSpec!;
        componentRef.instance.record = record;
      } else {
        // Create Code or Generated form
        componentRef = this.viewContainer.createComponent(formResolution.componentClass);
        componentRef.instance.record = record;
      }

      // Step 4: Set common properties
      componentRef.instance.EditMode = !primaryKey.HasValue;
      componentRef.instance.currentUser = this.currentUser;

      // Step 5: Wire up events (same as before)
      componentRef.instance.recordSaved.subscribe((savedRecord) => {
        this.onRecordSaved(savedRecord);
      });

      componentRef.instance.recordCancelled.subscribe(() => {
        this.onRecordCancelled();
      });

      // ... other event subscriptions

    } catch (error) {
      console.error('Error loading form:', error);
      // Show error to user
    }
  }
}
```

### Update TabbedDashboardComponent

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/tabbed-dashboard/tabbed-dashboard.component.ts`

**Changes needed:**

```typescript
import { DashboardResolverService } from '../services/dashboard-resolver.service';
import { InteractiveDashboardComponent } from '@memberjunction/ng-dashboards';

export class TabbedDashboardComponent {
  constructor(
    // ... existing dependencies
    private dashboardResolver: DashboardResolverService
  ) {}

  private async getDashboardInstance(dashboardId: string): Promise<ComponentRef<BaseDashboard>> {
    try {
      const dashboard = this.dashboards.find(d => d.ID === dashboardId);
      if (!dashboard) {
        throw new Error(`Dashboard not found: ${dashboardId}`);
      }

      // Step 1: Resolve which dashboard component to use
      const dashboardResolution = await this.dashboardResolver.resolveDashboardComponent(
        dashboard,
        this.currentUser
      );

      console.log('Dashboard resolution:', dashboardResolution.source);

      // Step 2: Create component based on resolution type
      let componentRef: ComponentRef<BaseDashboard>;

      if (dashboardResolution.type === 'Interactive') {
        // Create Interactive dashboard wrapper
        componentRef = this.tabstripContainer.createComponent(InteractiveDashboardComponent);
        componentRef.instance.componentSpec = dashboardResolution.componentSpec!;
      } else if (dashboardResolution.type === 'Code') {
        // Create Code-based dashboard
        componentRef = this.tabstripContainer.createComponent(dashboardResolution.componentClass);
      } else {
        // Create Config-based dashboard
        componentRef = this.tabstripContainer.createComponent(SingleDashboardComponent);
      }

      // Step 3: Load user state
      const userState = await this.loadUserState(dashboardId);

      // Step 4: Create config and set on instance
      const config = new DashboardConfig(dashboard, userState);
      componentRef.instance.Config = config;
      componentRef.instance.currentUser = this.currentUser;

      // Step 5: Wire up events (same as before)
      componentRef.instance.LoadingComplete.subscribe(() => {
        this.onDashboardLoaded(dashboardId);
      });

      componentRef.instance.UserStateChanged.subscribe((state) => {
        this.saveUserState(dashboardId, state);
      });

      componentRef.instance.OpenEntityRecord.subscribe((data) => {
        this.sharedService.OpenEntityRecord(data.EntityName, data.RecordPKey);
      });

      componentRef.instance.Error.subscribe((error) => {
        console.error('Dashboard error:', error);
      });

      // Step 6: Initialize dashboard
      componentRef.instance.initDashboard();
      componentRef.instance.loadData();

      return componentRef;

    } catch (error) {
      console.error('Error creating dashboard instance:', error);
      throw error;
    }
  }
}
```

---

## Migration Script

**Location:** `migrations/v2/VYYYYMMDDHHmm__v2.116.x_Interactive_Forms_And_Dashboards.sql`

```sql
/*
   Migration: Interactive Forms and Dashboards Support
   Version: 2.116.x
   Date: 2025-11-03

   Purpose: Add support for Interactive Component forms and dashboards

   Changes:
   1. Create EntityForm table for registering IC forms
   2. Add ComponentSpec column to Dashboard table
   3. Update Dashboard.Type constraint to include 'Interactive'
*/

-- Use MemberJunction schema
USE [${flyway:defaultSchema}];
GO

-----------------------------------------------------------------
-- PART 1: Create EntityForm Table
-----------------------------------------------------------------

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EntityForm' AND schema_id = SCHEMA_ID('__mj'))
BEGIN
    PRINT 'Creating EntityForm table...';

    CREATE TABLE [__mj].[EntityForm] (
        [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        [EntityID] UNIQUEIDENTIFIER NOT NULL,
        [Name] NVARCHAR(100) NOT NULL,
        [Description] NVARCHAR(MAX) NULL,
        [ComponentSpec] NVARCHAR(MAX) NOT NULL,
        [Priority] INT NOT NULL DEFAULT 0,
        [Scope] NVARCHAR(20) NOT NULL DEFAULT 'Global',
        [RoleID] UNIQUEIDENTIFIER NULL,
        [UserID] UNIQUEIDENTIFIER NULL,
        [IsDefault] BIT NOT NULL DEFAULT 0,
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
        [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
        [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

        CONSTRAINT [PK_EntityForm] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_EntityForm_Entity] FOREIGN KEY ([EntityID])
            REFERENCES [__mj].[Entity]([ID]),
        CONSTRAINT [FK_EntityForm_Role] FOREIGN KEY ([RoleID])
            REFERENCES [__mj].[Role]([ID]),
        CONSTRAINT [FK_EntityForm_User] FOREIGN KEY ([UserID])
            REFERENCES [__mj].[User]([ID]),
        CONSTRAINT [CK_EntityForm_Scope] CHECK ([Scope] IN ('Global', 'Role', 'User')),
        CONSTRAINT [CK_EntityForm_Status] CHECK ([Status] IN ('Active', 'Inactive', 'Deprecated')),
        CONSTRAINT [CK_EntityForm_ScopeValidation] CHECK (
            ([Scope] = 'Global' AND [RoleID] IS NULL AND [UserID] IS NULL) OR
            ([Scope] = 'Role' AND [RoleID] IS NOT NULL AND [UserID] IS NULL) OR
            ([Scope] = 'User' AND [UserID] IS NOT NULL)
        )
    );

    PRINT 'EntityForm table created successfully.';
END
ELSE
BEGIN
    PRINT 'EntityForm table already exists, skipping creation.';
END
GO

-----------------------------------------------------------------
-- PART 2: Add Indexes to EntityForm
-----------------------------------------------------------------

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EntityForm_EntityID' AND object_id = OBJECT_ID('[__mj].[EntityForm]'))
BEGIN
    PRINT 'Creating index IX_EntityForm_EntityID...';
    CREATE NONCLUSTERED INDEX [IX_EntityForm_EntityID] ON [__mj].[EntityForm]([EntityID]);
    PRINT 'Index created successfully.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EntityForm_Scope_Priority' AND object_id = OBJECT_ID('[__mj].[EntityForm]'))
BEGIN
    PRINT 'Creating index IX_EntityForm_Scope_Priority...';
    CREATE NONCLUSTERED INDEX [IX_EntityForm_Scope_Priority]
        ON [__mj].[EntityForm]([EntityID], [Scope], [Priority] DESC);
    PRINT 'Index created successfully.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EntityForm_RoleID' AND object_id = OBJECT_ID('[__mj].[EntityForm]'))
BEGIN
    PRINT 'Creating filtered index IX_EntityForm_RoleID...';
    CREATE NONCLUSTERED INDEX [IX_EntityForm_RoleID]
        ON [__mj].[EntityForm]([RoleID])
        WHERE [RoleID] IS NOT NULL;
    PRINT 'Index created successfully.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EntityForm_UserID' AND object_id = OBJECT_ID('[__mj].[EntityForm]'))
BEGIN
    PRINT 'Creating filtered index IX_EntityForm_UserID...';
    CREATE NONCLUSTERED INDEX [IX_EntityForm_UserID]
        ON [__mj].[EntityForm]([UserID])
        WHERE [UserID] IS NOT NULL;
    PRINT 'Index created successfully.';
END
GO

-----------------------------------------------------------------
-- PART 3: Add Extended Properties to EntityForm
-----------------------------------------------------------------

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Registers Interactive Components as form implementations for entities with priority-based resolution',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'EntityForm';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'ID';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Foreign key to Entity table - which entity this form is for',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'EntityID';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name for this form type',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional description of form purpose and features',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'JSON string containing ComponentSpec (can reference local, embedded, or registry components)',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'ComponentSpec';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Higher priority forms are preferred when multiple match. Within same scope, highest priority wins.',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'Priority';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Determines who can use this form: Global (all users), Role (specific role), User (specific user)',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'Scope';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Foreign key to Role table - required if Scope=Role, must be NULL otherwise',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'RoleID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Foreign key to User table - required if Scope=User, must be NULL otherwise',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'UserID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Indicates if this is the default form for the scope (only one default per entity+scope combination)',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Status of this form type: Active, Inactive, Deprecated',
    @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityForm',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

-----------------------------------------------------------------
-- PART 4: Extend Dashboard Table
-----------------------------------------------------------------

-- Add ComponentSpec column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns
               WHERE object_id = OBJECT_ID('[__mj].[Dashboard]')
               AND name = 'ComponentSpec')
BEGIN
    PRINT 'Adding ComponentSpec column to Dashboard table...';
    ALTER TABLE [__mj].[Dashboard]
    ADD [ComponentSpec] NVARCHAR(MAX) NULL;
    PRINT 'ComponentSpec column added successfully.';
END
ELSE
BEGIN
    PRINT 'ComponentSpec column already exists on Dashboard table.';
END
GO

-- Add extended property for ComponentSpec
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'JSON string containing ComponentSpec - specifies Interactive Component to use when Type=Interactive',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'Dashboard',
    @level2type = N'COLUMN', @level2name = N'ComponentSpec';
GO

-- Drop existing Type constraint if it exists
IF EXISTS (SELECT * FROM sys.check_constraints
           WHERE name = 'CK_Dashboard_Type'
           AND parent_object_id = OBJECT_ID('[__mj].[Dashboard]'))
BEGIN
    PRINT 'Dropping existing CK_Dashboard_Type constraint...';
    ALTER TABLE [__mj].[Dashboard] DROP CONSTRAINT [CK_Dashboard_Type];
    PRINT 'Constraint dropped.';
END
GO

-- Add updated Type constraint with 'Interactive' option
IF NOT EXISTS (SELECT * FROM sys.check_constraints
               WHERE name = 'CK_Dashboard_Type'
               AND parent_object_id = OBJECT_ID('[__mj].[Dashboard]'))
BEGIN
    PRINT 'Creating updated CK_Dashboard_Type constraint...';
    ALTER TABLE [__mj].[Dashboard]
    ADD CONSTRAINT [CK_Dashboard_Type] CHECK ([Type] IN ('Config', 'Code', 'Dynamic Code', 'Interactive'));
    PRINT 'Constraint created successfully.';
END
GO

-- Add ComponentSpec validation constraint
IF NOT EXISTS (SELECT * FROM sys.check_constraints
               WHERE name = 'CK_Dashboard_ComponentSpec'
               AND parent_object_id = OBJECT_ID('[__mj].[Dashboard]'))
BEGIN
    PRINT 'Creating CK_Dashboard_ComponentSpec constraint...';
    ALTER TABLE [__mj].[Dashboard]
    ADD CONSTRAINT [CK_Dashboard_ComponentSpec] CHECK (
        ([Type] = 'Interactive' AND [ComponentSpec] IS NOT NULL) OR
        ([Type] != 'Interactive')
    );
    PRINT 'Constraint created successfully.';
END
GO

-- Add index on Dashboard.Type for performance
IF NOT EXISTS (SELECT * FROM sys.indexes
               WHERE name = 'IX_Dashboard_Type'
               AND object_id = OBJECT_ID('[__mj].[Dashboard]'))
BEGIN
    PRINT 'Creating index IX_Dashboard_Type...';
    CREATE NONCLUSTERED INDEX [IX_Dashboard_Type] ON [__mj].[Dashboard]([Type]);
    PRINT 'Index created successfully.';
END
GO

-----------------------------------------------------------------
-- PART 5: Verify Changes
-----------------------------------------------------------------

PRINT '';
PRINT '======================================';
PRINT 'Migration completed successfully!';
PRINT '======================================';
PRINT '';
PRINT 'Summary:';
PRINT '- EntityForm table created with indexes and constraints';
PRINT '- Dashboard.ComponentSpec column added';
PRINT '- Dashboard.Type constraint updated to include ''Interactive''';
PRINT '- All extended properties added for documentation';
PRINT '';
PRINT 'Next steps:';
PRINT '1. Run CodeGen to generate EntityFormEntity class';
PRINT '2. Update DashboardEntity class will automatically include ComponentSpec field';
PRINT '3. Implement Angular resolver services and wrapper components';
PRINT '';
GO
```

---

## Implementation Checklist

### Phase 1: Database Schema ✅
- [x] Create EntityForm table
- [x] Add indexes to EntityForm
- [x] Add extended properties to EntityForm
- [x] Add ComponentSpec column to Dashboard
- [x] Update Dashboard Type constraint
- [x] Add ComponentSpec validation constraint
- [x] Create migration SQL file
- [ ] Run migration script
- [ ] Run CodeGen to generate entities

### Phase 2: TypeScript Types & Models ⏳
- [ ] Create FormResolutionResult interface
- [ ] Create DashboardResolutionResult interface
- [ ] Ensure ComponentSpec is exported from @memberjunction/interactive-components

### Phase 3: Services ⏳
- [ ] Implement FormResolverService
- [ ] Implement DashboardResolverService
- [ ] Add services to module providers

### Phase 4: Angular Wrapper Components ⏳
- [ ] Implement InteractiveFormComponent
- [ ] Implement InteractiveDashboardComponent
- [ ] Export components from modules
- [ ] Add components to declarations

### Phase 5: Integration ⏳
- [ ] Update SingleRecordComponent to use FormResolverService
- [ ] Update TabbedDashboardComponent to use DashboardResolverService
- [ ] Test form resolution (User > Role > Global > Code > Generated)
- [ ] Test dashboard resolution (Interactive > Code > Config)

### Phase 6: Testing ⏳
- [ ] Create sample EntityForm records for testing
- [ ] Create sample Dashboard with Type='Interactive'
- [ ] Test Interactive form rendering
- [ ] Test Interactive dashboard rendering
- [ ] Test event handling (save, cancel, delete)
- [ ] Test user state persistence
- [ ] Test priority resolution
- [ ] Test scope validation (User/Role/Global)

### Phase 7: Documentation ⏳
- [ ] Document EntityForm entity usage
- [ ] Document ComponentSpec format for forms
- [ ] Document ComponentSpec format for dashboards
- [ ] Create examples of Interactive Component forms
- [ ] Create examples of Interactive Component dashboards
- [ ] Document AI agent integration patterns

---

## Testing Plan

### Unit Tests

1. **FormResolverService**
   - Test User-specific form has highest priority
   - Test Role-specific form overrides Global
   - Test Global form overrides Code-based
   - Test Code-based overrides Generated
   - Test fallback to Generated form
   - Test error handling for invalid entity

2. **DashboardResolverService**
   - Test Interactive type resolution
   - Test Code type resolution
   - Test Config type fallback
   - Test error handling for missing ComponentSpec
   - Test error handling for missing DriverClass

### Integration Tests

1. **Interactive Forms**
   - Create EntityForm record with embedded ComponentSpec
   - Open entity record
   - Verify InteractiveFormComponent loads
   - Test form data binding
   - Test save event handling
   - Test cancel event handling
   - Test field change events

2. **Interactive Dashboards**
   - Create Dashboard record with Type='Interactive'
   - Open dashboard in TabbedDashboardComponent
   - Verify InteractiveDashboardComponent loads
   - Test user state persistence
   - Test openRecord event
   - Test refresh functionality

3. **Priority Resolution**
   - Create User-specific EntityForm
   - Create Role-specific EntityForm
   - Create Global EntityForm
   - Verify User-specific wins
   - Remove User-specific, verify Role-specific wins
   - Remove Role-specific, verify Global wins

### Manual Testing Checklist

- [ ] Create sample Interactive form using Component Studio
- [ ] Register as EntityForm for test entity
- [ ] Open test entity record
- [ ] Verify form renders correctly
- [ ] Edit field values
- [ ] Save record and verify changes persist
- [ ] Test cancel and verify changes revert
- [ ] Create sample Interactive dashboard
- [ ] Set Dashboard Type='Interactive'
- [ ] Add ComponentSpec JSON
- [ ] Open dashboard in Explorer
- [ ] Verify dashboard renders correctly
- [ ] Test user interactions
- [ ] Verify user state persists across sessions

---

## AI Agent Integration

### Form Manager Agent

**Capabilities:**
1. Generate ComponentSpec for forms based on entity metadata
2. Show preview with sample data
3. Register as EntityForm with appropriate scope
4. Handle user feedback and iteration
5. Update existing forms

**Example Workflow:**
```
User: "Create a custom form for Customers with revenue visualization"

Agent:
- Analyzes Customer entity metadata
- Generates ComponentSpec with React code
- Shows preview with sample customer data
- User approves with minor tweaks
- Agent updates ComponentSpec
- Registers as EntityForm with Scope='Global', Priority=10
```

### Dashboard Manager Agent

**Capabilities:**
1. Generate ComponentSpec for dashboards
2. Understand data aggregation requirements
3. Create visualizations (charts, tables, metrics)
4. Show preview with real data
5. Register as Dashboard with Type='Interactive'

**Example Workflow:**
```
User: "Create a sales dashboard with regional breakdown"

Agent:
- Analyzes available sales data
- Generates ComponentSpec with charts
- Shows preview with recent sales data
- User requests map visualization
- Agent adds map component
- Creates Dashboard record with Type='Interactive'
- Saves ComponentSpec JSON
```

### Shared Infrastructure

Both agents use:
- **ComponentSpec Generator**: Converts requirements to ComponentSpec JSON
- **Preview Service**: Renders components in chat UI
- **Registration Service**: Saves to EntityForm or Dashboard tables
- **Validation Service**: Ensures ComponentSpec is valid before registration

---

## Next Steps

1. **Review this plan document** - ensure alignment on approach
2. **Run database migration** - create tables and update schema
3. **Run CodeGen** - generate EntityFormEntity and update DashboardEntity
4. **Implement Phase 2-5** - TypeScript types, services, components, integration
5. **Test thoroughly** - verify all resolution paths work correctly
6. **Build AI agents** - Form Manager and Dashboard Manager
7. **Documentation** - create user guides and examples

---

## Benefits Summary

✅ **Unified Architecture** - Same pattern for forms and dashboards
✅ **AI-Native** - Designed for AI agent generation
✅ **Metadata-Driven** - No code deployment for new forms
✅ **User Customization** - Per-user and per-role form variations
✅ **Backward Compatible** - Existing forms and dashboards unchanged
✅ **Extensible** - Easy to add new resource types
✅ **High Performance** - ComponentRegistry caching built-in
✅ **Secure** - Role-based access control on form registration

---

**Status:** Ready for implementation! 🚀
