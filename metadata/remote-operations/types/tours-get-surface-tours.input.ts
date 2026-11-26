/** Input payload for `Tours.GetSurfaceTours` (fetches published tours and visitor progress for an external embed surface). */
export interface ToursGetSurfaceToursInput {
  SurfaceKey: string;
  CurrentUrl?: string;
  Locale?: string;
}
