import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icons } from '@/components/Icon';
import {
    capturePhoto,
    pickDocument,
    pickImageFromLibrary,
    type CapturedAttachment,
} from '@/data/services/attachments';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * A bottom-sheet action menu for attaching a photo or file, triggered by the
 * composer's paperclip button.
 *
 * Presents three actions — Take Photo (camera), Choose Photo (library), Choose
 * File (documents) — each backed by the corresponding {@link CapturedAttachment}
 * producer in `@/data/services/attachments`. Every producer degrades gracefully
 * (permission denial, user cancel, or a simulator with no camera all resolve to
 * `null`), so a "no-op" tap simply closes the sheet. On a successful pick the
 * chosen attachment is handed back to the parent via {@link onPicked} and the
 * sheet closes.
 *
 * Rendering is gated by {@link visible} and uses a translucent-scrim `Modal`, so
 * the parent owns show/hide state.
 */
export type AttachmentPickerProps = {
    /** Whether the action sheet is shown. */
    visible: boolean;
    /** Called to dismiss the sheet (backdrop tap, Cancel, or after a pick). */
    onClose: () => void;
    /** Called with the chosen attachment when a pick succeeds. */
    onPicked: (attachment: CapturedAttachment) => void;
};

/** The distinct capture sources, used to show a per-row busy spinner. */
type PickerSource = 'camera' | 'library' | 'document';

/**
 * Bottom-sheet attachment action menu. See {@link AttachmentPickerProps}.
 */
export function AttachmentPicker({ visible, onClose, onPicked }: AttachmentPickerProps) {
    const [busy, setBusy] = useState<PickerSource | null>(null);

    const run = async (source: PickerSource, pick: () => Promise<CapturedAttachment | null>) => {
        if (busy) return;
        setBusy(source);
        try {
            const attachment = await pick();
            if (attachment) onPicked(attachment);
        } finally {
            setBusy(null);
            onClose();
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.scrim} onPress={() => (busy ? undefined : onClose())}>
                {/* Stop propagation so taps inside the sheet don't dismiss it. */}
                <Pressable style={styles.sheet} onPress={() => undefined}>
                    <View style={styles.grabber} />
                    <Text style={styles.title}>Add attachment</Text>

                    <PickerRow
                        icon={<Icons.Camera size={20} color={Colors.brand} strokeWidth={2} />}
                        label="Take Photo"
                        sublabel="Use the camera"
                        busy={busy === 'camera'}
                        disabled={busy !== null}
                        onPress={() => void run('camera', capturePhoto)}
                    />
                    <PickerRow
                        icon={<Icons.Image size={20} color={Colors.brand} strokeWidth={2} />}
                        label="Choose Photo"
                        sublabel="Pick from your library"
                        busy={busy === 'library'}
                        disabled={busy !== null}
                        onPress={() => void run('library', pickImageFromLibrary)}
                    />
                    <PickerRow
                        icon={<Icons.FileText size={20} color={Colors.brand} strokeWidth={2} />}
                        label="Choose File"
                        sublabel="Pick a document"
                        busy={busy === 'document'}
                        disabled={busy !== null}
                        onPress={() => void run('document', pickDocument)}
                    />

                    <Pressable style={styles.cancel} onPress={() => (busy ? undefined : onClose())} disabled={busy !== null}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

/** A single tappable row in the {@link AttachmentPicker} sheet. */
function PickerRow({ icon, label, sublabel, busy, disabled, onPress }: {
    icon: React.ReactNode;
    label: string;
    sublabel: string;
    busy: boolean;
    disabled: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable style={[styles.row, disabled && styles.rowDisabled]} onPress={onPress} disabled={disabled}>
            <View style={styles.rowIcon}>{icon}</View>
            <View style={styles.rowBody}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowSub}>{sublabel}</Text>
            </View>
            {busy ? <ActivityIndicator size="small" color={Colors.brand} /> : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    scrim: { flex: 1, backgroundColor: 'rgba(13,13,16,0.35)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 28, ...Shadow.cardLarge },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.line2, marginBottom: 12 },
    title: { fontSize: 12, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 6, paddingBottom: 8 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8, borderRadius: Radius.lg },
    rowDisabled: { opacity: 0.55 },
    rowIcon: { width: 40, height: 40, borderRadius: Radius.md, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    rowLabel: { fontSize: 15.5, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    rowSub: { fontSize: 12.5, color: Colors.ink3, marginTop: 2 },

    cancel: { marginTop: 10, paddingVertical: 13, borderRadius: Radius.lg, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2 },
    cancelText: { fontSize: 15, fontWeight: Type.semibold, color: Colors.ink2 },
});
