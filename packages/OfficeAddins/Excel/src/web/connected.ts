/**
 * The sign-in dialog's last page. Explorer's connect page returns here with the sealed answer in
 * the URL fragment (never sent to a server). This page hands it to the pane and wipes it from the
 * address bar. Only the pane can open it.
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

Office.onReady(() => {
    const answer = readAnswer();
    window.history.replaceState(null, '', window.location.pathname);
    const element = document.getElementById('message');
    if (element) {
        element.textContent = answer.Kind === 'Sealed' ? 'Signed in. Returning to Excel...' : 'Sign-in cancelled. You can close this window.';
    }
    Office.context.ui.messageParent(JSON.stringify(answer));
});
