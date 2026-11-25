/** Output of `Tours.EvaluatePredicates`. */
export interface ToursEvaluatePredicatesOutput {
  Success: boolean;
  Results: Record<string, {
    Satisfied: boolean;
    RowCount?: number;
    ErrorMessage?: string;
  }>;
  ErrorMessage?: string;
}
