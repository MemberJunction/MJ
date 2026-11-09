import { describe, it, expect } from 'vitest';
import { MessageItemComponent, type MessageAttachment } from './message-item.component';
import { ConversationChatAreaComponent } from '../conversation/conversation-chat-area.component';

/**
 * An image in a message's text opens full size in the chat's image viewer.
 *
 * <mj-markdown> reports a clicked image through ImageClicked; the message item turns it into an
 * image attachment on AttachmentClicked, the same output an attachment thumbnail uses, so the chat
 * area opens its viewer on it. Constructed off the prototype, as the other message-item specs are.
 * (Co-located as .dom.test.ts because importing the components pulls the Angular graph the node
 * project can't load.)
 */
describe('MessageItemComponent — an image in the message text', () => {
    const SRC = 'https://api.example.test/media/F1?token=t';

    const clickedFrom = (image: { Src: string; Alt: string }): MessageAttachment[] => {
        const emitted: MessageAttachment[] = [];
        const item = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
        Object.assign(item as unknown as Record<string, unknown>, {
            AttachmentClicked: { emit: (a: MessageAttachment) => emitted.push(a) },
        });
        item.OnMarkdownImageClicked(image);
        return emitted;
    };

    const viewerFor = (attachment: MessageAttachment): ConversationChatAreaComponent => {
        const area = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
        area.OnAttachmentClicked(attachment);
        return area;
    };

    it('reports the image as an image attachment', () => {
        expect(clickedFrom({ Src: SRC, Alt: 'Pattern 5' })).toEqual([
            { id: SRC, type: 'Image', mimeType: '', fileName: 'Pattern 5', sizeBytes: 0, contentUrl: SRC },
        ]);
    });

    it('opens the chat image viewer on it', () => {
        const [attachment] = clickedFrom({ Src: SRC, Alt: 'Pattern 5' });
        const area = viewerFor(attachment);
        expect(area.ShowImageViewer).toBe(true);
        expect(area.SelectedImageUrl).toBe(SRC);
        expect(area.SelectedImageAlt).toBe('Pattern 5');
    });

    it('names an image with no alt text generically', () => {
        const [attachment] = clickedFrom({ Src: SRC, Alt: '' });
        expect(attachment.fileName).toBeNull();
        expect(viewerFor(attachment).SelectedImageAlt).toBe('Image attachment');
    });
});
