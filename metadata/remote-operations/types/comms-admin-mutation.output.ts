/** Output of `Communications.DeleteSendingDomain` and `Communications.RevokeSuppression`. */
export interface CommsAdminMutationOutput {
  Success: boolean;
  ErrorMessage?: string;
  WarningMessage?: string;
}
