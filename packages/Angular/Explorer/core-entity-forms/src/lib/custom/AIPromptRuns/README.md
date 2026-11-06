# AI Prompt Run Form Component Updates

## Overview
The AI Prompt Run form has been updated to provide better organization and visualization of input messages data. The main changes include:

1. **Renamed "Input Messages" to "Input"** - The main panel is now simply called "Input"
2. **Nested Sub-Panels** - Within the Input panel, there are now three nested sub-panels using expansion panels:
   - **Messages** - Displays chat messages with filtering capabilities
   - **Data** - Shows the data object from the input JSON
   - **Raw** - Shows the complete raw JSON
3. **Enhanced UI** - Sub-expansion panels have different colors for visual hierarchy

## New ChatMessage Viewer Component

A new component `ChatMessageViewerComponent` has been created to visualize chat messages from the AI prompt run.

### Features:
- **Combined Toolbar**: Navigation dropdown and filter controls in a single toolbar
- **Role-based Filtering**: Three checkboxes allow filtering by message role (System, User, Assistant) - labels simplified to just role names
- **Visual Indicators**: Each role has its own icon and color:
  - System: Blue cog icon
  - User: Green user icon
  - Assistant: Purple robot icon
- **Content Statistics**: Each message header shows character count and approximate token count (~1.25 tokens per word)
- **Copy Button**: Each message has a copy button to easily copy content to clipboard
- **Collapsible Messages**: Each message can be expanded/collapsed
- **Syntax Highlighting**: Message content is displayed with appropriate syntax highlighting using the code editor
- **Content Type Support**: Handles string content, ChatMessageContentBlock arrays, and complex content objects with text/json properties
- **Sequence Numbers**: Messages display sequence numbers (#1, #2, etc.) for easy reference
- **Navigation Dropdown**: Quick jump dropdown to navigate directly to any message - syncs with selected message
- **Increased Height**: Viewer height increased by 50% (from 500px to 750px) for better visibility

### Usage:
```html
<mj-chat-message-viewer [messages]="chatMessages"></mj-chat-message-viewer>
```

## Template Data Capture Note Component

`PromptRunDataCaptureNoteComponent` is the first item in the **Data** sub-panel. It tells the user which template data the run stored, by capture mode:

| `dataCapture` | The note shows |
|---|---|
| not set (runs saved before capture modes) | nothing |
| `None` | "Template data was not stored for this run (capture: None)." and a table of input, key and size, largest first. When the shape lists only the largest keys, a notice gives the total key count. |
| `Referenced` | "Only the template data keys the prompt's templates read were stored (capture: Referenced)." |
| `Full` with a `dataCaptureNote` | "All template data was stored (capture: Full). " and the note |
| `Full` without a note | nothing |

For a `None` run, the Data sub-panel shows this note instead of "No data object found".

### Usage:
```html
<mj-prompt-run-data-capture-note [DataCapture]="DataCapture" [DataShape]="DataShape" [DataCaptureNote]="DataCaptureNote" />
```

## Data Structure
The component expects the input messages to have this structure:
```json
{
  "dataCapture": "None" | "Referenced" | "Full",
  "dataCaptureNote": "string",   // only when a Referenced run stored Full
  "dataShape": {                 // None mode: key sizes, never values
    "data": { "keyCount": 2, "totalBytes": 419840, "keys": { "compositionContext": 266240, "componentCatalog": 153600 } }
  },
  "messages": [
    {
      "role": "system" | "user" | "assistant",
      "content": "string" | ChatMessageContentBlock[] | {
        "text": "string",
        "json": object
      }
    }
  ],
  "data": {
    // Referenced and Full modes: the data object (Referenced keeps only the keys the templates read)
  }
}
```

Runs saved before capture modes have no `dataCapture`, `dataShape` or `dataCaptureNote`.

### Complex Content Example:
```json
{
  "role": "user",
  "content": {
    "text": "Sub-agent completed successfully:",
    "json": {
      "agentName": "Skip: Technical Product Manager",
      "subAgentName": "Skip: Software Architect",
      "success": true
    }
  }
}
```

## UI Improvements
- Messages panel is expanded by default
- Data and Raw panels are collapsed by default (Data is often empty)
- Nested panels have subtle visual hierarchy with different colors
- Empty states are handled gracefully
- Copy buttons are available for individual messages and JSON data
- Character and token counts provide content size at a glance

## Technical Implementation
- Uses Angular's modern control flow syntax (@if, @for)
- Leverages existing `mj-code-editor` component for content display
- Follows MemberJunction's coding standards
- Properly handles error cases and empty data