/**
 * @fileoverview Team Section builder and formatter for the Chief of Staff briefing.
 *
 * Resolves a manager's active direct reports from `MJ: Employees` (`SupervisorID`) and
 * `MJ: Users`, constructs a `Team` briefing section ONLY when the user has 1 or more
 * direct reports, and explicitly omits the `Team` section when the user has zero
 * direct reports.
 *
 * @module @memberjunction/ai-agents
 */

import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import type { MJEmployeeEntity, MJUserEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID } from '@memberjunction/global';

/** Default cap on direct reports loaded into a single Chief of Staff briefing. */
export const DEFAULT_MAX_DIRECT_REPORTS = 50;

/** Summary of a single direct report included in a manager's Chief of Staff briefing. */
export interface TeamDirectReportSummary {
    EmployeeID: string;
    UserID: string | null;
    Name: string;
    Email: string;
    Title: string | null;
}

/** Structured `Team` section included in the Chief of Staff briefing for managers. */
export interface TeamBriefingSection {
    DirectReportCount: number;
    DirectReports: TeamDirectReportSummary[];
    Truncated: boolean;
    Summary: string;
}

/** Typed summary entry inside a Chief of Staff core briefing array. */
export type ChiefOfStaffBriefingRecord = Record<string, string | number | boolean | null | undefined>;

/** Core operational state bundled inside a Chief of Staff briefing envelope. */
export interface ChiefOfStaffCoreBriefingState {
    PendingApprovals: ChiefOfStaffBriefingRecord[];
    ActiveRoutines: ChiefOfStaffBriefingRecord[];
    AgentChannels: ChiefOfStaffBriefingRecord[];
    OpenSuggestions?: ChiefOfStaffBriefingRecord[];
}

/** Structured contribution returned by an individual skill briefing action. */
export interface ChiefOfStaffSkillBriefingEntry {
    SkillName: string;
    ActionID: string;
    ActionName: string | null;
    Success: boolean;
    ResultCode: string;
    Data: string | number | boolean | object | null | undefined;
    Error: string | null;
}

/** Envelope returned by Chief of Staff briefing assembly (`Team` omitted when user has 0 direct reports). */
export interface ChiefOfStaffBriefingEnvelope {
    GeneratedAtISO: string;
    HorizonDays: number;
    Agent: { AgentID: string; Name: string };
    User: { UserID: string; Name: string; Email: string };
    Core: ChiefOfStaffCoreBriefingState;
    SkillBriefings: ChiefOfStaffSkillBriefingEntry[];
    Team?: TeamBriefingSection;
}

/** Parameters for {@link ResolveDirectReportsForUser} and {@link BuildTeamBriefingSection}. */
export interface ResolveDirectReportsParams {
    ContextUser: UserInfo;
    MetadataProvider?: IMetadataProvider;
    MaxDirectReports?: number;
}

type EmployeeLookupRow = Pick<MJEmployeeEntity, 'ID' | 'FirstName' | 'LastName' | 'Email' | 'Title' | 'SupervisorID' | 'Active'>;
type UserEmployeeLookupRow = Pick<MJUserEntity, 'ID' | 'EmployeeID' | 'Email' | 'IsActive'>;

function createRunView(provider?: IMetadataProvider): RunView {
    return provider
        ? RunView.FromMetadataProvider(provider)
        : RunView.FromMetadataProvider(Metadata.Provider); // global-provider-ok: fallback when caller omits provider
}

function clampDirectReportLimit(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_MAX_DIRECT_REPORTS;
    }
    return Math.min(200, Math.max(1, Math.trunc(value)));
}

function formatEmployeeDisplayName(emp: Pick<EmployeeLookupRow, 'FirstName' | 'LastName' | 'Email'>): string {
    const full = [emp.FirstName?.trim(), emp.LastName?.trim()].filter((part): part is string => Boolean(part)).join(' ');
    return full.length > 0 ? full : emp.Email;
}

