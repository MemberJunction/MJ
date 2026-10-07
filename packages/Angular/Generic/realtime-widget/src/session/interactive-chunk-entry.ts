/**
 * The Interactive Component channel, as its own download.
 *
 * It carries the React runtime and the component host, which together dwarf the rest of the call code, and only
 * a session whose scope includes this channel can use them. `lazy-channels.ts` imports this module on demand;
 * the bundler turns that import into a separate file.
 */
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';
import { InteractiveComponentChannel } from '@memberjunction/ng-conversations/dist/lib/components/realtime/interactive-component/interactive-component-channel';
import { INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS } from '@memberjunction/ng-conversations/dist/lib/components/realtime/interactive-component/interactive-component-types';

/** Registers the channel with the ClassFactory under its `ClientPluginClass` key, unless something already did. */
export function EnsureInteractiveComponentChannelRegistered(): void {
  const factory = MJGlobal.Instance.ClassFactory;
  if (factory.GetRegistration(BaseRealtimeChannelClient, INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS) === null) {
    factory.Register(BaseRealtimeChannelClient, InteractiveComponentChannel, INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS);
  }
}
