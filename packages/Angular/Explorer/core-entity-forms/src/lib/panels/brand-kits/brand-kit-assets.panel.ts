import { Component } from '@angular/core';
import { IMetadataProvider } from '@memberjunction/core';
import { MJBrandKitEntity } from '@memberjunction/core-entities';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';

/**
 * Brand Kit Assets form panel (`after-fields` slot on `MJ: Brand Kits`).
 * Wraps `<mj-brand-kit-assets-editor>` from `@memberjunction/ng-brand-kits`.
 */
@RegisterClassEx(BaseFormPanel, {
  key: 'MJBrandKitAssetsPanel',
  skipNullKeyWarning: true,
  metadata: {
    entity: 'MJ: Brand Kits',
    slot: 'after-fields',
    sortKey: 20,
  },
})
@Component({
  standalone: false,
  selector: 'mj-brand-kit-assets-panel',
  templateUrl: './brand-kit-assets.panel.html',
  styleUrls: ['./brand-kit-assets.panel.css'],
})
export class BrandKitAssetsPanelComponent extends BaseFormPanel<MJBrandKitEntity> {
  public get HostProvider(): IMetadataProvider | null {
    return this.FormComponent?.ProviderToUse ?? null;
  }
}

export function LoadBrandKitAssetsPanelComponent(): void {
  // Prevents tree-shaking of @RegisterClassEx registration
}
