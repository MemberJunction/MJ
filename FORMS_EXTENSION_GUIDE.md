# Forms Extension Guide - Building on Interactive Components

## Overview

The Interactive Components system is **already designed to support forms**. The spec format and runtime architecture are fully generic and can accommodate form-specific features without modification.

This guide shows how to create form components using the existing system.

---

## 1. FORM COMPONENT SPECIFICATION

### 1.1 Basic Form Component

```typescript
import { ComponentSpec, ComponentProperty, ComponentEvent, ComponentDataRequirements } from '@memberjunction/interactive-component-types';

const userFormSpec: ComponentSpec = {
  name: 'UserForm',
  type: 'form',  // Already supported type
  
  title: 'User Edit Form',
  description: 'A form for creating and editing user records with validation',
  
  // FUNCTIONAL & TECHNICAL DOCS
  functionalRequirements: `
## Overview
A comprehensive form for managing user records with:
- Field validation (required, email, phone format)
- Auto-save capability
- Dirty state tracking
- Mode-based rendering (create, edit, view)

## Business Rules
- Email must be unique across all users
- Phone is optional but must be valid format if provided
- Status field is read-only in view mode
- Created/Updated timestamps are system-maintained

## User Experience
- Form loads with default values for create mode
- Required fields are clearly marked
- Validation errors appear inline below fields
- Save button disabled when form is pristine
- Unsaved changes warning on navigation
  `,
  
  technicalDesign: `
## Architecture
Built on React with Formik for state management and Yup for validation.

## Component Hierarchy
- UserForm (root)
  ├─ FormHeader (title, help text)
  ├─ FormSection (email, name fields)
  ├─ FormSection (phone, company fields)
  ├─ FormSection (status, dates fields - read-only)
  └─ FormFooter (save/cancel buttons)

## Data Fetching
- Loads user record via utilities.rv.RunView()
- Lazy loads related data (companies) on demand
- Caches loaded values for dirty tracking

## Validation
- Client-side: Yup schema with email/phone validators
- Server-side: On submit before saving
  `,
  
  exampleUsage: `
<mj-react-component 
  [component]="userFormSpec"
  [utilities]="utilities"
  [styles]="styles"
  [(savedUserSettings)]="userSettings"
  (openEntityRecord)="onOpenRecord($event)"
  (componentEvent)="onComponentEvent($event)">
</mj-react-component>

// Or programmatically:
const manager = new ComponentManager(compiler, registry, runtimeContext);
const result = await manager.loadComponent(userFormSpec);
const formComponent = result.component;
  `,
  
  // LOCATION & DEPENDENCIES
  location: 'embedded',
  code: `
