# Recursive Patterns Demo

This directory contains an example configuration for the NEW recursive patterns feature in MetadataSync.

## Overview

The recursive patterns feature eliminates the need to manually define each nesting level for self-referencing entities like hierarchical organizational structures, category trees, or AI Agent hierarchies.

## Example Configuration

See `recursive-example.json` for a complete example that shows how to configure recursive pulling for AI Agents that reference other AI Agents via ParentID.

### Key Configuration Elements

```json
{
  "entity": "AI Agents",
  "pull": {
    "relatedEntities": {
      "AI Agents": {
        "entity": "AI Agents",
        "foreignKey": "ParentID",
        "recursive": true,        // Enable automatic recursion
        "maxDepth": 5,           // Limit depth to prevent runaway processes
        "filter": "Status = 'Active'",
        "lookupFields": { ... },  // Applied at all levels
        "excludeFields": [ ... ]  // Applied at all levels
      }
    }
  }
}
```

## How It Works

1. **Automatic Detection**: When `recursive: true` is set on a self-referencing entity, the tool automatically creates child configurations
2. **Dynamic Depth**: The tool continues fetching child records until no more children are found or `maxDepth` is reached
3. **Safeguards**: Built-in protection prevents infinite loops and excessive memory usage
4. **Consistent Configuration**: All recursive levels use the same settings for lookups, exclusions, etc.

## Benefits Over Manual Configuration

**Before (Manual - 50+ lines for 3 levels):**
```json
{
  "relatedEntities": {
    "AI Agents": {
      "entity": "AI Agents", 
      "foreignKey": "ParentID",
      "relatedEntities": {
        "AI Agents": {
          "entity": "AI Agents",
          "foreignKey": "ParentID",
          "relatedEntities": {
            "AI Agents": {
              "entity": "AI Agents",
              "foreignKey": "ParentID"
              // And so on...
            }
          }
        }
      }
    }
  }
}
```

**After (Recursive - 6 lines for unlimited levels):**
```json
{
  "relatedEntities": {
    "AI Agents": {
      "entity": "AI Agents",
      "foreignKey": "ParentID", 
      "recursive": true
    }
  }
}
```

## Usage Example

```bash
# Pull AI Agents with recursive hierarchy
mj-sync pull --entity="AI Agents"

# With verbose output to see recursion in action
mj-sync pull --entity="AI Agents" --verbose
```

## Verbose Output Example

When using `--verbose`, you'll see recursion tracking:

```
Processing AI Agents
  ↳ Processing 3 related AI Agents records
    Max depth 5 reached for recursive entity AI Agents at record ABC-123-DEF
    Skipping circular reference for AI Agents with ID: XYZ-789-GHI
  ↳ Processing 2 related AI Agents records (depth 2)
    ↳ Processing 1 related AI Agents records (depth 3)
```

## Performance Considerations

- **Memory Usage**: Each level multiplies the number of records in memory
- **Database Queries**: More levels = more database roundtrips
- **Recommended Limits**: Keep `maxDepth` reasonable (5-10) for production use
- **Filtering**: Use filters to reduce the dataset at each level

## Backward Compatibility

Existing configurations continue to work unchanged. The recursive feature is opt-in via the `recursive: true` flag.