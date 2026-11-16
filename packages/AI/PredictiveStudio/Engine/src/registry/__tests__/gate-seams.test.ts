/** The gate's production seams (Tasks M3.2, M4.1, M4.2): the context `ForRequest` builds. */
import { beforeEach, describe, expect, it } from 'vitest';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { StoredEvidenceBuilder } from '../../governance/evidence-builder';
import { StoredSemanticsCheck } from '../../governance/semantics-checker';
import { StoredSignOffLookup } from '../../governance/sign-off-lookup';
import { GateContexts } from '../gate-seams';

let store: GateTestStore;
beforeEach(() => {
  store = new GateTestStore();
});
const ctx = () => GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() });

describe('GateContexts.ForRequest', () => {
  it("runs on the request's user and provider with the stored-rows evidence builder, the sign-off lookup and the output-binding semantics check", () => {
    const c = ctx();
    expect(c.ContextUser).toBe(GateWorld.User);
    expect(c.EvidenceBuilder).toBeInstanceOf(StoredEvidenceBuilder);
    expect(c.SignOffLookup).toBeInstanceOf(StoredSignOffLookup);
    expect(c.SemanticsCheck).toBeInstanceOf(StoredSemanticsCheck);
  });
});
