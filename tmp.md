# Feature Request: Built-in Actions for Agent Media Management

## Summary

Add built-in actions that allow agents to list, reference, and prune media from their `_pendingMediaReferences` registry during execution. This enables agents to have programmatic control over accumulated media content.

## Background

PR #1748 introduced multi-modal agent output infrastructure, and we've now implemented automatic interception of large binary content (images, etc.) using a placeholder pattern:

1. When actions return large binary data (>10KB), it's automatically intercepted
2. Data is stored in `_pendingMediaReferences` with a unique refId
3. LLM receives lightweight placeholder: `${media:img-xxx}` (~30 tokens vs ~700K tokens)
4. Placeholders are resolved to actual data URIs at the root agent level

**Current limitation:** Agents cannot programmatically interact with their accumulated media registry. They can only use placeholders in their output.

## Proposed Actions

### 1. List Media References
**Action Name:** `List Agent Media`

**Purpose:** Allow agent to see what media has been accumulated during its execution

**Output:**
```json
{
  "mediaReferences": [
    {
      "refId": "img-abc123",
      "modality": "Image",
      "mimeType": "image/png",
      "width": 1024,
      "height": 1024,
      "label": "Generated image 1",
      "sizeBytes": 524288
    }
  ],
  "totalCount": 1,
  "totalSizeBytes": 524288
}
```

**Use case:** Agent can check what images it has generated before deciding whether to generate more, or which ones to include in its output.

### 2. Prune Media References
**Action Name:** `Prune Agent Media`

**Purpose:** Allow agent to remove unwanted media from registry (e.g., failed generations, duplicates, unused content)

**Parameters:**
- `RefIds` (optional): Array of specific refIds to remove
- `KeepLast` (optional): Keep only the last N media items
- `MaxSizeBytes` (optional): Remove oldest items until total size is under threshold

**Use case:** Agent generates multiple image variations, picks the best one, and prunes the rest to keep payload size manageable.

### 3. Get Media Details
**Action Name:** `Get Agent Media Details`

**Purpose:** Get detailed information about a specific media item

**Parameters:**
- `RefId`: The media reference ID

**Output:**
```json
{
  "refId": "img-abc123",
  "modality": "Image",
  "mimeType": "image/png",
  "width": 1024,
  "height": 1024,
  "label": "Generated image 1",
  "sizeBytes": 524288,
  "placeholder": "${media:img-abc123}",
  "dataUri": "data:image/png;base64,..." // Optional: include actual data
}
```

## Implementation Notes

1. These actions would need access to the agent's `_pendingMediaReferences` map
2. Could be implemented as special "intrinsic" actions handled directly by BaseAgent rather than through ActionEngine
3. Alternative: Expose via agent context/state rather than actions

## Priority

Low - The current placeholder pattern works well for most use cases. This enhancement enables more sophisticated media management for agents that generate multiple images or need to optimize payload size.

## Related

- PR #1748: Multi-modal agent outputs and image generation infrastructure
- Commit `6d53185d7`: Placeholder pattern implementation with sub-agent bubbling
