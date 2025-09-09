# Code Refactoring Plan for AI Prompts Package

## Overview

This document outlines a comprehensive refactoring plan for the AI Prompts package to improve code maintainability, testability, and adherence to functional decomposition principles. The current codebase contains several methods that violate our guideline of keeping functions under 30-40 lines with single responsibilities.

## Most Egregious Long Methods

### 1. **AIPromptRunner.executePromptInParallel** - 241 lines

**Current problems:**
- Handles task creation, execution, monitoring, result selection, and cleanup all in one method
- Deep nesting with multiple try-catch blocks
- Mixed abstraction levels
- Difficult to test individual components

**Proposed decomposition:**
```typescript
// Main orchestrator - ~30 lines
async executePromptInParallel(params: AIPromptParams): Promise<AIPromptResult[]> {
    const executionContext = this.createParallelExecutionContext(params);
    const tasks = this.createParallelTasks(executionContext);
    
    try {
        const results = await this.executeParallelTasks(tasks, executionContext);
        return this.selectBestResults(results, executionContext);
    } finally {
        await this.cleanupParallelExecution(executionContext);
    }
}

// Separate focused methods:
private createParallelExecutionContext(params: AIPromptParams): ParallelExecutionContext
private createParallelTasks(context: ParallelExecutionContext): ExecutionTask[]
private async executeParallelTasks(tasks: ExecutionTask[], context: ParallelExecutionContext): Promise<TaskResult[]>
private selectBestResults(results: TaskResult[], context: ParallelExecutionContext): AIPromptResult[]
private async cleanupParallelExecution(context: ParallelExecutionContext): Promise<void>

// Further decomposition:
private monitorTaskProgress(task: ExecutionTask, context: ParallelExecutionContext): void
private handleTaskCancellation(task: ExecutionTask): void
private applyResultSelectionStrategy(results: TaskResult[], strategy: SelectionStrategy): AIPromptResult[]
```

### 2. **AIPromptRunner.buildModelVendorCandidates** - ~190 lines

**Current problems:**
- Inner helper function that should be extracted
- Complex switch statement for selection strategies
- Mixed filtering and sorting logic
- Difficult to add new selection strategies

**Proposed decomposition:**
```typescript
// Main method - simplified
buildModelVendorCandidates(options: BuildOptions): ModelVendorCandidate[] {
    const eligibleModels = this.filterEligibleModels(options);
    const candidates = this.createCandidatesFromModels(eligibleModels, options);
    return this.applyCandidateSelectionStrategy(candidates, options);
}

// Strategy pattern for selection
private applyCandidateSelectionStrategy(candidates: ModelVendorCandidate[], options: BuildOptions): ModelVendorCandidate[] {
    const strategy = this.selectionStrategies.get(options.selectionMode);
    return strategy.select(candidates, options);
}

// Separate strategies:
class BestModelStrategy implements SelectionStrategy { }
class BestVendorStrategy implements SelectionStrategy { }
class LoadBalancedStrategy implements SelectionStrategy { }
class RandomStrategy implements SelectionStrategy { }

// Helper methods:
private filterEligibleModels(options: BuildOptions): AIModelEntity[]
private createCandidatesFromModels(models: AIModelEntity[], options: BuildOptions): ModelVendorCandidate[]
private createSingleCandidate(model: AIModelEntity, vendor: AIVendorEntity): ModelVendorCandidate
```

### 3. **AIPromptRunner.ExecutePrompt** - 160 lines

**Current problems:**
- Handles both hierarchical and regular execution in one method
- Complex cancellation checking scattered throughout
- Mixed validation and execution logic
- Too many responsibilities

