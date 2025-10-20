# MemberJunction Actions Development Guide

## Overview

The Actions system provides a metadata-driven abstraction layer for exposing functionality to workflow engines, AI agents, and low-code environments. This guide covers when and how to use Actions effectively.

---

## Core Philosophy: Actions are Boundaries, Not Internal APIs

### The Right Way to Think About Actions

**Actions are an interface layer for external consumers**, not internal code organization:

```
┌─────────────────────────────────────────────────────────┐
│  External Consumers (Agents, Workflows, Users)          │
└────────────────────┬────────────────────────────────────┘
                     │
              ┌──────▼──────┐
              │   ACTIONS   │  ◄── Metadata-driven boundary
              │  (Thin API) │
              └──────┬──────┘
                     │
       ┌─────────────┴─────────────┐
       │                           │
  ┌────▼─────┐              ┌─────▼────┐
  │ Services │              │ Packages │  ◄── Direct imports
  │ & Classes│              │ & Utils  │      (Type-safe)
  └──────────┘              └──────────┘
```

### Key Principle

**Code-to-code calls should NEVER go through Actions.** Always use direct imports and class instantiation for internal communication.

---

## When to Create Actions (✅ Good Use Cases)

### 1. AI Agent Tool Integration
Expose functionality for LLMs to discover and execute:

```typescript
/**
 * Action: "Send Email"
 * Purpose: Allow agents to send emails via natural language
 * Consumer: AI agents, chatbots
 */
@RegisterClass(BaseAction, "Send Email")
export class SendEmailAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // Extract params from action interface
        const to = this.getStringParam(params, "to");
        const subject = this.getStringParam(params, "subject");
        const body = this.getStringParam(params, "body");

        // Delegate to service class
        const emailService = new EmailService();
        const result = await emailService.send({ to, subject, body });

        return {
            Success: result.success,
            Message: result.message,
            ResultCode: result.code
        };
    }
}
```

### 2. Workflow Orchestration Steps
Create reusable steps for visual workflow builders:

```typescript
/**
 * Action: "Validate Customer Data"
 * Purpose: Reusable validation step in approval workflows
 * Consumer: Workflow engine, business process automation
 */
@RegisterClass(BaseAction, "Validate Customer Data")
export class ValidateCustomerAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const customerId = this.getStringParam(params, "customerId");

        // Use validation service
        const validator = new CustomerValidator();
        const result = await validator.validate(customerId);

        // Add output params for workflow branching
        this.addOutputParam(params, "isValid", result.isValid);
        this.addOutputParam(params, "errors", result.errors);

        return {
            Success: true,
            Message: JSON.stringify(result)
        };
    }
}
```

### 3. External API Endpoints
Wrap functionality for REST/GraphQL exposure:

```typescript
/**
 * Action: "Get Company Report"
 * Purpose: Generate reports for external API consumers
 * Consumer: REST API, third-party integrations
 */
@RegisterClass(BaseAction, "Get Company Report")
export class GetCompanyReportAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const companyId = this.getStringParam(params, "companyId");
        const reportType = this.getStringParam(params, "reportType");

        // Delegate to report generator
        const generator = new ReportGenerator();
        const report = await generator.generate(companyId, reportType);

        return {
            Success: true,
            Message: JSON.stringify(report)
        };
    }
}
```

---

## When NOT to Create Actions (❌ Anti-Patterns)

### 1. Internal Code Reuse

```typescript
// ❌ BAD - Using Action for code reuse
class GenerateInvoiceAction extends BaseAction {
    async InternalRunAction(params: RunActionParams) {
        // Calling another action internally
        const customerData = await this.executeAction("Get Customer Data", [...], user);
        const pdfResult = await this.executeAction("Generate PDF", [...], user);
        return { Success: true };
    }
}

// ✅ GOOD - Direct class usage
class GenerateInvoiceAction extends BaseAction {
    async InternalRunAction(params: RunActionParams) {
        // Direct imports and instantiation
        const customerService = new CustomerService();
        const customerData = await customerService.getById(customerId);

        const pdfGenerator = new PDFGenerator();
        const pdf = await pdfGenerator.generate(template, customerData);

        return { Success: true };
    }
}
```

