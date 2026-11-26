import { MJGlobal } from '@memberjunction/global';
import { BaseTourPresenter } from './base-tour-presenter';
import { EmbeddedTourPresenterComponent } from './embedded-tour-presenter.component';
import { OverlayTourPresenterComponent } from './overlay-tour-presenter.component';
import { SidePanelTourPresenterComponent } from './side-panel-tour-presenter.component';

const STANDARD_PRESENTERS: ReadonlyArray<{
  key: string;
  cls: new () => BaseTourPresenter;
}> = [
  { key: 'Overlay', cls: OverlayTourPresenterComponent as unknown as new () => BaseTourPresenter },
  { key: 'SidePanel', cls: SidePanelTourPresenterComponent as unknown as new () => BaseTourPresenter },
  { key: 'Embedded', cls: EmbeddedTourPresenterComponent as unknown as new () => BaseTourPresenter },
];

/**
 * Pins `'Overlay'`, `'SidePanel'`, and `'Embedded'` presenters against tree-shaking.
 */
export function EnsureStandardTourPresentersRegistered(): void {
  const factory = MJGlobal.Instance.ClassFactory;
  for (const entry of STANDARD_PRESENTERS) {
    if (factory.GetRegistration(BaseTourPresenter, entry.key) === null) {
      factory.Register(BaseTourPresenter, entry.cls, entry.key);
    }
  }
}
