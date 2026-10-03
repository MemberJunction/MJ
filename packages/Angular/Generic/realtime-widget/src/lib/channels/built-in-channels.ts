import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';
import { IdentityVerificationChannel } from '@memberjunction/ng-conversations/dist/lib/components/realtime/identity-verification/identity-verification-channel';

/**
 * The channel classes this widget ships, by the ClassFactory key a host declaration resolves them through.
 *
 * Why this is a VALUE reference and not just a `Load…()` call: `@memberjunction/ng-conversations` declares
 * `"sideEffects": false`, and esbuild inlines an empty `Load…()` call away, finds the channel class
 * referenced by nothing, and drops its `@RegisterClass` decorator as dead code — the session then runs
 * perfectly, minus the channel, with only a console line to say so (measured on the Caliber widget's
 * whiteboard). Naming the class here is what pins it.
 */
export const BUILT_IN_CHANNEL_CLASSES: ReadonlyArray<{ key: string; channelClass: new () => BaseRealtimeChannelClient }> = [
  { key: 'IdentityVerificationChannel', channelClass: IdentityVerificationChannel }
];

/**
 * Makes sure every shipped channel is registered with the ClassFactory. Registers only when absent, so the
 * day the package's own `@RegisterClass` side effect survives bundling the two can never fight over a key.
 */
export function EnsureBuiltInChannelsRegistered(): void {
  const factory = MJGlobal.Instance.ClassFactory;
  for (const { key, channelClass } of BUILT_IN_CHANNEL_CLASSES) {
    if (factory.GetRegistration(BaseRealtimeChannelClient, key) === null) {
      factory.Register(BaseRealtimeChannelClient, channelClass, key);
    }
  }
}
