import { Component } from '@angular/core';
import { IMetadataProvider } from '@memberjunction/core';
import { MJBrandKitEntity } from '@memberjunction/core-entities';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';

/**
 * Brand Kit Generation Policy form panel (`after-fields` slot on `MJ: Brand Kits`).
 * Wraps `<mj-brand-kit-generation-policy-editor>` from `@memberjunction/ng-brand-kits`.
 */
@RegisterClassEx(BaseFormPanel, {
  key: 'MJBrandKitGenerationPolicyPanel',
  skipNullKeyWarning: true,
  metadata: {
    entity: 'MJ: Brand Kits',
    slot: 'after-fields',
    sortKey: 30,
  },
})
@Component({
  standalone: false,
  selector: 'mj-brand-kit-generation-policy-panel',
  templateUrl: './brand-kit-generation-policy.panel.html',
  styleUrls: ['./brand-kit-generation-policy.panel.css'],
})
export class BrandKitGenerationPolicyPanelComponent extends BaseFormPanel<MJBrandKitEntity> {
  public get HostProvider(): IMetadataProvider | null {
    return this.FormComponent?.ProviderToUse ?? null;
  }
}

export function LoadBrandKitGenerationPolicyPanelComponent(): void {
  // Prevents tree-shaking of @RegisterClassEx registration
}
