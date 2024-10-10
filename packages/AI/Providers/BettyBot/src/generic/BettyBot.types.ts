export type SettingsResponse = {
    status: string;
    errorMessage: string;
    enabledFeatures: unknown[];
    token: string;
};

export type BettyResponse = {
    status: string;
    errorMessage: string;
    conversationId: number;
    response: string;
    references: BettyReference[];
};

export type BettyReference = {
    link: string;
    title: string;
    type: string;
};