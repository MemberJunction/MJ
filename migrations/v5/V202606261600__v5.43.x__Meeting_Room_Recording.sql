/*
 * Meeting-Room recording fields on Conversation.
 *
 * A LiveKit "meeting" maps 1:1 to a Conversation whose Type = 'Meeting Room' (ApplicationScope =
 * 'Application', so it stays out of normal chat). A meeting can span MULTIPLE agent sessions, so the
 * room-level composite recording (one MP4 produced by LiveKit egress for the whole room) belongs on
 * the room — i.e. here on Conversation — NOT on any single AIAgentSession (which already has its own
 * per-agent RecordingFileID from V202606251200).
 *
 *   - RecordingFileID -> MJ: Files: the composite room recording (egress MP4 copied into MJStorage).
 *   - EgressID: the LiveKit egress session id, for tracking / stop / audit while a recording is live.
 *
 * Additive + nullable only (no breaking change). CodeGen generates the EntityField metadata + entity
 * class properties from these columns + their extended-property descriptions.
 */

ALTER TABLE ${flyway:defaultSchema}.Conversation ADD
    RecordingFileID UNIQUEIDENTIFIER NULL,
    EgressID NVARCHAR(255) NULL;

ALTER TABLE ${flyway:defaultSchema}.Conversation
    ADD CONSTRAINT FK_Conversation_RecordingFile
        FOREIGN KEY (RecordingFileID) REFERENCES ${flyway:defaultSchema}.[File](ID);

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Meeting-Room conversation, the MJ: Files row holding the room-level composite recording (the LiveKit egress MP4, copied into MJStorage). NULL when the meeting was not recorded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Conversation',
    @level2type = N'COLUMN', @level2name = N'RecordingFileID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The LiveKit egress session id for this meeting''s room recording. Set when recording starts; used to stop the egress and to correlate the egress-completion result with this conversation. NULL when the meeting was not recorded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Conversation',
    @level2type = N'COLUMN', @level2name = N'EgressID';
