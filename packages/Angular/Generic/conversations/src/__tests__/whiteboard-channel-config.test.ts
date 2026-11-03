import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WHITEBOARD_CHANNEL_CONFIG, ParseWhiteboardChannelConfig
} from '../lib/components/realtime/whiteboard/whiteboard-channel-config';

/** U5 — the Whiteboard channel's typed `{ Config, Problems }` config parser. */
describe('ParseWhiteboardChannelConfig', () => {
  it('returns the defaults for an absent or non-object config', () => {
    for (const raw of [undefined, null]) {
      const parsed = ParseWhiteboardChannelConfig(raw);
      expect(parsed.Config).toEqual(DEFAULT_WHITEBOARD_CHANNEL_CONFIG);
      expect(parsed.Problems).toEqual([]);
    }
    expect(DEFAULT_WHITEBOARD_CHANNEL_CONFIG).toEqual({ WidgetAccess: 'full', PersistWidgetState: true });
  });

  it('reads valid camelCase keys into PascalCase fields', () => {
    const parsed = ParseWhiteboardChannelConfig({ widgetAccess: 'inspect-only', persistWidgetState: false });
    expect(parsed.Config).toEqual({ WidgetAccess: 'inspect-only', PersistWidgetState: false });
    expect(parsed.Problems).toEqual([]);
    expect(ParseWhiteboardChannelConfig({ widgetAccess: 'off' }).Config.WidgetAccess).toBe('off');
  });

  it('falls back to the default and reports a problem for each wrongly typed value', () => {
    const parsed = ParseWhiteboardChannelConfig({ widgetAccess: 'read-only', persistWidgetState: 'no' });
    expect(parsed.Config).toEqual(DEFAULT_WHITEBOARD_CHANNEL_CONFIG);
    expect(parsed.Problems).toHaveLength(2);
    expect(parsed.Problems[0]).toContain('"widgetAccess"');
    expect(parsed.Problems[1]).toContain('"persistWidgetState"');
  });

  it('ignores unknown keys and does not share the defaults object', () => {
    const parsed = ParseWhiteboardChannelConfig({ somethingElse: 1, WidgetAccess: 'off' });
    expect(parsed.Config).toEqual(DEFAULT_WHITEBOARD_CHANNEL_CONFIG);
    expect(parsed.Problems).toEqual([]);
    parsed.Config.WidgetAccess = 'off';
    expect(DEFAULT_WHITEBOARD_CHANNEL_CONFIG.WidgetAccess).toBe('full');
  });
});
