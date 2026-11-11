/**
 * The 46 run-time checks of the review's `probes/architecture/check_gate_parity.sh` (`ps-review` `d47dfb8`, its
 * `t('…')` lines), one `it` each, under the product names (D-037): `deliver` → `Delivery.Create`,
 * `compareToIncumbent` → `IncumbentCheck.Compare`, `registerDelivery` → `RegisteredDelivery.Register`, `isIssued` →
 * `IsIssued`, `reverifyPublish` → `PublishRules.ReverifyPublish`, `decideStatusWrite` →
 * `StatusWriteRules.DecideStatusWrite`. The status-write authorisations name persisted statuses (§6.2a, D4-02).
 *
 * The spread forgeries are typed with `as unknown as <Class>` on purpose: the cast compiles (the types are a
 * convenience layer) and only the run-time `IsIssued` checks catch it, which is what these checks prove.
 */
import { describe, it, expect } from 'vitest';
import { EvaluationProtocol } from '../evaluation-protocol';
import { GateRules } from '../gate';
import { Delivery, IncumbentCheck, PublishRules, RegisteredDelivery, StatusWriteRules, type StoredPublishInputs } from '../registry-contracts';
import { RegistryInputs as R } from './fixtures/registry-inputs';

const task = R.Task;
const keep = R.KeepGate();
const model = R.ModelGate();
const none = R.NoSignalGate();
const m = R.Margin;
const keepIv = R.KeepIntervals();
const INC = R.IncumbentID;

function issued(d: ReturnType<typeof Delivery.Create>): Delivery {
  if (!d.Ok) throw new Error(`expected an issued delivery, got ${d.Error.Kind}`);
  return d.Delivery;
}

const dk = issued(Delivery.Create(keep, [R.Art('xgb'), R.Art('glm')], task));
const dn = issued(Delivery.Create(none, [R.Art('xgb')], task));
// f1: the finalist's bytes spread into a genuine keep-simple delivery; the cast is the forgery.
const spreadD = { ...dk, View: { gate: keep, artifact: { ...R.Art('xgb'), role: 'simpleBaseline' } } } as unknown as Delivery;
const base: StoredPublishInputs = R.KeepPublish();

describe('Delivery', () => {
  it('Delivery.Create: keep-simple delivers the GLM artifact, role simpleBaseline', () => {
    const d = Delivery.Create(keep, [R.Art('xgb'), R.Art('glm')], task);
    expect(d.Ok && d.Delivery.View.artifact?.candidate === 'glm' && d.Delivery.View.artifact.role === 'simpleBaseline').toBe(true);
  });
  it('Delivery.Create: model delivers the finalist, role model', () => {
    const d = Delivery.Create(model, [R.Art('xgb'), R.Art('glm')], task);
    expect(d.Ok && d.Delivery.View.artifact?.candidate === 'xgb' && d.Delivery.View.artifact.role === 'model').toBe(true);
  });
  it('Delivery.Create: no-signal delivers no artifact', () => {
    expect(dn.View.artifact).toBeNull();
  });
  it('Delivery.Create: missing shipped artifact is refused', () => {
    const r = Delivery.Create(keep, [R.Art('xgb')], task);
    expect(!r.Ok && r.Error.Kind === 'no-artifact-for-shipped').toBe(true);
  });
  it('Delivery.Create: duplicate shipped artifact is refused', () => {
    const r = Delivery.Create(keep, [R.Art('glm'), R.Art('glm')], task);
    expect(!r.Ok && r.Error.Kind === 'duplicate-artifact-for-shipped').toBe(true);
  });
  it('Delivery.Create: class order differing from TaskType is refused (N4)', () => {
    const r = Delivery.Create(keep, [R.Art('glm', ['Renewed', 'Lapsed'])], task);
    expect(!r.Ok && r.Error.Kind === 'class-order-mismatch').toBe(true);
  });
});