### 2. Shared Business Logic

```typescript
// ❌ BAD - Action as shared utility
@RegisterClass(BaseAction, "Calculate Tax")
export class CalculateTaxAction extends BaseAction {
    // Don't create Actions for pure computation
    protected async InternalRunAction(params: RunActionParams) {
        const amount = this.getNumericParam(params, "amount");
        const rate = this.getNumericParam(params, "rate");
        return { Success: true, Message: String(amount * rate) };
    }
}

// ✅ GOOD - Utility class or function
export class TaxCalculator {
    static calculate(amount: number, rate: number): number {
        return amount * rate;
    }
}

// Or for complex logic, a service class
export class TaxService {
    constructor(private taxRateProvider: TaxRateProvider) {}

    async calculateTax(amount: number, jurisdiction: string): Promise<TaxResult> {
        const rate = await this.taxRateProvider.getRate(jurisdiction);
        return {
            taxAmount: amount * rate,
            rate,
            jurisdiction
        };
    }
}
```

### 3. Action Chains (Action Calling Action)

```typescript
// ❌ BAD - Action orchestration chain
class ProcessOrderAction extends BaseAction {
    async InternalRunAction(params: RunActionParams) {
        await this.executeAction("Validate Order", [...], user);
        await this.executeAction("Check Inventory", [...], user);
        await this.executeAction("Process Payment", [...], user);
        await this.executeAction("Send Confirmation", [...], user);
        return { Success: true };
    }
}

// ✅ GOOD - Service orchestration
class OrderProcessor {
    constructor(
        private validator: OrderValidator,
        private inventory: InventoryService,
        private payment: PaymentService,
        private notifications: NotificationService
    ) {}

    async processOrder(order: Order): Promise<ProcessResult> {
        const validation = await this.validator.validate(order);
        if (!validation.isValid) {
            throw new ValidationError(validation.errors);
        }

        const available = await this.inventory.checkAvailability(order.items);
        if (!available) {
            throw new OutOfStockError();
        }

        const paymentResult = await this.payment.process(order.payment);
        await this.notifications.sendConfirmation(order.customer, paymentResult);

        return { success: true, orderId: order.id };
    }
}

// Action becomes thin wrapper
@RegisterClass(BaseAction, "Process Order")
class ProcessOrderAction extends BaseAction {
    async InternalRunAction(params: RunActionParams) {
        const order = this.extractOrderFromParams(params);
        const processor = new OrderProcessor(...); // Inject dependencies
        const result = await processor.processOrder(order);
        return { Success: result.success };
    }
}
```

---

## Best Practices

### 1. Keep Actions Thin

Actions should be **thin adapters** that bridge the external action interface to internal service classes:

```typescript
@RegisterClass(BaseAction, "Summarize Content")
export class SummarizeContentAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // ✅ Minimal logic: extract params, delegate, return result
        const content = this.getStringParam(params, "content");
        const maxWords = this.getNumericParam(params, "maxWords", 200);

        // Delegate to service
        const summarizer = new ContentSummarizer();
        const result = await summarizer.summarize(content, { maxWords });

        // Map result to action format
        return {
            Success: true,
            Message: result.summary
        };
    }
}
```

### 2. Create Service Classes for Logic

**Move business logic into service classes** that can be used directly by other code:

