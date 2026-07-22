import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { RecordForm } from '@/components/RecordForm';
import { OfflineQueueBadge } from '@/components/OfflineQueueBadge';
import { useRecordEditor } from '@/hooks/useExplorer';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Record edit screen.
 *
 * Route: `/explorer/record/:id/edit` (Expo Router, `app/explorer/record/[id]/edit.tsx`),
 * the editable sibling of the read-only detail screen (`app/explorer/record/[id].tsx`).
 * Params: `id` (record primary key) and `entity` (MJ entity name), read from the
 * query string via `useLocalSearchParams`.
 * Data: `useRecordEditor(entity, id)` -> `@/data/services/record-edit`, which loads
 * a strongly-typed `BaseEntity`, projects its editable scalar fields into editor
 * descriptors, and saves edits via `BaseEntity.Validate()` + `Save()`.
 * Interactions: back chevron -> `router.back()` (discard); Save (primary, LEFT per
 * MJ dialog convention) validates + persists then returns to detail; Cancel (RIGHT)
 * discards. Shows a spinner while saving, inline field errors, and a top banner for
 * save/permission failures.
 */
export default function RecordEditScreen() {
    const { id, entity } = useLocalSearchParams<{ id: string; entity: string }>();
    const { load, values, errors, loading, saving, error, canUpdate, setValue, save } = useRecordEditor(entity, id);
    const [saveError, setSaveError] = useState<string | null>(null);

    /** Run validation + save; on success return to the detail screen, else surface the error. */
    const onSave = async () => {
        setSaveError(null);
        const result = await save();
        if (result.success) {
            router.back();
        } else if (result.error) {
            setSaveError(result.error);
        }
    };

    const hasFields = !!load && load.descriptors.length > 0;
    const canSave = hasFields && canUpdate && !saving;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text numberOfLines={1} style={styles.headerTitle}>{load?.title ?? 'Edit'}</Text>
                    <Text style={styles.headerSub}>Editing {load?.entity.DisplayName ?? entity}</Text>
                </View>
                <View style={styles.iconBtn} />
            </View>

            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <EditBody
                    loading={loading}
                    error={error}
                    hasLoad={!!load}
                    hasFields={hasFields}
                    canUpdate={canUpdate}
                    saveError={saveError}
                    descriptors={load?.descriptors ?? []}
                    values={values}
                    errors={errors}
                    saving={saving}
                    onChange={setValue}
                />
            </KeyboardAvoidingView>

            {hasFields ? (
                <View style={styles.actionBar}>
                    <OfflineQueueBadge />
                    <Pressable style={[styles.saveBtn, !canSave && styles.btnDisabled]} onPress={onSave} disabled={!canSave}>
                        {saving ? <ActivityIndicator color={Colors.inverse} /> : <Text style={styles.saveText}>Save</Text>}
                    </Pressable>
                    <Pressable style={styles.cancelBtn} onPress={() => router.back()} disabled={saving}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                </View>
            ) : null}
        </SafeAreaView>
    );
}

/** Props for {@link EditBody} — the scrollable content area of the edit screen. */
type EditBodyProps = {
    loading: boolean;
    error: Error | null;
    hasLoad: boolean;
    hasFields: boolean;
    canUpdate: boolean;
    saveError: string | null;
    descriptors: React.ComponentProps<typeof RecordForm>['descriptors'];
    values: React.ComponentProps<typeof RecordForm>['values'];
    errors: React.ComponentProps<typeof RecordForm>['errors'];
    saving: boolean;
    onChange: React.ComponentProps<typeof RecordForm>['onChange'];
};

/** Renders the correct body state: loading, error, not-found, no-fields, or the form. */
function EditBody(props: EditBodyProps) {
    const { loading, error, hasLoad, hasFields, canUpdate, saveError } = props;

    if (loading && !hasLoad) {
        return <View style={styles.centerBlock}><ActivityIndicator color={Colors.brand} /></View>;
    }
    if (error) {
        return <View style={styles.centerBlock}><Text style={styles.errorText}>{error.message}</Text></View>;
    }
    if (!hasLoad) {
        return <View style={styles.centerBlock}><Text style={styles.errorText}>Record not found.</Text></View>;
    }
    if (!hasFields) {
        return <View style={styles.centerBlock}><Text style={styles.mutedText}>This record has no editable fields.</Text></View>;
    }

    return (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {!canUpdate ? (
                <View style={styles.banner}>
                    <Text style={styles.bannerText}>You don&apos;t have permission to update this record. Changes can&apos;t be saved.</Text>
                </View>
            ) : null}
            {saveError ? (
                <View style={[styles.banner, styles.bannerError]}>
                    <Text style={[styles.bannerText, styles.bannerErrorText]} numberOfLines={4}>{saveError}</Text>
                </View>
            ) : null}
            <RecordForm
                descriptors={props.descriptors}
                values={props.values}
                errors={props.errors}
                onChange={props.onChange}
                disabled={props.saving || !canUpdate}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    flex: { flex: 1 },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: Type.semibold, color: Colors.ink, maxWidth: 240 },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 1 },

    centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    errorText: { fontSize: 13, color: Colors.danger, textAlign: 'center' },
    mutedText: { fontSize: 13, color: Colors.ink3, textAlign: 'center' },

    body: { padding: 16, paddingBottom: 120, gap: 14 },
    banner: { backgroundColor: Colors.warnSoft, borderRadius: Radius.md, padding: 12 },
    bannerText: { fontSize: 13, color: Colors.warn, fontWeight: Type.medium, lineHeight: 19 },
    bannerError: { backgroundColor: Colors.dangerSoft },
    bannerErrorText: { color: Colors.danger },

    actionBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 28, backgroundColor: Colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line2 },
    saveBtn: { flex: 1, height: 50, borderRadius: Radius.lg, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center', ...Shadow.cardLarge },
    saveText: { color: Colors.inverse, fontSize: 15.5, fontWeight: Type.semibold },
    btnDisabled: { opacity: 0.5 },
    cancelBtn: { flex: 1, height: 50, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, alignItems: 'center', justifyContent: 'center' },
    cancelText: { color: Colors.ink, fontSize: 15.5, fontWeight: Type.semibold },
});
