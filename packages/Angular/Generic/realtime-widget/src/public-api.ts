/*
 * Public API of @memberjunction/ng-realtime-widget.
 *
 * The widget is usable two ways: as an Angular component (`RealtimeWidgetComponent`, selector
 * `mj-realtime-widget`), and as a one-script custom element (`dist/element/mj-realtime-widget.js`, built by
 * `pnpm run build`; `RegisterRealtimeWidgetElement` for an Angular host that wants the element too).
 */
export * from './lib/types';
export * from './lib/config';
export * from './lib/strings';
export * from './lib/element-types';
export * from './lib/realtime-widget.element';
export * from './lib/components/realtime-widget.component';
export * from './lib/components/widget-consent-gate.component';
export * from './lib/components/widget-status.component';
export * from './lib/components/widget-global-styles.component';
export * from './lib/channels/built-in-channels';
export * from './lib/session/widget-controller';
export * from './lib/session/widget-ports';
export * from './lib/session/perception-bridge';
export * from './lib/session/frame-capture-hook';
export * from './lib/csp-nonce';
export * from './lib/auth/widget-auth.adapter';
export * from './lib/auth/widget-auth.browser';
export * from './lib/auth/widget-key-client';
export * from './lib/lifecycle/widget-page-close';
export * from './lib/lifecycle/widget-page-close.browser';
export * from './lib/resume/widget-resume-store';
export * from './lib/theme/widget-theme';
