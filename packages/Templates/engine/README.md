# @memberjunction/templates

The `@memberjunction/templates` library provides a powerful templating engine built on Nunjucks with MemberJunction-specific extensions for dynamic content generation, AI-powered prompts, and recursive template embedding.

## Overview

This package serves as the core templating engine for MemberJunction applications, offering:

- **Nunjucks-based templating** with full syntax support
- **Template management** with metadata integration
- **Custom extensions** for AI prompts and template embedding
- **Type-safe interfaces** for template rendering
- **Caching and performance optimization**
- **Async rendering support**

## Installation

```bash
npm install @memberjunction/templates
```

## Key Features

### 1. Template Engine

- Manages template metadata and caching
- Provides both metadata-based and simple rendering APIs
- Integrates with MemberJunction's entity system
- Supports template validation and parameter checking

### 2. AI Prompt Extension

- Embeds AI-generated content directly in templates
- Supports multiple AI models (OpenAI, Groq, etc.)
- Configurable formatting options
- Seamless integration with MemberJunction's AI Engine

### 3. Template Embed Extension

- Recursive template inclusion with cycle detection
- Content type inheritance and fallbacks
- Data context passing and merging
- Error handling for missing templates

## Usage

### Basic Template Rendering

```typescript
import { TemplateEngineServer } from '@memberjunction/templates';
import { UserInfo } from '@memberjunction/core';

// Get the template engine instance
const templateEngine = TemplateEngineServer.Instance;

// Configure the engine (usually done once at startup)
await templateEngine.Config(false, contextUser);

// Simple rendering without metadata
const result = await templateEngine.RenderTemplateSimple(
    'Hello {{ name }}! Welcome to {{ company }}.',
    { name: 'John', company: 'Acme Corp' }
);

if (result.Success) {
    console.log(result.Output); // "Hello John! Welcome to Acme Corp."
}
```

### Rendering with Template Metadata

```typescript
import { TemplateEngineServer } from '@memberjunction/templates';
import { TemplateContentEntity } from '@memberjunction/core-entities';

// Assume you have loaded a template entity and its content
const templateEntity = await templateEngine.GetTemplateByName('WelcomeEmail');
const templateContent = templateEntity.GetHighestPriorityContent();

// Render with validation
const result = await templateEngine.RenderTemplate(
    templateEntity,
    templateContent,
    {
        userName: 'John Doe',
        accountType: 'Premium',
        signupDate: new Date()
    },
    false // SkipValidation = false
);

if (!result.Success) {
    console.error('Template rendering failed:', result.Message);
}
```

### Using the AI Prompt Extension

```typescript
// In your template:
const templateText = `
Dear {{ userName }},

{% AIPrompt AIModel="gpt-4", AllowFormatting=false %}
Generate a personalized welcome message for a new {{ accountType }} customer 
named {{ userName }} who just signed up for our service. Make it warm and 
professional, highlighting the benefits of their account type.
{% endAIPrompt %}

Best regards,
The Team
`;

const result = await templateEngine.RenderTemplateSimple(templateText, {
    userName: 'Sarah',
    accountType: 'Enterprise'
});
```

### Using the Template Embed Extension

```typescript
// Main template
const mainTemplate = `
{% template "Header", type="HTML" %}

<div class="content">
    <h1>Welcome {{ user.name }}</h1>
    {% template "UserProfile", data={showDetails: true} %}
</div>

{% template "Footer" %}
`;

// The embedded templates will be loaded from the template metadata
// and rendered with the appropriate content type and data context
```

## API Reference

### TemplateEngineServer

The main template engine class that handles all template operations.

#### Methods

##### `Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>`

Configures the template engine and loads template metadata.

##### `RenderTemplate(templateEntity: TemplateEntityExtended, templateContent: TemplateContentEntity, data: any, SkipValidation?: boolean): Promise<TemplateRenderResult>`

Renders a template using metadata entities with optional validation.

