import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AgentAvatarStack } from '@/components/AgentAvatarStack';
import { Icons } from '@/components/Icon';
import { MJStatusBanner } from '@/components/MJStatusBanner';
import {
    MOCK_CONVERSATIONS_PINNED,
    MOCK_CONVERSATIONS_TODAY,
    MOCK_CONVERSATIONS_YESTERDAY,
    type ConversationSummary,
} from '@/data/mock-conversations';
import { groupConversations } from '@/data/adapt';
import { useConversations } from '@/hooks/useConversations';
import { useMJ } from '@/providers/mj-provider';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

/**
 * Conversation list — global nav root.
 * Spec: plans/mobile-app-react-native/index.html · B1
 */
export default function ConversationsScreen() {
    const { status } = useMJ();
    const { conversations, loading, error, refresh } = useConversations();

    const grouped = useMemo(() => {
        if (conversations && conversations.length > 0) {
            return groupConversations(conversations);
        }
        return null;
    }, [conversations]);

    // Render either real data (when available) or mocks (visual preview).
    const pinned = grouped?.pinned ?? MOCK_CONVERSATIONS_PINNED;
    const today = grouped?.today ?? MOCK_CONVERSATIONS_TODAY;
    const yesterday = grouped?.yesterday ?? MOCK_CONVERSATIONS_YESTERDAY;
    const earlier = grouped?.earlier ?? [];
    const usingMockData = !grouped;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <MJStatusBanner />
            <View style={styles.navTop}>
                <Pressable hitSlop={8} style={styles.iconBtn}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} />
                </Pressable>
                <View style={styles.titleStack}>
                    <Text style={styles.title}>Conversations</Text>
                    {usingMockData && status === 'ready' ? (
                        <Text style={styles.emptyHint}>No conversations · showing sample</Text>
                    ) : null}
                </View>
                <Pressable hitSlop={8} style={styles.iconBtn}>
                    <Icons.Sliders size={22} color={Colors.ink} />
                </Pressable>
            </View>

            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={
                    <RefreshControl
                        refreshing={loading && status === 'ready'}
                        onRefresh={() => void refresh()}
                        tintColor={Colors.brand}
                    />
                }
            >
                <View style={styles.actions}>
                    <Pressable
                        style={styles.newButton}
                        onPress={() => router.push('/new-conversation')}
                    >
                        <Icons.Plus size={14} color={Colors.inverse} strokeWidth={2.5} />
                        <Text style={styles.newButtonText}>New conversation</Text>
                    </Pressable>
                    <Pressable style={styles.searchButton}>
                        <Icons.Search size={18} color={Colors.ink} />
                    </Pressable>
                </View>

                {error ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText} numberOfLines={3}>
                            Couldn't load conversations: {error.message}
                        </Text>
                        <Pressable onPress={() => void refresh()}>
                            <Text style={styles.errorRetry}>Try again</Text>
                        </Pressable>
                    </View>
                ) : null}

                {loading && status === 'ready' && !grouped ? (
                    <View style={styles.loadingBlock}>
                        <ActivityIndicator size="small" color={Colors.brand} />
                        <Text style={styles.loadingText}>Loading your conversations…</Text>
                    </View>
                ) : null}

                {pinned.length > 0 ? (
                    <>
                        <Section label="Pinned" icon={<Icons.Pin size={11} color="#c9a76b" />} />
                        <View style={styles.list}>
                            {pinned.map((conv) => <ConversationRow key={conv.id} conv={conv} />)}
                        </View>
                    </>
                ) : null}

                {today.length > 0 ? (
                    <>
                        <Section label={`Today · ${today.length}`} />
                        <View style={styles.list}>
                            {today.map((conv, idx) => (
                                <ConversationRow key={conv.id} conv={conv} active={idx === 0 && usingMockData} />
                            ))}
                        </View>
                    </>
                ) : null}

                {yesterday.length > 0 ? (
                    <>
                        <Section label={`Yesterday · ${yesterday.length}`} />
                        <View style={styles.list}>
                            {yesterday.map((conv) => <ConversationRow key={conv.id} conv={conv} />)}
                        </View>
                    </>
                ) : null}

                {earlier.length > 0 ? (
                    <>
                        <Section label={`Earlier · ${earlier.length}`} />
                        <View style={styles.list}>
                            {earlier.map((conv) => <ConversationRow key={conv.id} conv={conv} />)}
                        </View>
                    </>
                ) : null}

                <FooterNav />
            </ScrollView>
        </SafeAreaView>
    );
}

function Section({ label, icon }: { label: string; icon?: React.ReactNode }) {
    return (
        <View style={styles.section}>
            {icon}
            <Text style={styles.sectionLabel}>{label}</Text>
        </View>
    );
}

