import { useCallback, useEffect, useMemo, useState } from 'react';
import { Metadata } from '@memberjunction/core';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icons } from '@/components/Icon';
import { AdaptConversationToSummary } from '@/data/adapt';
import { useConversations } from '@/hooks/useConversations';
import { useAgents } from '@/hooks/useAgents';
import { useMJ } from '@/providers/mj-provider';
import { LoadUserApplications, type MobileApplication } from '@/host/applications';
import { Greeting } from '@/navigation/greeting';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * @fileoverview Home — where the app opens.
 *
 * ## Why this screen exists
 *
 * The app used to launch straight into the conversation list, and navigation lived in a single
 * hamburger inside a chat thread. So the landing screen could not reach Apps, Data or Profile at
 * all: you had to open a conversation to find the way out of conversations. Nothing on screen told
 * a new user the app had anything beyond a list of chats.
 *
 * Home answers "what is this and what can I do here" in one view: who you are, the two things you
 * are most likely to want (start typing, start talking), what you were last doing, who you can talk
 * to, and where everything else lives. The tab bar underneath keeps all of it one tap away from
 * anywhere.
 *
 * ## What it deliberately is not
 *
 * Not a dashboard. Nothing here aggregates, charts or computes — every row is a door to something
 * that already exists, and everything it shows comes from data the app already loads for other
 * screens. A home screen that needs its own queries is a home screen that is slow to open.
 */

