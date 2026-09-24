export class MJGlobalProperty
{
    key: unknown;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    value: unknown;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}

export class MJEvent
{
    component!: IMJComponent;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    event!: MJEventType;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    eventCode?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any; // Intentionally any - event payload varies by event type — case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
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
    TenantChanged: 'TenantChanged',
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