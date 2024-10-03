export type MSGraphGetResponse<T> = {
    "@odata.context": string,
    value: T
}

export type GetMessagesContextDataParams = {
    /**
     * Email of the user to fetch messages for. Defaults to the AZURE_ACCOUNT_EMAIL environment variable.
     */
    Email?: string
    /**
     * Filter to use in the MS Graph request to fetch messages. Defaults to fetching messages not marked as read.
     */
    Filter?: string;
    /**
     * Number of messages to return, defaults to 10.
     */
    Top?: number;

    /**
     * If true, messages returned will contain only extracted plain text content from the body
     */
    ReturnAsPlainText?: boolean;
};