export type MSGraphGetResponse<T> = {
    "@odata.context": string,
    value: T
}

export type GetMessagesContextDataParams = {
    /**
     * Filter to use in the MS Graph request to fetch messages. Defaults to fetching messages not marked as read.
     */
    Filter?: string;
    /**
     * Number of messages to return, defaults to 10.
     */
    Top?: number;
}