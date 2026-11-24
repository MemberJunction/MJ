/** Input for `Communications.SimulateComplianceGate`. */
export interface CommsSimulateComplianceGateInput {
  SenderID: string;
  PrincipalID?: string;
  RecordID?: string;
  PreferenceID?: string;
  MessageClass: string;
  RecipientJurisdictionID?: string;
}
