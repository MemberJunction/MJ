/** Output of `Tours.GetSurfaceTours`. */
export interface ToursGetSurfaceToursOutput {
  Success: boolean;
  SurfaceId?: string;
  SurfaceKey?: string;
  ConversationWidgetInstanceId?: string;
  ToursJson: string;
  RunsJson: string;
  ErrorMessage?: string;
}
