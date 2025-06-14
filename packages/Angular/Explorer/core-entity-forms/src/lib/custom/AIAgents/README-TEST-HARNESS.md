# AI Agent Test Harness

## Overview

The AI Agent Test Harness is a comprehensive developer workbench for testing and debugging AI agents in MemberJunction. It provides a modern chat interface with multi-turn conversation support, message history, and advanced configuration options.

## Features

### 1. Multi-Turn Conversation UI
- Clean, chat-style interface similar to modern AI assistants
- Message history with timestamps and execution metrics
- Visual indicators for streaming responses
- Error handling with detailed error messages

### 2. Message Management
- Full conversation history preserved across turns
- Each message shows role (user/assistant), timestamp, and execution time
- Streaming indicator with cursor animation during response generation
- Scrollable message area for long conversations

### 3. Sidebar Configuration
- **Data Context Tab**: Define variables available during agent execution
- **Template Data Tab**: Set template rendering variables
- **Saved Conversations Tab**: Access and manage saved test sessions

### 4. Conversation Management
- **Save**: Store conversations locally with custom names
- **Load**: Restore previous test sessions
- **Export**: Download conversations as JSON files
- **Import**: Load conversations from JSON files
- **Clear**: Reset the current conversation

### 5. Variable Configuration
- Support for multiple data types: string, number, boolean, object
- Dynamic variable addition/removal
- JSON object support for complex data structures
- Separate contexts for data and template variables

## Usage

### Opening the Test Harness

1. Navigate to any AI Agent record in MemberJunction
2. Click the "Test Harness" button in the header
3. The test harness dialog will open with the selected agent loaded

### Running a Test

1. Type your message in the input area at the bottom
2. (Optional) Configure data context variables in the sidebar
3. Press Enter or click the Send button
4. Watch the response stream in real-time
5. Continue the conversation with follow-up messages

### Managing Variables

1. Click on the Data Context or Template Data tab in the sidebar
2. Add variables by clicking "Add Variable"
3. Set the variable name, type, and value
4. Variables are automatically included in the agent execution context

### Saving and Loading Conversations

1. **To Save**: Click the Save button and enter a name for the conversation
2. **To Load**: Go to the Saved tab and click on a conversation
3. **To Export**: Click Export to download as JSON
4. **To Import**: Click Import and select a JSON file

## Technical Implementation

### Component Structure

- **ai-agent-test-harness.component.ts**: Main component logic
- **ai-agent-test-harness.component.html**: Template with chat UI
- **ai-agent-test-harness.component.css**: Styling for modern chat interface

### Key Features Implementation

1. **Message Threading**: Each message has a unique ID and maintains conversation context
2. **Streaming Simulation**: Currently simulates streaming; ready for GraphQL subscription integration
3. **Local Storage**: Conversations saved to browser localStorage (limited to 50)
4. **Auto-save**: Conversations automatically save after each interaction

### Future Enhancements

1. **Real Streaming**: Integration with GraphQL subscriptions for true streaming
2. **Server-side Storage**: Save conversations to database instead of localStorage
3. **Collaboration**: Share conversations with team members
4. **Analytics**: Track agent performance metrics across conversations
5. **Diff View**: Compare responses across different agent versions

## Keyboard Shortcuts

- **Enter**: Send message
- **Shift+Enter**: New line in message
- **Escape**: Close dialog (when focused)

## Best Practices

1. **Test Incrementally**: Start with simple queries and build complexity
2. **Use Variables**: Define context variables for realistic testing
3. **Save Important Tests**: Save conversations that reveal bugs or edge cases
4. **Export for Sharing**: Use export/import to share test cases with team
5. **Clear Between Tests**: Start fresh when testing different scenarios

## Troubleshooting

### Messages Not Sending
- Ensure the agent is saved and has an ID
- Check that your message is not empty
- Verify the agent is in Active status (for execution)

### Variables Not Working
- Ensure variable names don't contain spaces
- For objects, use valid JSON syntax
- Check the browser console for parsing errors

### Conversations Not Saving
- Check browser localStorage limits
- Try exporting and clearing old conversations
- Ensure browser allows localStorage access