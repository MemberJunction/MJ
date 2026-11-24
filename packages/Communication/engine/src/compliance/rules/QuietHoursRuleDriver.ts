import { RegisterClass } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceEvalContext,
  ComplianceRuleOutcome,
} from '@memberjunction/communication-types';
import { ReadNumberParam, ReadParamValue, ReadStringParam } from './RuleParamUtils';

/**
 * A daily window, in the recipient's local time, during which messages are held. `StartHour` is
 * inclusive and `EndHour` exclusive (0-23); a window may wrap past midnight.
 */
export interface QuietHoursWindow {
  StartHour: number;
  EndHour: number;
}

/** Merged `QuietHours` requirement: the union of every applicable regime's windows. */
export interface QuietHoursMerged {
  Windows: QuietHoursWindow[];
}

/**
 * The rule context plus the time zones of the recipient's jurisdiction, which the gate adds for
 * every rule driver.
 */
export interface QuietHoursEvalContext extends ComplianceEvalContext {
  /**
   * IANA time zones of the recipient's jurisdiction. A message is held when any of them is inside a
   * window.
   */
  JurisdictionTimezones?: string[];
}

const MS_PER_HOUR = 3_600_000;

function normalizeHour(hour: number): number {
  return ((Math.floor(hour) % 24) + 24) % 24;
}

function parseWindow(raw: Record<string, unknown>): QuietHoursWindow | null {
  const start = ReadNumberParam(raw, 'startHour', 'StartHour');
  const end = ReadNumberParam(raw, 'endHour', 'EndHour');
  if (start === undefined || end === undefined) {
    return null;
  }
  return {
    StartHour: normalizeHour(start),
    EndHour: normalizeHour(end),
  };
}

function isHourInWindow(hour: number, win: QuietHoursWindow): boolean {
  if (win.StartHour === win.EndHour) {
    return false;
  }
  if (win.StartHour < win.EndHour) {
    return hour >= win.StartHour && hour < win.EndHour;
  }
  // Wraps past midnight (e.g. 21:00 -> 08:00)
  return hour >= win.StartHour || hour < win.EndHour;
}

function getLocalHourInTimezone(date: Date, timeZone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    });
    const formatted = formatter.format(date);
    const parsed = Number(formatted);
    return Number.isFinite(parsed) ? parsed % 24 : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

function readSenderTimezone(ctx: ComplianceEvalContext): string | undefined {
  if (!ctx.Sender.Configuration) {
    return undefined;
  }
  try {
    const config = JSON.parse(ctx.Sender.Configuration) as Record<string, unknown>;
    return ReadStringParam(config, 'timezone', 'Timezone', 'defaultTimezone', 'DefaultTimezone');
  } catch {
    return undefined;
  }
}

/**
 * Resolves quiet hours across applicable regimes:
 * - Union of blocked local-time windows wins.
 * - Timezone fallback: principal timezone -> jurisdiction timezone(s) -> sender timezone -> UTC.
 */
@RegisterClass(BaseComplianceRule, 'QuietHoursRuleDriver')
export class QuietHoursRuleDriver extends BaseComplianceRule<QuietHoursMerged> {
  public MergeStrictest(parameterSets: ReadonlyArray<Record<string, unknown>>): QuietHoursMerged {
    const windows: QuietHoursWindow[] = [];

    for (const params of parameterSets) {
      const single = parseWindow(params);
      if (single) {
        windows.push(single);
      }

      const rawWindows = ReadParamValue<unknown[]>(params, 'windows', 'Windows');
      if (Array.isArray(rawWindows)) {
        for (const item of rawWindows) {
          if (item && typeof item === 'object') {
            const parsed = parseWindow(item as Record<string, unknown>);
            if (parsed) {
              windows.push(parsed);
            }
          }
        }
      }
    }

    return { Windows: windows };
  }

  public Evaluate(merged: QuietHoursMerged, ctx: QuietHoursEvalContext): ComplianceRuleOutcome {
    if (merged.Windows.length === 0 || ctx.MessageClass === 'Transactional') {
      return { Passed: true };
    }

    const timezones = this.resolveTimezones(ctx);
    if (!this.isBlockedAt(ctx.Now, timezones, merged.Windows)) {
      return { Passed: true };
    }

    const deferUntil = this.computeDeferUntil(ctx.Now, timezones, merged.Windows);
    return {
      Passed: false,
      Decision: 'Deferred',
      FailureReason: 'Message falls within quiet hours',
      DeferUntil: deferUntil,
    };
  }

  private resolveTimezones(ctx: QuietHoursEvalContext): string[] {
    const principalTz = ctx.PrincipalAttributes?.Timezone?.trim();
    if (principalTz) {
      return [principalTz];
    }

    if (ctx.JurisdictionTimezones && ctx.JurisdictionTimezones.length > 0) {
      return ctx.JurisdictionTimezones;
    }

    const senderTz = readSenderTimezone(ctx);
    if (senderTz) {
      return [senderTz];
    }

    return ['UTC'];
  }

  private isBlockedAt(date: Date, timezones: string[], windows: QuietHoursWindow[]): boolean {
    for (const tz of timezones) {
      const localHour = getLocalHourInTimezone(date, tz);
      if (windows.some((win) => isHourInWindow(localHour, win))) {
        return true;
      }
    }
    return false;
  }

  private computeDeferUntil(
    now: Date,
    timezones: string[],
    windows: QuietHoursWindow[],
  ): Date {
    // Advance hour-by-hour (snapped to the top of the next hour) until all candidate timezones are clear.
    const nextHourMs = Math.ceil(now.getTime() / MS_PER_HOUR) * MS_PER_HOUR;
    for (let offset = 0; offset <= 24; offset++) {
      const candidate = new Date(nextHourMs + offset * MS_PER_HOUR);
      if (!this.isBlockedAt(candidate, timezones, windows)) {
        return candidate;
      }
    }
    return new Date(nextHourMs + 24 * MS_PER_HOUR);
  }
}