export default function HomeScreen() {
    const { status } = useMJ();
    // Same read the profile screen does — the provider exposes connection state, not identity.
    const user = useMemo(
        () => (status === 'ready' ? new Metadata().CurrentUser ?? null : null),  // global-provider-ok: single-provider mobile client
        [status],
    );
    const { conversations, loading, refresh } = useConversations();
    const { agents } = useAgents();
    const [apps, setApps] = useState<MobileApplication[]>([]);

    const loadApps = useCallback(async () => {
        if (status !== 'ready') return;
        try {
            setApps(await LoadUserApplications());
        } catch {
            // Apps are one section of a page, not the page. A failure here leaves the section out
            // rather than taking Home down with it.
        }
    }, [status]);
    useEffect(() => { void loadApps(); }, [loadApps]);

    // The three most recent threads, through the same adapter the Chats tab uses — so a title with
    // a mention in it reads the same on both screens rather than showing the raw wire format here.
    // "Continue" is the job, not "browse"; the Chats tab is one tap away and does browsing properly.
    const recent = useMemo(
        () =>
            (conversations ?? [])
                // "Continue" has to have something to continue. A voice session that opened and
                // produced no transcript still creates its conversation, and this workspace has
                // dozens of those — they belong in the full list, not at the top of Home.
                .filter((c) => c.messageCount > 0)
                .slice(0, 3)
                .map(AdaptConversationToSummary),
        [conversations],
    );
    const topAgents = useMemo(() => (agents ?? []).slice(0, 6), [agents]);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={loading && status === 'ready'}
                        onRefresh={() => { void refresh(); void loadApps(); }}
                        tintColor={Colors.brand}
                    />
                }
            >
                <Text style={styles.greeting}>
                    {Greeting(user?.FirstName || user?.Name || null)}
                </Text>
                <Text style={styles.sub}>Ask an agent anything, or pick up where you left off.</Text>

                {/* The two primary actions, given the weight they deserve rather than buried in a
                    header. Typing and talking are the app's whole point. */}
                <View style={styles.actions}>
                    <Pressable
                        style={[styles.action, styles.actionPrimary]}
                        accessibilityRole="button"
                        onPress={() => router.push('/new-conversation')}
                    >
                        <Icons.Plus size={19} color={Colors.inverse} strokeWidth={2.4} />
                        <Text style={styles.actionPrimaryText}>New conversation</Text>
                    </Pressable>
                    <Pressable
                        style={[styles.action, styles.actionSecondary]}
                        accessibilityRole="button"
                        accessibilityLabel="Start a voice conversation"
                        onPress={() => router.push('/voice-mode')}
                    >
                        <Icons.Mic size={19} color={Colors.brand} strokeWidth={2.2} />
                        <Text style={styles.actionSecondaryText}>Talk</Text>
                    </Pressable>
                </View>

                {recent.length > 0 ? (
                    <Section
                        Title="Continue"
                        ActionLabel="All chats"
                        OnAction={() => router.push('/conversations')}
                    >
                        {recent.map((c) => (
                            <Pressable
                                key={c.id}
                                style={styles.row}
                                accessibilityRole="button"
                                accessibilityLabel={c.title}
                                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
                            >
                                <View style={[styles.rowAvatar, { backgroundColor: c.agents[0]?.color ?? Colors.brand }]}>
                                    <Text style={styles.rowAvatarText}>{c.agents[0]?.initial ?? 'A'}</Text>
                                </View>
                                <View style={styles.rowBody}>
                                    <Text style={styles.rowTitle} numberOfLines={1}>{c.title}</Text>
                                    <Text style={styles.rowSnippet} numberOfLines={1}>{c.snippet}</Text>
                                </View>
                                {c.live ? <View style={styles.liveDot} /> : null}
                                <Text style={styles.rowTime}>{c.timestamp}</Text>
                            </Pressable>
                        ))}
                    </Section>
                ) : null}

                {topAgents.length > 0 ? (
                    <Section Title="Your agents">
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.agentRail}
                        >
                            {topAgents.map((a) => (
                                <Pressable
                                    key={a.id}
                                    style={styles.agentChip}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Start a conversation with ${a.name}`}
                                    onPress={() => router.push('/new-conversation')}
                                >
                                    <View style={[styles.agentAvatar, { backgroundColor: a.color }]}>
                                        <Text style={styles.agentAvatarText}>{a.initial}</Text>
                                    </View>
                                    <Text style={styles.agentName} numberOfLines={1}>{a.name}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </Section>
                ) : null}

                <Section Title="Explore">
                    {/* Data Explorer is not a tab — four keeps the bar comfortable — so it gets a
                        first-class door here rather than being reachable only by deep link. */}
                    <Tile
                        Icon="Database"
                        Tint={Colors.agentForecaster}
                        Title="Data Explorer"
                        Body="Entities, queries and dashboards"
                        OnPress={() => router.push('/explorer')}
                    />
                    <Tile
                        Icon="Grid"
                        Tint={Colors.agentResearch}
                        Title="Apps"
                        Body={apps.length > 0 ? `${apps.length} available to you` : 'Applications hosted here'}
                        OnPress={() => router.push('/apps')}
                    />
                </Section>
            </ScrollView>
        </SafeAreaView>
    );
}

/** A titled block with an optional right-hand action. */
function Section({
    Title,
    ActionLabel,
    OnAction,
    children,
}: {
    Title: string;
    ActionLabel?: string;
    OnAction?: () => void;
    children: React.ReactNode;
}) {
    return (
        <View style={styles.section}>
            <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{Title}</Text>
                {ActionLabel && OnAction ? (
                    <Pressable hitSlop={8} accessibilityRole="button" onPress={OnAction}>
                        <Text style={styles.sectionAction}>{ActionLabel}</Text>
                    </Pressable>
                ) : null}
            </View>
            <View style={styles.card}>{children}</View>
        </View>
    );
}

/** One destination row inside a card. */
function Tile({
    Icon,
    Tint,
    Title,
    Body,
    OnPress,
}: {
    Icon: keyof typeof Icons;
    Tint: string;
    Title: string;
    Body: string;
    OnPress: () => void;
}) {
    const Glyph = Icons[Icon];
    return (
        <Pressable style={styles.row} accessibilityRole="button" accessibilityLabel={Title} onPress={OnPress}>
            <View style={[styles.tileIcon, { backgroundColor: Tint }]}>
                <Glyph size={17} color={Colors.inverse} strokeWidth={2.1} />
            </View>
            <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{Title}</Text>
                <Text style={styles.rowSnippet} numberOfLines={1}>{Body}</Text>
            </View>
            <Icons.ChevronRight size={18} color={Colors.ink3} strokeWidth={2} />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    scroll: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },

    greeting: { fontSize: 25, fontWeight: Type.bold, color: Colors.ink, letterSpacing: -0.5 },
    sub: { fontSize: 14, color: Colors.ink3, marginTop: 5, lineHeight: 20 },

    actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
    action: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: 48, borderRadius: Radius.lg,
    },
    actionPrimary: { flex: 1, backgroundColor: Colors.brand, ...Shadow.card },
    actionPrimaryText: { color: Colors.inverse, fontSize: 15, fontWeight: Type.semibold },
    actionSecondary: {
        paddingHorizontal: 20, backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2,
    },
    actionSecondaryText: { color: Colors.brand, fontSize: 15, fontWeight: Type.semibold },

    section: { marginTop: 26 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 9 },
    sectionTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1.3, color: Colors.ink3, textTransform: 'uppercase' },
    sectionAction: { fontSize: 13, fontWeight: Type.medium, color: Colors.brand },
    card: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        overflow: 'hidden',
    },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 12 },
    rowAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    rowAvatarText: { color: Colors.inverse, fontSize: 13.5, fontWeight: '700' },
    rowBody: { flex: 1, gap: 2 },
    rowTitle: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    rowSnippet: { fontSize: 12.5, color: Colors.ink3 },
    rowTime: { fontSize: 11.5, color: Colors.ink3 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.positive },

    tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

    agentRail: { paddingHorizontal: 11, paddingVertical: 11, gap: 9 },
    agentChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingLeft: 7, paddingRight: 14, paddingVertical: 7,
        borderRadius: 999, backgroundColor: Colors.surface2,
    },
    agentAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    agentAvatarText: { color: Colors.inverse, fontSize: 11.5, fontWeight: '700' },
    agentName: { fontSize: 13.5, fontWeight: Type.medium, color: Colors.ink, maxWidth: 130 },
});
