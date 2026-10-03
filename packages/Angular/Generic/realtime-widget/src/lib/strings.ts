/**
 * The widget's own copy (everything the realtime overlay renders is the overlay's, not ours). One table per
 * locale; `en` is built in and is the fallback for any key a table omits, so a partial translation degrades
 * to English instead of showing a key. Pages add a language with {@link RegisterWidgetLocale}.
 */

/** Every string the widget renders itself. `{agent}` is replaced with the agent's display name. */
export interface WidgetStrings {
  start: string;
  consentGreeting: string;
  consentLead: string;
  consentVoice: string;
  consentAi: string;
  consentFoot: string;
  begin: string;
  notNow: string;
  booting: string;
  connecting: string;
  endedTitle: string;
  endedMessage: string;
  startOver: string;
  errorTitle: string;
  errorDefault: string;
  tryAgain: string;
}

export const ENGLISH_STRINGS: Readonly<WidgetStrings> = {
  start: 'Talk to {agent}',
  consentGreeting: 'Welcome',
  consentLead: 'Before we begin, here is how this works:',
  consentVoice: 'You will talk with {agent}, an AI assistant, out loud, using your microphone.',
  consentAi: 'Your conversation is processed by AI to help with your request.',
  consentFoot: 'Your microphone stays off until you choose Begin. You can decline and nothing will be started.',
  begin: 'Begin',
  notNow: 'Not now',
  booting: 'Getting things ready…',
  connecting: 'Connecting you now…',
  endedTitle: "That's a wrap",
  endedMessage: 'Thanks for talking with us.',
  startOver: 'Start over',
  errorTitle: 'Something went wrong',
  errorDefault: 'The connection was interrupted. Please try again.',
  tryAgain: 'Try again'
};

const tables = new Map<string, Partial<WidgetStrings>>();

/** Adds (or replaces) a locale's table. Keys it omits fall back to English. Locale tags are matched case-insensitively. */
export function RegisterWidgetLocale(locale: string, table: Partial<WidgetStrings>): void {
  tables.set(locale.trim().toLowerCase(), table);
}

/**
 * The strings for a locale: an exact match (`pt-br`), else its language (`pt`), else English — with any key
 * the chosen table omits filled from English.
 */
export function ResolveWidgetStrings(locale: string | null): WidgetStrings {
  const tag = (locale ?? '').trim().toLowerCase();
  const table = tables.get(tag) ?? tables.get(tag.split('-')[0]) ?? {};
  return { ...ENGLISH_STRINGS, ...table };
}

/** Substitutes `{agent}` in a string. */
export function FormatWidgetString(text: string, agentName: string): string {
  return text.replace(/\{agent\}/g, agentName);
}
