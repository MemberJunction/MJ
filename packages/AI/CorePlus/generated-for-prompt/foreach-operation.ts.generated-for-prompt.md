```ts
interface LoopBodyActionStep {
    id?: string;  // Optional handle for referencing outputs from later steps in the same iteration (`steps.<id>.*`).
    name: string;  // Action name (canonical MJ Action name or sanitized native tool name).
    params: Record<string, unknown>;  // Parameters passed to the action (`item.field`, `steps.<id>.field`, `payload.*`, `static:*`, or...
    condition?: string;  // Optional boolean expression evaluated before this step runs; falsy skips the step cleanly.
    outputMapping?: string;  // Optional JSON mapping string (`{"ActionOutputField": "payloadPath"}` or `"target[]"`) folding...
}

interface ForEachOperation {
    collectionPath: string;  // Path in payload to array to iterate over
    itemVariable?: string;  // Variable name for current item (default: "item")
    indexVariable?: string;  // Variable name for loop index (default: "index")
    maxIterations?: number;  // Maximum iterations. `undefined` takes the default (1000); any other value is the limit,
    continueOnError?: boolean;  // Continue processing if an iteration fails (default: false)
    delayBetweenIterationsMs?: number;  // Delay between iterations in milliseconds (default: 0)
    executionMode?: 'sequential' | 'parallel';  // Execution mode for iterations (default: 'sequential')
    maxConcurrency?: number;  // Maximum number of iterations to process concurrently when executionMode='parallel' (default: 10)
    action?: {
        name: string;
        params: Record<string, unknown>;
        outputMapping?: string;
    };  // Execute action per iteration
    steps?: LoopBodyActionStep[];  // Execute an ordered sequence of actions per iteration with zero LLM turns between steps.
    subAgent?: {
        name: string;
        message: string;
        templateParameters?: Record<string, string>;
        context?: unknown;  // Runtime context propagated to the sub-agent.
    };  // Execute sub-agent per iteration
    prompt?: {
        name: string;
        templateParameters?: Record<string, string>;  // Values bound into the prompt's template, alongside the loop's own item and index.
        outputMapping?: string;  // JSON mapping from the prompt's response into the payload, per iteration.
    };  // Execute a prompt per iteration.
}
```
