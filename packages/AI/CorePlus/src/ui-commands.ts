/**
 * @fileoverview Type definitions for agent UI commands.
 *
 * This module contains type definitions for UI commands that agents can issue
 * to control the user interface. Commands are divided into two categories:
 * - Actionable Commands: Shown as buttons/links for user to click
 * - Automatic Commands: Execute immediately when received
 *
 * @module @memberjunction/ai-core-plus
 * @author MemberJunction.com
 * @since 2.116.0
 */

/**
 * Union type of all actionable commands.
 *
 * Actionable commands are shown to the user as clickable buttons or links,
 * typically after an agent completes work. They provide easy navigation to
 * created/modified resources or external links.
 *
 * @example
 * ```json
 * {
 *   "actionableCommands": [
 *     {
 *       "type": "open:resource",
 *       "label": "Open Customer Record",
 *       "icon": "fa-user",
 *       "resourceType": "Record",
 *       "resourceId": "abc-123",
 *       "mode": "view"
 *     }
 *   ]
 * }
 * ```
 */
export type ActionableCommand =
    | OpenResourceCommand
    | OpenURLCommand
    | CaptureDataSnapshotCommand
    | ComposeEmailCommand;

/**
 * Command to open a resource in the MemberJunction UI.
 *
 * This command navigates the user to a specific resource (record, dashboard,
 * report, form, etc.) within the application.
 *
 * @example Opening a record
 * ```json
 * {
 *   "type": "open:resource",
 *   "label": "Open Customer Record",
 *   "icon": "fa-user",
 *   "resourceType": "Record",
 *   "entityName": "Customers",
 *   "resourceId": "customer-123",
 *   "mode": "view"
 * }
 * ```
 *
 * @example Opening a dashboard
 * ```json
 * {
 *   "type": "open:resource",
 *   "label": "View Sales Dashboard",
 *   "icon": "fa-chart-line",
 *   "resourceType": "Dashboard",
 *   "resourceId": "sales-dashboard-456"
 * }
 * ```
 */
export interface OpenResourceCommand {
    /** Command type identifier */
    type: 'open:resource';

    /**
     * Button label shown to the user.
     * Should be clear and action-oriented (e.g., "Open Customer Record", "View Dashboard").
     */
    label: string;

    /**
     * Optional Font Awesome icon class to display on the button.
     * Examples: "fa-user", "fa-chart-line", "fa-file-alt"
     */
    icon?: string;

    /**
     * Type of resource to open.
     */
    resourceType: ResourceType;

    /**
     * Entity name (required for Record type).
     * The exact entity name as defined in MJ metadata.
     * Examples: "Customers", "MJ: AI Agent Runs", "Contacts"
     * Only used when resourceType is 'Record'.
     */
    entityName?: string;

    /**
     * ID of the resource to open.
     * For Record type with a single primary key: that key's value (`entityName` is separate).
     * For other types: The resource identifier (dashboard ID, report ID, etc.).
     * Optional on Record when {@link keys} supplies the primary key.
     */
    resourceId?: string;

    /**
     * Composite (or explicit) primary-key fields for Record type.
     * Keys are entity field names from metadata. When present, these win per field
     * over {@link resourceId}. Use this when the entity PK is not a single `ID`.
     */
    keys?: Record<string, string | number>;

    /**
     * Mode for opening the resource.
     * Only applies to Record type.
     * - 'view': Open in view/read-only mode
     * - 'edit': Open in edit mode
     */
    mode?: 'view' | 'edit';

    /**
     * Optional parameters to pass to the resource.
     * Used for reports (report parameters) and dashboards (filters).
     */
    parameters?: Record<string, any>;
}

/**
 * Types of resources that can be opened in the UI.
 */
export type ResourceType =
    | 'Record'      // Entity record (e.g., Customer, Order)
    | 'Dashboard'   // Dashboard view
    | 'Report'      // Report view
    | 'Form'        // Form view
    | 'View';       // Saved view

/**
 * Command to open an external URL.
 *
 * This command opens a URL in a new browser tab, useful for linking to
 * external resources like company websites, documentation, or third-party tools.
 *
 * @example
 * ```json
 * {
 *   "type": "open:url",
 *   "label": "Visit Company Website",
 *   "icon": "fa-external-link",
 *   "url": "https://example.com",
 *   "newTab": true
 * }
 * ```
 */
export interface OpenURLCommand {
    /** Command type identifier */
    type: 'open:url';

    /**
     * Button label shown to the user.
     * Should indicate the destination (e.g., "Visit Website", "View Documentation").
     */
    label: string;

    /**
     * Optional Font Awesome icon class to display on the button.
     * Commonly: "fa-external-link" for external links.
     */
    icon?: string;

    /**
     * URL to open.
     * Should be a complete URL including protocol (https://).
     */
    url: string;

    /**
     * Whether to open in a new tab.
     * Default: true
     */
    newTab?: boolean;
}

