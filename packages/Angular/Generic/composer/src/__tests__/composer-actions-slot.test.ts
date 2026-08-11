import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Placement contract for host-projected composer actions (`actionsTemplate`).
 *
 * This package owns the action strip's markup, so the ordering and visibility guarantees are
 * asserted here rather than in `ng-conversations`, which owns the slot that feeds it. Both halves
 * are template-source specs: `MessageInputBoxComponent` renders a live editor with mention
 * plugins, which makes a TestBed render disproportionate for what are placement guarantees.
 */
describe('message-input-box — projected composer actions', () => {
  const html = readFileSync(
    resolve(__dirname, '../lib/components/message/message-input-box.component.html'),
    'utf8'
  );
  const ts = readFileSync(
    resolve(__dirname, '../lib/components/message/message-input-box.component.ts'),
    'utf8'
  );

  it('accepts the template as a nullable TemplateRef input', () => {
    expect(ts).toContain('@Input() actionsTemplate: TemplateRef<unknown> | null = null;');
  });

  it('renders projected actions LAST, after every stock control', () => {
    // Additive-and-last is the same contract headerActions carries, and it is what keeps Plan
    // Mode's position fixed as the composer gains controls — a host button must never displace
    // a stock one.
    const planMode = html.indexOf('planModeToggle.emit()');
    const attach = html.indexOf('openFilePicker()');
    const voiceOptions = html.indexOf('onRealtimeOptionsClick()');
    const outlet = html.indexOf('*ngTemplateOutlet="actionsTemplate');

    expect(planMode).toBeGreaterThanOrEqual(0);
    expect(outlet).toBeGreaterThan(planMode);
    expect(outlet).toBeGreaterThan(attach);
    expect(outlet).toBeGreaterThan(voiceOptions);
  });

  it('keeps the outlet INSIDE the action strip', () => {
    // Nesting guard: if the strip's closing tag appears before the outlet, the projected control
    // has escaped .attach-buttons and would render unpositioned over the editor.
    const strip = html.indexOf('class="attach-buttons"');
    const outlet = html.indexOf('*ngTemplateOutlet="actionsTemplate');
    expect(strip).toBeGreaterThanOrEqual(0);
    expect(outlet).toBeGreaterThan(strip);
    expect(html.slice(strip, outlet)).not.toContain('</div>');
  });

  it('renders the strip when ONLY a projected action is present', () => {
    // The silent-failure guard: with every stock control disabled the strip used to collapse, so
    // a host projecting into an otherwise-empty strip got nothing at all and nothing errored.
    const gate = html.match(/@if \(enableAttachments \|\| enableRealtime \|\| enablePlanMode[^)]*\)/);
    expect(gate).not.toBeNull();
    expect(gate![0]).toContain('actionsTemplate');
  });

  it('passes the disabled state into the template context', () => {
    // So a projected control can follow the composer's disabled state without the host having to
    // track composer state itself.
    const outletLine = html.split('\n').find((l) => l.includes('*ngTemplateOutlet="actionsTemplate'));
    expect(outletLine).toBeDefined();
    expect(outletLine).toContain('$implicit: disabled');
    expect(outletLine).toContain('disabled: disabled');
  });
});
