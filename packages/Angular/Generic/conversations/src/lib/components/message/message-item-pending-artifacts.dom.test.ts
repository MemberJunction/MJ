import { describe, it, expect } from 'vitest';
import { MessageItemComponent } from './message-item.component';

/**
 * Spec for the pending-artifact placeholder gate.
 *
 * A message's artifact ENTITIES load asynchronously — a version's `Content` can be arbitrarily
 * large — while their display data is known synchronously. Before this gate that window rendered
 * nothing at all: the reply looked finished, then a card appeared seconds later, which reads as
 * "generation failed" rather than "still loading".
 *
 * The gate is per artifact, not all-or-nothing. A message can legitimately hold a loaded report
 * and an in-flight image at once (an agent that emits a report plus a standalone infographic), and
 * suppressing on `displayArtifacts.length > 0` would leave that image's window silent — the exact
 * case the placeholders exist for.
 *
 * Constructed off the prototype — the gate is pure derived state, and a full render of
 * MessageItemComponent needs the whole component graph.
 * (Co-located as .dom.test.ts because importing the component pulls the Angular graph
 * the node project can't load.)
 */
describe('MessageItemComponent — pending artifact placeholders', () => {
  const item = (fields: Record<string, unknown>): MessageItemComponent => {
    const c = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    Object.assign(c as unknown as Record<string, unknown>, {
      message: { ID: 'm1', Status: 'Complete' },
      artifacts: [],
      artifact: undefined,
      artifactVersion: undefined,
      pendingArtifacts: [],
      ...fields,
    });
    return c;
  };

  const pending = (id: string, name = `Artifact ${id}`, visibility = 'Always') => ({
    artifactId: id,
    artifactName: name,
    visibility,
  });
  const loaded = (id: string) => ({ artifact: { ID: id }, version: { ID: `${id}-v1` } });

  it('renders nothing when the message has no artifacts', () => {
    expect(item({}).pendingArtifactPlaceholders).toEqual([]);
  });

  it('renders one placeholder per pending artifact', () => {
    expect(item({ pendingArtifacts: [pending('a')] }).pendingArtifactPlaceholders).toHaveLength(1);
    expect(
      item({ pendingArtifacts: [pending('a'), pending('b'), pending('c')] }).pendingArtifactPlaceholders
    ).toHaveLength(3);
  });

  it('carries the name through so the placeholder can say what is arriving', () => {
    const c = item({ pendingArtifacts: [pending('a', 'Q3 Infographic')] });
    expect(c.pendingArtifactPlaceholders[0].artifactName).toBe('Q3 Infographic');
  });

  it('drops a placeholder once that artifact has loaded', () => {
    const c = item({ pendingArtifacts: [pending('a')], artifacts: [loaded('a')] });
    expect(c.pendingArtifactPlaceholders).toEqual([]);
  });

  // The case the all-or-nothing version got wrong: one artifact loaded, another still in flight.
  it('keeps the placeholder for an artifact still loading beside one already rendered', () => {
    const c = item({
      pendingArtifacts: [pending('report'), pending('image', 'Infographic')],
      artifacts: [loaded('report')],
    });
    expect(c.displayArtifacts).toHaveLength(1);
    expect(c.pendingArtifactPlaceholders.map(p => p.artifactId)).toEqual(['image']);
  });

  // The legacy single-artifact inputs feed displayArtifacts too, so they must suppress it as well.
  it('honours the legacy single inputs when matching against loaded artifacts', () => {
    const c = item({
      pendingArtifacts: [pending('a')],
      artifact: { ID: 'a' },
      artifactVersion: { ID: 'a-v1' },
    });
    expect(c.displayArtifacts).toHaveLength(1);
    expect(c.pendingArtifactPlaceholders).toEqual([]);
  });

  // The IDs come from different sources — one from the conversation query, one off a loaded
  // entity — and SQL Server returns upper-case UUIDs where PostgreSQL returns lower-case. A
  // case-sensitive match left the placeholder sitting above the very card it was waiting for.
  it('matches artifact IDs case-insensitively', () => {
    const c = item({
      pendingArtifacts: [pending('abc-123')],
      artifacts: [{ artifact: { ID: 'ABC-123' }, version: { ID: 'ABC-123-v1' } }],
    });
    expect(c.pendingArtifactPlaceholders).toEqual([]);
  });

  it('allocates nothing while nothing is pending — the getter is on a per-second refresh path', () => {
    const c = item({});
    expect(c.pendingArtifactPlaceholders).toBe(c.pendingArtifactPlaceholders);
  });

  it('labels the placeholder with what it is waiting for, and says it is loading', () => {
    const c = item({});
    expect(c.pendingLabel(pending('a', 'Q3 Infographic'))).toBe('Loading Q3 Infographic...');
    expect(c.pendingLabel(pending('a', ''))).toBe('Loading attachment...');
  });
});