// Form component implementation
export default function createUserForm(runtimeContext, styles, components) {
  // ... form implementation
}
  `,
  
  // FORM-SPECIFIC PROPERTIES
  properties: [
    {
      name: 'record',
      type: 'object',
      required: true,
      description: 'The user record to edit. For new records, pass an empty object'
    },
    {
      name: 'mode',
      type: 'string',
      required: false,
      defaultValue: 'edit',
      possibleValues: ['create', 'edit', 'view'],
      description: 'Form mode: create (blank), edit (pre-populated), or view (read-only)'
    },
    {
      name: 'autoSave',
      type: 'boolean',
      required: false,
      defaultValue: false,
      description: 'If true, saves after each field change (with debounce)'
    },
    {
      name: 'autoSaveDelay',
      type: 'number',
      required: false,
      defaultValue: 2000,
      description: 'Debounce delay for auto-save in milliseconds'
    }
  ],
  
  // FORM-SPECIFIC EVENTS
  events: [
    {
      name: 'save',
      description: 'Fired when user submits the form',
      parameters: [
        {
          name: 'record',
          type: 'object',
          description: 'The validated and submitted record data'
        }
      ]
    },
    {
      name: 'cancel',
      description: 'Fired when user cancels editing'
    },
    {
      name: 'fieldChange',
      description: 'Fired when any field value changes',
      parameters: [
        {
          name: 'fieldName',
          type: 'string',
          description: 'Name of the field that changed'
        },
        {
          name: 'value',
          type: 'any',
          description: 'The new value'
        }
      ]
    },
    {
      name: 'validationError',
      description: 'Fired when validation fails',
      parameters: [
        {
          name: 'errors',
          type: 'object',
          description: 'Object with field names as keys and error messages as values'
        }
      ]
    }
  ],
  
  // FORM-SPECIFIC METHODS
  methods: {
    standardMethodsSupported: {
      validate: true,        // Validate current form state
      isDirty: true,         // Check if form has unsaved changes
      reset: true,           // Reset to original values
      focus: true,           // Focus a specific field
      print: false,          // Not applicable for forms
      refresh: false         // Not applicable for forms
    },
    customMethods: [
      {
        name: 'submitForm',
        description: 'Submit the form programmatically',
        parameters: [],
        returnType: 'Promise<{ success: boolean; record?: any; error?: string }>'
      },
      {
        name: 'setField',
        description: 'Update a specific field value',
        parameters: [
          { name: 'fieldName', type: 'string' },
          { name: 'value', type: 'any' }
        ],
        returnType: 'void'
      },
      {
        name: 'getField',
        description: 'Get current value of a field',
        parameters: [
          { name: 'fieldName', type: 'string' }
        ],
        returnType: 'any'
      },
      {
        name: 'getErrors',
        description: 'Get all current validation errors',
        parameters: [],
        returnType: 'Record<string, string[]>'
      },
      {
        name: 'setMode',
        description: 'Change form mode (create, edit, view)',
        parameters: [
          { name: 'mode', type: 'string' }
        ],
        returnType: 'void'
      }
    ]
  },
  
  // DATA REQUIREMENTS
  dataRequirements: {
    mode: 'views',
    
    description: 'Form requires read access to Users entity and related lookups',
    
    entities: [
      {
        name: 'Users',
        description: 'The main user record being edited',
        displayFields: ['ID', 'FirstName', 'LastName', 'Email', 'Phone', 'CompanyID', 'Status', '__mj_CreatedAt', '__mj_UpdatedAt'],
        filterFields: ['ID'],
        sortFields: [],
        fieldMetadata: [
          // Populated by system from entity metadata
        ],
        permissionLevelNeeded: ['read', 'update'],  // update for edit mode
        usageContext: 'Primary entity for the form'
      },
      {
        name: 'Company',
        description: 'For company lookup dropdown',
        displayFields: ['ID', 'Name'],
        filterFields: [],
        sortFields: ['Name'],
        fieldMetadata: [],
        permissionLevelNeeded: ['read'],
        usageContext: 'Populates company dropdown'
      }
    ],
    
    queries: []
  },
  
  // OPTIONAL: Libraries for enhanced forms
  libraries: [
    {
      name: 'formik',
      globalVariable: 'Formik',
      version: '^2.4.0'
    },
    {
      name: 'yup',
      globalVariable: 'Yup',
      version: '^1.2.0'
    }
  ],
  
  // OPTIONAL: Other components this form depends on
  dependencies: [
    // Could have sub-components like FormField, FormSection, etc.
  ]
};
```

### 1.2 Advanced Form Specification

```typescript
const advancedFormSpec: ComponentSpec = {
  name: 'DynamicFormBuilder',
  type: 'form',
  
  // ... basic fields ...
  
  properties: [
    {
      name: 'schema',
      type: 'object',
      required: true,
      description: 'JSON Schema defining form fields, layout, validation rules'
    },
    {
      name: 'data',
      type: 'object',
      required: true,
      description: 'Current form data values'
    },
    {
      name: 'layout',
      type: 'object',
      required: false,
      description: 'Layout configuration (grid columns, sections, etc.)'
    },
    {
      name: 'validationMode',
      type: 'string',
      possibleValues: ['onChange', 'onBlur', 'onSubmit'],
      defaultValue: 'onBlur',
      description: 'When to validate fields'
    }
  ],
  
  // Form schema could be:
  /*
  schema: {
    sections: [
      {
        title: 'Personal Information',
        fields: [
          {
            name: 'firstName',
            type: 'text',
            label: 'First Name',
            validation: { required: true }
          },
          {
            name: 'email',
            type: 'email',
            label: 'Email',
            validation: { required: true, pattern: '^[^@]+@[^@]+\.[^@]+$' }
          }
        ]
      }
    ]
  }
  */
  
  events: [
    { name: 'save' },
    { name: 'cancel' },
    { name: 'fieldChange' },
    { name: 'sectionChange' },
    { name: 'formDataUpdated' }
  ]
};
```

---

## 2. FORM COMPONENT IMPLEMENTATION

### 2.1 React Component Structure

