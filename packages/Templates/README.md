# MemberJunction Templates System

The MemberJunction Templates system provides a powerful, extensible templating engine built on top of [Nunjucks](https://mozilla.github.io/nunjucks/) that integrates seamlessly with the MJ database architecture. This system enables dynamic content generation, AI-powered template rendering, and modular template composition.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [Core Features](#core-features)
- [Template Extensions](#template-extensions)
- [Built-in Extensions](#built-in-extensions)
- [Creating Custom Extensions](#creating-custom-extensions)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Overview

The Templates system consists of two main packages:

- **`@memberjunction/templates-base-types`**: Core types, base classes, and metadata management
- **`@memberjunction/templates-engine`**: Template rendering engine with Nunjucks integration and extensions

### Key Capabilities

- 🗃️ **Database-driven templates** with metadata management
- 🎯 **Multiple content types** per template (HTML, PlainText, Email, etc.)
- ⚡ **Template caching** for optimal performance
- 🔧 **Parameter validation** with typed input requirements
- 🤖 **AI integration** for dynamic content generation
- 🧩 **Extensible architecture** for custom functionality
- 🔄 **Template embedding** (recursive template inclusion)

## Architecture

```
┌─────────────────────┐
│   Template Engine   │ 
├─────────────────────┤
│   Nunjucks Core     │ ← Base templating engine
├─────────────────────┤
│   MJ Extensions     │ ← Custom extensions (AI, embedding, etc.)
├─────────────────────┤
│   Entity System     │ ← Database integration
└─────────────────────┘
```

### Component Structure

```
packages/Templates/
├── base-types/           # Core types and base classes
│   ├── TemplateEngineBase.ts       # Metadata management
│   ├── TemplateEntityExtended.ts   # Enhanced template entity
│   └── types.ts                    # Core type definitions
└── engine/              # Rendering engine and extensions
    ├── TemplateEngine.ts           # Main rendering engine
    └── extensions/                 # Template extensions
        ├── TemplateExtensionBase.ts    # Extension base class
        └── AIPrompt.extension.ts       # AI integration extension
```

## Database Schema

The Templates system uses four core database entities:

### Templates
The main template definition containing metadata and configuration.

| Field | Type | Description |
|-------|------|-------------|
| `ID` | uniqueidentifier | Primary key |
| `Name` | nvarchar(255) | Template name (used for lookups) |
| `Description` | nvarchar(MAX) | Template description |
| `CategoryID` | uniqueidentifier | Optional categorization |
| `UserPrompt` | nvarchar(MAX) | AI prompt for content generation |
| `UserID` | uniqueidentifier | Template owner |
| `IsActive` | bit | Enable/disable flag |
| `ActiveAt` | datetime | Optional activation date |
| `DisabledAt` | datetime | Optional expiration date |

### Template Contents
Multiple content variations per template, each with a specific type and priority.

| Field | Type | Description |
|-------|------|-------------|
| `ID` | uniqueidentifier | Primary key |
| `TemplateID` | uniqueidentifier | Parent template reference |
| `TypeID` | uniqueidentifier | Content type reference |
| `TemplateText` | nvarchar(MAX) | Actual template content (Nunjucks) |
| `Priority` | int | Priority for content selection |
| `IsActive` | bit | Enable/disable flag |

### Template Content Types
Defines available content output formats.

| Field | Type | Description |
|-------|------|-------------|
| `ID` | uniqueidentifier | Primary key |
| `Name` | nvarchar(255) | Type name (HTML, PlainText, Email, etc.) |
| `Description` | nvarchar(MAX) | Type description |
| `CodeType` | nvarchar(25) | Language/format (Nunjucks, HTML, JSON, etc.) |

### Template Params
Parameter definitions for template input validation and documentation.

| Field | Type | Description |
|-------|------|-------------|
| `ID` | uniqueidentifier | Primary key |
| `TemplateID` | uniqueidentifier | Parent template reference |
| `Name` | nvarchar(255) | Parameter name |
| `Type` | nvarchar(20) | Scalar, Array, Object, Record, Entity |
| `IsRequired` | bit | Required parameter flag |
| `DefaultValue` | nvarchar(MAX) | Optional default value |
| `EntityID` | uniqueidentifier | For Entity/Record type params |
| `LinkedParameterName` | nvarchar(255) | For Entity filtering |
| `ExtraFilter` | nvarchar(MAX) | Additional Entity constraints |

## Getting Started

### Installation

```bash
npm install @memberjunction/templates-base-types @memberjunction/templates-engine
```

### Basic Usage

```typescript
import { TemplateEngineServer } from '@memberjunction/templates-engine';
import { UserInfo } from '@memberjunction/core';

// Initialize the template engine
const engine = TemplateEngineServer.Instance;
await engine.Config(false, contextUser);

// Find a template by name
const template = engine.FindTemplate('WelcomeEmail');

// Get the HTML content variation
const htmlContent = template.GetContentByType('HTML')[0];

// Render the template with data
const result = await engine.RenderTemplate(template, htmlContent, {
    userName: 'John Doe',
    companyName: 'Acme Corp'
});

if (result.Success) {
    console.log(result.Output);
} else {
    console.error(result.Message);
}
```

### Simple Template Rendering

For ad-hoc template rendering without database storage:

```typescript
const result = await engine.RenderTemplateSimple(
    'Hello {{ userName }}, welcome to {{ companyName }}!',
    { userName: 'John', companyName: 'MJ Corp' }
);
```

## Core Features

### Content Type Management

Templates support multiple content variations for different output formats:

```typescript
// Get specific content type
const htmlContent = template.GetContentByType('HTML');
const textContent = template.GetContentByType('PlainText');

// Get highest priority content (any type)
const primaryContent = template.GetHighestPriorityContent();

// Get highest priority content of specific type
const primaryHtml = template.GetHighestPriorityContent('HTML');
```

### Parameter Validation

Templates automatically validate input parameters based on their definitions:

```typescript
const validationResult = template.ValidateTemplateInput(data);
if (!validationResult.Success) {
    console.log('Validation errors:', validationResult.Errors);
}
```

### Template Caching

The engine automatically caches compiled templates for performance:

```typescript
// Clear template cache if needed
engine.ClearTemplateCache();
```

## Template Extensions

Extensions allow you to add custom functionality to the Nunjucks templating engine. They are implemented as classes that extend `TemplateExtensionBase` and are automatically registered with the template engine.

### Extension Lifecycle

1. **Registration**: Extensions are registered via `@RegisterClass(TemplateExtensionBase, 'ExtensionName')`
2. **Initialization**: Extensions are instantiated with user context during engine setup
3. **Parsing**: The `parse()` method handles template syntax parsing
4. **Execution**: The `run()` method performs the actual extension logic

## Built-in Extensions

### AIPrompt Extension

Enables AI-powered content generation within templates using various LLM providers.

#### Syntax

```nunjucks
{% AIPrompt %}
Generate a personalized greeting for {{ userName }} who works at {{ companyName }}.
Make it professional but warm.
{% endAIPrompt %}
```

#### With Configuration

```nunjucks
{% AIPrompt %}
<!--!!
{
    "AIModel": "gpt-4", 
    "AllowFormatting": true
}
!!-->
Create a bulleted list of benefits for {{ productName }}:
- Feature 1: {{ feature1 }}
- Feature 2: {{ feature2 }}
{% endAIPrompt %}
```

#### Configuration Options

- `AIModel`: Specific AI model to use (defaults to highest power available)
- `AllowFormatting`: Allow HTML/Markdown formatting in AI responses (default: false)

### Template Extension (Planned)

Enables recursive template embedding for modular template composition.

#### Syntax

```nunjucks
<!-- Basic embedding -->
{% template "HeaderTemplate" %}

<!-- With specific content type -->
{% template "FooterTemplate", type="HTML" %}

<!-- With additional data context -->
{% template "SignatureTemplate", data={department: "Sales"} %}
```

## Creating Custom Extensions

### Step 1: Create Extension Class

```typescript
import { TemplateExtensionBase, NunjucksCallback } from '@memberjunction/templates-engine';
import { RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';

@RegisterClass(TemplateExtensionBase, 'MyCustomExtension')
export class MyCustomExtension extends TemplateExtensionBase {
    constructor(contextUser: UserInfo) {
        super(contextUser);
        this.tags = ['MyTag']; // Define template tags that trigger this extension
    }

    public parse(parser: any, nodes: any, lexer: any) {
        // Parse template syntax and extract parameters
        const tok = parser.nextToken();
        const params = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);

        // Parse template body content
        const body = parser.parseUntilBlocks('endMyTag');
        parser.advanceAfterBlockEnd();

        // Return async call node
        return new nodes.CallExtensionAsync(this, 'run', params, [body]);
    }

    public run(context: any, body: any, errorBody: any, params: any, callback: NunjucksCallback) {
        try {
            // Process the template content
            const content = body();
            
            // Perform your custom logic here
            const result = this.processContent(content, params);
            
            // Return result via callback
            callback(null, result);
        } catch (error) {
            callback(error);
        }
    }

    private processContent(content: string, params: any): string {
        // Implement your custom processing logic
        return content.toUpperCase(); // Example transformation
    }
}
```

### Step 2: Register Extension

Extensions are automatically discovered and registered when the module is loaded:

```typescript
// In your extension file
export function LoadMyCustomExtension() {
    // This function ensures the extension class isn't tree-shaken
}
```

```typescript
// In your main application
import { LoadMyCustomExtension } from './path/to/my-extension';
LoadMyCustomExtension(); // Ensure extension is loaded
```

### Step 3: Use in Templates

```nunjucks
{% MyTag param1="value1", param2="value2" %}
Content to be processed by the extension
{% endMyTag %}
```

## API Reference

### TemplateEngineServer

Main template rendering engine.

#### Methods

- `Config(forceRefresh?: boolean, contextUser?: UserInfo)` - Load template metadata
- `FindTemplate(templateName: string): TemplateEntityExtended` - Find template by name
- `RenderTemplate(template, content, data, skipValidation?)` - Render template with validation
- `RenderTemplateSimple(templateText: string, data: any)` - Render raw template string
- `ClearTemplateCache()` - Clear compiled template cache

### TemplateEntityExtended

Enhanced template entity with content and parameter management.

#### Methods

- `GetContentByType(type: string): TemplateContentEntity[]` - Get content by type
- `GetHighestPriorityContent(type?: string): TemplateContentEntity` - Get primary content
- `ValidateTemplateInput(data: any): ValidationResult` - Validate input parameters

### TemplateRenderResult

Result object returned by template rendering operations.

#### Properties

- `Success: boolean` - Indicates if rendering succeeded
- `Output: string` - Rendered template content
- `Message?: string` - Error message if Success is false

## Examples

### Email Template with AI Personalization

```nunjucks
<!DOCTYPE html>
<html>
<head>
    <title>Welcome to {{ companyName }}</title>
</head>
<body>
    <h1>Welcome {{ customerName }}!</h1>
    
    <p>{% AIPrompt %}
    Create a personalized welcome message for {{ customerName }} who just signed up 
    for our {{ serviceType }} service. Mention their industry: {{ customerIndustry }}.
    Keep it professional and under 100 words.
    {% endAIPrompt %}</p>
    
    <p>Best regards,<br>
    The {{ companyName }} Team</p>
</body>
</html>
```

### Modular Template Composition

```nunjucks
<!-- Main email template -->
{% template "EmailHeader" %}

<div class="content">
    <h1>{{ title }}</h1>
    
    {% template "UserGreeting", data={userName: customerName} %}
    
    {{ mainContent }}
    
    {% template "CallToAction", type="HTML" %}
</div>

{% template "EmailFooter" %}
```

### Report Template with Dynamic Sections

```nunjucks
# {{ reportTitle }}

Generated on: {{ currentDate }}

## Summary
{% template "ReportSummary", data={metrics: summaryMetrics} %}

## Detailed Analysis
{% for section in reportSections %}
### {{ section.title }}
{% template section.templateName, data=section.data %}
{% endfor %}

{% template "ReportFooter", type="PlainText" %}
```

## Best Practices

### Template Organization

1. **Use descriptive names**: Template names should clearly indicate their purpose
2. **Organize by category**: Use Template Categories to group related templates
3. **Version control**: Use Priority field to manage template versions

### Content Type Strategy

1. **Always provide PlainText**: Ensure accessibility and fallback options
2. **Consistent naming**: Use standard names (HTML, PlainText, Email, SMS)
3. **Priority ordering**: Higher priority = more preferred version

### Parameter Design

1. **Required vs Optional**: Carefully consider which parameters are truly required
2. **Provide defaults**: Set sensible default values where possible
3. **Clear descriptions**: Document parameter purpose and expected format
4. **Type appropriately**: Use correct parameter types (Scalar, Array, Object, etc.)

### Performance Optimization

1. **Cache templates**: Let the engine cache compiled templates
2. **Minimize complexity**: Keep template logic simple, move complex logic to extensions
3. **Batch operations**: Process multiple templates together when possible

### Extension Development

1. **Single responsibility**: Each extension should have one clear purpose
2. **Error handling**: Always handle errors gracefully with meaningful messages
3. **Async support**: Use async patterns for I/O operations
4. **Context awareness**: Leverage the UserInfo context for permissions and customization

### Security Considerations

1. **Input validation**: Always validate template parameters
2. **Sanitize output**: Be careful with user-generated content in templates
3. **Permission checks**: Ensure users can only access authorized templates
4. **AI content review**: Consider approval workflows for AI-generated content

---

For more information about the MemberJunction ecosystem, visit the [main documentation](../../README.md).