function ConversationRow({ conv, active = false }: { conv: ConversationSummary; active?: boolean }) {
    return (
        <Pressable
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: conv.id } })}
            style={[styles.row, active && styles.rowActive]}
        >
            <View style={styles.avSlot}>
                <AgentAvatarStack
                    agents={conv.agents}
                    size={30}
                    borderColor={active ? Colors.surface : Colors.bg}
                />
            </View>
            <View style={styles.body}>
                <View style={styles.bodyTop}>
                    <Text numberOfLines={1} style={styles.rowTitle}>{conv.title}</Text>
                    <Text style={styles.rowTime}>{conv.timestamp}</Text>
                </View>
                <Text numberOfLines={1} style={styles.rowSnippet}>{conv.snippet}</Text>
                <View style={styles.rowMeta}>
                    <Text style={styles.agentTag}>
                        {conv.agents.map(a => a.name).join(' · ')} · {conv.messageCount} messages
                    </Text>
                    {conv.live ? (
                        <View style={styles.liveTag}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>live</Text>
                        </View>
                    ) : null}
                    {conv.pinned ? <Icons.Pin size={10} color="#c9a76b" /> : null}
                    {conv.unreadCount ? (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{conv.unreadCount}</Text>
                        </View>
                    ) : null}
                </View>
            </View>
        </Pressable>
    );
}

function FooterNav() {
    return (
        <View style={styles.footer}>
            <Pressable style={styles.footerRow} onPress={() => router.push('/explorer')}>
                <View style={[styles.footerIcon, { backgroundColor: Colors.brandSoft }]}>
                    <Icons.Database size={18} color={Colors.brand} />
                </View>
                <View style={styles.footerBody}>
                    <Text style={styles.footerLabel}>Data Explorer</Text>
                    <Text style={styles.footerSub}>Entities · Queries · Dashboards</Text>
                </View>
                <Icons.ChevronRight size={16} color={Colors.ink3} />
            </Pressable>
            <Pressable style={styles.footerRow} onPress={() => router.push('/profile')}>
                <View style={[styles.footerIcon, { backgroundColor: '#b87a1f' }]}>
                    <Text style={styles.profileInitial}>A</Text>
                </View>
                <View style={styles.footerBody}>
                    <Text style={styles.footerLabel}>Profile</Text>
                    <Text style={styles.footerSub}>Settings &amp; account</Text>
                </View>
                <Icons.ChevronRight size={16} color={Colors.ink3} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    navTop: {
        height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2,
    },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    titleStack: { flex: 1, paddingLeft: 4 },
    title: { fontSize: 20, fontWeight: Type.bold, letterSpacing: -0.4, color: Colors.ink },
    emptyHint: { fontSize: 11, color: Colors.ink3, marginTop: 1 },
    scroll: { paddingBottom: Spacing.xxxl },

    actions: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
    newButton: { flex: 1, height: 44, backgroundColor: Colors.ink, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    newButtonText: { color: Colors.inverse, fontSize: 14, fontWeight: Type.semibold },
    searchButton: { width: 44, height: 44, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },

    errorBox: { marginTop: 12, marginHorizontal: 16, padding: 12, backgroundColor: Colors.dangerSoft, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    errorText: { fontSize: 13, color: Colors.danger, lineHeight: 19 },
    errorRetry: { color: Colors.danger, fontSize: 13, fontWeight: Type.semibold, marginTop: 6 },

    loadingBlock: { paddingVertical: 24, alignItems: 'center', gap: 8 },
    loadingText: { fontSize: 13, color: Colors.ink3 },

    section: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.xl, paddingTop: 18, paddingBottom: 8 },
    sectionLabel: { fontSize: 11, fontWeight: Type.bold, letterSpacing: 1.4, color: Colors.ink3 },

    list: { paddingHorizontal: 10 },
    row: { flexDirection: 'row', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderRadius: Radius.lg },
    rowActive: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, ...Shadow.card },
    avSlot: { width: 44, height: 44, justifyContent: 'center', alignItems: 'flex-start' },
    body: { flex: 1, minWidth: 0 },
    bodyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rowTitle: { fontSize: 14.5, fontWeight: Type.semibold, letterSpacing: -0.15, color: Colors.ink, flex: 1 },
    rowTime: { fontSize: 11.5, fontWeight: Type.medium, color: Colors.ink3 },
    rowSnippet: { fontSize: 12.5, color: Colors.ink3, marginTop: 3 },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    agentTag: { fontSize: 11, color: Colors.ink3, fontWeight: Type.medium },
    liveTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ec4a3' },
    liveText: { fontSize: 11, fontWeight: Type.semibold, color: Colors.brand },
    badge: { backgroundColor: Colors.brand, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
    badgeText: { fontSize: 10.5, fontWeight: Type.bold, color: Colors.inverse },

    footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2, marginTop: 8, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 18 },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.lg },
    footerIcon: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    footerBody: { flex: 1 },
    footerLabel: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink },
    footerSub: { fontSize: 11.5, color: Colors.ink3, marginTop: 1 },
    profileInitial: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
});
