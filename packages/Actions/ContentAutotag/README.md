# @memberjunction/actions-content-autotag

Action classes that execute content autotagging and vectorization operations within the MemberJunction framework.

## Overview

The `@memberjunction/actions-content-autotag` package provides an action class that combines content autotagging and vectorization capabilities. It automates the process of tagging content from various sources (local file system, RSS feeds, and websites) and then optionally vectorizing the tagged content for use in AI/ML applications.

## Purpose

This package serves as a bridge between MemberJunction's content autotagging system and the action framework, allowing you to:

- Automatically tag content from multiple sources (file system, RSS feeds, websites)
- Vectorize tagged content for semantic search and AI applications
- Execute both operations through a single, configurable action
- Integrate content processing into automated workflows

## Installation

```bash
npm install @memberjunction/actions-content-autotag
```

## Usage

### Basic Usage

The package exports the `AutotagAndVectorizeContentAction` class, which can be executed through the MemberJunction action framework:

```typescript
import { AutotagAndVectorizeContentAction } from '@memberjunction/actions-content-autotag';
import { RunActionParams } from '@memberjunction/actions-base';

// Configure the action parameters
const actionParams: RunActionParams = {
    ActionName: 'Autotag And Vectorize Content',
    ContextUser: userInfo, // Your UserInfo instance
    Params: [
        {
            Name: 'Autotag',
            Value: 1  // Set to 1 to enable autotagging
        },
        {
            Name: 'Vectorize',
            Value: 1  // Set to 1 to enable vectorization
        },
        {
            Name: 'EntityNames',
            Value: 'Documents,Articles,BlogPosts'  // Comma-separated list of entities to vectorize
        }
    ]
};

// Execute the action
const action = new AutotagAndVectorizeContentAction();
const result = await action.RunAction(actionParams);

if (result.Success) {
    console.log('Content autotagging and vectorization completed successfully');
} else {
    console.error('Action failed:', result.Message);
}
```

### Registration with Action Framework

The action is automatically registered with the MemberJunction action framework using the `@RegisterClass` decorator. It can be invoked by name:

```typescript
import { ActionEngine } from '@memberjunction/actions';

const actionEngine = new ActionEngine();
const result = await actionEngine.RunAction({
    ActionName: 'Autotag And Vectorize Content',
    ContextUser: userInfo,
    Params: [
        { Name: 'Autotag', Value: 1 },
        { Name: 'Vectorize', Value: 1 },
        { Name: 'EntityNames', Value: 'Documents' }
    ]
});
```

## API Documentation

### AutotagAndVectorizeContentAction

The main action class that performs content autotagging and vectorization.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `Autotag` | `number` | Yes | Set to `1` to enable autotagging, `0` to disable |
| `Vectorize` | `number` | Yes | Set to `1` to enable vectorization, `0` to disable |
| `EntityNames` | `string` | No* | Comma-separated list of entity names to vectorize (*Required if `Vectorize` is `1`) |

#### Return Value

Returns an `ActionResultSimple` object:

```typescript
interface ActionResultSimple {
    Success: boolean;
    Message?: string;
    ResultCode: string;
}
```

- `Success`: `true` if the action completed successfully
- `Message`: Error message if the action failed
- `ResultCode`: `"SUCCESS"` or `"FAILED"`

### LoadAutotagAndVectorizeContentAction

A utility function that ensures the action class is included in the final bundle:

```typescript
import { LoadAutotagAndVectorizeContentAction } from '@memberjunction/actions-content-autotag';

// Call this function during application initialization
LoadAutotagAndVectorizeContentAction();
```

## How It Works

1. **Autotagging Phase**: When enabled, the action executes three autotagging operations in sequence:
   - `AutotagLocalFileSystem`: Processes files from configured local directories
   - `AutotagRSSFeed`: Processes content from configured RSS feeds
   - `AutotagWebsite`: Processes content from configured websites

2. **Vectorization Phase**: When enabled, the action:
   - Inherits functionality from `VectorizeEntityAction`
   - Processes the specified entities from the `EntityNames` parameter
   - Creates vector embeddings for the content using configured AI models

## Dependencies

This package depends on several MemberJunction packages:

- `@memberjunction/global`: Core global utilities and registration system
- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/core-entities`: Entity definitions and management
- `@memberjunction/actions`: Base action framework
- `@memberjunction/core-actions`: Core action implementations including `VectorizeEntityAction`
- `@memberjunction/content-autotagging`: Content autotagging implementations

## Configuration

The autotagging sources (file paths, RSS feeds, websites) are configured through the respective autotagging classes. Refer to the `@memberjunction/content-autotagging` package documentation for detailed configuration options.

## Error Handling

The action implements comprehensive error handling:

- Missing required parameters throw an error before processing begins
- Any errors during autotagging or vectorization are caught and returned in the result
- The action returns a failed result with the error message rather than throwing exceptions

## Integration with MemberJunction

This action integrates seamlessly with:

- **Action Framework**: Registered as a named action that can be invoked programmatically or through workflows
- **Entity System**: Works with MemberJunction entities for vectorization
- **AI/Vector System**: Leverages the MemberJunction AI vector synchronization for embedding generation
- **User Context**: Respects user permissions and context throughout execution

## Best Practices

1. **Parameter Validation**: Always provide both `Autotag` and `Vectorize` parameters, even if setting one to `0`
2. **Entity Selection**: Only specify entities in `EntityNames` that have been configured for vectorization
3. **Performance**: Consider the volume of content when running both operations together
4. **Monitoring**: Check console logs for progress updates during execution
5. **Error Recovery**: Implement retry logic for failed operations in production environments

## Examples

### Autotag Only

```typescript
const result = await action.RunAction({
    ActionName: 'Autotag And Vectorize Content',
    ContextUser: userInfo,
    Params: [
        { Name: 'Autotag', Value: 1 },
        { Name: 'Vectorize', Value: 0 }
    ]
});
```

### Vectorize Only

```typescript
const result = await action.RunAction({
    ActionName: 'Autotag And Vectorize Content',
    ContextUser: userInfo,
    Params: [
        { Name: 'Autotag', Value: 0 },
        { Name: 'Vectorize', Value: 1 },
        { Name: 'EntityNames', Value: 'Documents,KnowledgeBase' }
    ]
});
```

### Full Pipeline

```typescript
const result = await action.RunAction({
    ActionName: 'Autotag And Vectorize Content',
    ContextUser: userInfo,
    Params: [
        { Name: 'Autotag', Value: 1 },
        { Name: 'Vectorize', Value: 1 },
        { Name: 'EntityNames', Value: 'Documents,Articles,BlogPosts,KnowledgeBase' }
    ]
});
```

## License

ISC