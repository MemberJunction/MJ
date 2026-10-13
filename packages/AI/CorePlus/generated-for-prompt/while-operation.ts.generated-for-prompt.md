```ts
interface WhileOperation {
    condition: string;  // Boolean expression evaluated before each iteration
    itemVariable?: string;  // Variable name for attempt context (default: "attempt")
    maxIterations?: number;  // Maximum iterations. `undefined` takes the default (100); any other value is the limit,
    continueOnError?: boolean;  // Continue processing if an iteration fails (default: false)
    delayBetweenIterationsMs?: number;  // Delay between iterations in milliseconds (default: 0)
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
    prompt?: {
        name: string;
        templateParameters?: Record<string, string>;  // Values bound into the prompt's template, alongside the loop's own item and index.
        outputMapping?: string;  // JSON mapping from the prompt's response into the payload, per iteration.
    };  // Execute a prompt per iteration.
}
```
