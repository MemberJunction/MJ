```ts
type AgentDecisionQuestion =
    | { kind: 'Likelihood'; instructions: string }  // yes/no -> probability of yes
    | { kind: 'Choice'; instructions: string; options: Array<{ value: string; description: string }> }  // pick one (2..255 options)
    | { kind: 'Score'; instructions: string; levels: string[] };  // ordered rubric, lowest first (2..10 levels), each level a description

interface AgentDecisionRequest {
    id: string;  // Names this request. The answers come back under it.
    state?: string;  // What the questions are about. Either literal text, "payload" for the whole payload, or a path...
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

interface AgentFinishIf {
    questions: string[];  // One to three yes/no questions about what the step's results show; each must be a confident yes.
    message: string;  // The final reply to the user if every question passes. Write it as your final message.
}
```

Decisions are answered inline at no turn cost; the answers arrive on the next turn.
Use them for small, known answer spaces; never for writing, arithmetic or dates.
finishIf ends the run after actions or a sub-agent only when every question passes; otherwise you get your normal next turn.
Use it when the step you are requesting should finish the task.