```typescript
// Create a form following the ComponentObject pattern
export default function createUserForm(runtimeContext, styles, components) {
  const { React } = runtimeContext;
  const { useState, useEffect, useCallback, useRef } = React;
  
  // ==========================================
  // MAIN COMPONENT
  // ==========================================
  
  function UserForm(props) {
    const {
      utilities,
      callbacks,
      components,
      styles,
      libraries,
      savedUserSettings,
      onSaveUserSettings
    } = props;
    
    // FORM STATE
    const [record, setRecord] = useState(props.record || {});
    const [originalRecord, setOriginalRecord] = useState(props.record || {});
    const [mode, setMode] = useState(props.mode || 'edit');
    const [isDirty, setIsDirty] = useState(false);
    const [errors, setErrors] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    
    // ==========================================
    // INITIALIZATION
    // ==========================================
    
    useEffect(() => {
      // Load record if ID provided
      if (props.record?.ID) {
        loadRecord(props.record.ID);
      }
    }, [props.record?.ID]);
    
    const loadRecord = useCallback(async (recordId) => {
      try {
        const rv = utilities.rv;
        const result = await rv.RunView({
          EntityName: 'Users',
          ExtraFilter: `ID='${recordId}'`,
          ResultType: 'entity_object'
        });
        
        if (result.Success && result.Results.length > 0) {
          const loaded = result.Results[0];
          setRecord(loaded);
          setOriginalRecord(loaded);
          setIsDirty(false);
        }
      } catch (error) {
        callbacks.CreateSimpleNotification(
          `Failed to load record: ${error.message}`,
          'error'
        );
      }
    }, [utilities, callbacks]);
    
    // ==========================================
    // FIELD MANAGEMENT
    // ==========================================
    
    const handleFieldChange = useCallback((fieldName, value) => {
      setRecord(prev => ({
        ...prev,
        [fieldName]: value
      }));
      setIsDirty(true);
    }, []);
    
    const validateField = useCallback((fieldName, value) => {
      const fieldErrors = [];
      
      // Example validation rules
      if (fieldName === 'Email') {
        if (!value) fieldErrors.push('Email is required');
        else if (!/^[^@]+@[^@]+\.[^@]+$/.test(value)) {
          fieldErrors.push('Invalid email format');
        }
      }
      
      if (fieldName === 'FirstName' || fieldName === 'LastName') {
        if (!value) fieldErrors.push(`${fieldName} is required`);
      }
      
      return fieldErrors;
    }, []);
    
    const validateForm = useCallback(() => {
      const newErrors = {};
      const fieldsToValidate = ['FirstName', 'LastName', 'Email'];
      
      for (const fieldName of fieldsToValidate) {
        const fieldErrors = validateField(fieldName, record[fieldName]);
        if (fieldErrors.length > 0) {
          newErrors[fieldName] = fieldErrors;
        }
      }
      
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }, [record, validateField]);
    
    // ==========================================
    // SAVE & CANCEL
    // ==========================================
    
    const handleSave = useCallback(async () => {
      if (!validateForm()) {
        callbacks.CreateSimpleNotification(
          'Please fix validation errors before saving',
          'warning'
        );
        return;
      }
      
      try {
        setIsSaving(true);
        const md = utilities.md;
        
        // Get user entity object
        const userEntity = await md.GetEntityObject('Users');
        
        // Load the entity if editing
        if (mode === 'edit' && record.ID) {
          await userEntity.Load(record.ID);
        }
        
        // Set field values
        userEntity.FirstName = record.FirstName;
        userEntity.LastName = record.LastName;
        userEntity.Email = record.Email;
        userEntity.Phone = record.Phone;
        userEntity.CompanyID = record.CompanyID;
        // Don't set Status, CreatedAt, UpdatedAt - system maintains these
        
        // Save
        const saved = await userEntity.Save();
        
        if (saved) {
          setIsDirty(false);
          setOriginalRecord(record);
          callbacks.CreateSimpleNotification(
            'User saved successfully',
            'success'
          );
          
          // Emit save event to parent
          // (Would normally call a callback if the spec defined one)
        } else {
          throw new Error(userEntity.LatestResult.Message);
        }
      } catch (error) {
        callbacks.CreateSimpleNotification(
          `Error saving user: ${error.message}`,
          'error'
        );
      } finally {
        setIsSaving(false);
      }
    }, [record, mode, validateForm, utilities, callbacks]);
    
    const handleCancel = useCallback(() => {
      if (isDirty) {
        const confirmed = window.confirm(
          'You have unsaved changes. Are you sure you want to discard them?'
        );
        if (!confirmed) return;
      }
      
      setRecord(originalRecord);
      setIsDirty(false);
      setErrors({});
    }, [isDirty, originalRecord]);
    
    // ==========================================
    // RENDER
    // ==========================================
    
    const readOnly = mode === 'view';
    
    return (
      <div style={{ padding: styles.spacing.md }}>
        <h2>User {mode === 'create' ? 'Create' : 'Edit'}</h2>
        
        <div style={{ marginTop: styles.spacing.lg }}>
          {/* First Name */}
          <div style={{ marginBottom: styles.spacing.md }}>
            <label>First Name *</label>
            <input
              type="text"
              value={record.FirstName || ''}
              onChange={(e) => handleFieldChange('FirstName', e.target.value)}
              disabled={readOnly}
              style={{
                width: '100%',
                padding: styles.spacing.sm,
                borderColor: errors.FirstName ? styles.colors.error : styles.colors.border
              }}
            />
            {errors.FirstName && (
              <div style={{ color: styles.colors.error, fontSize: styles.typography.fontSize.sm }}>
                {errors.FirstName[0]}
              </div>
            )}
          </div>
          
          {/* Last Name */}
          <div style={{ marginBottom: styles.spacing.md }}>
            <label>Last Name *</label>
            <input
              type="text"
              value={record.LastName || ''}
              onChange={(e) => handleFieldChange('LastName', e.target.value)}
              disabled={readOnly}
              style={{ width: '100%', padding: styles.spacing.sm }}
            />
          </div>
          
          {/* Email */}
          <div style={{ marginBottom: styles.spacing.md }}>
            <label>Email *</label>
            <input
              type="email"
              value={record.Email || ''}
              onChange={(e) => handleFieldChange('Email', e.target.value)}
              disabled={readOnly}
              style={{ width: '100%', padding: styles.spacing.sm }}
            />
          </div>
          
          {/* Phone */}
          <div style={{ marginBottom: styles.spacing.md }}>
            <label>Phone</label>
            <input
              type="tel"
              value={record.Phone || ''}
              onChange={(e) => handleFieldChange('Phone', e.target.value)}
              disabled={readOnly}
              style={{ width: '100%', padding: styles.spacing.sm }}
            />
          </div>
        </div>
        
        {/* Buttons */}
        {!readOnly && (
          <div style={{ marginTop: styles.spacing.lg, display: 'flex', gap: styles.spacing.md }}>
            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              style={{
                padding: `${styles.spacing.sm} ${styles.spacing.md}`,
                backgroundColor: styles.colors.primary,
                color: styles.colors.textInverse,
                border: 'none',
                cursor: 'pointer',
                opacity: !isDirty || isSaving ? 0.5 : 1
              }}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              style={{
                padding: `${styles.spacing.sm} ${styles.spacing.md}`,
                backgroundColor: styles.colors.secondary,
                color: styles.colors.textInverse,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }
  
  // ==========================================
  // EXPOSED COMPONENT OBJECT
  // ==========================================
  
  return {
    component: UserForm,
    
    // Standard methods
    validate() {
      // Implementation would validate current form state
      return true; // or { valid: false, errors: [...] }
    },
    
    isDirty() {
      // Return true if form has unsaved changes
      return false;
    },
    
    reset() {
      // Reset form to original values
      // setRecord(originalRecord);
      // setIsDirty(false);
    },
    
    // Custom form methods
    submitForm() {
      // Submit form programmatically
      // return handleSave();
    },
    
    getCurrentDataState() {
      // Return current form data state for AI agents
      return {
        record,
        isDirty,
        mode,
        errors
      };
    },
    
    getDataStateHistory() {
      // Could track history of form changes if needed
      return [];
    }
  };
}
```

