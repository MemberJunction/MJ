import { Stack } from 'expo-router';
import { Colors } from '@/theme/tokens';

/**
 * The **Home** tab's own stack.
 *
 * Every tab gets one, and every drill-down reachable from that tab lives inside it. That is what
 * keeps the tab bar on screen as you go deeper: a screen pushed on the ROOT stack covers the bar,
 * so a user three levels into Data Explorer had to press back three times to reach anywhere else.
 * Pushed within the tab's stack the bar never leaves — which is the whole reason a native app puts
 * navigation at the bottom rather than behind a menu.
 *
 * Screens that SHOULD cover the bar stay on the root stack instead: the voice call, the login
 * screen, the full-screen previews. Those are modes, not places.
 */
export default function HomeTabLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Colors.bg },
                animation: 'slide_from_right',
            }}
        />
    );
}
