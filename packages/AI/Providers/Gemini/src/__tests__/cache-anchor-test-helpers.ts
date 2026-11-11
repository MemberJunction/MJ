/**
 * Every Gemini request opens with the fixed cache-anchor turns (see `GeminiLLM.withCacheAnchor`). Tests
 * about the rest of a request's shape compare the turns after them.
 */
import { GEMINI_LEADING_USER_TURN_TEXT, GEMINI_USER_TURN_SEPARATOR_TEXT } from '../index';

interface TurnLike {
    role?: string;
    parts?: Array<{ text?: string }>;
}

/** Whether `turn` is a single-text-part turn of `role` with exactly `text`. */
function isTextTurn(turn: TurnLike | undefined, role: string, text: string): boolean {
    return turn?.role === role && turn.parts?.length === 1 && turn.parts[0].text === text;
}

/** `contents` without the opening anchor (fixed user turn, then the separator model turn), when present. */
export function WithoutCacheAnchor<T>(contents: T[]): T[] {
    const [first, second] = contents as TurnLike[];
    return isTextTurn(first, 'user', GEMINI_LEADING_USER_TURN_TEXT) && isTextTurn(second, 'model', GEMINI_USER_TURN_SEPARATOR_TEXT)
        ? contents.slice(2)
        : contents;
}
