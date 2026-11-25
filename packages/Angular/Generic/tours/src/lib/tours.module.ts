import { NgModule } from '@angular/core';
import { MJTourAnchorDirective } from './anchors/mj-tour-anchor.directive';
import { MJTourHostComponent } from './host/mj-tour-host.component';
import { TourGlobalStylesComponent } from './overlay/tour-global-styles.component';
import { TourSpotlightOverlayComponent } from './overlay/tour-spotlight-overlay.component';
import { EmbeddedTourPresenterComponent } from './presenters/embedded-tour-presenter.component';
import { OverlayTourPresenterComponent } from './presenters/overlay-tour-presenter.component';
import { SidePanelTourPresenterComponent } from './presenters/side-panel-tour-presenter.component';

const TOUR_STANDALONE_EXPORTS = [
  MJTourHostComponent,
  MJTourAnchorDirective,
  TourGlobalStylesComponent,
  TourSpotlightOverlayComponent,
  OverlayTourPresenterComponent,
  SidePanelTourPresenterComponent,
  EmbeddedTourPresenterComponent,
];

@NgModule({
  imports: TOUR_STANDALONE_EXPORTS,
  exports: TOUR_STANDALONE_EXPORTS,
})
export class MJToursModule {}
