/** Single `=MJ.AI(...)` cell evaluation request entry. */
export interface ArtifactAiFormulaCellRequest {
    /** Worksheet identifier. */
    SheetID: string;
    /** Canonical A1 cell coordinate (e.g. `'C4'`). */
    Address: string;
    /** Prompt string extracted from `=MJ.AI(prompt, ...)`. */
    Prompt: string;
    /** Serialized resolved values of referenced cells/ranges. */
    ContextValuesJSON: string;
    /** Deterministic SHA/FNV input hash for cache deduplication. */
    InputHash: string;
}

/** Input payload for `Artifact.EvaluateAiFormula`. */
export interface ArtifactEvaluateAiFormulaInput {
    /** Hosting `MJ: Artifacts` ID for mandatory permission & audit attribution. */
    ArtifactID: string;
    /** Batch of up to 50 `=MJ.AI(...)` cells explicitly triggered for evaluation. */
    Cells: ArtifactAiFormulaCellRequest[];
    /** Optional explicit AI model override name. */
    ModelOverride?: string | null;
}