##### `RenderTemplateSimple(templateText: string, data: any): Promise<TemplateRenderResult>`

Renders a template string without metadata integration.

##### `GetTemplateByName(templateName: string): TemplateEntityExtended | null`

Retrieves a template entity by its name.

##### `GetTemplateByID(templateID: string): TemplateEntityExtended | null`

Retrieves a template entity by its ID.

##### `ClearTemplateCache(): void`

Clears the internal template cache.

### TemplateRenderResult

```typescript
interface TemplateRenderResult {
    Success: boolean;     // Whether rendering succeeded
    Output: string;       // The rendered output (null if failed)
    Message?: string;     // Error message (only when Success=false)
}
```

### Extension Configuration

#### AIPrompt Extension Parameters

- `AIModel` (optional): Specific AI model to use (e.g., "gpt-4", "claude-3")
- `AllowFormatting` (optional): Whether to allow formatted output (HTML, Markdown, etc.)

#### Template Embed Extension Parameters

- First parameter: Template name (required)
- `type` (optional): Specific content type to use
- `data` (optional): Additional data to pass to the embedded template

## Template Extension Development

To create custom template extensions:

```typescript
import { TemplateExtensionBase, RegisterClass } from '@memberjunction/templates';

@RegisterClass(TemplateExtensionBase, 'MyExtension')
export class MyExtension extends TemplateExtensionBase {
    constructor(contextUser: UserInfo) {
        super(contextUser);
        this.tags = ['myTag'];
    }
    
    public parse(parser: Parser, nodes: Nodes, lexer: Lexer) {
        const tok = parser.nextToken();
        const params = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);
        
        const body = parser.parseUntilBlocks('endMyTag');
        parser.advanceAfterBlockEnd();
        
        return new nodes.CallExtensionAsync(this, 'run', params, [body]);
    }
    
    public run(context: Context, params: any, body: any, callBack: NunjucksCallback) {
        // Your extension logic here
        try {
            const content = body();
            // Process content...
            callBack(null, processedContent);
        } catch (error) {
            callBack(error);
        }
    }
}
```

## Dependencies

- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/templates-base-types`: Base types and interfaces
- `@memberjunction/ai`: AI integration interfaces
- `@memberjunction/aiengine`: AI engine implementation
- `@memberjunction/ai-groq`: Groq AI provider
- `@memberjunction/core-entities`: Entity definitions
- `@memberjunction/global`: Global utilities
- `nunjucks`: Template engine

## Integration with MemberJunction

This package integrates seamlessly with other MemberJunction packages:

- **Entity System**: Templates are stored as entities with full metadata support
- **AI Engine**: Direct integration for AI-powered content generation
- **User Context**: Templates respect user permissions and context
- **Metadata Provider**: Flexible metadata loading strategies

## Configuration

The template engine uses the MemberJunction configuration system. Key configuration options:

- Template caching strategies
- Default AI models for prompts
- Extension registration
- Nunjucks environment settings

## Performance Considerations

- Templates are cached after first compilation
- Use `ClearTemplateCache()` when templates are updated
- AI prompts are processed asynchronously
- Template embedding includes cycle detection

## Error Handling

All rendering methods return a `TemplateRenderResult` object:

```typescript
const result = await templateEngine.RenderTemplateSimple(template, data);

if (!result.Success) {
    console.error('Rendering failed:', result.Message);
    // Handle error appropriately
} else {
    // Use result.Output
}
```

## Best Practices

1. **Always check rendering results** for success before using output
2. **Configure the engine once** at application startup
3. **Use template validation** for user-provided data
4. **Clear cache** when templates are modified
5. **Handle AI failures gracefully** with fallback content
6. **Avoid deep template nesting** to prevent performance issues

## License

ISC - See LICENSE file for details.

## Support

For issues, questions, or contributions, please visit [MemberJunction.com](https://memberjunction.com) or contact the development team.