```typescript
// packages/AI/ContentSummarization/src/ContentSummarizer.ts
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';

export interface SummarizeOptions {
    maxWords: number;
    includeCitations?: boolean;
    format?: 'paragraph' | 'bullets' | 'hybrid';
}

export interface SummaryResult {
    summary: string;
    wordCount: number;
    citations?: Citation[];
}

export class ContentSummarizer {
    private promptRunner: AIPromptRunner;

    constructor() {
        this.promptRunner = new AIPromptRunner();
    }

    async summarize(content: string, options: SummarizeOptions): Promise<SummaryResult> {
        // Load prompt from AIEngine
        const prompt = await this.getPrompt('Summarize Content');

        // Build params
        const promptParams = new AIPromptParams();
        promptParams.prompt = prompt;
        promptParams.data = {
            content,
            maxWords: options.maxWords,
            format: options.format || 'paragraph'
        };

        // Execute
        const result = await this.promptRunner.ExecutePrompt<SummaryResult>(promptParams);

        if (!result.success) {
            throw new Error(`Summarization failed: ${result.errorMessage}`);
        }

        return result.result!;
    }

    private async getPrompt(name: string): Promise<AIPromptEntityExtended> {
        // Load from AIEngine (cached)
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name === name);
        if (!prompt) {
            throw new Error(`Prompt "${name}" not found`);
        }
        return prompt;
    }
}
```

Now **both Actions and other code** can use the service:

```typescript
// Action uses service
@RegisterClass(BaseAction, "Summarize Content")
export class SummarizeContentAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const summarizer = new ContentSummarizer();
        const result = await summarizer.summarize(content, options);
        return { Success: true, Message: result.summary };
    }
}

// Other code uses service directly
export class DocumentProcessor {
    async processDocument(doc: Document): Promise<void> {
        const summarizer = new ContentSummarizer();
        const summary = await summarizer.summarize(doc.content, { maxWords: 200 });
        doc.summary = summary.summary;
        await doc.Save();
    }
}
```

### 3. Use Direct Package Imports

When one Action needs functionality from another domain, **import the underlying package**:

```typescript
// ❌ BAD - Action calling Action
class AnalyzeDocumentAction extends BaseAction {
    async InternalRunAction(params: RunActionParams) {
        const summaryResult = await this.executeAction("Summarize Content", [...], user);
        const extractResult = await this.executeAction("Extract Entities", [...], user);
        return { Success: true };
    }
}

// ✅ GOOD - Direct service usage
import { ContentSummarizer } from '@memberjunction/ai-content';
import { EntityExtractor } from '@memberjunction/nlp';

class AnalyzeDocumentAction extends BaseAction {
    async InternalRunAction(params: RunActionParams) {
        const content = this.getStringParam(params, "content");

        // Direct instantiation with type safety
        const summarizer = new ContentSummarizer();
        const extractor = new EntityExtractor();

        const summary = await summarizer.summarize(content, { maxWords: 200 });
        const entities = await extractor.extract(content);

        return {
            Success: true,
            Message: JSON.stringify({ summary, entities })
        };
    }
}
```

### 4. Parameter Extraction Patterns

Use helper methods for consistent parameter extraction:

```typescript
export abstract class BaseCustomAction extends BaseAction {
    protected getStringParam(params: RunActionParams, name: string, defaultValue?: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : defaultValue;
    }

    protected getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const parsed = Number(param.Value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    protected getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim().toLowerCase();
        if (value === "true" || value === "1" || value === "yes") return true;
        if (value === "false" || value === "0" || value === "no") return false;
        return defaultValue;
    }

    protected addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: "Output",
            Value: value
        });
    }
}
```

### 5. Error Handling

Provide clear, actionable error messages:

```typescript
protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
        // Validation
        const content = this.getStringParam(params, "content");
        if (!content) {
            return {
                Success: false,
                ResultCode: "MISSING_PARAMETER",
                Message: "Parameter 'content' is required"
            };
        }

        // Execution
        const service = new MyService();
        const result = await service.process(content);

        if (!result.success) {
            return {
                Success: false,
                ResultCode: result.errorCode || "PROCESSING_FAILED",
                Message: result.errorMessage || "Processing failed"
            };
        }

        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify(result.data)
        };

    } catch (error) {
        LogError(`Error in MyAction: ${error}`);
        return {
            Success: false,
            ResultCode: "UNEXPECTED_ERROR",
            Message: error instanceof Error ? error.message : String(error)
        };
    }
}
```

