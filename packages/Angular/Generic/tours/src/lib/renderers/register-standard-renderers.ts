import { MJGlobal } from '@memberjunction/global';
import { ActionStepRenderer } from './action-step-renderer.component';
import { BannerStepRenderer } from './banner-step-renderer.component';
import { BaseTourStepRenderer } from './base-step-renderer';
import { BeaconStepRenderer } from './beacon-step-renderer.component';
import { ChoiceStepRenderer } from './choice-step-renderer.component';
import { ModalStepRenderer } from './modal-step-renderer.component';
import { SpotlightStepRenderer } from './spotlight-step-renderer.component';

const CORE_RENDERER_CLASSES: ReadonlyArray<{
  key: string;
  cls: new () => BaseTourStepRenderer;
}> = [
  { key: 'Spotlight', cls: SpotlightStepRenderer as unknown as new () => BaseTourStepRenderer },
  { key: 'Action', cls: ActionStepRenderer as unknown as new () => BaseTourStepRenderer },
  { key: 'Beacon', cls: BeaconStepRenderer as unknown as new () => BaseTourStepRenderer },
  { key: 'Modal', cls: ModalStepRenderer as unknown as new () => BaseTourStepRenderer },
  { key: 'Banner', cls: BannerStepRenderer as unknown as new () => BaseTourStepRenderer },
  { key: 'Choice', cls: ChoiceStepRenderer as unknown as new () => BaseTourStepRenderer },
];

/**
 * Pins the 6 core eager Light DOM step renderers against tree-shaking and guarantees
 * ClassFactory registration when bundled with `esbuild`.
 */
export function EnsureStandardTourRenderersRegistered(): void {
  const factory = MJGlobal.Instance.ClassFactory;
  for (const entry of CORE_RENDERER_CLASSES) {
    if (factory.GetRegistration(BaseTourStepRenderer, entry.key) === null) {
      factory.Register(BaseTourStepRenderer, entry.cls, entry.key);
    }
  }
}
