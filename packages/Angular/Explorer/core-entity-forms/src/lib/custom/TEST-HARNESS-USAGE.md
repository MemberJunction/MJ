# Test Harness Components Usage Guide

This guide explains how to use the AI Agent and AI Prompt test harness components and dialog service in your Angular applications.

## Installation

Import the `MemberJunctionCoreEntityFormsModule` in your Angular module:

```typescript
import { MemberJunctionCoreEntityFormsModule } from '@memberjunction/ng-explorer-core';

@NgModule({
  imports: [
    MemberJunctionCoreEntityFormsModule,
    // ... other imports
  ]
})
export class YourModule { }
```

## Using Test Harness Components Directly

### AI Agent Test Harness

```html
<!-- In your template -->
<mj-ai-agent-test-harness 
  [aiAgent]="agentEntity"
  [isVisible]="showTestHarness"
  (visibilityChange)="onVisibilityChange($event)">
</mj-ai-agent-test-harness>
```

```typescript
// In your component
import { AIAgentEntity } from '@memberjunction/core-entities';

export class YourComponent {
  agentEntity: AIAgentEntity;
  showTestHarness = true;
  
  onVisibilityChange(isVisible: boolean) {
    this.showTestHarness = isVisible;
  }
}
```

### AI Prompt Test Harness

```html
<!-- In your template -->
<mj-ai-prompt-test-harness 
  [aiPrompt]="promptEntity"
  [template]="templateEntity"
  [templateContent]="templateContentEntity"
  [isVisible]="showTestHarness"
  (visibilityChange)="onVisibilityChange($event)">
</mj-ai-prompt-test-harness>
```

## Using Dialog Service (Recommended)

The dialog service provides a programmatic way to open test harnesses in Kendo dialogs.

### Basic Usage

```typescript
import { TestHarnessDialogService } from '@memberjunction/ng-explorer-core';

export class YourComponent {
  constructor(private testHarnessService: TestHarnessDialogService) {}
  
  // Open AI Agent Test Harness by ID
  openAgentTestHarness(agentId: string) {
    this.testHarnessService.openAgentById(agentId);
  }
  
  // Open AI Prompt Test Harness by ID
  openPromptTestHarness(promptId: string) {
    this.testHarnessService.openPromptById(promptId);
  }
}
```

### Advanced Usage with Options

```typescript
// Open Agent Test Harness with custom options
openAgentWithOptions() {
  const dialogRef = this.testHarnessService.openAgentTestHarness({
    agentId: 'agent-123',
    title: 'Custom Agent Test',
    width: '95vw',
    height: '85vh',
    initialDataContext: {
      userId: '123',
      organizationId: '456',
      customData: { key: 'value' }
    },
    initialTemplateData: {
      greeting: 'Hello',
      context: 'Testing'
    },
    disableClose: false
  });
  
  // Handle dialog close
  dialogRef.afterClosed().subscribe(result => {
    console.log('Dialog closed', result);
  });
}

// Open Prompt Test Harness with pre-loaded entity
async openPromptWithEntity() {
  const md = new Metadata();
  const prompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts');
  await prompt.Load('prompt-id-123');
  
  this.testHarnessService.openPromptTestHarness({
    prompt: prompt,
    title: `Testing: ${prompt.Name}`,
    initialTemplateVariables: {
      userName: 'John Doe',
      context: 'Customer support'
    },
    selectedModelId: 'gpt-4-model-id'
  });
}
```

## Integration Examples

### From a Button in a Grid

```html
<button (click)="testAgent(agent.ID)">
  Test Agent
</button>
```

```typescript
testAgent(agentId: string) {
  this.testHarnessService.openAgentById(agentId);
}
```

### From an Entity Form

```typescript
// In your custom AI Agent form component
export class CustomAIAgentForm {
  constructor(private testHarnessService: TestHarnessDialogService) {}
  
  testCurrentAgent() {
    if (this.record && this.record.ID) {
      this.testHarnessService.openAgentTestHarness({
        agent: this.record as AIAgentEntity,
        title: `Testing: ${this.record.Name}`
      });
    }
  }
}
```

### From a Card Component

```html
<div class="agent-card">
  <h3>{{ agent.Name }}</h3>
  <div class="card-actions">
    <button kendoButton (click)="openTestHarness()">
      <span class="k-icon k-i-play"></span>
      Test Agent
    </button>
  </div>
</div>
```

## Features

Both test harnesses include:

- **Multi-turn Conversations**: Full chat interface with message history
- **Variable Management**: 
  - AI Agent: Data context and template data variables
  - AI Prompt: Template variables with type support
- **Save/Load Functionality**: Save conversations to local storage
- **Import/Export**: Export conversations as JSON files
- **Streaming Support**: Simulated streaming (real streaming when available)
- **Error Handling**: Clear error messages and notifications
- **Responsive Design**: Works on desktop and tablet devices

## Styling

The dialogs come with default styling, but you can customize them by adding CSS to your global styles:

```css
/* Customize dialog panel */
.test-harness-dialog-panel {
  /* Your custom styles */
}

/* Customize dialog content */
.test-harness-dialog .dialog-header {
  background-color: #your-color;
}
```

## Notes

- The dialog service is provided at the root level, so it's available throughout your application
- Test harnesses automatically load related entities (templates, content, etc.)
- Conversations are saved to browser local storage (limited to 50 per type)
- Both test harnesses support real-time streaming when GraphQL subscriptions are available