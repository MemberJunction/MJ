# Code Refactoring Plan for AI Agents Package

## Overview

This document outlines a comprehensive refactoring plan for the AI Agents package. The current codebase contains several extremely long methods (some over 200 lines!) that violate our functional decomposition principles. These methods are difficult to test, understand, and maintain.

## Most Egregious Long Methods

### 1. **base-agent.ts - executeSubAgentStep()** - 252 lines (!!)

**Current problems:**
- Massive method handling sub-agent execution, payload filtering, result merging, and error tracking
- Multiple levels of nesting with complex conditionals
- Mixed responsibilities across different abstraction levels
- Impossible to unit test individual components

**Proposed decomposition:**
```typescript
// Main orchestrator - ~30 lines
protected async executeSubAgentStep(
    step: SubAgentStep,
    agentPromptResult: AgentResponseJson
): Promise<StepResult> {
    const subAgent = await this.loadSubAgent(step.SubAgentID);
    const executionContext = this.prepareSubAgentContext(step, agentPromptResult);
    
    try {
        const filteredPayload = await this.filterDownstreamPayload(executionContext);
        const subAgentResult = await this.executeSubAgent(subAgent, filteredPayload, executionContext);
        const mergedResult = await this.mergeUpstreamResults(subAgentResult, executionContext);
        
        await this.trackSubAgentExecution(executionContext, mergedResult);
        return mergedResult;
    } catch (error) {
        return this.handleSubAgentError(error, executionContext);
    }
}

// Focused helper methods:
private async loadSubAgent(subAgentId: string): Promise<BaseAgent>
private prepareSubAgentContext(step: SubAgentStep, promptResult: AgentResponseJson): SubAgentContext
private async filterDownstreamPayload(context: SubAgentContext): Promise<FilteredPayload>
private async executeSubAgent(agent: BaseAgent, payload: FilteredPayload, context: SubAgentContext): Promise<AgentResult>
private async mergeUpstreamResults(result: AgentResult, context: SubAgentContext): Promise<StepResult>
private async trackSubAgentExecution(context: SubAgentContext, result: StepResult): Promise<void>
private handleSubAgentError(error: Error, context: SubAgentContext): StepResult

// Further decomposition for payload filtering:
class PayloadFilter {
    filterForDownstream(payload: any, allowedPaths: string[]): FilteredPayload
    validatePathPermissions(paths: string[], operations: string[]): ValidationResult
    extractAllowedOperations(path: string): Set<PayloadOperation>
}
```

### 2. **base-agent.ts - executePromptStep()** - 205 lines

**Current problems:**
- Handles payload management, prompt preparation, execution, and result processing
- Complex nested conditionals for different payload scenarios
- Error handling mixed with business logic
- Too many responsibilities in one method

**Proposed decomposition:**
```typescript
// Main orchestrator - ~25 lines
protected async executePromptStep(
    step: PromptStep,
    agentPromptResult: AgentResponseJson
): Promise<StepResult> {
    const context = this.createPromptStepContext(step, agentPromptResult);
    
    try {
        await this.preparePromptPayload(context);
        const promptResult = await this.executePromptWithTracking(context);
        const processedResult = await this.processPromptResult(promptResult, context);
        
        await this.applyPayloadChanges(processedResult, context);
        return this.createStepResult(processedResult, context);
    } catch (error) {
        return this.handlePromptStepError(error, context);
    }
}

// Specialized payload handling:
private async preparePromptPayload(context: PromptStepContext): Promise<void> {
    if (context.step.ManagePayload) {
        await this.configurePayloadManagement(context);
    }
    
    if (context.step.PayloadDataPropertyName) {
        await this.attachPayloadToPrompt(context);
    }
}

// Prompt execution with proper separation:
private async executePromptWithTracking(context: PromptStepContext): Promise<AIPromptResult> {
    const tracker = this.createPromptTracker(context);
    tracker.start();
    
    try {
        const result = await this.executePrompt(context.promptParams);
        tracker.complete(result);
        return result;
    } catch (error) {
        tracker.fail(error);
        throw error;
    }
}

// Result processing:
private async processPromptResult(
    result: AIPromptResult,
    context: PromptStepContext
): Promise<ProcessedPromptResult> {
    const processed = new ProcessedPromptResult(result);
    
    if (context.step.ExtractPayloadFromResult) {
        processed.extractedPayload = await this.extractPayloadFromResult(result, context);
    }
    
    return processed;
}
```

### 3. **base-agent.ts - executeActionsStep()** - 179 lines

**Current problems:**
- Handles parallel action execution with complex progress tracking
- Message formatting logic embedded in execution logic
- Error aggregation mixed with result processing
- Too much orchestration detail

