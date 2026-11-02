import { NgModule } from '@angular/core';
import { BrandKitAssetsEditorComponent } from './brand-kit-assets-editor/brand-kit-assets-editor.component';
import { BrandKitCreatorComponent } from './brand-kit-creator/brand-kit-creator.component';
import { BrandKitGenerationPolicyEditorComponent } from './brand-kit-generation-policy-editor/brand-kit-generation-policy-editor.component';

@NgModule({
  imports: [
    BrandKitAssetsEditorComponent,
    BrandKitCreatorComponent,
    BrandKitGenerationPolicyEditorComponent,
  ],
  exports: [
    BrandKitAssetsEditorComponent,
    BrandKitCreatorComponent,
    BrandKitGenerationPolicyEditorComponent,
  ],
})
export class BrandKitsModule {}
