```ts
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
    subAgent?: {
        name: string;
        message: string;
        templateParameters?: Record<string, string>;
        context?: unknown;  // Runtime context propagated to the sub-agent.
    };  // Execute sub-agent per iteration
}
```
