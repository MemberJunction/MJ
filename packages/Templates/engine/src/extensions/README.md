# Nunjucks Template Extensions Development Guide

This document explains how to create custom Nunjucks extensions for the MemberJunction template engine, focusing on the crucial relationship between the `parse()` method's `nodes.CallExtensionAsync()` call and the resulting `run()` method signature.

## Table of Contents
- [Overview](#overview)
- [The Extension Pattern](#the-extension-pattern)
- [CallExtensionAsync Parameter Mapping](#callextensionasync-parameter-mapping)
- [Implementation Examples](#implementation-examples)
- [Best Practices](#best-practices)
- [Common Patterns](#common-patterns)

## Overview

Nunjucks extensions allow you to create custom template tags with complex functionality. The key to understanding extensions lies in how the `parse()` method configures the `run()` method's parameters through the `nodes.CallExtensionAsync()` call.

## The Extension Pattern

All MemberJunction template extensions follow this pattern:

1. **Extend `TemplateExtensionBase`**: Inherit from the base class
2. **Define Tags**: Specify which template tags trigger this extension
3. **Implement `parse()`**: Parse template syntax and return `nodes.CallExtensionAsync()`
4. **Implement `run()`**: Execute the extension logic with callback pattern

## CallExtensionAsync Parameter Mapping

The **critical concept** is that the parameters you pass to `nodes.CallExtensionAsync()` in the `parse()` method directly determine the signature of your `run()` method.

### Basic Signature Pattern
```typescript
nodes.CallExtensionAsync(this, 'run', params, [additional_args])
```

### Parameter Mapping Rules

| CallExtensionAsync Parameters | Resulting run() Method Signature |
|------------------------------|----------------------------------|
| `(this, 'run', params)` | `run(context, body, callBack)` |
| `(this, 'run', params, [body])` | `run(context, params, body, callBack)` |
| `(this, 'run', params, [body, error])` | `run(context, params, body, error, callBack)` |

### Fixed Parameters
- **`context`**: Always the first parameter - Nunjucks template context
- **`callBack`**: Always the last parameter - Async callback function
- **Middle parameters**: Determined by the array passed as the 4th argument to `CallExtensionAsync`

## Implementation Examples

### Example 1: Simple Extension (No Body)
**Template Syntax:** `{% template "TemplateName" %}`

```typescript
// In parse() method
return new nodes.CallExtensionAsync(this, 'run', params);

// Resulting run() signature
public run(context: Context, body: any, callBack: NunjucksCallback) {
    // body parameter exists but will be undefined since no body was parsed
    // Implementation logic here...
}
```

### Example 2: Extension with Body Content
**Template Syntax:** 
```nunjucks
{% AIPrompt model="gpt-4" %}
Generate a greeting message for {{ userName }}
{% endAIPrompt %}
```

```typescript
// In parse() method
const body = parser.parseUntilBlocks('endAIPrompt');
parser.advanceAfterBlockEnd();
return new nodes.CallExtensionAsync(this, 'run', params, [body]);

// Resulting run() signature
public run(context: Context, params: any, body: any, callBack: NunjucksCallback) {
    const prompt = body(); // Call body() to get the rendered content
    // Implementation logic here...
}
```

### Example 3: Extension with Body and Error Handling
```typescript
// In parse() method
const body = parser.parseUntilBlocks('error', 'endCustomTag');
let errorBody = null;
if(parser.skipSymbol('error')) {
    parser.skip(lexer.TOKEN_BLOCK_END);
    errorBody = parser.parseUntilBlocks('endCustomTag');
}
parser.advanceAfterBlockEnd();
return new nodes.CallExtensionAsync(this, 'run', params, [body, errorBody]);

// Resulting run() signature
public run(context: Context, params: any, body: any, errorBody: any, callBack: NunjucksCallback) {
    // Implementation logic here...
}
```

## Best Practices

### 1. Always Use Async Pattern
```typescript
// ✅ Correct - Use CallExtensionAsync for non-blocking operations
return new nodes.CallExtensionAsync(this, 'run', params, [body]);

// ❌ Incorrect - CallExtension blocks template rendering
return new nodes.CallExtension(this, 'run', params, [body]);
```

### 2. Proper Error Handling
```typescript
public run(context: Context, params: any, body: any, callBack: NunjucksCallback) {
    try {
        // Your async operation
        someAsyncOperation()
            .then(result => callBack(null, result))
            .catch(error => {
                LogError(error);
                callBack(error);
            });
    } catch (error) {
        LogError(error);
        callBack(error);
    }
}
```

### 3. Parameter Validation
```typescript
public run(context: Context, params: any, body: any, callBack: NunjucksCallback) {
    // Validate required parameters early
    if (!params.templateName) {
        const error = new Error('Template name is required');
        LogError(error);
        callBack(error);
        return;
    }
    
    // Continue with implementation...
}
```

### 4. Context Preservation
```typescript
// When calling other async operations, preserve the Nunjucks context
const templateEngine = TemplateEngineServer.Instance;
templateEngine.RenderTemplateSimple(templateText, context.ctx)
    .then(result => callBack(null, result.Output))
    .catch(error => callBack(error));
```

## Common Patterns

### Self-Closing Tags
For tags that don't need body content (like `{% template "Name" %}`):
```typescript
public parse(parser: Parser, nodes: Nodes, lexer: Lexer) {
    const tok = parser.nextToken();
    const params = parser.parseSignature(null, true);
    parser.advanceAfterBlockEnd(tok.value);
    
    // No body parsing needed
    return new nodes.CallExtensionAsync(this, 'run', params);
}
```

### Block Tags with Content
For tags that wrap content (like `{% AIPrompt %}...{% endAIPrompt %}`):
```typescript
public parse(parser: Parser, nodes: Nodes, lexer: Lexer) {
    const tok = parser.nextToken();
    const params = parser.parseSignature(null, true);
    parser.advanceAfterBlockEnd(tok.value);
    
    // Parse until closing tag
    const body = parser.parseUntilBlocks('endAIPrompt');
    parser.advanceAfterBlockEnd();
    
    return new nodes.CallExtensionAsync(this, 'run', params, [body]);
}
```

### Multiple Closing Tags
For tags with optional error handling:
```typescript
public parse(parser: Parser, nodes: Nodes, lexer: Lexer) {
    const tok = parser.nextToken();
    const params = parser.parseSignature(null, true);
    parser.advanceAfterBlockEnd(tok.value);
    
    // Parse until error or end tag
    const body = parser.parseUntilBlocks('error', 'endCustomTag');
    let errorBody = null;
    
    if(parser.skipSymbol('error')) {
        parser.skip(lexer.TOKEN_BLOCK_END);
        errorBody = parser.parseUntilBlocks('endCustomTag');
    }
    
    parser.advanceAfterBlockEnd();
    return new nodes.CallExtensionAsync(this, 'run', params, [body, errorBody]);
}
```

## Debugging Tips

### 1. Log Parameter Mapping
```typescript
public run(context: Context, ...args: any[]) {
    console.log('Extension run() called with arguments:', args.length);
    console.log('Arguments:', args.map((arg, i) => `[${i}]: ${typeof arg}`));
    
    // Your implementation...
}
```

### 2. Validate CallExtensionAsync Usage
If your `run()` method isn't receiving the expected parameters:
1. Check the number of parameters passed to `CallExtensionAsync`
2. Verify the order matches your expectations
3. Ensure you're parsing the correct template sections

### 3. Type Safety
```typescript
// Define interfaces for better type safety
interface CustomExtensionParams {
    templateName: string;
    type?: string;
    data?: any;
}

public run(context: Context, params: CustomExtensionParams, body: any, callBack: NunjucksCallback) {
    // Now you have type safety on params
}
```

## Conclusion

The key to successful Nunjucks extension development is understanding that:

1. **`nodes.CallExtensionAsync()` parameters directly map to `run()` method parameters**
2. **The order and number of parameters in the array (4th argument) determines the middle parameters**
3. **Always start with `context` and end with `callBack`**
4. **Use proper async patterns with Promise chains, not async/await in the run method**

This pattern allows for flexible and powerful template extensions while maintaining the non-blocking nature of the Nunjucks template engine.