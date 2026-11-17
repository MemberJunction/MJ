/** Result for a single evaluated `=MJ.AI(...)` cell. */
export interface ArtifactAiFormulaCellResult {
    /** Worksheet identifier. */
    SheetID: string;
    /** Canonical A1 coordinate. */
    Address: string;
    /** Input hash corresponding to this evaluated output. */
    InputHash: string;
    /** Evaluated text/scalar value from the LLM. */
    Value: string;
    /** Non-fatal cell-level error message if evaluation failed. */
    ErrorMessage?: string | null;
    /** True when permission or quota check refused execution. */
    AccessDenied?: boolean;
}

/** Output payload for `Artifact.EvaluateAiFormula`. */
export interface ArtifactEvaluateAiFormulaOutput {
    /** Evaluated cell results matching requested `Cells`. */
    Results: ArtifactAiFormulaCellResult[];
}