**Proposed decomposition:**
```typescript
// Main orchestrator - ~25 lines
protected async executeActionsStep(
    step: ActionsStep,
    agentPromptResult: AgentResponseJson
): Promise<StepResult> {
    const actions = await this.prepareActions(step, agentPromptResult);
    const executor = new ParallelActionExecutor(this.options);
    
    const results = await executor.executeAll(actions, {
        onProgress: (progress) => this.reportActionProgress(progress),
        cancellationToken: this.cancellationToken
    });
    
    return this.aggregateActionResults(results, step);
}

// Parallel execution handler:
class ParallelActionExecutor {
    async executeAll(
        actions: PreparedAction[],
        options: ExecutionOptions
    ): Promise<ActionResult[]> {
        const controller = new ExecutionController(options);
        const promises = actions.map(action => 
            this.executeWithTracking(action, controller)
        );
        
        return controller.waitForCompletion(promises);
    }
    
    private async executeWithTracking(
        action: PreparedAction,
        controller: ExecutionController
    ): Promise<ActionResult> {
        return controller.track(action.id, async () => {
            return await this.executeSingleAction(action);
        });
    }
}

// Result aggregation:
private aggregateActionResults(
    results: ActionResult[],
    step: ActionsStep
): StepResult {
    const aggregator = new ActionResultAggregator();
    const summary = aggregator.summarize(results);
    const messages = this.formatActionMessages(results);
    
    return new StepResult({
        success: summary.allSuccessful,
        messages: messages,
        data: summary
    });
}

// Message formatting:
private formatActionMessages(results: ActionResult[]): string[] {
    const formatter = new ActionMessageFormatter();
    return results.map(result => formatter.format(result));
}
```

### 4. **base-agent.ts - Execute()** - 86 lines

**Current problems:**
- Main entry point doing too much orchestration
- Progress reporting mixed with execution logic
- Configuration loading mixed with validation
- Multiple try-catch blocks with different concerns

**Proposed decomposition:**
```typescript
// Simplified main method - ~25 lines
public async Execute(params: AIAgentExecuteParams): Promise<AIAgentRunEntity> {
    const context = await this.initializeExecution(params);
    
    try {
        await this.validateExecution(context);
        const result = await this.runAgentCore(context);
        return await this.finalizeExecution(result, context);
    } catch (error) {
        return await this.handleExecutionError(error, context);
    }
}

// Initialization:
private async initializeExecution(params: AIAgentExecuteParams): Promise<ExecutionContext> {
    const run = await this.createAgentRun(params);
    const config = await this.loadConfiguration(params);
    
    return new ExecutionContext({
        params,
        run,
        config,
        startTime: new Date()
    });
}

// Core execution:
private async runAgentCore(context: ExecutionContext): Promise<AgentResult> {
    this.reportProgress("Starting agent execution", 10);
    
    const executor = this.createExecutor(context);
    const result = await executor.execute();
    
    this.reportProgress("Agent execution completed", 90);
    return result;
}

// Finalization:
private async finalizeExecution(
    result: AgentResult,
    context: ExecutionContext
): Promise<AIAgentRunEntity> {
    context.run.EndedAt = new Date();
    context.run.Status = result.success ? 'Success' : 'Failed';
    context.run.Output = result.output;
    
    await context.run.Save();
    this.reportProgress("Execution finalized", 100);
    
    return context.run;
}
```

### 5. **PayloadManager.ts - mergeAllowedPaths()** - 92 lines

**Current problems:**
- Complex unauthorized change tracking logic
- Nested loops with multiple responsibilities
- Validation mixed with merging and reporting
- Difficult to understand flow

**Proposed decomposition:**
```typescript
// Main method - ~20 lines
public mergeAllowedPaths(
    subAgentPayload: AgentPayload,
    subAgentAllowedPaths: string[],
    parentAllowedPaths: string[]
): MergeResult {
    const validator = new PathPermissionValidator(parentAllowedPaths);
    const changes = this.extractChanges(subAgentPayload);
    
    const validationResult = validator.validateChanges(changes, subAgentAllowedPaths);
    
    if (validationResult.hasUnauthorized) {
        this.handleUnauthorizedChanges(validationResult.unauthorized);
    }
    
    return this.applyAuthorizedChanges(validationResult.authorized);
}

// Permission validation:
class PathPermissionValidator {
    validateChanges(
        changes: PayloadChange[],
        allowedPaths: string[]
    ): ValidationResult {
        const authorized: PayloadChange[] = [];
        const unauthorized: UnauthorizedChange[] = [];
        
        for (const change of changes) {
            if (this.isAuthorized(change, allowedPaths)) {
                authorized.push(change);
            } else {
                unauthorized.push(this.createUnauthorizedChange(change));
            }
        }
        
        return { authorized, unauthorized, hasUnauthorized: unauthorized.length > 0 };
    }
    
    private isAuthorized(change: PayloadChange, allowedPaths: string[]): boolean {
        return allowedPaths.some(path => this.pathMatches(change.path, path));
    }
}

// Unauthorized change handling:
private handleUnauthorizedChanges(unauthorized: UnauthorizedChange[]): void {
    const reporter = new UnauthorizedChangeReporter();
    reporter.logWarnings(unauthorized);
    
    if (this.options.throwOnUnauthorized) {
        throw new UnauthorizedPayloadChangeError(unauthorized);
    }
}
```

