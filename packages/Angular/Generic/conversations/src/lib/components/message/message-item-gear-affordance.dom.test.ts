import { describe, it, expect } from 'vitest';
import { MessageItemComponent } from './message-item.component';

/**
 * Spec for the agent-run gear's render gate.
 *
 * The gear opens a panel that hosts three sibling blocks: the run-details section
 * (only when `showAgentRunDetails`), associated tasks, and — on non-last messages —
 * the delete / rating / pin overflow. `hasAgentDetailsPanelContent` must mirror those
 * template conditions EXACTLY: return false while the panel would render something and
 * the gear vanishes with content behind it; return true while it would render nothing
 * and the gear is a dead control opening an empty popup.
 *
 * Constructed off the prototype — the gate is pure derived state, and a full render of
 * MessageItemComponent needs the whole component graph.
 * (Co-located as .dom.test.ts because importing the component pulls the Angular graph
 * the node project can't load.)
 */
describe('MessageItemComponent — agent-run gear render gate', () => {
  // `messageStatus` reads message.Status, so the fixture carries a message —
  // default 'Complete' (the common case) and overridable per test.
  const gearItem = (fields: Record<string, unknown>): MessageItemComponent => {
    const item = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    Object.assign(item as unknown as Record<string, unknown>, {
      message: { ID: 'm1', Status: 'Complete' },
      showAgentRunDetails: true,
      detailTasks: [],
      isLastMessage: false,
      allowMessageDelete: false,
      allowPinning: false,
      showMessageRating: false,
      ...fields,
    });
    return item;
  };

  it('is true by default (showAgentRunDetails=true) — gear renders exactly as before', () => {
    expect(gearItem({}).hasAgentDetailsPanelContent).toBe(true);
  });

  it('is FALSE on a last message with run-details off and no actions/tasks — gear hidden', () => {
    expect(gearItem({ showAgentRunDetails: false, isLastMessage: true }).hasAgentDetailsPanelContent).toBe(false);
  });

  it('stays true with run-details off when the panel still hosts something', () => {
    expect(gearItem({ showAgentRunDetails: false, detailTasks: [{}] }).hasAgentDetailsPanelContent).toBe(true);
    expect(gearItem({ showAgentRunDetails: false, allowPinning: true }).hasAgentDetailsPanelContent).toBe(true);
    expect(gearItem({ showAgentRunDetails: false, showMessageRating: true }).hasAgentDetailsPanelContent).toBe(true);
  });

  it('is FALSE for a non-last message with run-details off and every action disabled', () => {
    expect(gearItem({ showAgentRunDetails: false }).hasAgentDetailsPanelContent).toBe(false);
  });

  // The template renders the rating ONLY inside `@if (messageStatus === 'Complete')`,
  // so counting showMessageRating on an incomplete message would put the gear back
  // over an empty panel — the exact bug this gate exists to prevent.
  it('does NOT count the rating on a non-Complete message (it would not render)', () => {
    for (const Status of ['In-Progress', 'Error'] as const) {
      expect(
        gearItem({ showAgentRunDetails: false, showMessageRating: true, message: { ID: 'm1', Status } })
          .hasAgentDetailsPanelContent
      ).toBe(false);
    }
  });

  it('still counts delete/pin on a non-Complete message (those render outside the status branch)', () => {
    const incomplete = { ID: 'm1', Status: 'Error' };
    expect(
      gearItem({ showAgentRunDetails: false, allowPinning: true, message: incomplete }).hasAgentDetailsPanelContent
    ).toBe(true);
    // isConversationOwner is a getter — seed the state it derives from, don't assign it.
    const ownerId = '11111111-1111-1111-1111-111111111111';
    expect(
      gearItem({
        showAgentRunDetails: false,
        allowMessageDelete: true,
        conversation: { UserID: ownerId },
        currentUser: { ID: ownerId },
        message: incomplete,
      }).hasAgentDetailsPanelContent
    ).toBe(true);
  });
});