/**
 * Command requesting the host UI capture a Data Snapshot of the user's current
 * view of an artifact, submit it as a `Data Snapshot` input artifact on the
 * conversation, and resume the conversation so the agent can analyze it.
 *
 * Use this when an analysis-class agent needs the user's on-screen state
 * (filters, drill, sort, selection, scroll position, etc.) to answer accurately
 * but no `Data Snapshot` artifact is attached to the request. The agent emits
 * this command alongside `nextStep: 'Chat'` and a brief `message` explaining
 * why; the chat UI renders a button; on click the host captures the snapshot
 * from the currently-viewed artifact, persists it as a Data Snapshot artifact,
 * attaches it as an `Input` to the next conversation turn, and resumes.
 *
 * Any artifact type that supports snapshotting can be captured this way — the
 * artifact viewer plugin produces the snapshot via its standard contract.
 *
 * @example
 * ```json
 * {
 *   "type": "client:capture-data-snapshot",
 *   "label": "Capture & Submit Data Snapshot",
 *   "icon": "fa-camera",
 *   "artifactId": "abc-123",
 *   "followupMessage": "Now answer the original question with the snapshot data."
 * }
 * ```
 */
export interface CaptureDataSnapshotCommand {
    /** Command type identifier */
    type: 'client:capture-data-snapshot';

    /**
     * Button label shown to the user.
     * Should be clear about the action (e.g., "Capture & Submit Data Snapshot",
     * "Share my current view").
     */
    label: string;

    /**
     * Optional Font Awesome icon class to display on the button.
     * Commonly: "fa-camera" or "fa-image".
     */
    icon?: string;

    /**
     * Optional ID of the artifact to snapshot. When omitted, the host defaults
     * to the most recently attached output artifact on the conversation
     * (typical for single-artifact conversations).
     */
    artifactId?: string;

    /**
     * Optional follow-up text the host should pass back to the agent after
     * the snapshot is attached, so the agent knows what question to answer.
     * If omitted, the host may resume with the most recent user message.
     */
    followupMessage?: string;
}

/**
 * Union type of all automatic commands.
 *
 * Automatic commands execute immediately when received, without user interaction.
 * Used for updating UI state, refreshing data, and showing notifications.
 *
 * @example
 * ```json
 * {
 *   "automaticCommands": [
 *     {
 *       "type": "refresh:data",
 *       "scope": "cache",
 *       "cacheName": "AI"
 *     },
 *     {
 *       "type": "notification",
 *       "message": "Customer created successfully",
 *       "severity": "success"
 *     }
 *   ]
 * }
 * ```
 */
export type AutomaticCommand =
    | RefreshDataCommand
    | ShowNotificationCommand;

/**
 * Command to refresh data in the UI.
 *
 * This command tells the UI to refresh cached data or reload specific entities.
 * Use after modifying system configuration or entity data.
 *
 * @example Refresh specific entities
 * ```json
 * {
 *   "type": "refresh:data",
 *   "scope": "entity",
 *   "entityNames": ["Customers", "Contacts"]
 * }
 * ```
 *
 * @example Refresh AI cache
 * ```json
 * {
 *   "type": "refresh:data",
 *   "scope": "cache",
 *   "cacheName": "AI"
 * }
 * ```
 */
export interface RefreshDataCommand {
    /** Command type identifier */
    type: 'refresh:data';

    /**
     * Scope of data to refresh:
     * - 'entity': Refresh specific entity data
     * - 'cache': Refresh a named cache
     */
    scope: 'entity' | 'cache';

    /**
     * Array of entity names to refresh.
     * Only used when scope is 'entity'.
     * Example: ["Customers", "Contacts", "Orders"]
     */
    entityNames?: string[];

    /**
     * Name of cache to refresh.
     * Only used when scope is 'cache'.
     */
    cacheName?: CacheName;
}

/**
 * Names of caches that can be refreshed.
 * This list will grow as new caches are added to the system.
 */
export type CacheName =
    | 'Core'     // Core metadata (entities, fields, etc.)
    | 'AI'       // AI metadata (agents, prompts, models, etc.)
    | 'Actions'; // Action metadata (actions, params, etc.)

/**
 * Command to show a notification message to the user.
 *
 * This command displays a toast/notification with a message, typically used
 * to confirm successful operations or alert about errors.
 *
 * @example Success notification
 * ```json
 * {
 *   "type": "notification",
 *   "message": "Customer 'Acme Corp' created successfully",
 *   "severity": "success",
 *   "duration": 3000
 * }
 * ```
 *
 * @example Error notification
 * ```json
 * {
 *   "type": "notification",
 *   "message": "Failed to save changes: Invalid email format",
 *   "severity": "error",
 *   "duration": 5000
 * }
 * ```
 */
export interface ShowNotificationCommand {
    /** Command type identifier */
    type: 'notification';

    /**
     * Message text to display.
     * Keep concise but informative (1-2 sentences).
     */
    message: string;

    /**
     * Severity level affecting icon and color:
     * - 'success': Green with checkmark icon
     * - 'info': Blue with info icon
     * - 'warning': Yellow with warning icon
     * - 'error': Red with error icon
     *
     * Default: 'info'
     */
    severity?: 'success' | 'info' | 'warning' | 'error';

