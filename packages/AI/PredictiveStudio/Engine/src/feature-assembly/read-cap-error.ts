/**
 * An explicit row cap (`maxRows` / `MaxRows`) smaller than the rows the read matches (decision D2-C1): training and
 * scoring refuse instead of silently working on a sample. One class, so both paths share one truncation rule and
 * callers branch on `instanceof` and the structured fields, never on the message.
 */
export class ReadCapExceededError extends Error {
  constructor(
    message: string,
    public readonly EntityName: string,
    public readonly MaxRows: number,
    public readonly RowsRead: number,
    public readonly RowsMatched: number,
  ) {
    super(message);
    this.name = 'ReadCapExceededError';
  }

  /**
   * True when an explicit cap cut the read short. No cap means the read was uncapped (`IgnoreMaxRows`), so it can
   * never truncate; an unknown match count cannot prove truncation.
   */
  public static IsTruncated(maxRows: number | undefined, rowsRead: number, rowsMatched: number | undefined): rowsMatched is number {
    return maxRows !== undefined && rowsMatched !== undefined && rowsMatched > rowsRead;
  }

  /** The training refusal (feature assembly). */
  public static ForTraining(entityName: string, maxRows: number, rowsRead: number, rowsMatched: number): ReadCapExceededError {
    return new ReadCapExceededError(
      `FeatureAssembly read ${rowsRead} of ${rowsMatched} rows of '${entityName}' because MaxRows=${maxRows}. ` +
        'Training reads every labelled row: remove maxRows, or narrow the population with a filter, and train again.',
      entityName,
      maxRows,
      rowsRead,
      rowsMatched,
    );
  }

  /** The scoring refusal (Score Record Set scope resolution). */
  public static ForScoring(entityName: string, maxRows: number, rowsRead: number, rowsMatched: number): ReadCapExceededError {
    return new ReadCapExceededError(
      `Score Record Set: the scope matches ${rowsMatched} rows of '${entityName}' but maxRows=${maxRows} would score only ${rowsRead}. ` +
        'Remove maxRows to score every matching row, or narrow the filter.',
      entityName,
      maxRows,
      rowsRead,
      rowsMatched,
    );
  }
}
