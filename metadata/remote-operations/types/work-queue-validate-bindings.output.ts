/** One validation finding. */
export interface WorkQueueBindingIssueRow {
    Severity: 'Error' | 'Warning';
    /** The topic, subscription or resource the finding is about. */
    Subject: string;
    Message: string;
}

/** Output of `WorkQueue.ValidateBindings`. */
export interface WorkQueueValidateBindingsOutput {
    issues: WorkQueueBindingIssueRow[];
}
