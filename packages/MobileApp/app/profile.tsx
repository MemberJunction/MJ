import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Metadata } from '@memberjunction/core';
import { Icons } from '@/components/Icon';
import { useMJ } from '@/providers/mj-provider';
import { Env } from '@/config/env';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Profile & settings.
 * Spec: plans/mobile-app-react-native/html/profile.html
 *
 * Identity comes from the MJ current user. Some toggles (voice, push,
 * biometric lock) are visible in Phase 1 but inert until Phase 2 wires them.
 */
export default function ProfileScreen() {
    const { signOut, authMethod, status } = useMJ();

    const user = useMemo(() => {
        if (status !== 'ready') return null;
        return new Metadata().CurrentUser ?? null;
    }, [status]);

    const displayName = user?.Name || [user?.FirstName, user?.LastName].filter(Boolean).join(' ') || 'MJ User';
    const email = user?.Email || '—';
    const title = user?.Title || 'Member';
    const initials = (() => {
        const f = user?.FirstName?.charAt(0) ?? '';
        const l = user?.LastName?.charAt(0) ?? '';
        const fromName = (user?.Name ?? '').trim().charAt(0);
        return (f + l).toUpperCase() || fromName.toUpperCase() || 'MJ';
    })();
    const workspaceHost = Env.graphqlUrl.replace(/^https?:\/\//, '').replace(/\/graphql\/?$/, '');

    const handleSignOut = async () => {
        await signOut();
        router.replace('/login');
    };
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <Text style={styles.title}>Profile & settings</Text>
                <View style={styles.iconBtn} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={styles.profileBlock}>
                    <View style={styles.avBig}><Text style={styles.avBigText}>{initials}</Text></View>
                    <Text style={styles.name}>{displayName}</Text>
                    <Text style={styles.email}>{email}</Text>
                    <View style={styles.orgPill}>
                        <View style={styles.orgDot} />
                        <Text style={styles.orgText}>{title}</Text>
                    </View>
                </View>

                <Text style={styles.sectionLabel}>PREFERENCES</Text>
                <View style={styles.group}>
                    <SettingRow icon={<Icons.Sparkle size={16} color={Colors.ink2} strokeWidth={2} />} label="Default agent" sub="Who answers when you don't @mention" value="Skip" />
                    <SettingRow icon={<Icons.Sliders size={16} color={Colors.ink2} strokeWidth={2} />} label="Appearance" value="System" />
                    <ToggleRow icon={<Icons.Mic size={16} color={Colors.ink2} strokeWidth={2} />} label="Voice responses" sub="Speak Skip's replies aloud" off />
                    <ToggleRow icon={<Icons.Plus size={16} color={Colors.ink2} strokeWidth={2} />} label="Push notifications" sub="Approvals · agent completion · alerts" />
                </View>

                <Text style={styles.sectionLabel}>ACCOUNT</Text>
                <View style={styles.group}>
                    <ToggleRow icon={<Icons.Pin size={16} color={Colors.ink2} />} label="Face ID app lock" sub="Lock when app goes to background" />
                    <SettingRow icon={<Icons.Database size={16} color={Colors.ink2} strokeWidth={2} />} label="Connected workspace" sub={workspaceHost} arrow />
                    <SettingRow icon={<Icons.Search size={16} color={Colors.ink2} strokeWidth={2} />} label="Help & feedback" arrow />
                </View>

                <Pressable style={styles.signOut} onPress={handleSignOut}>
                    <Text style={styles.signOutText}>Sign out</Text>
                </Pressable>

                <Text style={styles.versionFooter}>
                    MJ Mobile · v0.1.0 · Phase 1{authMethod ? ` · ${authMethod}` : ''}
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

function SettingRow({ icon, label, sub, value, arrow }: { icon: React.ReactNode; label: string; sub?: string; value?: string; arrow?: boolean }) {
    return (
        <View style={styles.row}>
            <View style={styles.rowIcon}>{icon}</View>
            <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{label}</Text>
                {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
            </View>
            {value ? <Text style={styles.rowValue}>{value}</Text> : null}
            {(value || arrow) ? <Icons.ChevronRight size={14} color={Colors.ink3} strokeWidth={2} /> : null}
        </View>
    );
}

function ToggleRow({ icon, label, sub, off }: { icon: React.ReactNode; label: string; sub?: string; off?: boolean }) {
    return (
        <View style={styles.row}>
            <View style={styles.rowIcon}>{icon}</View>
            <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{label}</Text>
                {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
            </View>
            <View style={[styles.toggle, off && styles.toggleOff]}>
                <View style={[styles.toggleKnob, off && styles.toggleKnobOff]} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    title: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: Type.semibold, color: Colors.ink },

    profileBlock: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 18 },
    avBig: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#b87a1f', alignItems: 'center', justifyContent: 'center', ...Shadow.cardLarge },
    avBigText: { color: Colors.inverse, fontSize: 30, fontWeight: '700' },
    name: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, marginTop: 14, color: Colors.ink },
    email: { fontSize: 13.5, color: Colors.ink3, marginTop: 4 },
    orgPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 999 },
    orgDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brand },
    orgText: { fontSize: 12.5, color: Colors.ink2, fontWeight: Type.medium },

    sectionLabel: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8, fontSize: 11, fontWeight: '700', color: Colors.ink3, letterSpacing: 1.4 },
    group: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, marginHorizontal: 14, marginBottom: 12, ...Shadow.card, overflow: 'hidden' },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    rowIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { fontSize: 14.5, fontWeight: Type.medium, color: Colors.ink },
    rowSub: { fontSize: 12, color: Colors.ink3, marginTop: 1 },
    rowValue: { fontSize: 13, color: Colors.ink3 },

    toggle: { width: 42, height: 26, borderRadius: 13, backgroundColor: Colors.brand, padding: 2 },
    toggleOff: { backgroundColor: 'rgba(13,13,16,0.15)' },
    toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff', alignSelf: 'flex-end', ...Shadow.card },
    toggleKnobOff: { alignSelf: 'flex-start' },

    signOut: { margin: 14, padding: 14, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, alignItems: 'center' },
    signOutText: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.danger },

    versionFooter: { textAlign: 'center', fontSize: 11, color: Colors.ink3, marginTop: 8 },
});