### 6. **loop-agent-type.ts - DetermineNextStep()** - 123 lines

**Current problems:**
- Large switch statement with complex logic in each case
- Multiple levels of validation and error handling
- Mixed parsing and business logic
- Difficult to add new step types

**Proposed decomposition:**
```typescript
// Main method using strategy pattern - ~20 lines
public override async DetermineNextStep(response: LoopAgentResponseJson): Promise<AIAgentRunStepEntity | undefined> {
    const validator = new LoopResponseValidator();
    const validationResult = validator.validate(response);
    
    if (!validationResult.isValid) {
        throw new InvalidLoopResponseError(validationResult.errors);
    }
    
    const handler = this.getStepHandler(response.nextStep.type);
    return handler.createStep(response.nextStep, this.agent);
}

// Step handler interface:
interface StepHandler {
    createStep(stepData: any, agent: BaseAgent): Promise<AIAgentRunStepEntity>;
}

// Specific handlers:
class SubAgentStepHandler implements StepHandler {
    async createStep(stepData: any, agent: BaseAgent): Promise<AIAgentRunStepEntity> {
        const step = await this.createBaseStep(agent);
        step.StepType = 'SubAgent';
        step.StepInfo = this.prepareSubAgentInfo(stepData);
        return step;
    }
}

class ActionsStepHandler implements StepHandler {
    async createStep(stepData: any, agent: BaseAgent): Promise<AIAgentRunStepEntity> {
        const step = await this.createBaseStep(agent);
        step.StepType = 'Actions';
        step.StepInfo = this.prepareActionsInfo(stepData);
        return step;
    }
}

// Handler registry:
private getStepHandler(stepType: string): StepHandler {
    const handlers = new Map<string, StepHandler>([
        ['subAgent', new SubAgentStepHandler()],
        ['actions', new ActionsStepHandler()],
        ['chat', new ChatStepHandler()],
        ['prompt', new PromptStepHandler()]
    ]);
    
    const handler = handlers.get(stepType);
    if (!handler) {
        throw new UnknownStepTypeError(stepType);
    }
    
    return handler;
}
```

### 7. **loop-agent-type.ts - isValidLoopResponse()** - 71 lines

**Current problems:**
- Multiple validation rules mixed together
- Complex conditional logic with side effects
- Modifies response object during validation
- Should be pure validation

**Proposed decomposition:**
```typescript
// Main validation method - ~15 lines
private isValidLoopResponse(response: any): ValidationResult {
    const validators = [
        new RequiredFieldsValidator(),
        new NextStepStructureValidator(),
        new StepTypeValidator(),
        new StepDataValidator()
    ];
    
    const errors: ValidationError[] = [];
    
    for (const validator of validators) {
        const result = validator.validate(response);
        if (!result.isValid) {
            errors.push(...result.errors);
        }
    }
    
    return new ValidationResult(errors.length === 0, errors);
}

// Individual validators:
class RequiredFieldsValidator implements Validator {
    validate(response: any): ValidationResult {
        const requiredFields = ['status', 'statusExplanation', 'nextStep'];
        const missing = requiredFields.filter(field => !response[field]);
        
        if (missing.length > 0) {
            return ValidationResult.error(`Missing required fields: ${missing.join(', ')}`);
        }
        
        return ValidationResult.success();
    }
}

class NextStepStructureValidator implements Validator {
    validate(response: any): ValidationResult {
        if (!response.nextStep) {
            return ValidationResult.success();
        }
        
        if (!response.nextStep.type) {
            return ValidationResult.error('nextStep must have a type property');
        }
        
        return ValidationResult.success();
    }
}

// Response normalizer (separate from validation):
class LoopResponseNormalizer {
    normalize(response: any): LoopAgentResponseJson {
        const normalized = { ...response };
        
        // Handle common malformations
        if (normalized.finished && !normalized.status) {
            normalized.status = 'finished';
        }
        
        if (normalized.actions && !normalized.nextStep) {
            normalized.nextStep = { type: 'actions', actions: normalized.actions };
        }
        
        return normalized;
    }
}
```

