import { NgModule } from '@angular/core';
import { MjAvatarStudioComponent } from './avatar-studio.component';
import { MjAvatarPickerTriggerComponent } from './avatar-picker-trigger.component';

/**
 * Convenience NgModule exporting the standalone Avatar Studio components for
 * NgModule-based hosts. Standalone components can also import
 * `MjAvatarStudioComponent` and `MjAvatarPickerTriggerComponent` directly.
 */
@NgModule({
  imports: [MjAvatarStudioComponent, MjAvatarPickerTriggerComponent],
  exports: [MjAvatarStudioComponent, MjAvatarPickerTriggerComponent],
})
export class AvatarStudioModule {}
