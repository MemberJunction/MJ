import { InjectionToken } from '@angular/core';
import { LocalMediaController, type ILocalMediaController } from '@memberjunction/ai-realtime-client/media';

/**
 * Makes the camera-and-microphone controller a component runs on, such as a lobby's `MediaPreview`. The default is the
 * browser's `LocalMediaController`; a test provides a fake, and a host on another platform its own. A factory, not one
 * shared controller, since each lobby or preview owns its controller and disposes it.
 */
export const LOCAL_MEDIA_CONTROLLER_FACTORY = new InjectionToken<() => ILocalMediaController>('LOCAL_MEDIA_CONTROLLER_FACTORY', {
  providedIn: 'root',
  factory: () => () => new LocalMediaController(),
});
