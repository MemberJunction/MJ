# @memberjunction/templates-base-types

Base types and core functionality for the MemberJunction templating system. This package provides the foundational classes, types, and metadata management for templates that can be used in both client and server environments.

## Overview

This package serves as the foundation for the MemberJunction templating system, providing:

- **Base template engine class** for metadata management and caching
- **Extended template entity** with additional functionality
- **Core type definitions** for template rendering results
- **Template metadata access** through a singleton pattern

## Installation

```bash
npm install @memberjunction/templates-base-types
```

## Core Components

### TemplateEngineBase

The `TemplateEngineBase` class provides a singleton engine for managing template metadata, including templates, content variations, parameters, and categories.

```typescript
import { TemplateEngineBase } from '@memberjunction/templates-base-types';

// Get the singleton instance
const templateEngine = TemplateEngineBase.Instance;

// Load template metadata (required before use)
await templateEngine.Config();

// Access templates
const templates = templateEngine.Templates;

// Find a specific template by name (case-insensitive)
const template = templateEngine.FindTemplate('Welcome Email');
```

### TemplateEntityExtended

An enhanced version of the base `TemplateEntity` that includes associated content and parameters as properties, along with utility methods.

```typescript
import { TemplateEntityExtended } from '@memberjunction/templates-base-types';

// Access template content and parameters
const template: TemplateEntityExtended = templateEngine.FindTemplate('Invoice Template');

// Get all content for the template
const allContent = template.Content;

// Get content by type
const htmlContent = template.GetContentByType('HTML');
const plainTextContent = template.GetContentByType('PlainText');

// Get the highest priority content
const primaryContent = template.GetHighestPriorityContent();
const primaryHtmlContent = template.GetHighestPriorityContent('HTML');

// Validate input data against template parameters
const validationResult = template.ValidateTemplateInput({
    customerName: 'John Doe',
    invoiceNumber: '12345'
});

if (!validationResult.Success) {
    console.error('Validation errors:', validationResult.Errors);
}
```

### TemplateRenderResult

A simple class representing the result of a template rendering operation.

```typescript
import { TemplateRenderResult } from '@memberjunction/templates-base-types';

// Typically returned by rendering operations
const result: TemplateRenderResult = {
    Success: true,
    Output: '<html>Rendered content...</html>',
    Message: undefined // Optional, typically used for error messages
};
```

## API Reference

### TemplateEngineBase

#### Properties

- `Templates: TemplateEntityExtended[]` - All loaded templates
- `TemplateContentTypes: TemplateContentTypeEntity[]` - Available content types
- `TemplateCategories: TemplateCategoryEntity[]` - Template categories
- `TemplateContents: TemplateContentEntity[]` - All template content records
- `TemplateParams: TemplateParamEntity[]` - All template parameters

#### Methods

- `static get Instance(): TemplateEngineBase` - Get the singleton instance
- `async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider)` - Load template metadata
- `FindTemplate(templateName: string): TemplateEntityExtended` - Find a template by name (case-insensitive)

### TemplateEntityExtended

#### Properties

- `Content: TemplateContentEntity[]` - Associated content records
- `Params: TemplateParamEntity[]` - Associated parameter definitions

#### Methods

- `GetContentByType(type: string): TemplateContentEntity[]` - Get all content of a specific type
- `GetHighestPriorityContent(type?: string): TemplateContentEntity` - Get the highest priority content
- `ValidateTemplateInput(data: any): ValidationResult` - Validate input data against parameter requirements

### TemplateRenderResult

#### Properties

- `Success: boolean` - Whether the rendering was successful
- `Output: string` - The rendered output
- `Message?: string` - Optional message (typically for errors)

## Usage Examples

### Basic Template Metadata Access

```typescript
import { TemplateEngineBase } from '@memberjunction/templates-base-types';

async function loadTemplates() {
    const engine = TemplateEngineBase.Instance;
    
    // Load metadata (only needed once)
    await engine.Config();
    
    // List all active templates
    const activeTemplates = engine.Templates.filter(t => t.IsActive);
    
    // Find templates by category
    const emailTemplates = engine.Templates.filter(t => 
        t.CategoryID === engine.TemplateCategories.find(c => c.Name === 'Email')?.ID
    );
    
    console.log(`Found ${activeTemplates.length} active templates`);
    console.log(`Found ${emailTemplates.length} email templates`);
}
```

### Working with Template Content

```typescript
import { TemplateEngineBase, TemplateEntityExtended } from '@memberjunction/templates-base-types';

async function getTemplateContent(templateName: string, contentType: string) {
    const engine = TemplateEngineBase.Instance;
    await engine.Config();
    
    const template = engine.FindTemplate(templateName);
    if (!template) {
        throw new Error(`Template "${templateName}" not found`);
    }
    
    // Get specific content type
    const content = template.GetHighestPriorityContent(contentType);
    if (!content) {
        throw new Error(`No ${contentType} content found for template "${templateName}"`);
    }
    
    return content.TemplateText;
}
```

### Template Parameter Validation

```typescript
import { TemplateEngineBase } from '@memberjunction/templates-base-types';

async function validateTemplateData(templateName: string, inputData: any) {
    const engine = TemplateEngineBase.Instance;
    await engine.Config();
    
    const template = engine.FindTemplate(templateName);
    if (!template) {
        throw new Error(`Template "${templateName}" not found`);
    }
    
    const validation = template.ValidateTemplateInput(inputData);
    
    if (!validation.Success) {
        // Handle validation errors
        validation.Errors.forEach(error => {
            console.error(`Parameter ${error.Source}: ${error.Message}`);
        });
        throw new Error('Template validation failed');
    }
    
    // Data is valid, proceed with rendering
    return true;
}
```

## Dependencies

This package depends on the following MemberJunction packages:

- `@memberjunction/core` - Core MemberJunction functionality and base classes
- `@memberjunction/core-entities` - Entity definitions for templates, content, and parameters
- `@memberjunction/global` - Global utilities and decorators

## Integration with Other MJ Packages

This package serves as the foundation for:

- **`@memberjunction/templates-engine`** - The full template rendering engine that builds on these base types
- **Custom template extensions** - Third-party extensions can use these types for compatibility

The base types ensure consistent template handling across the entire MemberJunction ecosystem, whether templates are being managed, validated, or rendered.

## Build and Development

```bash
# Build the package
npm run build

# Watch for changes during development
npm run start
```

The package is built using TypeScript and outputs to the `dist` directory. Type definitions are automatically generated during the build process.

## Notes

- This package intentionally has minimal dependencies to ensure it can be used in various environments
- The `TemplateEngineBase` uses the singleton pattern to ensure consistent metadata access across an application
- Template metadata is loaded from the MemberJunction database using the dataset system
- The `@RegisterClass` decorator on `TemplateEntityExtended` ensures proper integration with the MJ entity system

## License

ISC