async function resolveManagerEmployeeID(
    rv: RunView,
    contextUser: UserInfo
): Promise<string | null> {
    const rawEmpId = contextUser.EmployeeID;
    if (rawEmpId != null) {
        const empStr = String(rawEmpId).trim();
        if (empStr.length > 0 && empStr !== '0') {
            return empStr;
        }
    }

    const userRowRes = await rv.RunView<UserEmployeeLookupRow>(
        {
            EntityName: 'MJ: Users',
            ExtraFilter: `ID='${EscapeSQLString(contextUser.ID)}' AND IsActive=1`,
            Fields: ['ID', 'EmployeeID', 'Email', 'IsActive'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        contextUser
    );
    const linkedEmployeeID = userRowRes.Success ? userRowRes.Results[0]?.EmployeeID : null;
    if (linkedEmployeeID && linkedEmployeeID.trim().length > 0) {
        return linkedEmployeeID.trim();
    }

    const email = (contextUser.Email ?? '').trim();
    if (email.length === 0) {
        return null;
    }
    const empRes = await rv.RunView<EmployeeLookupRow>(
        {
            EntityName: 'MJ: Employees',
            ExtraFilter: `LOWER(Email)=LOWER('${EscapeSQLString(email)}') AND Active=1`,
            Fields: ['ID', 'FirstName', 'LastName', 'Email', 'Title', 'SupervisorID', 'Active'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        contextUser
    );
    return empRes.Success && empRes.Results.length > 0 ? empRes.Results[0].ID : null;
}

async function loadLinkedUserIDsForReports(
    rv: RunView,
    reports: readonly EmployeeLookupRow[],
    contextUser: UserInfo
): Promise<Map<string, string>> {
    const userIdByEmployeeId = new Map<string, string>();
    if (reports.length === 0) {
        return userIdByEmployeeId;
    }
    const inClause = reports.map((r) => `'${EscapeSQLString(r.ID)}'`).join(',');
    const usersRes = await rv.RunView<UserEmployeeLookupRow>(
        {
            EntityName: 'MJ: Users',
            ExtraFilter: `EmployeeID IN (${inClause}) AND IsActive=1`,
            Fields: ['ID', 'EmployeeID', 'Email', 'IsActive'],
            MaxRows: reports.length,
            ResultType: 'simple',
        },
        contextUser
    );
    if (!usersRes.Success) {
        return userIdByEmployeeId;
    }
    for (const userRow of usersRes.Results) {
        if (userRow.EmployeeID) {
            userIdByEmployeeId.set(NormalizeUUID(userRow.EmployeeID), userRow.ID);
        }
    }
    return userIdByEmployeeId;
}

/**
 * Resolves active direct reports (`MJ: Employees` where `SupervisorID` equals the user's
 * employee record, `Active = 1`) for the given user. Returns an empty array when the user
 * has no employee record or zero direct reports.
 */
export async function ResolveDirectReportsForUser(
    params: ResolveDirectReportsParams
): Promise<{ DirectReports: TeamDirectReportSummary[]; Truncated: boolean }> {
    const md: IMetadataProvider = params.MetadataProvider ?? Metadata.Provider; // global-provider-ok: fallback when caller omits provider
    if (typeof md?.EntityByName === 'function' && !md.EntityByName('MJ: Employees')) {
        return { DirectReports: [], Truncated: false };
    }

    const rv = createRunView(params.MetadataProvider);
    const managerEmployeeID = await resolveManagerEmployeeID(rv, params.ContextUser);
    if (!managerEmployeeID) {
        return { DirectReports: [], Truncated: false };
    }

    const cap = clampDirectReportLimit(params.MaxDirectReports);
    const reportsRes = await rv.RunView<EmployeeLookupRow>(
        {
            EntityName: 'MJ: Employees',
            ExtraFilter: `SupervisorID='${EscapeSQLString(managerEmployeeID)}' AND Active=1`,
            Fields: ['ID', 'FirstName', 'LastName', 'Email', 'Title', 'SupervisorID', 'Active'],
            OrderBy: 'FirstName ASC, LastName ASC',
            MaxRows: cap + 1,
            ResultType: 'simple',
        },
        params.ContextUser
    );
    if (!reportsRes.Success || reportsRes.Results.length === 0) {
        return { DirectReports: [], Truncated: false };
    }

    const truncated = reportsRes.Results.length > cap;
    const boundedRows = reportsRes.Results.slice(0, cap);
    const userIdByEmpId = await loadLinkedUserIDsForReports(rv, boundedRows, params.ContextUser);

    const directReports: TeamDirectReportSummary[] = boundedRows.map((emp) => ({
        EmployeeID: emp.ID,
        UserID: userIdByEmpId.get(NormalizeUUID(emp.ID)) ?? null,
        Name: formatEmployeeDisplayName(emp),
        Email: emp.Email,
        Title: emp.Title ?? null,
    }));

    return { DirectReports: directReports, Truncated: truncated };
}

/**
 * Builds the `Team` section for the Chief of Staff briefing when the user has 1 or more
 * direct reports. Returns `null` when the user has zero direct reports so callers omit
 * the section completely.
 */
export async function BuildTeamBriefingSection(
    params: ResolveDirectReportsParams
): Promise<TeamBriefingSection | null> {
    const { DirectReports, Truncated } = await ResolveDirectReportsForUser(params);
    if (DirectReports.length === 0) {
        return null;
    }
    const namesPreview = DirectReports.slice(0, 5)
        .map((r) => (r.Title ? `${r.Name} (${r.Title})` : r.Name))
        .join(', ');
    const overflow = DirectReports.length > 5 ? ` (+${DirectReports.length - 5} more)` : '';
    const countLabel = DirectReports.length === 1 ? '1 direct report' : `${DirectReports.length} direct reports`;
    return {
        DirectReportCount: DirectReports.length,
        DirectReports,
        Truncated,
        Summary: `${countLabel}: ${namesPreview}${overflow}`,
    };
}

/**
 * Assembles the Chief of Staff briefing JSON envelope, explicitly omitting the `Team` property
 * whenever `Team` is null or empty (zero direct reports).
 */
export function AssembleChiefOfStaffBriefingEnvelope(params: {
    GeneratedAtISO?: string;
    HorizonDays: number;
    Agent: { AgentID: string; Name: string };
    User: { UserID: string; Name: string; Email: string };
    Core: ChiefOfStaffCoreBriefingState;
    SkillBriefings: ChiefOfStaffSkillBriefingEntry[];
    Team?: TeamBriefingSection | null;
}): ChiefOfStaffBriefingEnvelope {
    const envelope: ChiefOfStaffBriefingEnvelope = {
        GeneratedAtISO: params.GeneratedAtISO ?? new Date().toISOString(),
        HorizonDays: params.HorizonDays,
        Agent: params.Agent,
        User: params.User,
        Core: params.Core,
        SkillBriefings: params.SkillBriefings,
    };
    if (params.Team && params.Team.DirectReportCount > 0) {
        envelope.Team = params.Team;
    }
    return envelope;
}

/**
 * Renders an executive Chief of Staff briefing in Markdown. Includes a `## Team` section
 * strictly when the user has direct reports (`envelope.Team` is populated), and omits the
 * `## Team` section entirely when the user has zero direct reports.
 */
export function FormatChiefOfStaffBriefingMarkdown(envelope: ChiefOfStaffBriefingEnvelope): string {
    const pendingCount = Array.isArray(envelope.Core['PendingApprovals']) ? envelope.Core['PendingApprovals'].length : 0;
    const routineCount = Array.isArray(envelope.Core['ActiveRoutines']) ? envelope.Core['ActiveRoutines'].length : 0;
    const channelCount = Array.isArray(envelope.Core['AgentChannels']) ? envelope.Core['AgentChannels'].length : 0;

    const sections: string[] = [
        `# Chief of Staff Briefing — ${envelope.User.Name}`,
        '',
        '## Health Snapshot',
        `- Horizon: ${envelope.HorizonDays} days | Pending Approvals: ${pendingCount} | Active Routines: ${routineCount}`,
        '',
        '## Key Deltas',
        ...formatSkillBriefingLines(envelope.SkillBriefings),
        '',
        '## Decisions & Approvals Needed',
        pendingCount > 0 ? `- ${pendingCount} pending approval request(s) awaiting review.` : '- No pending approvals.',
    ];

    if (envelope.Team && envelope.Team.DirectReportCount > 0) {
        sections.push('', '## Team', `- ${envelope.Team.Summary}`);
        for (const report of envelope.Team.DirectReports) {
            const roleSuffix = report.Title ? ` — ${report.Title}` : '';
            sections.push(`  - ${report.Name}${roleSuffix} (${report.Email})`);
        }
    }

    sections.push(
        '',
        '## Active Agent Channels',
        channelCount > 0 ? `- ${channelCount} active agent channel(s).` : '- No open agent channels.'
    );
    return sections.join('\n');
}

function formatSkillBriefingLines(skillBriefings: ChiefOfStaffSkillBriefingEntry[]): string[] {
    if (skillBriefings.length === 0) {
        return ['- Core briefing state assembled cleanly.'];
    }
    return skillBriefings.map((b) => {
        const name = b.SkillName || 'Skill';
        const ok = b.Success === true;
        return `- **${name}**: ${ok ? 'Ready' : `Unavailable (${b.ResultCode || 'ERROR'})`}`;
    });
}
