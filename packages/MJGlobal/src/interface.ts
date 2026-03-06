export class MJGlobalProperty
{
    key: unknown;
    value: unknown;
}

export class MJEvent
{
    component!: IMJComponent;
    event!: MJEventType;
    eventCode?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any; // Intentionally any - event payload varies by event type
}

export interface IMJComponent
{

}

export const MJEventType = {
    ComponentRegistered: 'ComponentRegistered',
    ComponentUnregistered: 'ComponentUnregistered',
    ComponentEvent: 'ComponentEvent',
    LoggedIn: 'LoggedIn',
    LoggedOut: 'LoggedOut',
    LoginFailed: 'LoginFailed',
    LogoutFailed: 'LogoutFailed',
    ManualResizeRequest: 'ManualResizeRequest',
    DisplaySimpleNotificationRequest: 'DisplaySimpleNotificationRequest',
} as const;

export type MJEventType = typeof MJEventType[keyof typeof MJEventType];


export type DisplaySimpleNotificationRequestData = {
    message: string
    title?: string
    style?: "none" | "success" | "error" | "warning" | "info"
    ResourceTypeID?: number
    ResourceRecordID?: number
    ResourceConfiguration?: string
    DisplayDuration?: number
}