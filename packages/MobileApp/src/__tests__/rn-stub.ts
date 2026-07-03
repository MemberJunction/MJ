import { vi } from 'vitest';

/**
 * Minimal `react-native` stand-in for tests.
 *
 * The real `react-native` entry point is Flow-typed JS (`import typeof …`) that
 * Vite/Rollup cannot parse, and it's a native module regardless. The mobile app's
 * pure UI modules only need host-component tags + a couple of statics, so we alias
 * `react-native` to this stub (see vitest.config.ts). Primitives are plain string
 * tags so a rendered element tree is trivial to introspect; `Linking.openURL` is a
 * spy tests can assert against.
 */
export const View = 'View';
export const Text = 'Text';
export const ScrollView = 'ScrollView';
export const Pressable = 'Pressable';
export const StyleSheet = { create: <T>(styles: T): T => styles };
export const Linking = { openURL: vi.fn(() => Promise.resolve(true)) };
export const Platform = { OS: 'ios' as const };
