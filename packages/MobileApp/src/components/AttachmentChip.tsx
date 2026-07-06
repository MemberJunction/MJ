import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icons } from '@/components/Icon';
import type { CapturedAttachment } from '@/data/services/attachments';
import { Colors, Radius, Type } from '@/theme/tokens';

/**
 * A compact preview of a pending {@link CapturedAttachment} shown above a
 * composer input before send. Images render a small thumbnail; documents render
 * a file glyph + filename. A trailing (x) removes the attachment via {@link onRemove}.
 */
export type AttachmentChipProps = {
    /** The attachment to preview. */
    attachment: CapturedAttachment;
    /** Called when the user taps the remove (x) control. */
    onRemove: () => void;
};

/** Preview chip for a pending attachment. See {@link AttachmentChipProps}. */
export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
    const isImage = attachment.kind === 'image';
    return (
        <View style={styles.chip}>
            {isImage ? (
                <Image source={{ uri: attachment.uri }} style={styles.thumb} />
            ) : (
                <View style={styles.docIcon}>
                    <Icons.FileText size={16} color={Colors.brand} strokeWidth={2} />
                </View>
            )}
            <Text style={styles.name} numberOfLines={1}>
                {attachment.name}
            </Text>
            <Pressable hitSlop={8} style={styles.remove} onPress={onRemove}>
                <Icons.X size={14} color={Colors.ink2} strokeWidth={2.4} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%', paddingLeft: 6, paddingRight: 8, paddingVertical: 6, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.md },
    thumb: { width: 30, height: 30, borderRadius: Radius.sm, backgroundColor: Colors.surface2 },
    docIcon: { width: 30, height: 30, borderRadius: Radius.sm, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    name: { flexShrink: 1, fontSize: 13, fontWeight: Type.medium, color: Colors.ink },
    remove: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
});