describe('issued values', () => {
  it('issued Delivery passes Delivery.IsIssued', () => {
    expect(Delivery.IsIssued(dk)).toBe(true);
  });
  it('Delivery instance and its view are frozen', () => {
    expect(Object.isFrozen(dk) && Object.isFrozen(dk.View) && Object.isFrozen(dk.View.artifact)).toBe(true);
  });
  it('mutating a frozen view throws in strict mode', () => {
    const artifact = dk.View.artifact as { candidate: string } | null;
    expect(() => { if (artifact !== null) artifact.candidate = 'xgb'; }).toThrow(TypeError);
  });
  it('spread Delivery (f1) is not issued', () => {
    expect(Delivery.IsIssued(spreadD)).toBe(false);
  });
  it('RegisteredDelivery.Register refuses a spread Delivery', () => {
    expect(RegisteredDelivery.Register(spreadD, null).Ok).toBe(false);
  });
  it('IncumbentCheck.Compare refuses a spread Delivery', () => {
    expect(IncumbentCheck.Compare(spreadD, INC, m, R.ClaimedWin(1, 1, 1))).toBeNull();
  });
});

describe('IncumbentCheck', () => {
  it('IncumbentCheck.Compare: winning interval -> beats-incumbent, candidate from delivery', () => {
    const win = IncumbentCheck.Compare(dk, INC, m, R.ClaimedWin(0.02, 0.01, 0.03));
    expect(win instanceof IncumbentCheck && IncumbentCheck.IsIssued(win) && win.View.Kind === 'beats-incumbent' &&
      win.View.Comparison.beats === true && win.View.Delivery.View.artifact?.candidate === 'glm').toBe(true);
  });
  it('spread IncumbentCheck (f2/f5) is not issued', () => {
    const win = IncumbentCheck.Compare(dk, INC, m, R.ClaimedWin(0.02, 0.01, 0.03));
    if (!(win instanceof IncumbentCheck)) throw new Error('expected an issued check');
    // f2/f5: another incumbent id spread into a genuine check; the cast is the forgery.
    const forged = { ...win, View: { ...win.View, IncumbentModelID: 'other' } } as unknown as IncumbentCheck;
    expect(IncumbentCheck.IsIssued(forged)).toBe(false);
  });
  it('IncumbentCheck.Compare: losing interval -> does-not-beat-incumbent', () => {
    const lose = IncumbentCheck.Compare(dk, INC, m, R.ClaimedWin(0.004, -0.01, 0.02));
    expect(lose !== null && !(lose instanceof IncumbentCheck) && lose.Kind === 'does-not-beat-incumbent' && lose.Comparison.beats === false).toBe(true);
  });
  it('IncumbentCheck.Compare: lower bound equal to margin does not beat', () => {
    const r = IncumbentCheck.Compare(dk, INC, m, R.ClaimedWin(0.01, 0.005, 0.02));
    expect(r !== null && !(r instanceof IncumbentCheck) && r.Kind === 'does-not-beat-incumbent').toBe(true);
  });
  it('IncumbentCheck.Compare: no-incumbent only when id is null', () => {
    const r = IncumbentCheck.Compare(dk, null, m, R.ClaimedWin(0, -1, 1));
    expect(r instanceof IncumbentCheck && r.View.Kind === 'no-incumbent').toBe(true);
  });
  it('IncumbentCheck.Compare: no-signal delivery cannot be compared', () => {
    expect(IncumbentCheck.Compare(dn, INC, m, R.ClaimedWin(1, 1, 1))).toBeNull();
  });
});