    /**
     * Duration in milliseconds before auto-dismissing.
     * Set to 0 for manual dismiss only.
     * Default: 3000 (3 seconds)
     */
    duration?: number;
}

/**
 * Command offering the user a pre-filled email to send THEMSELVES.
 *
 * The agent drafts; the user sends. Nothing in this path transmits mail — the host opens the
 * user's own compose surface with the fields filled in, and the user decides whether to send.
 * Agents that need to actually send mail should use MJ's Communication providers instead.
 *
 * Deliberately carries NO target field (no "open in Outlook Web", no "use the in-app composer").
 * Which compose surface opens is the HOST's decision, so retargeting later — a Gmail/Outlook web
 * deep link, an in-app composer — is a change in one handler rather than a migration across every
 * agent that ever emitted one of these.
 *
 * Bodies are PLAIN TEXT. The `mailto:` scheme has no HTML body parameter, so markdown an agent
 * emits will appear literally in the user's compose window; instruct agents accordingly.
 *
 * @example
 * ```json
 * {
 *   "type": "compose:email",
 *   "label": "Open draft in Mail",
 *   "icon": "fa-envelope",
 *   "to": ["bob@example.com"],
 *   "subject": "Membership renewal",
 *   "body": "Hi Bob,\n\nYour membership renews on [date]."
 * }
 * ```
 */
export interface ComposeEmailCommand {
    /** Command type identifier */
    type: 'compose:email';
    /**
     * Button label shown to the user.
     * Should make clear that a draft opens rather than anything being sent
     * (e.g. "Open draft in Mail"), never "Send email".
     */
    label: string;
    /**
     * Optional Font Awesome icon class to display on the button.
     * Commonly: "fa-envelope".
     */
    icon?: string;
    /**
     * Recipient addresses.
     *
     * OMIT this when the address is not known. The compose window then opens with an empty To
     * field for the user to fill, which is the safe outcome — a guessed address does not fail
     * loudly, it delivers the user's message to a stranger.
     */
    to?: string[];
    /** Carbon-copy addresses. Same rule as {@link to}: omit rather than guess. */
    cc?: string[];
    /** Blind-carbon-copy addresses. Same rule as {@link to}: omit rather than guess. */
    bcc?: string[];
    /** Subject line. */
    subject?: string;
    /** Body text. PLAIN TEXT only — see the note on this interface. */
    body?: string;
    /**
     * Optional artifact holding the full draft.
     *
     * Actionable commands render only on a conversation's LAST message, so this button disappears
     * as soon as the user asks a follow-up. When the draft is too long to survive a `mailto:` URL
     * (see {@link MAILTO_MAX_URL_LENGTH}) the host falls back to opening this artifact instead,
     * and it is also what keeps the draft reachable after the turn has moved on.
     */
    artifactId?: string;
}

/**
 * Practical ceiling on the length of a `mailto:` URL, in characters.
 *
 * This is an observed floor across mail clients, not a published figure; Outlook on Windows binds
 * first. It exists because of a specific and silent failure: a client handed a URL past its limit
 * does NOT refuse it — it opens a draft with the body TRUNCATED, and the user sends half a message
 * without noticing. Hosts must check {@link IsMailtoURLWithinLimit} and fall back to the artifact
 * rather than risk that.
 */
export const MAILTO_MAX_URL_LENGTH = 1800;

/**
 * Build a `mailto:` URL from a compose-email command.
 *
 * Recipients are comma-joined into the path; everything else rides in the query string. Every
 * field is percent-encoded, because subjects and bodies routinely contain `&`, `#` and `+`, each
 * of which silently corrupts the parse if left raw.
 *
 * Note that encoding INFLATES the text — every space becomes `%20`, every newline `%0A` — so a
 * body of roughly 1,000 characters already yields a ~1,450-character URL. Agents should be told a
 * body ceiling near 1,000, not one near {@link MAILTO_MAX_URL_LENGTH}.
 */
export function BuildMailtoURL(command: Pick<ComposeEmailCommand, 'to' | 'cc' | 'bcc' | 'subject' | 'body'>): string {
    const clean = (values?: string[]): string[] => (values ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
    const params: string[] = [];

    const addList = (key: string, values?: string[]): void => {
        const list = clean(values);
        if (list.length > 0) {
            params.push(`${key}=${encodeURIComponent(list.join(','))}`);
        }
    };

    addList('cc', command.cc);
    addList('bcc', command.bcc);
    if (command.subject) {
        params.push(`subject=${encodeURIComponent(command.subject)}`);
    }
    if (command.body) {
        params.push(`body=${encodeURIComponent(command.body)}`);
    }

    const path = clean(command.to).map((r) => encodeURIComponent(r)).join(',');
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return `mailto:${path}${query}`;
}

/**
 * Whether a built `mailto:` URL is short enough that the mail client will not truncate the body.
 * A host that gets `false` here must NOT open the URL — see {@link MAILTO_MAX_URL_LENGTH}.
 */
export function IsMailtoURLWithinLimit(url: string): boolean {
    return url.length <= MAILTO_MAX_URL_LENGTH;
}
