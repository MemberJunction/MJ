import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Type } from '@/theme/tokens';

/**
 * @fileoverview The app's global navigation, reachable from every primary screen.
 *
 * MJ Explorer keeps a persistent top bar — logo, home, app switcher, search, account — so a user is
 * never more than one tap from anywhere. The native app had no equivalent: once inside a
 * conversation the only exits were "back to conversations" and "new conversation", so Apps,
 * Explorer and Profile were unreachable without backing all the way out.
 *
 * A phone has no room for a persistent bar of that kind, so this is the same idea as a sheet: one
 * consistent affordance in the header of every primary screen, opening the same destinations in the
 * same order as the web's switcher.
 */

/** One destination. `Route` is an Expo Router path. */
/** One destination. `Route` is typed as an Expo Router `Href`, so a typo is a compile error. */
type Destination = {
    Label: string;
    Description: string;
    Route: Href;
    Icon: keyof typeof Icons;
    Tint: string;
};

/** Destinations, ordered to match MJ Explorer's application switcher. */
export const GLOBAL_NAV_DESTINATIONS: Destination[] = [
    { Label: 'Conversations', Description: 'Your agent threads', Route: '/conversations', Icon: 'Send', Tint: Colors.brand },
    { Label: 'Apps', Description: 'Applications hosted in this app', Route: '/apps', Icon: 'Sliders', Tint: Colors.agentResearch },
    { Label: 'Data Explorer', Description: 'Entities, queries, dashboards', Route: '/explorer', Icon: 'Database', Tint: Colors.agentForecaster },
    { Label: 'Profile & settings', Description: 'Account, agent, notifications', Route: '/profile', Icon: 'Star', Tint: Colors.agentEmailDrafter },
];

/**
 * The navigation sheet.
 *
 * @param Visible Whether the sheet is shown.
 * @param OnClose Dismiss without navigating.
 * @param CurrentRoute The route the caller is on, so it can be marked and made inert.
 */
export function GlobalNav({
    Visible,
    OnClose,
    CurrentRoute,
}: {
    Visible: boolean;
    OnClose: () => void;
    CurrentRoute?: Href;
}) {
    return (
        <Modal visible={Visible} animationType="slide" transparent onRequestClose={OnClose}>
            <Pressable style={styles.backdrop} onPress={OnClose}>
                <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.handle} />
                    <Text style={styles.title}>Go to</Text>
                    <ScrollView style={styles.list}>
                        {GLOBAL_NAV_DESTINATIONS.map((d) => {
                            const Glyph = Icons[d.Icon];
                            const active = CurrentRoute === d.Route;
                            return (
                                <Pressable
                                    key={d.Label}
                                    style={styles.row}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={`Go to ${d.Label}`}
                                    onPress={() => {
                                        OnClose();
                                        // `replace` rather than `push`: these are peer destinations,
                                        // not a drill-down, so stacking them would build a back
                                        // history nobody asked for.
                                        if (!active) router.replace(d.Route);
                                    }}
                                >
                                    <View style={[styles.tile, { backgroundColor: d.Tint }]}>
                                        <Glyph size={17} color={Colors.inverse} strokeWidth={2} />
                                    </View>
                                    <View style={styles.body}>
                                        <Text style={styles.label}>{d.Label}</Text>
                                        <Text style={styles.description} numberOfLines={1}>{d.Description}</Text>
                                    </View>
                                    {active ? <Text style={styles.check}>✓</Text> : null}
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                    <Pressable style={styles.close} onPress={OnClose}>
                        <Text style={styles.closeText}>Close</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(7,25,39,0.35)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, maxHeight: '70%' },
    handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.line2, marginBottom: 12 },
    title: { fontSize: Type.bodyLarge, fontWeight: '700', color: Colors.ink, marginBottom: 8 },
    list: { flexGrow: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    tile: { width: 34, height: 34, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1 },
    label: { fontSize: Type.small, fontWeight: Type.semibold, color: Colors.ink },
    description: { fontSize: Type.caption, color: Colors.ink3, marginTop: 1 },
    check: { fontSize: 16, color: Colors.brand, fontWeight: '700' },
    close: { marginTop: 12, padding: 13, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, alignItems: 'center' },
    closeText: { fontSize: Type.small, fontWeight: Type.semibold, color: Colors.ink },
});