---

## Integration with AI Prompts Package

When creating Actions that use AI capabilities, use the `@memberjunction/ai-prompts` package directly:

```typescript
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';

@RegisterClass(BaseAction, "My AI Action")
export class MyAIAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // 1. Ensure AIEngine is initialized
            if (!AIEngine.Instance.Config.Prompts?.length) {
                await AIEngine.Instance.Config(false, params.ContextUser);
            }

            // 2. Get prompt from AIEngine
            const prompt = AIEngine.Instance.Prompts.find(p => p.Name === 'My Prompt Name');
            if (!prompt) {
                return {
                    Success: false,
                    ResultCode: "PROMPT_NOT_FOUND",
                    Message: "Prompt 'My Prompt Name' not found"
                };
            }

            // 3. Build execution parameters
            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.data = {
                // Your dynamic data here
                inputText: this.getStringParam(params, "input"),
                options: { ... }
            };
            promptParams.contextUser = params.ContextUser;

            // 4. Execute prompt
            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt<MyResultType>(promptParams);

            // 5. Handle result
            if (!result.success) {
                return {
                    Success: false,
                    ResultCode: "PROMPT_EXECUTION_FAILED",
                    Message: result.errorMessage || "Prompt execution failed"
                };
            }

            // 6. Add output parameters
            this.addOutputParam(params, "result", result.result);
            this.addOutputParam(params, "tokensUsed", result.tokensUsed);

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(result.result)
            };

        } catch (error) {
            LogError(`Error in MyAIAction: ${error}`);
            return {
                Success: false,
                ResultCode: "UNEXPECTED_ERROR",
                Message: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
```

---

## Testing Actions

### Unit Tests - Test the Service, Not the Action

```typescript
// Test the service class (where the logic lives)
describe('ContentSummarizer', () => {
    it('should summarize content', async () => {
        const summarizer = new ContentSummarizer();
        const result = await summarizer.summarize('Long content...', { maxWords: 100 });

        expect(result.summary).toBeDefined();
        expect(result.wordCount).toBeLessThanOrEqual(100);
    });
});
```

### Integration Tests - Test Action Execution

```typescript
// Test the action wrapper
describe('SummarizeContentAction', () => {
    it('should execute action with params', async () => {
        const action = new SummarizeContentAction();
        const params = new RunActionParams();
        params.Params = [
            { Name: 'content', Type: 'Input', Value: 'Long content...' },
            { Name: 'maxWords', Type: 'Input', Value: 100 }
        ];

        const result = await action.InternalRunAction(params);

        expect(result.Success).toBe(true);
        expect(result.Message).toBeDefined();
    });
});
```

---

## Summary: Decision Tree

```
Need to expose functionality?
│
├─ For AI agents/workflows/external APIs?
│  └─ ✅ Create an Action (thin wrapper)
│     └─ Delegate to service class
│
└─ For internal code use?
   └─ ❌ Do NOT create an Action
      └─ Options:
         ├─ Create service class
         ├─ Create utility function
         ├─ Use existing package
         └─ Direct class instantiation
```

## Key Takeaways

1. **Actions = External Interface**: Use Actions only as an interface layer for non-code consumers
2. **Services = Business Logic**: Put actual logic in service classes that can be imported directly
3. **Direct Imports for Code**: Never call Actions from other Actions or code - use direct imports
4. **Type Safety First**: Preserve TypeScript types by using classes and interfaces, not string-based action names
5. **Thin Wrappers**: Actions should just extract params, delegate to services, and return results

Following these principles will result in cleaner, more maintainable, and more performant code.
