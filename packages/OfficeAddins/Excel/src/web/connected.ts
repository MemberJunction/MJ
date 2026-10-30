/**
 * The sign-in flow's return page. Explorer's connect page returns here with the RSA-OAEP-sealed
 * answer in the URL fragment (never sent to a server).
 *
 * - Inside an Office Dialog (default host): `Office.context.ui.messageParent` hands the sealed
 *   answer directly to the Excel task pane and the dialog closes immediately.
 * - Inside a system browser tab (custom MJ server chosen via "Server"): the window stays open, so
 *   this page reveals a 1-click Copy button for the one-time encrypted connection code.
 */
import { IsHandoffToken } from '../handoff';

function readAnswer(): { Kind: 'Sealed' | 'Cancelled'; Value?: string } {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const sealed = fragment.get('h');
    if (IsHandoffToken(sealed)) {
        return { Kind: 'Sealed', Value: sealed };
    }
    return { Kind: 'Cancelled' };
}

const answer = readAnswer();
try {
    // Office.js intentionally sets `window.history.replaceState = null` on load, so guard before calling.
    if (typeof window.history?.replaceState === 'function') {
        window.history.replaceState(null, '', window.location.pathname);
    }
} catch {
    // Ignore when the host environment restricts History API mutations.
}

let manualFallbackRevealed = false;
function revealManualFallback(sealed: string): void {
    if (manualFallbackRevealed) {
        return;
    }
    const card = document.getElementById('manual-handoff');
    const input = document.getElementById('handoff-code') as HTMLInputElement | null;
    const copyButton = document.getElementById('copy-code');
    const copyStatus = document.getElementById('copy-status');
    if (!card || !input || !copyButton) {
        return;
    }
    manualFallbackRevealed = true;
    input.value = sealed;
    card.hidden = false;
    input.addEventListener('focus', () => input.select());
    copyButton.addEventListener('click', () => {
        void navigator.clipboard.writeText(sealed).then(
            () => {
                if (copyStatus) {
                    copyStatus.textContent = 'Copied! Paste it into Excel.';
                }
            },
            () => {
                input.focus();
                input.select();
                if (copyStatus) {
                    copyStatus.textContent = 'Press Cmd+C or Ctrl+C to copy.';
                }
            },
        );
    });
}

function updateHeadingMessage(): void {
    const messageEl = document.getElementById('message');
    if (messageEl) {
        messageEl.textContent = answer.Kind === 'Sealed'
            ? 'Signed in to MemberJunction.'
            : 'Sign-in cancelled. You can close this window.';
    }
}

updateHeadingMessage();
if (answer.Kind === 'Sealed' && answer.Value) {
    const sealedValue = answer.Value;
    window.setTimeout(() => revealManualFallback(sealedValue), 400);
}

if (typeof Office !== 'undefined' && typeof Office.onReady === 'function') {
    Office.onReady(() => {
        updateHeadingMessage();
        try {
            if (Office.context?.ui?.messageParent) {
                Office.context.ui.messageParent(JSON.stringify(answer));
            }
        } catch {
            // Not running inside an Office Dialog; manual copy card fallback handles external browsers.
        }
        if (answer.Kind === 'Sealed' && answer.Value) {
            const sealedValue = answer.Value;
            window.setTimeout(() => revealManualFallback(sealedValue), 350);
        }
    });
}
