/**
 * @fileoverview Entry point for the standalone Angular 21 MemberJunction Browser Extension
 * Side Panel application (`chrome-extension://<id>/sidepanel.html`).
 *
 * Mounts `<mj-extension-sidepanel-app>` with `@memberjunction/ng-conversations` and
 * `@memberjunction/ng-browser-extension` directly against `MJAPI` (zero `<iframe>`, zero `MJExplorer`).
 */

import { provideHttpClient } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { InstallExtensionMediaCompat } from './extension-media-compat';
import { SIDE_PANEL_REGISTERED_CLASS_NAMES } from './generated/class-registrations';
import { ExtensionSidePanelRootComponent } from './sidepanel-root.component';

// Retain all @RegisterClass decorators across core-entities, ai-core-plus, ng-conversations, and browser-extension-core
void SIDE_PANEL_REGISTERED_CLASS_NAMES.length;

// Enable MV3-compliant AudioWorklet loading and one-time Side Panel microphone permission popup
InstallExtensionMediaCompat();

bootstrapApplication(ExtensionSidePanelRootComponent, {
  providers: [provideAnimations(), provideHttpClient()],
}).catch((err) => {
  console.error('[MJ Extension SidePanel] Angular bootstrap failed:', err);
});