describe('RegisteredDelivery', () => {
  it('RegisteredDelivery.Register: the registry delivery carries the gate and the shipped role', () => {
    const rk = RegisteredDelivery.Register(dk, R.File('h-glm'));
    expect(rk.Ok && RegisteredDelivery.IsIssued(rk.Registered) && rk.Registered.View.gate.outcome === 'keep-simple-baseline' &&
      rk.Registered.View.kind === 'delivered' && rk.Registered.View.shippedRole === 'simpleBaseline' && rk.Registered.View.shipped === 'glm').toBe(true);
  });
  it('spread RegisteredDelivery (f4) is not issued', () => {
    const rk = RegisteredDelivery.Register(dk, R.File('h-glm'));
    if (!rk.Ok) throw new Error(rk.Reason);
    // f4: a genuine registry delivery spread into a plain object; the cast is the forgery.
    expect(RegisteredDelivery.IsIssued({ ...rk.Registered } as unknown as RegisteredDelivery)).toBe(false);
  });
  it('RegisteredDelivery.Register refuses a stored file with another hash', () => {
    expect(RegisteredDelivery.Register(dk, R.File('h-xgb')).Ok).toBe(false);
  });
  it('RegisteredDelivery.Register refuses a stored file for no-signal', () => {
    expect(RegisteredDelivery.Register(dn, R.File('h-xgb')).Ok).toBe(false);
  });
});

describe('stored intervals', () => {
  it('intervals: keep-simple intervals derive the keep-simple booleans', () => {
    expect(GateRules.GateInputsFromIntervals(keepIv, m)).toEqual(R.KeepInputs());
  });
  it('intervals: a lower bound equal to the margin does not beat', () => {
    expect(GateRules.GateInputsFromIntervals({ ...keepIv, memberVsDummy: { glm: { value: 0.01, lower: 0.005, upper: 0.02 } } }, m).memberBeatsDummy['glm']).toBe(false);
  });
  it('intervals: no best-simple interval means the model does not beat the best simple', () => {
    expect(GateRules.GateInputsFromIntervals({ ...keepIv, modelVsBestSimple: null, modelVsDummy: { value: 0.05, lower: 0.04, upper: 0.06 } }, m).modelBeatsBestSimple).toBe(false);
  });
});

describe('PublishRules.ReverifyPublish', () => {
  it('ReverifyPublish: consistent stored data publishes the GLM and replaces the incumbent', () => {
    const ok = PublishRules.ReverifyPublish(base);
    expect(ok.Ok && ok.Shipped === 'glm' && ok.Replaces === INC).toBe(true);
  });
  it('ReverifyPublish: registry that names the finalist (f1/f4 persisted) is refused', () => {
    expect(PublishRules.ReverifyPublish({ ...base, RegisteredDelivery: { Shipped: 'xgb', ArtifactSha256: 'h-xgb' } })).toMatchObject({ Ok: false, Reason: 'delivery-mismatch' });
  });
  it('ReverifyPublish: registry hash differing from the stored artifact is refused', () => {
    expect(PublishRules.ReverifyPublish({ ...base, RegisteredDelivery: { Shipped: 'glm', ArtifactSha256: 'h-other' } })).toMatchObject({ Ok: false, Reason: 'delivery-mismatch' });
  });
  it('ReverifyPublish: losing stored interval (f2) is refused', () => {
    expect(PublishRules.ReverifyPublish({ ...base, IncumbentDiff: { incumbentModelId: INC, value: 0.02, lower: -0.01, upper: 0.03 } })).toMatchObject({ Ok: false, Reason: 'does-not-beat-incumbent' });
  });
  it('ReverifyPublish: comparison against a non-current incumbent (f5) is refused', () => {
    expect(PublishRules.ReverifyPublish({ ...base, CurrentPublishedModelID: R.OtherIncumbentID })).toMatchObject({ Ok: false, Reason: 'incumbent-not-current' });
  });
  it('ReverifyPublish: a published incumbent with no stored comparison (f3) is refused', () => {
    expect(PublishRules.ReverifyPublish({ ...base, IncumbentDiff: null })).toMatchObject({ Ok: false, Reason: 'incumbent-diff-missing' });
  });
  it('ReverifyPublish: first model (no published incumbent) needs no comparison', () => {
    const r = PublishRules.ReverifyPublish({ ...base, IncumbentDiff: null, CurrentPublishedModelID: null });
    expect(r.Ok && r.Replaces === null).toBe(true);
  });
  it('ReverifyPublish: stored intervals that recompute to no-signal are refused', () => {
    const iv = { ...keepIv, memberVsDummy: { glm: { value: 0, lower: -0.01, upper: 0.01 } } };
    expect(PublishRules.ReverifyPublish({ ...base, GateIntervals: iv })).toMatchObject({ Ok: false, Reason: 'gate-no-signal' });
  });
  it('ReverifyPublish (N9): a protocol row of another version than the run pinned is refused', () => {
    expect(PublishRules.ReverifyPublish({ ...base, ProtocolRow: { ...base.ProtocolRow, Version: 4 } })).toMatchObject({ Ok: false, Reason: 'protocol-mismatch' });
  });
  it('ReverifyPublish (N9): a protocol row of another protocol is refused', () => {
    expect(PublishRules.ReverifyPublish({ ...base, ProtocolRow: { ...base.ProtocolRow, ID: R.OtherIncumbentID } })).toMatchObject({ Ok: false, Reason: 'protocol-mismatch' });
  });
  it("ReverifyPublish (N9): the pinned version's margin applies to the gate: at margin 0.02 the GLM no longer beats the dummy", () => {
    const at = R.WithPromotion(base, { margin: EvaluationProtocol.ToNonNegative(0.02) });
    expect(PublishRules.ReverifyPublish(at)).toMatchObject({ Ok: false, Reason: 'gate-no-signal' });
  });
  it("ReverifyPublish (N9): the pinned version's margin applies to the incumbent: at margin 0.01 a lower bound of 0.01 does not beat", () => {
    const iv = { ...keepIv, memberVsDummy: { glm: { value: 0.04, lower: 0.02, upper: 0.06 } } };
    const at = R.WithPromotion({ ...base, GateIntervals: iv }, { margin: EvaluationProtocol.ToNonNegative(0.01) });
    expect(PublishRules.ReverifyPublish(at)).toMatchObject({ Ok: false, Reason: 'does-not-beat-incumbent' });
  });
});