## Common Patterns to Extract

### Progress Reporting
```typescript
class ProgressReporter {
    constructor(private callback?: (message: string, percent: number) => void) {}
    
    report(message: string, percent: number): void {
        if (this.callback) {
            this.callback(message, percent);
        }
    }
    
    createPhase(startPercent: number, endPercent: number): PhaseReporter {
        return new PhaseReporter(this, startPercent, endPercent);
    }
}
```

### Execution Tracking
```typescript
class ExecutionTracker {
    private steps: TrackedStep[] = [];
    
    startStep(name: string, type: string): TrackedStep {
        const step = new TrackedStep(name, type);
        this.steps.push(step);
        return step;
    }
    
    completeStep(step: TrackedStep, result: any): void {
        step.complete(result);
    }
    
    failStep(step: TrackedStep, error: Error): void {
        step.fail(error);
    }
    
    getSummary(): ExecutionSummary {
        return new ExecutionSummary(this.steps);
    }
}
```

### Parallel Execution Controller
```typescript
class ParallelExecutionController<T> {
    constructor(private options: ParallelExecutionOptions) {}
    
    async executeAll(
        tasks: ExecutableTask<T>[],
        onProgress?: (completed: number, total: number) => void
    ): Promise<TaskResult<T>[]> {
        const results: TaskResult<T>[] = [];
        let completed = 0;
        
        const promises = tasks.map(async (task) => {
            try {
                const result = await this.executeWithTimeout(task);
                completed++;
                onProgress?.(completed, tasks.length);
                return { success: true, result };
            } catch (error) {
                completed++;
                onProgress?.(completed, tasks.length);
                return { success: false, error };
            }
        });
        
        return Promise.all(promises);
    }
}
```

### Payload Path Utilities
```typescript
class PayloadPathUtils {
    static extractOperations(pathWithOps: string): {
        path: string;
        operations: Set<PayloadOperation>;
    } {
        const colonIndex = pathWithOps.lastIndexOf(':');
        if (colonIndex === -1) {
            return { path: pathWithOps, operations: new Set(['add', 'update', 'delete']) };
        }
        
        const path = pathWithOps.substring(0, colonIndex);
        const opsString = pathWithOps.substring(colonIndex + 1);
        const operations = new Set(opsString.split(',') as PayloadOperation[]);
        
        return { path, operations };
    }
    
    static pathMatches(path: string, pattern: string): boolean {
        // Implementation
    }
    
    static isSubPath(child: string, parent: string): boolean {
        // Implementation
    }
}
```

## Benefits of Refactoring

1. **Testability**: Can unit test each component in isolation
2. **Readability**: Methods tell a story at the appropriate abstraction level
3. **Maintainability**: Changes are localized to specific concerns
4. **Debuggability**: Stack traces clearly show the execution flow
5. **Extensibility**: Easy to add new step types, validators, or handlers
6. **Reusability**: Common patterns can be shared across the codebase
7. **Performance**: Easier to optimize individual components
8. **Reliability**: Simpler code has fewer bugs

## Implementation Priority

### Critical (200+ lines):
1. `executeSubAgentStep()` - 252 lines
2. `executePromptStep()` - 205 lines

### High Priority (100+ lines):
3. `executeActionsStep()` - 179 lines
4. `DetermineNextStep()` - 123 lines

### Medium Priority (50+ lines):
5. `mergeAllowedPaths()` - 92 lines
6. `Execute()` - 86 lines
7. `isValidLoopResponse()` - 71 lines
8. `applyAgentChangeRequest()` - 60 lines

### Utility Extraction:
9. Common patterns (progress, tracking, validation)
10. Payload utilities

## Testing Strategy

1. **Before refactoring**: Ensure comprehensive integration tests exist
2. **During refactoring**:
   - Extract one method at a time
   - Write unit tests for each extracted method
   - Ensure integration tests still pass
3. **After refactoring**:
   - Add edge case tests now visible in smaller methods
   - Performance benchmarks to ensure no regression
   - Documentation of new patterns

## Migration Approach

1. **Phase 1**: Extract utilities and common patterns
2. **Phase 2**: Refactor the critical 200+ line methods
3. **Phase 3**: Refactor high-priority methods
4. **Phase 4**: Complete remaining methods
5. **Phase 5**: Documentation and team training

Each phase should be completed and merged before starting the next to minimize conflicts and allow the team to adapt to new patterns gradually.