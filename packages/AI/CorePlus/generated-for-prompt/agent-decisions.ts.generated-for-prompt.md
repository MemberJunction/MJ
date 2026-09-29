```ts
type AgentDecisionQuestion =
    | { kind: 'Likelihood'; instructions: string }  // yes/no -> probability of yes
    | { kind: 'Choice'; instructions: string; options: Array<{ value: string; description: string }> }  // pick one (2..255 options)
    | { kind: 'Score'; instructions: string; levels: string[] };  // ordered rubric, lowest first (2..10 levels), each level a description

interface AgentDecisionRequest {
    id: string;  // Names this request. The answers come back under it.
    state?: string;  // What the questions are about. Either literal text, or a path into the payload starting "payload."...
    forEachItemIn?: string;  // Ask the same questions of each item of a payload array, one decision per item (for example...
    questions: Record<string, AgentDecisionQuestion>;  // The questions, keyed by a short label for code.
}

interface AgentDecisionResult {
    id: string;  // The ID of the decision request these answers correspond to.
    success: boolean;  // Whether the decision execution succeeded.
    error?: string;  // Error message if the decision execution failed.
    skippedCount?: number;  // Number of items skipped if forEachItemIn exceeded decisionsMaxItems cap.
    answers?: Record<string, AgentDecisionAnswerSummary> | Array<Record<string, AgentDecisionAnswerSummary>>;  // Per question: a Likelihood's probability, or a Choice/Score value with its confidence. One entry...
}

interface AgentDecisionAnswerSummary {
    probability?: number;  // A Likelihood's probability of yes.
    value?: string | number;  // A Choice's option value, or a Score's position from 0 (lowest level).
    confidence?: number;  // How confident the model is in `value` (0..1).
}
```

Decisions are answered inline at no turn cost; the answers arrive on the next turn.
Use them for small, known answer spaces; never for writing, arithmetic or dates.
