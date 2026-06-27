/*----------------------------------------------------------------------------------------------------
  Agent Media Library (Praxis WBS: S1 follow-up) — MJ-core, additive only.

  Lets a realtime agent draw on a curated, governed media kit during a conversation by REUSING the
  existing Artifacts + Collections stack instead of a bespoke media-resource entity:

    - A Collection of Artifacts IS the agent's "media kit". Each membership row (MJ: Collection
      Artifacts) already carries Sequence (priority/order); this migration adds the two pieces a
      realtime agent needs to reason over an item WITHOUT a new top-level entity:
        * ContextDescription — the agent-facing "what this is / when to show it", PER-MEMBERSHIP so
          the same artifact can be framed differently in different kits.
        * Preload            — eager hint: show / prefetch this item at session start.
      (The artifact itself keeps describing the media — MJ: Files link, MimeType, name, viewer,
       versioning, permissions. Nothing is duplicated; bytes stream via the existing /media route.)

    - AIAgent gains DefaultMediaCollectionID (FK -> Collection): the agent's default media kit. A
      per-session runtime override (supplied by the calling app, e.g. a Praxis Protocol) takes
      precedence; when neither is set the agent simply has no kit and the call-time Media_ShowMedia
      tool still works for ad-hoc media.
----------------------------------------------------------------------------------------------------*/

/*--------------------------------------------------------------------------------------------------
  1. CollectionArtifact — agent-facing media metadata (per-membership; Sequence already exists)
--------------------------------------------------------------------------------------------------*/
ALTER TABLE ${flyway:defaultSchema}.CollectionArtifact ADD
    ContextDescription NVARCHAR(MAX) NULL,
    Preload BIT NOT NULL CONSTRAINT DF_CollectionArtifact_Preload DEFAULT (0);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Agent-facing description of what this media item is and WHEN to show it during a conversation. Read by a realtime agent (alongside the artifact''s own name/type) to decide autonomously whether/when to surface the item. Per-membership: the same artifact can carry different guidance in different Collections (media kits).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CollectionArtifact',
    @level2type = N'COLUMN', @level2name = N'ContextDescription';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Eager-load hint for a realtime media kit: when 1, the agent is told to show / the client to prefetch this item at session start rather than waiting until it is contextually relevant. Default 0 (lazy — surfaced only when the agent chooses).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CollectionArtifact',
    @level2type = N'COLUMN', @level2name = N'Preload';
GO

/*--------------------------------------------------------------------------------------------------
  2. AIAgent — default media kit binding (a Collection used as the agent's media library)
--------------------------------------------------------------------------------------------------*/
ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    DefaultMediaCollectionID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.AIAgent
    ADD CONSTRAINT FK_AIAgent_DefaultMediaCollection
        FOREIGN KEY (DefaultMediaCollectionID) REFERENCES ${flyway:defaultSchema}.Collection(ID);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'OPTIONAL default media kit for this agent: a Collection of Artifacts the agent may show on the realtime Media channel during a conversation. Resolved per session as runtime-override > this agent default > none. When set, the agent is given a manifest (each item''s display name, media type, when-to-show ContextDescription and Preload flag) so it can surface items via the Media_ShowMedia tool. When NULL the agent has no curated kit (ad-hoc Media_ShowMedia still works).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'DefaultMediaCollectionID';
GO
