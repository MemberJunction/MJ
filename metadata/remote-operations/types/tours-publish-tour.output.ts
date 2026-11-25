/** Output of `Tours.PublishTour`. */
export interface ToursPublishTourOutput {
  Success: boolean;
  TourId?: string;
  TourVersionId?: string;
  VersionNumber?: number;
  UnchangedSnapshot?: boolean;
  ErrorMessage?: string;
}
