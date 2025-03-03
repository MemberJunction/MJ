export type MSGraphGetResponse<T> = {
    "@odata.context": string,
    value: T
}

export type GetMessagesContextDataParams = {
    /**
     * The email address of the service account to use. If not provide,
     * defaults to the AZURE_ACCOUNT_EMAIL config variable
     */
    Email?: string
    /**
     * If true, messages will be returned with the body stripped of HTLM tags
     */
    ReturnAsPlainText?: boolean;
    /**
     * If true, messages will be marked as read after being processed
     */
    MarkAsRead?: boolean;
    /**
     * Filter to use in the MS Graph request to fetch messages. Defaults to fetching messages not marked as read.
     */
    Filter?: string;
    /**
     * Number of messages to return, defaults to 10.
     */
    Top?: number;
};