/** Output of `Communications.CreateSendingDomain` and `Communications.VerifySendingDomain`. */
export interface CommsSendingDomainAuthOutput {
  Success: boolean;
  Verified?: boolean;
  Status?: string;
  ProviderDomainID?: string;
  DNSRecordsJSON?: string;
  ErrorMessage?: string;
}
