import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll, text, attr, click } from '@memberjunction/ng-test-utils';
import { ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import type { RealtimeChannelVerbResult } from '@memberjunction/realtime-runtime';
import { IdentityVerificationModel, type IdentityVerificationService } from './identity-verification-model';
import { IdentityVerificationSurfaceComponent, type IdentityVerificationDispatch } from './identity-verification-surface.component';

/**
 * DOM spec for <mj-identity-verification-surface>. The surface owns no rules (the model does — see the
 * channel spec); it must render the model's state faithfully and send the USER's actions back through
 * `Dispatch`. Covered: the three stages (details, code, verified), agent-suggested values being marked
 * until confirmed, what each control dispatches, the accessibility contract (labels, live regions,
 * autofill hints) and the axe scan.
 */
const OK = { Success: true, VerificationState: 'pending' as const, SendsRemaining: 2, AttemptsRemaining: 5 };

function service(): IdentityVerificationService {
  return { Request: async () => OK, SubmitCode: async () => ({ Success: true, VerificationState: 'verified' as const, VerifiedEmail: 'ada@example.com' }) };
}

function render(configure: (m: IdentityVerificationModel) => void = () => undefined) {
  const model = new IdentityVerificationModel(service());
  configure(model);
  const dispatch = vi.fn<IdentityVerificationDispatch>(async (verb, args): Promise<RealtimeChannelVerbResult> => {
    // behave like the channel: user-initiated verbs run as the user
    if (verb === 'fill') return model.Fill(args, 'user');
    if (verb === 'confirm') return model.Confirm(args, 'user');
    if (verb === 'submit') return model.Submit();
    if (verb === 'resend') return model.Resend();
    return model.EnterCode(args);
  });
  const fixture = renderComponentFixture(IdentityVerificationSurfaceComponent, {
    inputs: { Model: model, Dispatch: dispatch, AgentName: 'Sage' },
  });
  return { fixture, model, dispatch };
}

const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('IdentityVerificationSurfaceComponent (DOM)', () => {
  it('renders nothing until a model is bound', () => {
    const fixture = renderComponentFixture(IdentityVerificationSurfaceComponent, {});
    expect(query(fixture, '.idv')).toBeNull();
  });

  it('shows a labelled name and email field with the right keyboard and autofill hints', () => {
    const { fixture } = render();
    expect(text(fixture, 'label[for="idv-name"]')).toBe('Your name');
    expect(text(fixture, 'label[for="idv-email"]')).toBe('Your email');
    expect(attr(fixture, '#idv-name', 'autocomplete')).toBe('name');
    expect(attr(fixture, '#idv-email', 'type')).toBe('email');
    expect(attr(fixture, '#idv-email', 'inputmode')).toBe('email');
    expect(attr(fixture, '#idv-email', 'autocomplete')).toBe('email');
  });

  it('marks a value the agent filled as a suggestion until the user confirms it', async () => {
    const { fixture, model, dispatch } = render((m) => m.Fill({ field: 'name', value: 'Ada' }, 'agent'));
    expect(text(fixture, '#idv-name-hint')).toContain('Suggested by Sage');
    expect((query(fixture, '#idv-name') as HTMLInputElement).value).toBe('Ada');
    expect(attr(fixture, '#idv-name', 'aria-describedby')).toBe('idv-name-hint');

    click(fixture, '#idv-name-hint button');
    await settle(fixture);
    expect(dispatch).toHaveBeenCalledWith('confirm', { field: 'name' });
    expect(model.View.Name.Confirmed).toBe(true);
    expect(query(fixture, '#idv-name-hint')).toBeNull(); // the marker goes once the user approved it
  });

  it('attributes a host-supplied suggestion to the page, not the agent', () => {
    const { fixture } = render((m) => m.Seed({ email: 'ada@example.com' }));
    expect(text(fixture, '#idv-email-hint')).toContain('Suggested by this page');
  });

  it('commits what the user types on blur as their own, confirmed value', async () => {
    const { fixture, model, dispatch } = render();
    const input = query(fixture, '#idv-name') as HTMLInputElement;
    input.value = 'Grace Hopper';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle(fixture);
    expect(dispatch).toHaveBeenCalledWith('fill', { field: 'name', value: 'Grace Hopper' });
    expect(model.View.Name).toMatchObject({ Value: 'Grace Hopper', Source: 'user', Confirmed: true });
  });

  it('keeps the draft and says why when a value is refused, instead of making the user retype it', async () => {
    const { fixture } = render();
    const input = query(fixture, '#idv-email') as HTMLInputElement;
    input.value = 'not-an-email';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle(fixture);
    expect(text(fixture, '.idv__problem')).toContain('does not look like an email');
    expect(attr(fixture, '.idv__problem', 'role')).toBe('alert');
    expect((query(fixture, '#idv-email') as HTMLInputElement).value).toBe('not-an-email');
  });

  it('only enables "Send code" once the details are confirmed, and sends them', async () => {
    const { fixture, model, dispatch } = render();
    expect((query(fixture, '.idv__send') as HTMLButtonElement).disabled).toBe(true);
    model.Fill({ field: 'name', value: 'Ada' }, 'user');
    model.Fill({ field: 'email', value: 'ada@example.com' }, 'user');
    await settle(fixture);
    expect((query(fixture, '.idv__send') as HTMLButtonElement).disabled).toBe(false);
    click(fixture, '.idv__send');
    await settle(fixture);
    expect(dispatch).toHaveBeenCalledWith('submit', {});
    expect(model.View.Status).toBe('code_sent');
  });

  it('shows "Confirm details" while anything is still unconfirmed', () => {
    const { fixture } = render((m) => m.Fill({ field: 'name', value: 'Ada' }, 'agent'));
    expect(queryAll(fixture, '.idv__actions button').some((b) => b.textContent?.includes('Confirm details'))).toBe(true);
  });

  describe('code stage', () => {
    async function inCodeStage() {
      const r = render((m) => {
        m.Fill({ field: 'name', value: 'Ada' }, 'user');
        m.Fill({ field: 'email', value: 'ada@example.com' }, 'user');
      });
      await r.model.Submit();
      await settle(r.fixture);
      return r;
    }

    it('says where the code went, offers a one-time-code field, and locks the details', async () => {
      const { fixture } = await inCodeStage();
      expect(text(fixture, '.idv__sent')).toContain('ada@example.com');
      expect(attr(fixture, '#idv-code', 'autocomplete')).toBe('one-time-code');
      expect(attr(fixture, '#idv-code', 'inputmode')).toBe('numeric');
      expect((query(fixture, '#idv-email') as HTMLInputElement).disabled).toBe(true);
      expect(attr(fixture, '.idv__code', 'aria-live')).toBe('polite');
    });

    it('sends the typed code and clears it afterwards', async () => {
      const { fixture, model, dispatch } = await inCodeStage();
      const code = query(fixture, '#idv-code') as HTMLInputElement;
      code.value = '123456';
      code.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      click(fixture, '.idv__code .idv__actions button');
      await settle(fixture);
      expect(dispatch).toHaveBeenCalledWith('enter_code', { code: '123456' });
      expect(model.View.Status).toBe('verified');
      expect(fixture.componentInstance.CodeDraft).toBe('');
    });

    it('does not offer to verify an empty code', async () => {
      const { fixture } = await inCodeStage();
      expect((query(fixture, '.idv__code .idv__actions button') as HTMLButtonElement).disabled).toBe(true);
    });

    it('holds "Resend" back for the server cool-down and shows how long', async () => {
      const model = new IdentityVerificationModel({ Request: async () => ({ ...OK, RetryAfterSeconds: 30 }), SubmitCode: async () => OK });
      model.Fill({ field: 'name', value: 'Ada' }, 'user');
      model.Fill({ field: 'email', value: 'ada@example.com' }, 'user');
      const fixture = renderComponentFixture(IdentityVerificationSurfaceComponent, { inputs: { Model: model } });
      await model.Submit();
      await settle(fixture);
      const resend = queryAll(fixture, '.idv__code .idv__actions button')[1] as HTMLButtonElement;
      expect(resend.disabled).toBe(true);
      expect(resend.textContent).toMatch(/Resend in \d+s/);
      fixture.destroy(); // clears the cool-down ticker
    });

    it('reports tries left', async () => {
      const { fixture } = await inCodeStage();
      expect(text(fixture, '.idv__hint')).toContain('5 tries left');
    });
  });

  it('shows who is verified in a status region once the server says so', async () => {
    const { fixture, model } = render();
    model.MarkVerified({ VerifiedEmail: 'ada@example.com', VerifiedName: 'Ada', VerifiedAt: '2030-01-01T00:00:00Z', Method: 'link' });
    await settle(fixture);
    expect(attr(fixture, '.idv__done', 'role')).toBe('status');
    expect(text(fixture, '.idv__done-heading')).toContain('verified');
    expect(text(fixture, '.idv__done-detail')).toContain('ada@example.com');
    expect(query(fixture, '#idv-name')).toBeNull();
  });

  it('has no axe violations in any stage', async () => {
    const details = render((m) => m.Fill({ field: 'name', value: 'Ada' }, 'agent'));
    await ExpectNoAxeViolations(details.fixture);
    const sent = render((m) => {
      m.Fill({ field: 'name', value: 'Ada' }, 'user');
      m.Fill({ field: 'email', value: 'ada@example.com' }, 'user');
    });
    await sent.model.Submit();
    await settle(sent.fixture);
    await ExpectNoAxeViolations(sent.fixture);
  });
});
