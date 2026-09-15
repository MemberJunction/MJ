import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';
import { LoadUserApplications, type MobileApplication } from '@/host/applications';
import { useMJ } from '@/providers/mj-provider';

/**
 * Application launcher — the list of MJ applications this user can open.
 *
 * The mobile app is a **host**, not a fixed set of screens: everything here comes from the same
 * `MJ: Applications` metadata MJ Explorer reads, so an application that appears on the web appears
 * here without a line of mobile code. Screens are contributed by registering a
 * `BaseMobileResource` under the driver name the application already declares.
 *
 * Applications with no mobile surface are still listed. Opening one shows what it does offer and
 * an honest "open on desktop" for the rest, which is more useful than pretending the app does not
 * exist on this device.
 */
export default function AppsScreen() {
    const router = useRouter();
    const { status } = useMJ();
    const [apps, setApps] = useState<MobileApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setError(null);
            setApps(await LoadUserApplications());
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Wait for the MJ provider before touching metadata. A cold launch straight into a deep link
    // reaches this screen before the provider has a token, and `Metadata.CurrentUser` throws on an
    // unset provider — which surfaced as "Cannot read property 'CurrentUser' of undefined" rather
    // than as a loading state. Gating on status is what makes a deep link as safe as a tap.
    useEffect(() => {
        if (status === 'ready') {
            void load();
        } else if (status === 'no-token' || status === 'error') {
            setLoading(false);
        }
    }, [status, load]);

    return (
        <SafeAreaView style={styles.screen} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Apps</Text>
                <Text style={styles.subtitle}>{apps.length} available</Text>
            </View>

            <ScrollView
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            void load();
                        }}
                    />
                }
            >
                {loading ? (
                    <Text style={styles.muted}>Loading applications…</Text>
                ) : error ? (
                    <Text style={styles.error}>{error}</Text>
                ) : apps.length === 0 ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>No applications</Text>
                        <Text style={styles.muted}>
                            Applications you have access to will appear here.
                        </Text>
                    </View>
                ) : (
                    apps.map((app) => (
                        <Pressable
                            key={app.ID}
                            style={styles.card}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${app.Name}`}
                            onPress={() => router.push({ pathname: '/apps/[appId]', params: { appId: app.ID } })}
                        >
                            <View style={[styles.tile, { backgroundColor: app.Color ?? Colors.brand }]}>
                                <AppGlyph icon={app.Icon} />
                            </View>
                            <View style={styles.cardBody}>
                                <Text style={styles.cardTitle}>{app.Name}</Text>
                                {app.Description ? (
                                    <Text style={styles.cardSub} numberOfLines={2}>
                                        {app.Description}
                                    </Text>
                                ) : null}
                                <Text style={styles.cardMeta}>
                                    {app.NavItems.length} {app.NavItems.length === 1 ? 'section' : 'sections'}
                                </Text>
                            </View>
                            <Icons.ChevronRight size={16} color={Colors.ink3} />
                        </Pressable>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

/**
 * Renders an application's tile glyph.
 *
 * Metadata carries Font Awesome classes, which this app does not ship — it draws its own SVG icon
 * set. Rather than pull in a whole icon font for the launcher, the common families are mapped onto
 * the existing set and anything unrecognised falls back to a neutral grid. An app therefore always
 * gets *a* glyph, and one that is at least in the right family when we know it.
 */
function AppGlyph({ icon }: { icon: string | null }) {
    const name = (icon ?? '').toLowerCase();
    const color = Colors.inverse;
    if (name.includes('comment') || name.includes('message') || name.includes('chat')) return <Icons.Send size={18} color={color} />;
    if (name.includes('table') || name.includes('database') || name.includes('grid')) return <Icons.Database size={18} color={color} />;
    if (name.includes('bolt') || name.includes('gear') || name.includes('sliders')) return <Icons.Sliders size={18} color={color} />;
    if (name.includes('note') || name.includes('pen') || name.includes('edit')) return <Icons.Edit size={18} color={color} />;
    if (name.includes('star') || name.includes('home')) return <Icons.Star size={18} color={color} />;
    if (name.includes('search') || name.includes('magnifying')) return <Icons.Search size={18} color={color} />;
    return <Icons.Database size={18} color={color} />;
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: 30, fontWeight: Type.bold, color: Colors.ink },
    subtitle: { fontSize: 13, color: Colors.ink3, marginTop: 2 },
    list: { padding: Spacing.lg, gap: Spacing.sm },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        padding: 14,
        borderWidth: 1,
        borderColor: Colors.line2,
    },
    tile: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1 },
    cardTitle: { fontSize: 16, fontWeight: Type.semibold, color: Colors.ink },
    cardSub: { fontSize: 13, color: Colors.ink3, marginTop: 2 },
    cardMeta: { fontSize: 11, color: Colors.ink3, marginTop: 4 },
    empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
    emptyTitle: { fontSize: 17, fontWeight: Type.semibold, color: Colors.ink },
    muted: { fontSize: 14, color: Colors.ink3, textAlign: 'center' },
    error: { fontSize: 14, color: Colors.danger, textAlign: 'center', paddingTop: 40 },
});