**Proposed decomposition:**
```typescript
// Main entry point - delegates to specific executors
async ExecutePrompt(params: AIPromptParams): Promise<AIPromptResult> {
    this.validatePromptParams(params);
    
    const context = await this.prepareExecutionContext(params);
    
    if (context.isHierarchical) {
        return this.hierarchicalExecutor.execute(context);
    } else {
        return this.standardExecutor.execute(context);
    }
}

// Separate executor classes:
class HierarchicalPromptExecutor {
    async execute(context: ExecutionContext): Promise<AIPromptResult>
}

class StandardPromptExecutor {
    async execute(context: ExecutionContext): Promise<AIPromptResult>
}

// Context preparation:
private async prepareExecutionContext(params: AIPromptParams): Promise<ExecutionContext> {
    const prompt = await this.loadPrompt(params);
    const models = await this.selectModels(params, prompt);
    return new ExecutionContext(params, prompt, models);
}
```

### 4. **AIPromptRunner.parseAndValidateResultEnhanced** - ~155 lines

**Current problems:**
- Large switch statement with complex logic in each case
- Repeated error handling patterns
- Mixed parsing and validation concerns
- Difficult to add new output types

**Proposed decomposition:**
```typescript
// Main parser delegates to type-specific parsers
private parseAndValidateResultEnhanced(
    llmResult: string, 
    outputType: string, 
    zod?: AIPromptZodEntity
): { success: boolean; result?: any; error?: string } {
    
    const parser = this.getParserForOutputType(outputType);
    return parser.parseAndValidate(llmResult, zod);
}

// Parser interface
interface OutputParser {
    parseAndValidate(result: string, schema?: AIPromptZodEntity): ParseResult;
}

// Specific parser implementations
class JsonOutputParser implements OutputParser { }
class TextOutputParser implements OutputParser { }
class NumberOutputParser implements OutputParser { }
class BooleanOutputParser implements OutputParser { }
class ArrayOutputParser implements OutputParser { }

// Parser factory
private getParserForOutputType(outputType: string): OutputParser {
    return this.parserRegistry.get(outputType) || new TextOutputParser();
}
```

### 5. **AIPromptRunner.renderChildPromptTemplates** - ~145 lines

**Current problems:**
- Recursive method with complex parallel processing
- Mixed data merging and template loading
- Difficult to follow the flow
- Error handling mixed with business logic

**Proposed decomposition:**
```typescript
// Main orchestrator
private async renderChildPromptTemplates(
    childPrompts: AIPromptEntityExtended[], 
    parentData: any
): Promise<RenderedPrompt[]> {
    const renderTasks = childPrompts.map(child => 
        this.createChildRenderTask(child, parentData)
    );
    
    return Promise.all(renderTasks);
}

// Separate concerns:
private async createChildRenderTask(
    childPrompt: AIPromptEntityExtended, 
    parentData: any
): Promise<RenderedPrompt> {
    const childData = await this.prepareChildData(childPrompt, parentData);
    const template = await this.loadPromptTemplate(childPrompt);
    return this.renderTemplate(template, childData);
}

private async prepareChildData(
    childPrompt: AIPromptEntityExtended, 
    parentData: any
): Promise<any> {
    const staticData = await this.loadStaticData(childPrompt);
    return this.mergeData(parentData, staticData, childPrompt.DataMergeMode);
}

private mergeData(parentData: any, childData: any, mergeMode: string): any {
    const merger = this.dataMergers.get(mergeMode);
    return merger.merge(parentData, childData);
}
```

### 6. **AIPromptRunner.executeWithValidationRetries** - ~145 lines

**Current problems:**
- Complex retry loop with multiple responsibilities
- Token tracking logic mixed with execution logic
- Validation attempt recording mixed with retry logic
- Difficult to test retry logic independently

**Proposed decomposition:**
```typescript
// Main retry orchestrator
private async executeWithValidationRetries(
    context: ExecutionContext
): Promise<AIPromptResult> {
    const retryManager = new RetryManager(context.validationRetries);
    
    while (retryManager.hasRetriesLeft()) {
        const attempt = await this.executeSingleAttempt(context);
        
        if (attempt.isValid) {
            return attempt.result;
        }
        
        retryManager.recordFailure(attempt);
        context = await this.prepareRetryContext(context, attempt);
    }
    
    throw new ValidationRetriesExhaustedError(retryManager.getAttempts());
}

// Separate retry management
class RetryManager {
    constructor(private maxRetries: number) {}
    hasRetriesLeft(): boolean
    recordFailure(attempt: AttemptResult): void
    getAttempts(): AttemptResult[]
}

// Single attempt execution
private async executeSingleAttempt(context: ExecutionContext): Promise<AttemptResult> {
    const result = await this.executeWithTokenTracking(context);
    const validation = await this.validateResult(result, context);
    return new AttemptResult(result, validation);
}
```

