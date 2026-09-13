import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import type { MJConversationEntity } from '@memberjunction/core-entities';
import { BaseMobileResource, type MobileResourceProps } from '@/host/BaseMobileResource';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';
import { Icons } from '@/components/Icon';

/**
 * @fileoverview **Sample hosted application** — proves the mobile app is a host, not a fixed set
 * of screens, and serves as the worked example the authoring guide refers to.
 *
 * This file is the entire mobile contribution of an application. It does three things, and an app
 * team building their own surface does the same three:
 *
 *  1. Write a normal React Native screen.
 *  2. Wrap it in a {@link BaseMobileResource} subclass.
 *  3. Register that subclass under the `DriverClass` name the application already declares in its
 *     `MJ: Applications` nav metadata for the web.
 *
 * Note what is *not* here: no navigation wiring, no auth, no data-provider setup, no chrome, and
 * no mobile-specific entity access. Those belong to the host and the shared MJ object model, and
 * an application that had to supply them would not really be *hosted* — it would be forked into
 * the shell.
 *
 * The feature itself is deliberately mundane: browse recent conversations and capture a short note
 * as a new one. Mundane is the point — it exercises read, write, loading, empty and error states
 * over real MJ entities without inventing a domain to admire.
 */

/** A conversation row as this screen displays it. */
type FieldNote = {
    /** `MJ: Conversations` row id. */
    ID: string;
    /** Conversation name, shown as the note title. */
    Name: string;
    /** When it was last touched, pre-formatted for display. */
    UpdatedAt: string;
};

/**
 * The sample application's screen.
 *
 * An ordinary function component. It receives {@link MobileResourceProps} from the shell and is
 * otherwise indistinguishable from any other screen in the app — which is the property that makes
 * the extension mechanism worth having.
 */
function FieldNotesScreen({ ApplicationName, NavItem }: MobileResourceProps) {
    const [notes, setNotes] = useState<FieldNote[]>([]);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        const result = await new RunView().RunView<{ ID: string; Name: string; __mj_UpdatedAt: string }>({
            EntityName: 'MJ: Conversations',
            OrderBy: '__mj_UpdatedAt DESC',
            Fields: ['ID', 'Name', '__mj_UpdatedAt'],
            MaxRows: 25,
            ResultType: 'simple',
        });
        if (!result.Success) {
            setError(result.ErrorMessage ?? 'Could not load notes.');
        } else {
            setNotes(
                (result.Results ?? []).map((r) => ({
                    ID: r.ID,
                    Name: r.Name || 'Untitled',
                    UpdatedAt: formatWhen(r.__mj_UpdatedAt),
                })),
            );
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const save = useCallback(async () => {
        const text = draft.trim();
        if (!text || saving) return;
        setSaving(true);
        setError(null);
        try {
            const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
            const conv = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', md.CurrentUser);
            conv.NewRecord();
            conv.Name = text;
            if (md.CurrentUser?.ID) conv.UserID = md.CurrentUser.ID;
            if (!(await conv.Save())) {
                setError(conv.LatestResult?.CompleteMessage ?? 'Could not save the note.');
                return;
            }
            setDraft('');
            await load();
        } finally {
            setSaving(false);
        }
    }, [draft, saving, load]);

    return (
        <View style={styles.screen}>
            <View style={styles.composer}>
                <TextInput
                    style={styles.input}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Capture a field note…"
                    placeholderTextColor={Colors.ink3}
                    accessibilityLabel="Field note text"
                    editable={!saving}
                    onSubmitEditing={() => void save()}
                    returnKeyType="done"
                />
                <Pressable
                    onPress={() => void save()}
                    disabled={!draft.trim() || saving}
                    accessibilityRole="button"
                    accessibilityLabel="Save note"
                    style={[styles.saveBtn, (!draft.trim() || saving) && styles.saveBtnDisabled]}
                >
                    {saving ? (
                        <ActivityIndicator color={Colors.inverse} size="small" />
                    ) : (
                        <Icons.Plus size={16} color={Colors.inverse} strokeWidth={2.5} />
                    )}
                </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <ScrollView contentContainerStyle={styles.list}>
                {loading ? (
                    <Text style={styles.muted}>Loading notes…</Text>
                ) : notes.length === 0 ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>No notes yet</Text>
                        <Text style={styles.muted}>
                            {ApplicationName} · {NavItem.Label}
                        </Text>
                    </View>
                ) : (
                    notes.map((n) => (
                        <View key={n.ID} style={styles.note}>
                            <Text style={styles.noteTitle} numberOfLines={2}>
                                {n.Name}
                            </Text>
                            <Text style={styles.noteMeta}>{n.UpdatedAt}</Text>
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

/**
 * Formats a timestamp for the note list.
 *
 * Relative for anything inside a day, absolute beyond it — the boundary where "3 hours ago" stops
 * being more useful than a date.
 */
function formatWhen(raw: string | null | undefined): string {
    if (!raw) return '';
    const when = new Date(raw);
    if (Number.isNaN(when.getTime())) return '';
    const minutes = Math.floor((Date.now() - when.getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
    return when.toLocaleDateString();
}

/**
 * Registers {@link FieldNotesScreen} as the mobile surface for the `FieldNotesResource` driver.
 *
 * The key must match the `DriverClass` in the application's `MJ: Applications` nav metadata — the
 * same string the web shell resolves against `BaseResourceComponent`. One driver name, two hosts,
 * no duplicated navigation model.
 */
@RegisterClass(BaseMobileResource, 'FieldNotesResource')
export class FieldNotesMobileResource extends BaseMobileResource {
    /** @inheritdoc */
    public get Component() {
        return FieldNotesScreen;
    }

    /** @inheritdoc */
    public override get Title(): string | null {
        return 'Field Notes';
    }
}

/**
 * Tree-shaking guard.
 *
 * `@RegisterClass` runs as a module side effect, and a bundler that sees no import of this module
 * will eliminate it — the class then never registers and the nav item silently falls back to
 * "opens on desktop", working in development and failing in a production build. Every registering
 * module in MJ carries one of these; a host calls it to create a static reference the bundler
 * cannot drop.
 */
export function LoadFieldNotesMobileResource(): void {
    /* intentionally empty — see the doc comment */
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.bg },
    composer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
    },
    input: {
        flex: 1,
        height: 44,
        paddingHorizontal: Spacing.md,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: Radius.lg,
        fontSize: 15,
        color: Colors.ink,
    },
    saveBtn: {
        width: 44,
        height: 44,
        borderRadius: Radius.lg,
        backgroundColor: Colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveBtnDisabled: { opacity: 0.4 },
    list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.sm },
    note: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
    },
    noteTitle: { fontSize: 15, color: Colors.ink, fontWeight: Type.semibold },
    noteMeta: { fontSize: 12, color: Colors.ink3, marginTop: 4 },
    empty: { alignItems: 'center', paddingTop: 48, gap: Spacing.xs },
    emptyTitle: { fontSize: 17, fontWeight: Type.semibold, color: Colors.ink },
    muted: { fontSize: 14, color: Colors.ink3, textAlign: 'center' },
    error: {
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.sm,
        fontSize: 13,
        color: Colors.danger,
    },
});
