/**
 * Channels the widget keeps OUT of its call chunk and downloads only when a session could use them.
 *
 * The runtime asks, before it builds any channel plugin, whether the host needs to load channel code (see
 * `RealtimeSessionRuntime.ChannelClassLoader`), passing the `ClientPluginClass` key of every channel the session
 * could include: the registry's rows plus what the page and the widget instance declared. A key that has a lazy
 * loader here triggers its download; every other key resolves from what is already loaded. A session that never
 * names the Interactive Component channel never downloads it.
 */
import { INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS } from '@memberjunction/ng-conversations/dist/lib/components/realtime/interactive-component/interactive-component-types';

/** One channel whose code loads on demand. */
export interface LazyChannelLoader {
  /** The `ClientPluginClass` key that needs this loader. */
  Key: string;
  /** Downloads the channel's code and registers it with the ClassFactory. */
  Load(): Promise<void>;
}

/**
 * The widget's lazy channels.
 *
 * Why a dynamic `import()` is correct here (MJ allows one for a measured bundle-size deferral): the Interactive
 * Component channel pulls in the React runtime and the component host, the heaviest part of the whole call code,
 * and most sessions never open a component. The bundler splits this import into its own file, fetched relative to
 * the call chunk.
 */
export const LAZY_CHANNEL_LOADERS: readonly LazyChannelLoader[] = [
  {
    Key: INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS,
    async Load(): Promise<void> {
      const chunk = await import('../../session/interactive-chunk-entry');
      chunk.EnsureInteractiveComponentChannelRegistered();
    }
  }
];

/**
 * Builds the loader the runtime calls: loads each lazy channel the keys name, once, in parallel. A failure to
 * load one is reported by throwing (the runtime logs it and carries on without that channel).
 *
 * @param loaders The lazy channels (defaults to the widget's own).
 */
export function CreateChannelClassLoader(loaders: readonly LazyChannelLoader[] = LAZY_CHANNEL_LOADERS): (keys: readonly string[]) => Promise<void> {
  const inFlight = new Map<string, Promise<void>>();
  return async (keys) => {
    const wanted = loaders.filter((loader) => keys.includes(loader.Key));
    const results = await Promise.allSettled(
      wanted.map((loader) => {
        let load = inFlight.get(loader.Key);
        if (!load) {
          load = loader.Load();
          inFlight.set(loader.Key, load);
          load.catch(() => inFlight.delete(loader.Key)); // a failed download is retried by the next session
        }
        return load;
      })
    );
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed.length > 0) {
      throw new Error(`Could not load channel code: ${failed.map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason))).join('; ')}`);
    }
  };
}
