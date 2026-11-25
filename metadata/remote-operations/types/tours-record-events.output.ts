/** Output of `Tours.RecordEvents`. */
export interface ToursRecordEventsOutput {
  Success: boolean;
  ProcessedCount: number;
  RunIdsByClientId?: Record<string, string>;
  AutoPausedTourKeys?: string[];
  ErrorMessage?: string;
}
