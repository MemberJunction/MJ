# @memberjunction/ng-ai-test-harness

A beautiful, reusable Angular component for testing AI agents, prompts, and actions in MemberJunction applications.

## Overview

The AI Test Harness provides a comprehensive testing interface supporting three modes:
- **Agent Mode**: Test AI agents with conversational inputs
- **Prompt Mode**: Test AI prompts with user messages
- **Action Mode**: Test actions with parameter inputs

## Features

- 🎨 Beautiful, modern UI with smooth animations
- 🔄 Three testing modes with easy switching
- ⚙️ Advanced settings (temperature, max tokens, streaming)
- 📊 Execution history tracking
- 💬 Real-time streaming responses
- 💰 Token usage and cost tracking
- 🔌 Dialog service for programmatic access
- 🎯 TypeScript support with full type safety

## Installation

```bash
npm install @memberjunction/ng-ai-test-harness
```

## Usage

### Module Import

```typescript
import { AITestHarnessModule } from '@memberjunction/ng-ai-test-harness';

@NgModule({
  imports: [
    AITestHarnessModule,
    // ... other imports
  ]
})
export class YourModule { }
```

### Component Usage

#### Embedded Mode

```html
<mj-ai-test-harness 
  [config]="testConfig"
  [embedded]="true"
  (executionComplete)="onTestComplete($event)"
  (modeChanged)="onModeChanged($event)">
</mj-ai-test-harness>
```

```typescript
testConfig: TestHarnessConfig = {
  mode: 'agent',
  entityId: 'agent-id-here',
  showHistory: true,
  showAdvancedOptions: false,
  theme: 'light',
  maxHistoryItems: 10
};

onTestComplete(result: TestExecutionResult) {
  console.log('Test completed:', result);
}
```

#### Dialog Mode

```typescript
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';

constructor(private testHarness: AITestHarnessDialogService) {}

// Test an agent
testAgent() {
  this.testHarness.openForAgent('agent-id').subscribe(result => {
    if (result.success) {
      console.log('Agent test successful:', result);
    }
  });
}

// Test a prompt
testPrompt() {
  this.testHarness.openForPrompt('prompt-id').subscribe(result => {
    console.log('Prompt test result:', result);
  });
}

// Test an action
testAction() {
  this.testHarness.openForAction('action-id').subscribe(result => {
    console.log('Action test result:', result);
  });
}
```

## Configuration

### TestHarnessConfig

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| mode | `'agent' \| 'prompt' \| 'action'` | `'agent'` | Testing mode |
| entityId | `string` | - | Pre-selected entity ID |
| showHistory | `boolean` | `true` | Show execution history |
| showAdvancedOptions | `boolean` | `false` | Show advanced settings |
| theme | `'light' \| 'dark'` | `'light'` | Visual theme |
| maxHistoryItems | `number` | `10` | Max history items to display |

### TestExecutionResult

```typescript
interface TestExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
  tokensUsed?: number;
  cost?: number;
}
```

## Advanced Features

### Custom Entity Filtering

```typescript
this.testHarness.open({
  mode: 'agent',
  entityFilter: "Status='Active' AND Category='Customer Service'",
  defaultInput: 'Hello, how can you help me?'
});
```

### Streaming Responses

The test harness supports real-time streaming for compatible AI models. Enable streaming in the advanced options panel or programmatically:

```typescript
this.testHarness.open({
  mode: 'prompt',
  streamResponse: true,
  temperature: 0.7,
  maxTokens: 2000
});
```

## Styling

The component uses CSS custom properties for theming:

```scss
:root {
  --harness-primary: #007bff;
  --harness-success: #28a745;
  --harness-error: #dc3545;
  --harness-background: #f8f9fa;
  --harness-text: #212529;
}
```

## Dependencies

- Angular 21+
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/graphql-dataprovider
- Kendo UI for Angular

## License

ISC

## Contributing

Contributions are welcome! Please submit pull requests to the MemberJunction repository.

## Support

For issues and questions, please use the MemberJunction GitHub repository.