describe('StatusWriteRules.DecideStatusWrite', () => {
  it('DecideStatusWrite: create as Draft allowed', () => {
    expect(StatusWriteRules.DecideStatusWrite('Draft', { Kind: 'create' }, null, false).Allow).toBe(true);
  });
  it('DecideStatusWrite: create as Published refused', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'create' }, null, false).Reason).toBe('create-not-draft');
  });
  it('DecideStatusWrite: saved record whose stored row is unreadable is refused (N7)', () => {
    expect(StatusWriteRules.DecideStatusWrite('Draft', { Kind: 'unreadable' }, null, false).Reason).toBe('stored-row-unreadable');
  });
  it('DecideStatusWrite: unchanged status allowed', () => {
    expect(StatusWriteRules.DecideStatusWrite('Validated', { Kind: 'row', Status: 'Validated' }, null, false).Allow).toBe(true);
  });
  it('DecideStatusWrite: change outside gate refused', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'row', Status: 'Validated' }, null, false).Reason).toBe('status-changed-outside-gate');
  });
  it('DecideStatusWrite: gate-authorised transition allowed', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'row', Status: 'Validated' }, { From: 'Validated', To: 'Published' }, false).Allow).toBe(true);
  });
  it('DecideStatusWrite: authorisation for another transition refused', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'row', Status: 'Draft' }, { From: 'Validated', To: 'Published' }, false).Reason).toBe('gate-transition-mismatch');
  });
  it('DecideStatusWrite: non-gate update inside a TransactionGroup refused (N6)', () => {
    expect(StatusWriteRules.DecideStatusWrite('Validated', { Kind: 'row', Status: 'Validated' }, null, true).Reason).toBe('deferred-in-transaction-group');
  });
  it('DecideStatusWrite: gate-authorised transition inside a group allowed', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'row', Status: 'Validated' }, { From: 'Validated', To: 'Published' }, true).Allow).toBe(true);
  });
});
