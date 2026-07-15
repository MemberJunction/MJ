import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query, text, attr, createFakeProvider } from '@memberjunction/ng-test-utils';
import { EntityLinkPillComponent } from './entity-link-pill.component';

/**
 * DOM coverage for <mj-entity-link-pill> — a read-only clickable pill for a related record. Its
 * rendering is driven entirely by @Inputs (entityName/recordId/recordName): ngOnChanges resolves
 * entityName via ProviderToUse.EntityByName(...) into `entityInfo`, and the template shows the pill
 * only when `entityInfo && recordId`. The icon/label/tooltip getters derive from entityInfo +
 * recordName. We assert all of that through a fake provider whose EntityByName returns a minimal
 * EntityInfo stub (Icon + Name). The only SharedService path is inside openRecord() (the click
 * handler) — SharedService.Instance is a process singleton not available in the DOM harness, so that
 * click is intentionally NOT exercised (noted below); everything the pill RENDERS is covered.
 */

// Minimal EntityInfo stub — only the fields the pill's getters read (Icon, Name). Same
// minimal-metadata cast the reference specs use for provider.entities / EntityByName.
const ENTITY_STUB = (over: Partial<{ Icon: string; Name: string }> = {}) =>
  ({ Icon: 'fa-robot', Name: 'AI Agent Runs', ...over }) as unknown as EntityInfo;

// `resolves: false` makes EntityByName return undefined (the "entity not found" guard path).
// Note: a default-valued param can't express this — passing `undefined` would re-trigger the
// default — so a boolean flag drives the resolver explicitly.
function render(inputs: Record<string, unknown>, opts: { resolves?: boolean; entity?: EntityInfo } = {}) {
  const resolved: EntityInfo | undefined = opts.resolves === false ? undefined : (opts.entity ?? ENTITY_STUB());
  const fixture = renderComponentFixture(EntityLinkPillComponent, {
    imports: [CommonModule],
    declarations: [EntityLinkPillComponent],
    inputs: { Provider: createFakeProvider({ entityByName: () => resolved }), ...inputs },
  });
  fixture.detectChanges(false);
  return fixture;
}

describe('EntityLinkPillComponent (DOM)', () => {
  it('renders the pill with the record name as its label when entity resolves and recordId is set', () => {
    const fixture = render({ entityName: 'MJ: AI Agent Runs', recordId: 'rec-1', recordName: 'Nightly Run' });
    expect(query(fixture, '.entity-link-pill')).not.toBeNull();
    expect(text(fixture, '.entity-label')).toBe('Nightly Run');
  });

  it('falls back to the entity Name as the label when no recordName is given', () => {
    const fixture = render({ entityName: 'MJ: AI Agent Runs', recordId: 'rec-1', recordName: null });
    expect(text(fixture, '.entity-label')).toBe('AI Agent Runs');
  });

  it('applies the fas-prefixed entity icon class from metadata', () => {
    const fixture = render({ entityName: 'MJ: AI Agent Runs', recordId: 'rec-1' }, { entity: ENTITY_STUB({ Icon: 'fa-robot' }) });
    const icon = query(fixture, '.entity-icon');
    expect(icon?.className).toContain('fas');
    expect(icon?.className).toContain('fa-robot');
  });

  it('builds the tooltip from the entity name and record name', () => {
    const fixture = render({ entityName: 'MJ: AI Agent Runs', recordId: 'rec-1', recordName: 'Nightly Run' });
    expect(attr(fixture, '.entity-link-pill', 'title')).toBe('Open AI Agent Runs: Nightly Run');
  });

  it('does not render the pill when the entity name does not resolve', () => {
    const fixture = render({ entityName: 'Nonexistent', recordId: 'rec-1' }, { resolves: false });
    expect(query(fixture, '.entity-link-pill')).toBeNull();
  });

  it('does not render the pill when recordId is missing even if the entity resolves', () => {
    const fixture = render({ entityName: 'MJ: AI Agent Runs', recordId: null });
    expect(query(fixture, '.entity-link-pill')).toBeNull();
  });
});
