import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';
import { LoadUserApplications, DefaultNavItem, type MobileApplication } from '@/host/applications';
import { ResolveMobileResource, type MobileNavItem } from '@/host/BaseMobileResource';
import { useMJ } from '@/providers/mj-provider';

/**
 * Application shell — renders one hosted MJ application and its navigation.
 *
 * This is the mobile counterpart of MJ Explorer's tab shell, and it resolves screens exactly the
 * way Explorer does: the nav item names a `DriverClass`, and `MJGlobal.ClassFactory` resolves it —
 * against `BaseMobileResource` here rather than `BaseResourceComponent`. Nothing in this file
 * imports any application's code, which is what makes the app a host rather than a bundle of
 * hard-coded screens.
 *
 * Generic nav items — ones that name a record rather than a driver class — resolve through the same
 * registry, keyed by their resource type; see `src/host/generic-resources.tsx` for which this build
 * renders.
 *
 * A nav item this build has no mobile surface for renders an honest "open on desktop" card. That
 * is a deliberate product decision: some surfaces (authoring tools, dense grids, admin) should not
 * be on a phone, and saying so is better than shipping a degraded imitation.
 */
export default function AppShellScreen() {
    const { appId } = useLocalSearchParams<{ appId: string }>();
    const router = useRouter();
    const { status } = useMJ();
    const [app, setApp] = useState<MobileApplication | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeItem, setActiveItem] = useState<MobileNavItem | null>(null);

    // Same readiness gate as the launcher: a deep link can reach this screen before the MJ
    // provider has a token, and metadata access throws on an unset provider. The terminal states
    // have to clear `loading` too — without that a cold launch straight into this deep link sits on
    // "Loading…" forever, with no header and so no way back.
    useEffect(() => {
        if (status !== 'ready') {
            if (status === 'no-token' || status === 'error') setLoading(false);
            return;
        }
        let cancelled = false;
        void (async () => {
            const apps = await LoadUserApplications().catch(() => [] as MobileApplication[]);
            if (cancelled) return;
            const found = apps.find((a) => a.ID.toLowerCase() === (appId ?? '').toLowerCase()) ?? null;
            setApp(found);
            setActiveItem(found ? DefaultNavItem(found) : null);
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [appId, status]);

    // One resolution path for both kinds of nav item: a `Custom` item is resolved by the driver
    // class the application declares, a generic one (`Dashboards`, …) by its resource type, which
    // the shell registers surfaces for in `src/host/generic-resources.tsx`. Keyed on the resolved
    // name, so switching items re-resolves and nothing is cached across applications that happen to
    // share a label.
    const resourceKey = activeItem
        ? activeItem.ResourceType === 'Custom'
            ? activeItem.DriverClass
            : activeItem.ResourceType
        : undefined;
    const resource = useMemo(() => ResolveMobileResource(resourceKey), [resourceKey]);

    if (loading) {
        return (
            <View style={styles.centered}>
                <Text style={styles.muted}>Loading…</Text>
            </View>
        );
    }

    if (!app) {
        return (
            <SafeAreaView style={styles.screen} edges={['top']}>
                <View style={styles.header}>
                    <Pressable
                        onPress={() => router.back()}
                        accessibilityRole="button"
                        accessibilityLabel="Back"
                        style={styles.backBtn}
                    >
                        <Icons.ChevronLeft size={22} color={Colors.ink} />
                    </Pressable>
                </View>
                <View style={styles.centered}>
                    <Text style={styles.emptyTitle}>Application not found</Text>
                    <Text style={styles.muted}>
                        {status === 'ready'
                            ? 'It may have been removed, or you may not have access.'
                            : 'Sign in to open your applications.'}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    const Body = resource?.Component ?? null;

    return (
        <SafeAreaView style={styles.screen} edges={['top']}>
            <View style={styles.header}>
                <Pressable
                    onPress={() => router.back()}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    style={styles.backBtn}
                >
                    <Icons.ChevronLeft size={22} color={Colors.ink} />
                </Pressable>
                <View style={styles.headerText}>
                    <Text style={styles.title} numberOfLines={1}>
                        {resource?.Title ?? app.Name}
                    </Text>
                    {activeItem ? <Text style={styles.subtitle}>{activeItem.Label}</Text> : null}
                </View>
            </View>

            {app.NavItems.length > 1 ? (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.tabStrip}
                    contentContainerStyle={styles.tabs}
                >
                    {app.NavItems.map((item) => {
                        const active = item.Label === activeItem?.Label;
                        return (
                            <Pressable
                                key={item.Label}
                                onPress={() => setActiveItem(item)}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: active }}
                                style={[styles.tab, active && styles.tabActive]}
                            >
                                <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.Label}</Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            ) : null}

            <View style={styles.body}>
                {Body && activeItem ? (
                    <Body ApplicationID={app.ID} ApplicationName={app.Name} NavItem={activeItem} />
                ) : (
                    <NotOnMobile label={activeItem?.Label ?? app.Name} />
                )}
            </View>
        </SafeAreaView>
    );
}

/**
 * The honest fallback for a nav item with no mobile surface in this build.
 *
 * Named for what it tells the user rather than what it lacks — this is a statement about where the
 * work belongs, not an error.
 */
function NotOnMobile({ label }: { label: string }) {
    return (
        <View style={styles.centered}>
            <View style={styles.fallbackIcon}>
                <Icons.Database size={20} color={Colors.ink3} />
            </View>
            <Text style={styles.emptyTitle}>{label} opens on desktop</Text>
            <Text style={styles.muted}>
                This section has no mobile surface in this build. Open MJ Explorer to use it.
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.sm },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.sm },
    backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerText: { flex: 1 },
    title: { fontSize: 20, fontWeight: Type.bold, letterSpacing: -0.4, color: Colors.ink },
    subtitle: { fontSize: 12, color: Colors.ink3, marginTop: 1 },
    // `flexGrow: 0` keeps the horizontal strip at its natural height; without it the
    // ScrollView expands to fill the column and the tabs render as full-height bars.
    tabStrip: { flexGrow: 0, flexShrink: 0 },
    tabs: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.sm, alignItems: 'center' },
    tab: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    tabActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
    tabText: { fontSize: 13, color: Colors.ink2, fontWeight: Type.semibold },
    tabTextActive: { color: Colors.inverse },
    body: { flex: 1 },
    fallbackIcon: { width: 48, height: 48, borderRadius: Radius.lg, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
    emptyTitle: { fontSize: 17, fontWeight: Type.semibold, color: Colors.ink, textAlign: 'center' },
    muted: { fontSize: 14, color: Colors.ink3, textAlign: 'center', lineHeight: 20 },
});
