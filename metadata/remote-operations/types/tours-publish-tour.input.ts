/** Input payload for `Tours.PublishTour` (creates an immutable `TourVersion` snapshot and activates the tour in Tour Studio). */
export interface ToursPublishTourInput {
  TourId: string;
  ChangeSummary?: string;
  Activate?: boolean;
}
