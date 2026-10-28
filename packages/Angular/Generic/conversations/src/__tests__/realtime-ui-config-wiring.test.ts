import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ResolveRealtimeUi, DEFAULT_REALTIME_UI_SIGNALS } from '../lib/components/realtime/realtime-ui-config';

const here = dirname(fileURLToPath(import.meta.url));
const overlayDir = resolve(here, '../lib/components/realtime');
const overlaySource =
  readFileSync(resolve(overlayDir, 'realtime-session-overlay.component.html'), 'utf8') +
  readFileSync(resolve(overlayDir, 'realtime-session-overlay.component.ts'), 'utf8');

describe('every resolved UI output is read by the overlay (#6101)', () => {
  const keys = Object.keys(ResolveRealtimeUi(undefined, DEFAULT_REALTIME_UI_SIGNALS));
  it.each(keys)('%s is bound in the overlay template or component', (key) => {
    const bound = overlaySource.includes(`Ui.${key}`) || overlaySource.includes(`_ui.${key}`);
    expect(bound, `ResolvedRealtimeUi.${key} is computed but nothing in the overlay reads it`).toBe(true);
  });
});
