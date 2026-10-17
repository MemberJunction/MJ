import { NgModule } from '@angular/core';
import { BrandKitAssetsEditorComponent } from './brand-kit-assets-editor/brand-kit-assets-editor.component';
import { BrandKitGenerationPolicyEditorComponent } from './brand-kit-generation-policy-editor/brand-kit-generation-policy-editor.component';

@NgModule({
  imports: [BrandKitAssetsEditorComponent, BrandKitGenerationPolicyEditorComponent],
  exports: [BrandKitAssetsEditorComponent, BrandKitGenerationPolicyEditorComponent],
})
export class BrandKitsModule {}
