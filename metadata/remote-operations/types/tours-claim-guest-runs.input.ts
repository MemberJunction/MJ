/** Input payload for `Tours.ClaimGuestRuns` (attaches prior guest visitor tour runs to the newly authenticated MJ user). */
export interface ToursClaimGuestRunsInput {
  VisitorKey: string;
  SurfaceKey?: string;
}
