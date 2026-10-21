export type GateStatus = 'expected-fail' | 'required';
export type RunMode = 'pr' | 'nightly' | 'weekly';
export type GateRequirement = 'live-model' | 'sidecar-16gb' | 'bizapps-common'; // bizapps-common: the bridged Feature Pipeline gates
export type StatRule = 'noise-publish-400' | 'coverage-400' | 'detection-400' | 'false-alarm-400'
  | 'noise-publish-60'; // G0.2's publication count at n = 60

export type GateImplementation =
  | { Kind: 'stub' }                                      // registry-stubs.gates.test.ts defines it; outcome not-implemented
  | { Kind: 'body' }                                      // exactly one TruthGate.Define('<TestName>', …) in gates/*.gates.test.ts
                                                          //   (also the form of a bridge that runs an `mj test` row)
  | { Kind: 'external'; Package: string; File: string }; // a test titled exactly <TestName> in another package's file

export interface GateEntry {
  GateID: string;             // "G0.1"
  Phase: number;              // 0–7
  OwnerPR: 1 | 2 | 3 | 4 | 5;
  Dataset: string;            // "W1", "C2", "T4", …
  Criterion: string;          // "S7.5"
  Threshold: string;          // verbatim P11
  Plain: string;
  Today: string | null;
  RTest: string | null;
  TestName: string;           // "W1 → S7.5"
  StatRule: StatRule | null;
  AmendedBy: string | null;   // decisions that amended the threshold, e.g. "D-029, D-030, D-032" (G0.2)
  P11Threshold: string | null;// the P11 threshold text when AmendedBy is set; null otherwise
  Status: GateStatus;         // added: every gate starts expected-fail
  RunMode: RunMode;           // added
  Requires: GateRequirement[];// added
  Implementation: GateImplementation; // added
}
