import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Services
import { ScriptLoaderService } from './services/script-loader.service';
import { ReactBridgeService } from './services/react-bridge.service';
import { ComponentCompilerService } from './services/component-compiler.service';
import { ComponentRegistryService } from './services/component-registry.service';

// Components
import { ReactComponentComponent } from './components/react-component.component';

@NgModule({
  declarations: [
    ReactComponentComponent
  ],
  imports: [
    CommonModule
  ],
  providers: [
    ScriptLoaderService,
    ReactBridgeService,
    ComponentCompilerService,
    ComponentRegistryService
  ],
  exports: [
    ReactComponentComponent
  ]
})
export class ReactComponentHostModule {}