### 7. **AIPromptRunner.executeSinglePrompt** - 90 lines

**Current problems:**
- While shorter than others, still handles too many concerns
- Mixed responsibilities: model selection, execution, result processing
- Complex error handling mixed with business logic

**Proposed decomposition:**
```typescript
// Simplified main method
private async executeSinglePrompt(
    params: AIPromptParams,
    context: ExecutionContext
): Promise<AIPromptResult> {
    const model = await this.selectExecutionModel(params, context);
    const promptText = await this.preparePromptText(params, context);
    const result = await this.callModel(model, promptText, params);
    return this.processModelResult(result, params);
}

// Focused helper methods
private async selectExecutionModel(params: AIPromptParams, context: ExecutionContext): Promise<AIModel>
private async preparePromptText(params: AIPromptParams, context: ExecutionContext): Promise<string>
private async callModel(model: AIModel, prompt: string, params: AIPromptParams): Promise<ModelResult>
private processModelResult(result: ModelResult, params: AIPromptParams): Promise<AIPromptResult>
```

## Common Patterns to Extract

### Progress Tracking Utility
```typescript
class ExecutionProgressTracker {
    startTracking(taskId: string): void
    updateProgress(taskId: string, progress: number): void
    completeTask(taskId: string, result: any): void
    getProgress(taskId: string): ProgressInfo
}
```

### Cancellation Manager
```typescript
class CancellationManager {
    checkCancellation(): void
    registerCancellableTask(task: Task): void
    cancelAll(): void
    isCancelled(): boolean
}
```

### Error Factory
```typescript
class AIPromptErrorFactory {
    static validationError(message: string, details?: any): AIPromptError
    static executionError(message: string, cause?: Error): AIPromptError
    static timeoutError(message: string, timeout: number): AIPromptError
    static modelNotFoundError(modelId: string): AIPromptError
}
```

### Token Tracking
```typescript
class TokenUsageTracker {
    startTracking(executionId: string): void
    recordTokens(executionId: string, input: number, output: number): void
    getTotalUsage(executionId: string): TokenUsage
    reset(executionId: string): void
}
```

## Benefits of Refactoring

1. **Improved Testability**: Each small method can be unit tested independently
2. **Better Readability**: Methods fit on one screen and have clear single purposes
3. **Easier Maintenance**: Changes are localized to specific responsibilities
4. **Enhanced Reusability**: Common patterns are extracted into reusable utilities
5. **Clearer Debugging**: Stack traces are more meaningful with well-named small methods
6. **Greater Flexibility**: Strategy pattern allows easy addition of new behaviors
7. **Reduced Complexity**: Lower cognitive load when understanding individual methods
8. **Better Error Handling**: Centralized error creation and handling

## Implementation Priority

1. **High Priority**: 
   - `executePromptInParallel` (241 lines)
   - `buildModelVendorCandidates` (190 lines)
   - `ExecutePrompt` (160 lines)

2. **Medium Priority**:
   - `parseAndValidateResultEnhanced` (155 lines)
   - `executeWithValidationRetries` (145 lines)
   - `renderChildPromptTemplates` (145 lines)

3. **Lower Priority**:
   - `executeSinglePrompt` (90 lines)
   - Extract common utilities

## Testing Strategy

For each refactored method:
1. Write unit tests for each extracted method
2. Ensure existing integration tests still pass
3. Add tests for edge cases now visible in smaller methods
4. Test error handling paths explicitly
5. Verify performance hasn't degraded

## Migration Approach

1. Start with one high-priority method
2. Extract one responsibility at a time
3. Ensure tests pass after each extraction
4. Gradually migrate calling code
5. Remove old method once fully migrated
6. Document new patterns for team