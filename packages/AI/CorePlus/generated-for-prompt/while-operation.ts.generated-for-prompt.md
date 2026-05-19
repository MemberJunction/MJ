```ts
interface WhileOperation {
    condition: string;  // Boolean expression evaluated before each iteration
    itemVariable?: string;  // Variable name for attempt context (default: "attempt")
    maxIterations?: number;  // Maximum iterations (undefined=100, 0=unlimited, >0=limit)
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
}
```
