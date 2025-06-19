# MemberJunction Templates System

The MemberJunction Templates system provides a powerful, extensible templating engine built on top of [Nunjucks](https://mozilla.github.io/nunjucks/) that integrates seamlessly with the MJ database architecture. This system enables dynamic content generation, AI-powered template rendering, and modular template composition.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [Core Features](#core-features)
- [Template Naming Conventions](#template-naming-conventions)
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
| `TemplateContentID` | uniqueidentifier | Optional: Specific content reference |
| `Name` | nvarchar(255) | Parameter name |
| `Type` | nvarchar(20) | Scalar, Array, Object, Record, Entity |
| `IsRequired` | bit | Required parameter flag |
| `DefaultValue` | nvarchar(MAX) | Optional default value |
| `EntityID` | uniqueidentifier | For Entity/Record type params |
| `LinkedParameterName` | nvarchar(255) | For Entity filtering |
| `ExtraFilter` | nvarchar(MAX) | Additional Entity constraints |

**Content-Specific Parameters (NEW in v2.52.0)**:
- When `TemplateContentID` is NULL: Parameter applies to all content variations (default)
- When `TemplateContentID` has a value: Parameter applies only to that specific content
- Content-specific parameters override global parameters with the same name

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

// Validate for specific content (NEW in v2.52.0)
const contentValidation = template.ValidateTemplateInput(data, contentId);
```

### Content-Specific Parameters (NEW in v2.52.0)

Templates now support parameters that apply only to specific content variations, enabling more flexible multi-format templates:

```typescript
// Get parameters for a specific content
const contentParams = template.GetParametersForContent(contentId);

// Get only global parameters (that apply to all contents)
const globalParams = template.GetParametersForContent();
```

#### Use Case Example: Marketing Campaign Template

Consider a marketing template with HTML and SMS variations:

**Global Parameters** (apply to all content):
- `recipientName` (required)
- `companyName` (required)
- `campaignCode` (required)

**HTML-Specific Parameters**:
- `heroImageUrl` (required for HTML only)
- `colorScheme` (default: "blue")
- `includeFooter` (default: true)

**SMS-Specific Parameters**:
- `shortLink` (required for SMS only)
- `maxLength` (default: 160)

```typescript
// When rendering HTML content, these params are validated:
// - All global params + HTML-specific params

// When rendering SMS content, these params are validated:
// - All global params + SMS-specific params
```

#### Parameter Precedence

When the same parameter name exists at both global and content-specific levels:
1. Content-specific parameter definition takes precedence
2. This allows overriding requirements, defaults, and types per content
3. The template engine automatically handles the resolution

### Template Caching

The engine automatically caches compiled templates for performance:

```typescript
// Clear template cache if needed
engine.ClearTemplateCache();
```

## Template Naming Conventions

**CRITICAL**: Template names must be unique across the entire system since `FindTemplate()` performs case-insensitive name lookups. Poor naming can lead to conflicts and unexpected behavior.

### Recommended Naming Patterns

#### **Organization.Category.Purpose**
```
"Acme.Email.Header"
"Acme.Email.Footer" 
"Acme.Email.Welcome"
"Acme.Report.MonthlyStatus"
"Global.Shared.Signature"
```

#### **Department.Type.Variant**
```
"Sales.Proposal.Header"
"Sales.Proposal.Footer"
"HR.Onboarding.Welcome"
"Marketing.Campaign.CTA"
```

#### **Simple Descriptive Names**
```
"EMAIL_HEADER"
"EMAIL_FOOTER"
"WELCOME_EMAIL"
"PASSWORD_RESET"
"INVOICE_TEMPLATE"
```

### Naming Guidelines

✅ **DO**:
- Use UPPER_CASE or PascalCase for consistency
- Include content type hints (`EMAIL_`, `SMS_`, `REPORT_`)
- Be specific and descriptive
- Consider team/department ownership
- Document template purposes

❌ **DON'T**:
- Use generic names like "Template1", "Header", "Content"
- Create ambiguous names that could conflict
- Use special characters or spaces
- Make names too long (keep under 50 characters)

### Conflict Prevention

Since template lookup is **case-insensitive** and **global**, consider:

1. **Prefix conventions**: Team or application prefixes
2. **Category usage**: Leverage `CategoryID` for logical grouping
3. **Name registry**: Maintain a shared naming registry for large teams
4. **Validation**: Check for existing names before creating new templates

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

### TemplateEmbed Extension

Enables recursive template embedding for modular template composition.

#### Syntax

```nunjucks
<!-- Basic embedding -->
{% template "EMAIL_HEADER" %}

<!-- With specific content type -->
{% template "EMAIL_FOOTER", type="HTML" %}

<!-- With additional data context -->
{% template "USER_SIGNATURE", data={department: "Sales"} %}
```

#### Features

- **Recursive inclusion**: Templates can embed other templates
- **Content type inheritance**: Embedded templates inherit parent content type by default
- **Cycle detection**: Prevents infinite recursion with clear error messages
- **Data context merging**: Pass additional data to embedded templates
- **Error handling**: Comprehensive validation and meaningful error messages

#### Content Type Resolution Priority

1. **Explicit type parameter**: `{% template "TemplateName", type="HTML" %}`
2. **Current content type**: Inherits from parent template
3. **Highest priority content**: Falls back to best available content in target template

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
- `ValidateTemplateInput(data: any, contentId?: string): ValidationResult` - Validate input parameters
- `GetParametersForContent(contentId?: string): TemplateParamEntity[]` - Get parameters for specific content (NEW in v2.52.0)

### TemplateRenderResult

Result object returned by template rendering operations.

#### Properties

- `Success: boolean` - Indicates if rendering succeeded
- `Output: string` - Rendered template content
- `Message?: string` - Error message if Success is false

## Examples

### Complete Email Template System

This example demonstrates modular template composition with reusable header and footer components.

#### Template: "EMAIL_HEADER" (HTML Content Type)

```nunjucks
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ emailTitle | default("Message from " + companyName) }}</title>
    <style>
        .email-container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
        .header { background-color: #2c3e50; color: white; padding: 20px; text-align: center; }
        .logo { font-size: 24px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo">{{ companyName | default("Company Name") }}</div>
            {% if tagline %}
            <div style="font-size: 14px; margin-top: 5px;">{{ tagline }}</div>
            {% endif %}
        </div>
        <div class="content" style="padding: 20px;">
```

#### Template: "EMAIL_FOOTER" (HTML Content Type)

```nunjucks
        </div>
        <div class="footer" style="background-color: #ecf0f1; padding: 20px; text-align: center; font-size: 12px; color: #7f8c8d;">
            <p>{{ companyName | default("Your Company") }}<br>
            {{ companyAddress | default("123 Business St, City, State 12345") }}</p>
            
            {% if unsubscribeUrl %}
            <p><a href="{{ unsubscribeUrl }}" style="color: #3498db;">Unsubscribe</a> | 
               <a href="{{ preferencesUrl | default('#') }}" style="color: #3498db;">Update Preferences</a></p>
            {% endif %}
            
            <p>&copy; {{ currentYear | default(2024) }} {{ companyName | default("Your Company") }}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
```

#### Template: "WELCOME_EMAIL" (HTML Content Type)

This template demonstrates embedding the header and footer components:

```nunjucks
{% template "EMAIL_HEADER" %}

<h1>Welcome to {{ companyName }}, {{ customerName }}! 🎉</h1>

<p>Thank you for signing up for our {{ serviceType }} service. We're excited to have you on board!</p>

{% AIPrompt %}
Create a personalized welcome message for {{ customerName }} who just signed up 
for our {{ serviceType }} service. Mention their industry: {{ customerIndustry }}.
Keep it professional, warm, and under 100 words.
{% endAIPrompt %}

<div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <h3>What's Next?</h3>
    <ul>
        <li>Complete your profile setup</li>
        <li>Explore our {{ serviceType }} features</li>
        <li>Join our community forum</li>
    </ul>
</div>

<p style="text-align: center;">
    <a href="{{ dashboardUrl }}" style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
        Get Started Now
    </a>
</p>

<p>If you have any questions, feel free to reach out to our support team at {{ supportEmail }}.</p>

<p>Best regards,<br>
The {{ companyName }} Team</p>

{% template "EMAIL_FOOTER" %}
```

#### Usage Example

```typescript
const result = await engine.RenderTemplate(welcomeTemplate, htmlContent, {
    companyName: "MemberJunction",
    tagline: "Powerful Database Solutions",
    customerName: "Sarah Johnson",
    serviceType: "Enterprise Platform",
    customerIndustry: "Healthcare Technology",
    companyAddress: "123 Tech Park Dr, Innovation City, CA 94000",
    supportEmail: "support@memberjunction.com",
    dashboardUrl: "https://app.memberjunction.com/dashboard",
    unsubscribeUrl: "https://memberjunction.com/unsubscribe?token=xyz",
    currentYear: 2024
});
```

### Report Template with Dynamic Sections

```nunjucks
# {{ reportTitle }}

Generated on: {{ currentDate }}

## Summary
{% template "REPORT_SUMMARY", data={metrics: summaryMetrics} %}

## Detailed Analysis
{% for section in reportSections %}
### {{ section.title }}
{% template section.templateName, data=section.data %}
{% endfor %}

{% template "REPORT_FOOTER", type="PlainText" %}
```

### Multi-Format Templates

Templates can support multiple content types for different output channels:

```nunjucks
<!-- Same template with PlainText content type -->
Welcome to {{ companyName }}, {{ customerName }}!

Thank you for signing up for our {{ serviceType }} service.

{% AIPrompt %}
Create a brief welcome message for {{ customerName }} in plain text format.
Keep it under 50 words and professional.
{% endAIPrompt %}

What's Next:
- Complete your profile setup
- Explore our {{ serviceType }} features  
- Join our community forum

Questions? Contact us at {{ supportEmail }}

Best regards,
The {{ companyName }} Team

---
{{ companyName }} | {{ companyAddress }}
```

### Content-Specific Parameters Example

This example shows how to use content-specific parameters for a notification template that supports Email, SMS, and Push formats:

```typescript
// Template: "USER_NOTIFICATION"
// Global Parameters:
// - userName (required)
// - notificationType (required)
// - actionUrl (required)

// Email Content Parameters:
// - emailSubject (required for email)
// - includeHeader (default: true)
// - includeFooter (default: true)
// - brandColor (default: "#3498db")

// SMS Content Parameters:
// - senderName (required for SMS)
// - maxLength (default: 160)

// Push Content Parameters:
// - appIcon (required for push)
// - badge (default: 1)
// - sound (default: "default")

// Usage for Email:
const emailResult = await engine.RenderTemplate(notificationTemplate, emailContent, {
    // Global params
    userName: "John Doe",
    notificationType: "payment_received",
    actionUrl: "https://app.example.com/payments/123",
    // Email-specific params
    emailSubject: "Payment Received - $99.00",
    brandColor: "#27ae60"
});

// Usage for SMS (different required params):
const smsResult = await engine.RenderTemplate(notificationTemplate, smsContent, {
    // Global params
    userName: "John",
    notificationType: "payment_received", 
    actionUrl: "https://app.co/p/123",
    // SMS-specific params
    senderName: "ACMEPAY"
});

// The template engine automatically validates the correct parameters for each content type
```

## Best Practices

### Template Naming and Organization

1. **Follow naming conventions**: Use the patterns outlined in [Template Naming Conventions](#template-naming-conventions)
2. **Prevent conflicts**: Check for existing names before creating new templates
3. **Use prefixes**: Consider team/application prefixes for large organizations
4. **Document purposes**: Maintain clear descriptions for all templates
5. **Organize by category**: Use Template Categories to group related templates
6. **Version control**: Use Priority field to manage template versions

### Content Type Strategy

1. **Always provide PlainText**: Ensure accessibility and fallback options
2. **Consistent naming**: Use standard names (HTML, PlainText, Email, SMS)
3. **Priority ordering**: Higher priority = more preferred version

### Parameter Design

1. **Required vs Optional**: Carefully consider which parameters are truly required
2. **Provide defaults**: Set sensible default values where possible
3. **Clear descriptions**: Document parameter purpose and expected format
4. **Type appropriately**: Use correct parameter types (Scalar, Array, Object, etc.)
5. **Content-Specific Strategy** (NEW in v2.52.0):
   - Use global parameters for data shared across all formats
   - Use content-specific parameters for format-specific needs
   - Consider UI/UX differences between formats (e.g., SMS length limits)
   - Document which parameters apply to which content types

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