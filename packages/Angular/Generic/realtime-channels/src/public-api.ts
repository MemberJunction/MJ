/**
 * @packageDocumentation
 *
 * # @memberjunction/ng-realtime-channels
 *
 * Build realtime-agent channels in Angular without the call overlay.
 *
 * - {@link AngularComponentChannel}: wrap an EXISTING Angular component as a channel surface: a descriptor plus a few
 *   binding functions.
 * - {@link EnableChannelFrameCapture} / {@link ChannelFrameCapture}: the opt-in DOM rasterizer that lets a channel show
 *   the model what a surface looks like.
 *
 * See `guides/REALTIME_CHANNELS_GUIDE.md`.
 */

export * from './lib/angular-component-channel';
export * from './lib/channel-frame-capture';
export * from './lib/dom-frame-capture';
