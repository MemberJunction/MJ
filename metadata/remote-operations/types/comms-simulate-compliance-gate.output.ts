/** Output of `Communications.SimulateComplianceGate`. */
export interface CommsSimulateComplianceGateOutput {
  Success: boolean;
  Decision?: string;
  Reason?: string;
  Detail?: string;
  ResultJSON?: string;
  ErrorMessage?: string;
}