---

## 3. ANGULAR INTEGRATION

### 3.1 Using Forms in Angular

```typescript
// In your Angular component
import { Component, OnInit, ViewChild } from '@angular/core';
import { MJReactComponent } from '@memberjunction/ng-react';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

@Component({
  selector: 'app-user-management',
  template: `
    <div class="user-management">
      <h1>User Management</h1>
      
      <mj-react-component 
        #userForm
        [component]="userFormSpec"
        [utilities]="utilities"
        [styles]="styles"
        [savedUserSettings]="userFormSettings"
        (componentEvent)="onComponentEvent($event)"
        (openEntityRecord)="onOpenRecord($event)">
      </mj-react-component>
    </div>
  `,
  styles: [`
    .user-management {
      padding: 20px;
    }
  `]
})
export class UserManagementComponent implements OnInit {
  @ViewChild('userForm') userFormComponent!: MJReactComponent;
  
  userFormSpec: ComponentSpec = {
    // Your form spec here
  };
  
  utilities: any;
  styles: any;
  userFormSettings: any = {};
  
  ngOnInit() {
    // Initialize utilities and styles
    this.setupForm();
  }
  
  setupForm() {
    // Load form spec from database or create inline
    // If spec is stored in database:
    // this.loadFormSpecFromDatabase('UserForm');
  }
  
  onComponentEvent(event: any) {
    console.log('Component event:', event);
  }
  
  onOpenRecord(event: any) {
    console.log('Open entity record:', event);
  }
  
  // Public methods to interact with form
  saveForm() {
    this.userFormComponent.invokeMethod('submitForm');
  }
  
  checkIfDirty() {
    return this.userFormComponent.isDirty();
  }
  
  validateForm() {
    return this.userFormComponent.validate();
  }
  
  resetForm() {
    this.userFormComponent.reset();
  }
}
```

