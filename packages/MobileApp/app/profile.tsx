import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMMKVBoolean, useMMKVString } from 'react-native-mmkv';
import { Metadata } from '@memberjunction/core';
import { Icons } from '@/components/Icon';
import { useMJ } from '@/providers/mj-provider';
import { useAgents } from '@/hooks/useAgents';
import { Env } from '@/config/env';
import {
    prefsStorage,
    PrefKeys,
    APPEARANCE_LABEL,
    cycleAppearance,
    setDefaultAgent,
    type AppearanceMode,
} from '@/data/preferences';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Profile & settings.
 * Spec: plans/mobile-app-react-native/html/profile.html
 *
 * Identity comes from the MJ current user. Preferences (default agent,
 * appearance, voice/push/Face-ID toggles) persist to MMKV via the prefs store.
 * Voice/push/Face-ID are functionally inert until Phase 2 wires the features,
 * but the chosen state is saved now so those features can read it. Full dark
 * rendering for the Appearance choice is a Phase 2 task (theme/tokens.ts).
 */
export default function ProfileScreen() {
    const { signOut, authMethod, status } = useMJ();
    const [agentPickerOpen, setAgentPickerOpen] = useState(false);

    // Reactive preferences — writing the same key elsewhere re-renders this screen.
    const [appearanceRaw] = useMMKVString(PrefKeys.appearance, prefsStorage);
    const [defaultAgentName] = useMMKVString(PrefKeys.defaultAgentName, prefsStorage);
    const [voiceOn, setVoiceOn] = useMMKVBoolean(PrefKeys.voiceResponses, prefsStorage);
    const [pushOn, setPushOn] = useMMKVBoolean(PrefKeys.pushNotifications, prefsStorage);
    const [faceIdOn, setFaceIdOn] = useMMKVBoolean(PrefKeys.faceIdLock, prefsStorage);

    const appearance = (appearanceRaw as AppearanceMode | undefined) ?? 'system';

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
                    <SettingRow
                        icon={<Icons.Sparkle size={16} color={Colors.ink2} strokeWidth={2} />}
                        label="Default agent"
                        sub="Who answers when you don't @mention"
                        value={defaultAgentName || 'Skip'}
                        onPress={() => setAgentPickerOpen(true)}
                    />
                    <SettingRow
                        icon={<Icons.Sliders size={16} color={Colors.ink2} strokeWidth={2} />}
                        label="Appearance"
                        value={APPEARANCE_LABEL[appearance]}
                        onPress={() => cycleAppearance()}
                    />
                    <ToggleRow
                        icon={<Icons.Mic size={16} color={Colors.ink2} strokeWidth={2} />}
                        label="Voice responses"
                        sub="Speak Skip's replies aloud"
                        value={!!voiceOn}
                        onToggle={() => setVoiceOn(!voiceOn)}
                    />
                    <ToggleRow
                        icon={<Icons.Plus size={16} color={Colors.ink2} strokeWidth={2} />}
                        label="Push notifications"
                        sub="Approvals · agent completion · alerts"
                        value={!!pushOn}
                        onToggle={() => setPushOn(!pushOn)}
                    />
                </View>

                <Text style={styles.sectionLabel}>ACCOUNT</Text>
                <View style={styles.group}>
                    <ToggleRow
                        icon={<Icons.Pin size={16} color={Colors.ink2} />}
                        label="Face ID app lock"
                        sub="Lock when app goes to background"
                        value={!!faceIdOn}
                        onToggle={() => setFaceIdOn(!faceIdOn)}
                    />
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

            <AgentPickerModal
                visible={agentPickerOpen}
                selectedName={defaultAgentName}
                onClose={() => setAgentPickerOpen(false)}
                onSelect={(id, name) => {
                    setDefaultAgent(id, name);
                    setAgentPickerOpen(false);
                }}
            />
        </SafeAreaView>
    );
}

function SettingRow({ icon, label, sub, value, arrow, onPress }: { icon: React.ReactNode; label: string; sub?: string; value?: string; arrow?: boolean; onPress?: () => void }) {
    return (
        <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
            <View style={styles.rowIcon}>{icon}</View>
            <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{label}</Text>
                {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
            </View>
            {value ? <Text style={styles.rowValue}>{value}</Text> : null}
            {(value || arrow) ? <Icons.ChevronRight size={14} color={Colors.ink3} strokeWidth={2} /> : null}
        </Pressable>
    );
}

function ToggleRow({ icon, label, sub, value, onToggle }: { icon: React.ReactNode; label: string; sub?: string; value: boolean; onToggle: () => void }) {
    return (
        <Pressable style={styles.row} onPress={onToggle}>
            <View style={styles.rowIcon}>{icon}</View>
            <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{label}</Text>
                {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
            </View>
            <View style={[styles.toggle, !value && styles.toggleOff]}>
                <View style={[styles.toggleKnob, !value && styles.toggleKnobOff]} />
            </View>
        </Pressable>
    );
}

function AgentPickerModal({ visible, selectedName, onClose, onSelect }: { visible: boolean; selectedName?: string; onClose: () => void; onSelect: (id: string, name: string) => void }) {
    const { agents, loading } = useAgents();
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <Pressable style={styles.modalBackdrop} onPress={onClose}>
                <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>Default agent</Text>
                    <Text style={styles.modalSub}>Answers when you don&apos;t @mention anyone.</Text>
                    {loading || agents === null ? (
                        <View style={styles.modalLoading}><ActivityIndicator color={Colors.brand} /></View>
                    ) : (
                        <ScrollView style={styles.modalList}>
                            {agents.map((a) => {
                                const active = a.name === selectedName;
                                return (
                                    <Pressable key={a.id} style={styles.agentRow} onPress={() => onSelect(a.id, a.name)}>
                                        <View style={[styles.agentAv, { backgroundColor: a.color }]}>
                                            <Text style={styles.agentAvText}>{a.initial}</Text>
                                        </View>
                                        <Text style={styles.agentName}>{a.name}</Text>
                                        {active ? <Text style={styles.agentCheck}>✓</Text> : null}
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    )}
                    <Pressable style={styles.modalClose} onPress={onClose}>
                        <Text style={styles.modalCloseText}>Close</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
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

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(13,13,16,0.35)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: Colors.bg, borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, maxHeight: '70%' },
    modalHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.line2, marginBottom: 12 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.ink },
    modalSub: { fontSize: 13, color: Colors.ink3, marginTop: 2, marginBottom: 10 },
    modalLoading: { paddingVertical: 28, alignItems: 'center' },
    modalList: { flexGrow: 0 },
    agentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    agentAv: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    agentAvText: { color: Colors.inverse, fontSize: 14, fontWeight: '700' },
    agentName: { flex: 1, fontSize: 15, color: Colors.ink, fontWeight: Type.medium },
    agentCheck: { fontSize: 16, color: Colors.brand, fontWeight: '700' },
    modalClose: { marginTop: 12, padding: 13, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, alignItems: 'center' },
    modalCloseText: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink },
});
