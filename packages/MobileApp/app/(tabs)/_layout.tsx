import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { Icons } from '@/components/Icon';
import { Colors, Type } from '@/theme/tokens';

/**
 * The tab bar — the app's navigation backbone.
 *
 * Route: `app/(tabs)/_layout.tsx`. The `(tabs)` group is invisible in the URL, so every route
 * inside keeps the path it already had (`/conversations`, `/apps`, `/profile`) and existing deep
 * links are unaffected.
 *
 * ## Why a tab bar rather than the sheet this replaces
 *
 * Navigation used to live in ONE place: a hamburger inside a chat thread that opened a modal
 * sheet. That meant the screen the app actually launches into — the conversation list — had no way
 * to reach Apps, Data or Profile at all. You had to open a conversation to find the way out of
 * conversations. A sheet also hides the app's shape behind a tap: nothing on screen tells a new
 * user that Apps or Data exist.
 *
 * MJ Explorer uses a sidebar, and this deliberately does not mirror it. A phone has no room for a
 * persistent sidebar, and both platforms' users read a bottom tab bar as "these are the places this
 * app has". The SCREENS still match Explorer element for element — only the chrome differs, which
 * is the one place native convention should win over cross-surface sameness.
 *
 * Data Explorer is not a tab by choice: four tabs stay comfortable at small widths, and Data is a
 * destination you go to deliberately rather than switch between. It is a first-class card on Home.
 */
export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: Colors.brand,
                tabBarInactiveTintColor: Colors.ink3,
                tabBarStyle: styles.bar,
                tabBarLabelStyle: styles.label,
                tabBarItemStyle: styles.item,
                // The thread's composer sits directly above this bar; without it the keyboard
                // pushes the bar up and it lands on top of the send button.
                tabBarHideOnKeyboard: Platform.OS === 'android',
            }}
        >
            {/*
              * Each tab carries an explicit `tabBarButtonTestID`. React Navigation's generated
              * accessibility label is "Chats, tab, 2 of 4" — position-dependent, and not a
              * reliable tap target either. An end-to-end test keyed off it passes by luck and
              * breaks the moment a tab is reordered.
              */}
            <Tabs.Screen
                name="(home)"
                options={{
                    tabBarButtonTestID: 'tab-home',
                    title: 'Home',
                    tabBarIcon: ({ color, focused }) => (
                        <Icons.Home size={23} color={color} strokeWidth={focused ? 2.4 : 1.9} />
                    ),
                }}
            />
            <Tabs.Screen
                name="(chats)"
                options={{
                    tabBarButtonTestID: 'tab-chats',
                    title: 'Chats',
                    tabBarIcon: ({ color, focused }) => (
                        <Icons.MessageSquare size={23} color={color} strokeWidth={focused ? 2.4 : 1.9} />
                    ),
                }}
            />
            <Tabs.Screen
                name="(apps)"
                options={{
                    tabBarButtonTestID: 'tab-apps',
                    title: 'Apps',
                    tabBarIcon: ({ color, focused }) => (
                        <Icons.Grid size={22} color={color} strokeWidth={focused ? 2.4 : 1.9} />
                    ),
                }}
            />
            <Tabs.Screen
                name="(you)"
                options={{
                    tabBarButtonTestID: 'tab-you',
                    title: 'You',
                    tabBarIcon: ({ color, focused }) => (
                        <Icons.User size={23} color={color} strokeWidth={focused ? 2.4 : 1.9} />
                    ),
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    bar: {
        backgroundColor: Colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.line2,
        // Let the navigator add the home-indicator inset itself rather than hard-coding a height,
        // which is what makes a tab bar sit wrong on one device family.
        paddingTop: 6,
        height: Platform.OS === 'ios' ? 84 : 62,
    },
    item: { paddingVertical: 2 },
    label: { fontSize: 11, fontWeight: Type.medium, marginTop: 1 },
});