---

## 4. KEY PATTERNS FOR FORMS

### 4.1 Dirty Tracking
```typescript
// Compare current values with original values
const isDirty = JSON.stringify(record) !== JSON.stringify(originalRecord);
```

### 4.2 Validation
```typescript
// Use Yup for validation (if included in libraries)
const schema = Yup.object({
  email: Yup.string().email().required(),
  firstName: Yup.string().required(),
  phone: Yup.string().matches(/^[\d\-]+$/, 'Invalid phone')
});

const validation = schema.validateSync(record);
```

### 4.3 Auto-Save
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    if (isDirty && props.autoSave) {
      handleSave();
    }
  }, props.autoSaveDelay || 2000);
  
  return () => clearTimeout(timer);
}, [record, isDirty, props.autoSave, props.autoSaveDelay]);
```

### 4.4 Field Dependency
```typescript
// Disable company field if user is not associated
const isCompanyFieldDisabled = !record.HasCompanyAssociation;
```

---

## 5. STORING FORMS IN REGISTRY

Forms can be stored in the Component entity in MemberJunction:

```sql
-- Insert form component into database
INSERT INTO Component (Name, Namespace, Type, Location, Specification)
VALUES (
  'UserForm',
  'forms/user',
  'form',
  'registry',
  '{
    "name": "UserForm",
    "type": "form",
    "location": "embedded",
    "title": "User Edit Form",
    "description": "...",
    "code": "...",
    "properties": [...],
    "events": [...],
    "dataRequirements": {...}
  }'
);
```

Then load at runtime:
```typescript
const formSpec = {
  name: 'UserForm',
  location: 'registry',
  registry: undefined,  // Local registry
  namespace: 'forms/user'
};

const result = await componentManager.loadComponent(formSpec);
```

---

## 6. BEST PRACTICES FOR FORMS

1. **Always declare data requirements** - Be explicit about what entities/fields needed
2. **Implement validation** - Both client and server-side
3. **Track dirty state** - Don't let users accidentally lose work
4. **Handle errors gracefully** - Show validation errors inline
5. **Provide feedback** - Use notifications for save success/failure
6. **Support read-only mode** - Use for viewing/reviewing records
7. **Implement all standard methods** - validate, isDirty, reset at minimum
8. **Use saved user settings** - Remember user preferences (form layout, field order, etc.)
9. **Emit save/cancel events** - Let parents know when form actions occur
10. **Test with test harness** - Validate before deployment

---

## 7. FORMS + AI AGENTS

The Interactive Components system enables AI agents to:

1. **Understand form requirements** from the ComponentSpec
2. **Generate form implementations** with proper validation
3. **Create custom forms** for new entities
4. **Validate form data** before submission
5. **Guide users** through complex workflows

Example:
```typescript
// AI agent could generate forms dynamically
const aiGeneratedFormSpec = await generateFormForEntity({
  entityName: 'Accounts',
  aiTools: utilities.ai,
  requirements: 'Create a form for account management with validation'
});

// Then render it
await componentManager.loadComponent(aiGeneratedFormSpec);
```

---

## Summary

The Interactive Components system **is already fully capable of handling forms**. The same specification format, compilation pipeline, and rendering system that works for reports also works for forms. Just:

1. Use `type: 'form'` in your spec
2. Add form-specific properties and events
3. Implement form state management in React
4. Use the utilities and callbacks for data access
5. Store specs in the Component registry for reuse

No changes to the core system are needed.
