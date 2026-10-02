/**
 * @fileoverview Home's time-of-day greeting.
 *
 * Its own module, free of any React Native import, for the same reason the composer's Return rule
 * and the session card's view model are: this package keeps no React renderer in its test setup, so
 * the decisions live where they can be asserted directly.
 */

/**
 * Greets by time of day, naming the user only when there is a name worth using.
 *
 * Deliberately says nothing rather than saying the wrong thing. `Name` is frequently the login
 * address on MJ accounts, and "Good evening, da-robot-tester@bluecypress.io" is worse than a plain
 * "Good evening": long enough to wrap the heading onto two lines, and it reads as a system reciting
 * a database column rather than greeting anyone.
 *
 * @param name The user's given name, or anything that might not be one.
 * @param now Injectable clock, so the part-of-day boundaries are testable.
 */
export function Greeting(name: string | null | undefined, now: Date = new Date()): string {
    const hour = now.getHours();
    const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const first = name?.trim().split(/\s+/)[0] ?? '';
    // An address, or something long enough to wrap the heading, is not a first name.
    const usable = first.length > 0 && first.length <= 18 && !first.includes('@');
    return usable ? `${part}, ${first}` : part;
}
