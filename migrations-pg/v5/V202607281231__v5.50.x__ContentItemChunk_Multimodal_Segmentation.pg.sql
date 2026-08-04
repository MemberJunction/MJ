-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202607281231__v5.50.x__ContentItemChunk_Multimodal_Segmentation.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'ContentItemChunk' AND a.attname = 'Text'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ContentItemChunk" ALTER COLUMN "Text" TYPE TEXT, ALTER COLUMN "Text" DROP NOT NULL;

ALTER TABLE __mj."ContentItemChunk"
  ADD COLUMN "Modality" VARCHAR(20) NOT NULL DEFAULT 'text',
  ADD COLUMN "StartOffset" INT NULL,
  ADD COLUMN "EndOffset" INT NULL,
  ADD COLUMN "StartMs" INT NULL,
  ADD COLUMN "EndMs" INT NULL,
  ADD COLUMN "PageNumber" INT NULL,
  ADD COLUMN "SegmentTitle" VARCHAR(500) NULL,
  ADD COLUMN "Description" TEXT NULL,
  ADD COLUMN "Transcript" TEXT NULL,
  ADD COLUMN "SegmenterKey" VARCHAR(100) NULL,
  ADD COLUMN "ParentChunkID" UUID NULL;

ALTER TABLE __mj."ContentItemChunk"
  ADD CONSTRAINT "CK_ContentItemChunk_Modality" CHECK ("Modality" IN ('audio', 'image', 'multimodal', 'text', 'video'));

ALTER TABLE __mj."ContentItemChunk"
  ADD CONSTRAINT "FK_ContentItemChunk_ParentChunkID" FOREIGN KEY ("ParentChunkID") REFERENCES __mj."ContentItemChunk" (
    "ID"
  );

ALTER TABLE __mj."ContentSource"
  ADD COLUMN "SegmenterKey" VARCHAR(100) NULL,
  ADD COLUMN "CleanerKey" VARCHAR(100) NULL
 /* ----------------------------------------------------------------------------- */ /* ContentSource / ContentType — strategy selection */ /* Which cleaning and segmentation strategies a source uses is a property of the */ /* source, not of MemberJunction: the right HTML selector depends on the site's */ /* template, and the right chunking strategy depends on what the content is. These */ /* mirror the existing EmbeddingModelID / VectorIndexID pair, including its */ /* resolution order — ContentSource overrides ContentType, which falls back to a */ /* built-in default. */ /* The keys live in columns (discoverable, filterable, visible in a grid); their */ /* OPTIONS — CSS selectors, target sizes — ride the existing Configuration JSONType */ /* alongside VectorIDStrategy and ChunkTextStorage. */ /* ----------------------------------------------------------------------------- */;

ALTER TABLE __mj."ContentType"
  ADD COLUMN "SegmenterKey" VARCHAR(100) NULL,
  ADD COLUMN "CleanerKey" VARCHAR(100) NULL;

COMMENT ON COLUMN __mj."ContentSource"."SegmenterKey" IS 'Registration key of the segmentation strategy used to split this source''s content into embeddable chunks — for example StructuralText (document headings), AdaptiveBoundary (target size closing on the nearest natural break), SemanticText (LLM-detected topic boundaries), Transcript (audio/video chapters), PagedContent (one segment per page), or FixedWindow (uniform windows). NULL falls back to the Content Type''s value, then to a built-in default.';

COMMENT ON COLUMN __mj."ContentSource"."CleanerKey" IS 'Registration key of the content-cleaning strategy applied to this source before segmentation — for example Html (CSS-selector-driven extraction that drops navigation, sidebars, and advertising) or PlainText (whitespace normalization only). Cleaning is separate from segmentation because the two change for different reasons: a new site template needs new selectors, not a new chunking strategy. NULL falls back to the Content Type''s value, then to a default inferred from the content''s mime type.';

COMMENT ON COLUMN __mj."ContentType"."SegmenterKey" IS 'Default segmentation strategy for content of this type, used when a Content Source does not specify its own SegmenterKey. See ContentSource.SegmenterKey for the available strategies.';

COMMENT ON COLUMN __mj."ContentType"."CleanerKey" IS 'Default content-cleaning strategy for content of this type, used when a Content Source does not specify its own CleanerKey. See ContentSource.CleanerKey.';

COMMENT ON COLUMN __mj."ContentItemChunk"."Text" IS 'The chunk of extracted text (from the parent Content Item) that was embedded to produce this chunk''s vector. NULL for media-only segments (for example an image, or a video window with no transcript), where the embedded payload is the media itself and any readable representation lives in Description/Transcript.';

COMMENT ON COLUMN __mj."ContentItemChunk"."Modality" IS 'The modality of this chunk''s embedded payload: text (default), image, audio, video, or multimodal (text and media fused into a single vector). Determines which vector index the chunk''s embedding belongs to, since a multimodal embedding model produces vectors of a different dimension than a text model, and is used at retrieval time to merge results per modality rather than taking a single global top-k.';

COMMENT ON COLUMN __mj."ContentItemChunk"."StartOffset" IS 'Inclusive character offset where this chunk begins within the parent Content Item''s extracted text. Together with EndOffset this is the provenance link that resolves a search hit back to the exact passage in the source document. NULL for media segments, which are positioned by StartMs/EndMs instead.';

COMMENT ON COLUMN __mj."ContentItemChunk"."EndOffset" IS 'Exclusive character offset where this chunk ends within the parent Content Item''s extracted text. See StartOffset. NULL for media segments.';

COMMENT ON COLUMN __mj."ContentItemChunk"."StartMs" IS 'Start of this chunk''s time window, in milliseconds from the beginning of the parent audio or video asset. Set by transcript- or window-based segmentation; enables time-windowed playback deep-links from a search result (for example 14:22-15:05 of a session recording). NULL for text segments.';

COMMENT ON COLUMN __mj."ContentItemChunk"."EndMs" IS 'End of this chunk''s time window, in milliseconds from the beginning of the parent audio or video asset. See StartMs. NULL for text segments.';

COMMENT ON COLUMN __mj."ContentItemChunk"."PageNumber" IS 'One-based page number this chunk came from, for paginated sources such as PDFs or slide decks. Provides citation-grade provenance alongside the character offsets. NULL when the source is not paginated.';

COMMENT ON COLUMN __mj."ContentItemChunk"."SegmentTitle" IS 'Human-readable label for this segment — a document heading for structure-based segmentation, or a generated chapter title for topic- and transcript-based segmentation. Displayed with search results and prepended to the embedded text so a chunk''s vector carries its own topic.';

COMMENT ON COLUMN __mj."ContentItemChunk"."Description" IS 'An AI-generated description of this chunk''s content, primarily for non-text segments. Retrieval of a media chunk otherwise yields only a pointer (an asset and a time window) that an agent cannot reason over; this column is the readable representation that an agent reads, a cross-encoder reranks, and lexical search matches. A short summary of it may be mirrored into the vector record''s metadata for display and filtering, but the full text belongs here.';

COMMENT ON COLUMN __mj."ContentItemChunk"."Transcript" IS 'The verbatim transcript covering this chunk''s time window, for audio and video segments, including speaker labels where the source provides them. Distinct from Description, which is a generated summary: this is what was actually said, and it is what makes a recording findable by lexical search.';

COMMENT ON COLUMN __mj."ContentItemChunk"."SegmenterKey" IS 'Registration key of the segmentation strategy that produced this chunk (for example StructuralText, SemanticText, Transcript, or FixedWindow). Provenance: when a Content Source''s configured strategy changes, this identifies which chunks were produced by the previous strategy and therefore need re-chunking.';

COMMENT ON COLUMN __mj."ContentItemChunk"."ParentChunkID" IS 'Optional self-reference to another chunk of the same Content Item that is the parent of this one, expressing a chapter to sub-chapter hierarchy — for example a five-minute chapter of a recording and the individual speaker turns within it, or a document section and its subsections. NULL for top-level segments.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '012c715a-4846-4910-9d64-35c7327fa213' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'SegmenterKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('012c715a-4846-4910-9d64-35c7327fa213', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Sources */, 100039, 'SegmenterKey', 'Segmenter Key', 'Registration key of the segmentation strategy used to split this source''s content into embeddable chunks — for example StructuralText (document headings), AdaptiveBoundary (target size closing on the nearest natural break), SemanticText (LLM-detected topic boundaries), Transcript (audio/video chapters), PagedContent (one segment per page), or FixedWindow (uniform windows). NULL falls back to the Content Type''s value, then to a built-in default.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '22f6a2ee-fe1a-4fe7-a946-9fe7743de677' OR ("EntityID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'CleanerKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('22f6a2ee-fe1a-4fe7-a946-9fe7743de677', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Sources */, 100040, 'CleanerKey', 'Cleaner Key', 'Registration key of the content-cleaning strategy applied to this source before segmentation — for example Html (CSS-selector-driven extraction that drops navigation, sidebars, and advertising) or PlainText (whitespace normalization only). Cleaning is separate from segmentation because the two change for different reasons: a new site template needs new selectors, not a new chunking strategy. NULL falls back to the Content Type''s value, then to a default inferred from the content''s mime type.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cfc92a3b-c738-4940-8c92-11b032ce7e05' OR ("EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'SegmenterKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cfc92a3b-c738-4940-8c92-11b032ce7e05', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Types */, 100028, 'SegmenterKey', 'Segmenter Key', 'Default segmentation strategy for content of this type, used when a Content Source does not specify its own SegmenterKey. See ContentSource.SegmenterKey for the available strategies.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '87551e67-a36d-4de6-adb8-eab1a8450900' OR ("EntityID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'CleanerKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('87551e67-a36d-4de6-adb8-eab1a8450900', 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22' /* Entity: MJ: Content Types */, 100029, 'CleanerKey', 'Cleaner Key', 'Default content-cleaning strategy for content of this type, used when a Content Source does not specify its own CleanerKey. See ContentSource.CleanerKey.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7ca10d77-d4c3-4844-9ac6-cf684c1027a5' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'Modality')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7ca10d77-d4c3-4844-9ac6-cf684c1027a5', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100039, 'Modality', 'Modality', 'The modality of this chunk''s embedded payload: text (default), image, audio, video, or multimodal (text and media fused into a single vector). Determines which vector index the chunk''s embedding belongs to, since a multimodal embedding model produces vectors of a different dimension than a text model, and is used at retrieval time to merge results per modality rather than taking a single global top-k.', 'nvarchar', 40, 0, 0, FALSE, 'text', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f0f04464-9380-4cfe-a012-27e6eda15913' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'StartOffset')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f0f04464-9380-4cfe-a012-27e6eda15913', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100040, 'StartOffset', 'Start Offset', 'Inclusive character offset where this chunk begins within the parent Content Item''s extracted text. Together with EndOffset this is the provenance link that resolves a search hit back to the exact passage in the source document. NULL for media segments, which are positioned by StartMs/EndMs instead.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c98f7a52-c1dc-4a2f-8733-5a4a49a6cde9' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'EndOffset')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c98f7a52-c1dc-4a2f-8733-5a4a49a6cde9', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100041, 'EndOffset', 'End Offset', 'Exclusive character offset where this chunk ends within the parent Content Item''s extracted text. See StartOffset. NULL for media segments.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1e8a8a29-a598-49a4-ac97-c8dd923e506a' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'StartMs')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1e8a8a29-a598-49a4-ac97-c8dd923e506a', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100042, 'StartMs', 'Start Ms', 'Start of this chunk''s time window, in milliseconds from the beginning of the parent audio or video asset. Set by transcript- or window-based segmentation; enables time-windowed playback deep-links from a search result (for example 14:22-15:05 of a session recording). NULL for text segments.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4b42c9ed-789e-4417-ad71-44bbb7ebf7d5' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'EndMs')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4b42c9ed-789e-4417-ad71-44bbb7ebf7d5', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100043, 'EndMs', 'End Ms', 'End of this chunk''s time window, in milliseconds from the beginning of the parent audio or video asset. See StartMs. NULL for text segments.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd52720e3-05a7-41b2-8c00-c57d8767a930' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'PageNumber')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d52720e3-05a7-41b2-8c00-c57d8767a930', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100044, 'PageNumber', 'Page Number', 'One-based page number this chunk came from, for paginated sources such as PDFs or slide decks. Provides citation-grade provenance alongside the character offsets. NULL when the source is not paginated.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '62ff46f8-8815-462f-9f31-8818d831b2bb' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'SegmentTitle')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('62ff46f8-8815-462f-9f31-8818d831b2bb', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100045, 'SegmentTitle', 'Segment Title', 'Human-readable label for this segment — a document heading for structure-based segmentation, or a generated chapter title for topic- and transcript-based segmentation. Displayed with search results and prepended to the embedded text so a chunk''s vector carries its own topic.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5cb468a1-7c22-47eb-bf54-f53bc2c45714' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5cb468a1-7c22-47eb-bf54-f53bc2c45714', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100046, 'Description', 'Description', 'An AI-generated description of this chunk''s content, primarily for non-text segments. Retrieval of a media chunk otherwise yields only a pointer (an asset and a time window) that an agent cannot reason over; this column is the readable representation that an agent reads, a cross-encoder reranks, and lexical search matches. A short summary of it may be mirrored into the vector record''s metadata for display and filtering, but the full text belongs here.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd0b9e206-c912-4baf-9336-a2af8baba492' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'Transcript')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d0b9e206-c912-4baf-9336-a2af8baba492', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100047, 'Transcript', 'Transcript', 'The verbatim transcript covering this chunk''s time window, for audio and video segments, including speaker labels where the source provides them. Distinct from Description, which is a generated summary: this is what was actually said, and it is what makes a recording findable by lexical search.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8c51c895-93bf-43d8-9049-6a6ac8484a76' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'SegmenterKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8c51c895-93bf-43d8-9049-6a6ac8484a76', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100048, 'SegmenterKey', 'Segmenter Key', 'Registration key of the segmentation strategy that produced this chunk (for example StructuralText, SemanticText, Transcript, or FixedWindow). Provenance: when a Content Source''s configured strategy changes, this identifies which chunks were produced by the previous strategy and therefore need re-chunking.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '96841354-26bf-4919-91a3-b3170ea58f68' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'ParentChunkID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('96841354-26bf-4919-91a3-b3170ea58f68', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100049, 'ParentChunkID', 'Parent Chunk ID', 'Optional self-reference to another chunk of the same Content Item that is the parent of this one, expressing a chapter to sub-chapter hierarchy — for example a five-minute chapter of a recording and the individual speaker turns within it, or a document section and its subsections. NULL for top-level segments.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 17ba00d6-7e25-4f88-96b9-3541f424e3aa */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '17ba00d6-7e25-4f88-96b9-3541f424e3aa',
    '7CA10D77-D4C3-4844-9AC6-CF684C1027A5',
    1,
    'audio',
    'audio',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e5ed9508-72ed-4db0-be53-8876156fb5c9 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e5ed9508-72ed-4db0-be53-8876156fb5c9',
    '7CA10D77-D4C3-4844-9AC6-CF684C1027A5',
    2,
    'image',
    'image',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 61510446-22f5-41f5-940c-ce906f41ca1d */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '61510446-22f5-41f5-940c-ce906f41ca1d',
    '7CA10D77-D4C3-4844-9AC6-CF684C1027A5',
    3,
    'multimodal',
    'multimodal',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID db53b66f-4dc5-4888-9dfe-124fd8f7fb4e */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'db53b66f-4dc5-4888-9dfe-124fd8f7fb4e',
    '7CA10D77-D4C3-4844-9AC6-CF684C1027A5',
    4,
    'text',
    'text',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ecedff77-b9a9-42b3-abd5-45327c54f821 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ecedff77-b9a9-42b3-abd5-45327c54f821',
    '7CA10D77-D4C3-4844-9AC6-CF684C1027A5',
    5,
    'video',
    'video',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 7CA10D77-D4C3-4844-9AC6-CF684C1027A5 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '7CA10D77-D4C3-4844-9AC6-CF684C1027A5';
/* Create Entity Relationship: MJ: Content Item Chunks -> MJ: Content Item Chunks (One To Many via ParentChunkID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '383f6b94-709b-44fc-9d1b-1e09b4e8c174') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('383f6b94-709b-44fc-9d1b-1e09b4e8c174', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21', 'ParentChunkID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3ab39fd0-661f-4722-8d8b-39966220d555' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'RootParentChunkID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3ab39fd0-661f-4722-8d8b-39966220d555', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100051, 'RootParentChunkID', 'Root Parent Chunk ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '49B8433E-F36B-1410-867F-007B559E242F'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = 'A793AD50-0E66-EF11-A752-C0A5E8ACCB22'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '62FF46F8-8815-462F-9F31-8818D831B2BB' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '7CA10D77-D4C3-4844-9AC6-CF684C1027A5'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '62FF46F8-8815-462F-9F31-8818D831B2BB'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '62FF46F8-8815-462F-9F31-8818D831B2BB'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '5CB468A1-7C22-47EB-BF54-F53BC2C45714'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'D0B9E206-C912-4BAF-9336-A2AF8BABA492'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '62FF46F8-8815-462F-9F31-8818D831B2BB'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = 'A7B7433E-F36B-1410-867F-007B559E242F'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'FBB09B21-50A3-4CCE-A114-44B0C9835251'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '8E282AD9-2695-4F04-AC1F-79A5380D4E4D'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 16 fields */
/* UPDATE Entity Field Category Info MJ: Content Types.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '43B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '67B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6DB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '49B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4FB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.AIModelID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '55B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.AIModel */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ADDF8AC9-BF3A-4ECB-AF21-5C04DA27C396' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.EmbeddingModelID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0706EBD4-7D99-4F16-99DF-0E398E319AA3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.EmbeddingModel */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BAAB3CB5-ACCB-4594-BC69-8031EDBF0AA7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.VectorIndexID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '93D4F3C4-3110-41CD-85FD-7A6A2C28B2A4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.VectorIndex */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3C4FEC28-2617-418E-B476-09722B4A0858' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.MinTags */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5BB8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.MaxTags */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '61B8433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.Configuration */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '399CBC27-D03E-4230-9AE3-547E14651719' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.SegmenterKey */
UPDATE __mj."EntityField" SET "Category" = 'Advanced Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Segmenter Strategy', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CFC92A3B-C738-4940-8C92-11B032CE7E05' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Types.CleanerKey */
UPDATE __mj."EntityField" SET "Category" = 'Advanced Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Cleaner Strategy', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '87551E67-A36D-4DE6-ADB8-EAB1A8450900' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 26 fields */
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C07B5B08-0084-4F59-B638-243F526546E4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2D402F99-B9A1-4ABB-9D19-A4B204D09BAC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9E337B81-5B94-46AC-B696-0EFA27C9F85B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ContentItemID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '073F4C8A-F2AB-4F27-9FE3-743882972F31' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Sequence */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7618B84A-5040-4C23-9007-71F193E13B8A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ContentItem */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Content Item', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9527FB1B-0C05-4C0E-A709-C8922FAC9C8E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkID */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Chunk', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '96841354-26BF-4919-91A3-B3170EA58F68' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.RootParentChunkID */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Root Parent Chunk', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3AB39FD0-661F-4722-8D8B-39966220D555' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.SegmentTitle */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '62FF46F8-8815-462F-9F31-8818D831B2BB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Modality */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7CA10D77-D4C3-4844-9AC6-CF684C1027A5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.SegmenterKey */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8C51C895-93BF-43D8-9049-6A6AC8484A76' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Text */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Text', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '80DC7D33-19F5-4781-BC71-E1E1B882C514' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Description */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Content', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5CB468A1-7C22-47EB-BF54-F53BC2C45714' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Transcript */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Content', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D0B9E206-C912-4BAF-9336-A2AF8BABA492' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.StartOffset */
UPDATE __mj."EntityField" SET "Category" = 'Provenance', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F0F04464-9380-4CFE-A012-27E6EDA15913' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.EndOffset */
UPDATE __mj."EntityField" SET "Category" = 'Provenance', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C98F7A52-C1DC-4A2F-8733-5A4A49A6CDE9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.StartMs */
UPDATE __mj."EntityField" SET "Category" = 'Provenance', "GeneratedFormSection" = 'Category', "DisplayName" = 'Start (ms)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1E8A8A29-A598-49A4-AC97-C8DD923E506A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.EndMs */
UPDATE __mj."EntityField" SET "Category" = 'Provenance', "GeneratedFormSection" = 'Category', "DisplayName" = 'End (ms)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4B42C9ED-789E-4417-AD71-44BBB7EBF7D5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.PageNumber */
UPDATE __mj."EntityField" SET "Category" = 'Provenance', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D52720E3-05A7-41B2-8C00-C57D8767A930' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.VectorRecordID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F761D312-981B-47E1-94DC-42FF4550CC13' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.EmbeddingStatus */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '06DB407C-561A-4740-8A28-E93DC745435B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.TaggingStatus */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A805FBDB-79C6-4B2B-B39D-693CCE47A9E7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.DeleteStatus */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EDEFD181-AC1E-4533-A7F7-CAD268E1EC07' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.LastEmbeddedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9F645E2C-17FF-4569-B28C-BF8CAEAA0B68' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.LastTaggedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2C847A8B-A352-43F7-BCDF-CA951AD2F9A6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.LastDeletedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7EB2AE41-CE4E-45E5-B481-B929099AC6E6' AND "AutoUpdateCategory" = TRUE;

/* Update FieldCategoryInfo setting for entity */
UPDATE __mj."EntitySetting" SET "Value" = '{"Provenance":{"icon":"fa fa-map-marked-alt","description":"Source location tracking using offsets, time windows, or page numbers"}}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'
  AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */
UPDATE __mj."EntitySetting" SET "Value" = '{"Provenance":"fa fa-map-marked-alt"}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21'
  AND "Name" = 'FieldCategoryIcons';

/* Set categories for 24 fields */
/* UPDATE Entity Field Category Info MJ: Content Sources.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A1B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C5B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CBB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A7B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceTypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B3B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.URL */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = 'BFB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.ContentSourceType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Content Source Type Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FBB09B21-50A3-4CCE-A114-44B0C9835251' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.ContentTypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ADB7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.ContentFileTypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B9B7433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.ContentType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Content Type Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8E282AD9-2695-4F04-AC1F-79A5380D4E4D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.ContentFileType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Content File Type Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ABA84E45-FDE6-4FD0-ACC9-BDA83A8CDE17' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModelID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '045043FD-61A9-477F-82A7-72A7FC615A3C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.VectorIndexID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '11091434-73BD-4006-8C65-8639EA9AF1F3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.EmbeddingModel */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Embedding Model Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '12DE0FA4-7538-42BE-9C11-7638B15B2D78' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.VectorIndex */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Vector Index Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9CA2DC63-66EC-405B-9974-81FD5129B693' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.Configuration */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '3402501E-8128-40E0-BCF8-1BC2867C3931' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.EntityID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3F8AEC67-CBBB-47BE-96C8-70795F10849C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.EntityDocumentID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7BFD47B8-2B7B-4D5E-AF0F-510B6DA68FAA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.ScheduledActionID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '08929B56-9F28-4BB0-9F68-D783E68B8B27' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.SegmenterKey */
UPDATE __mj."EntityField" SET "Category" = 'Processing & Automation', "GeneratedFormSection" = 'Category', "DisplayName" = 'Segmenter Strategy', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '012C715A-4846-4910-9D64-35C7327FA213' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.CleanerKey */
UPDATE __mj."EntityField" SET "Category" = 'Processing & Automation', "GeneratedFormSection" = 'Category', "DisplayName" = 'Cleaner Strategy', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '22F6A2EE-FE1A-4FE7-A946-9FE7743DE677' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.Entity */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E446A7B9-8F1C-47A4-8FBA-53FF05049F2C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.EntityDocument */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity Document Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '715BCEB6-0B7D-49CB-AC91-3AF520EF90D9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Sources.ScheduledAction */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Scheduled Action Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '70FCDE3C-BD64-496C-8830-4C4D3786A5D6' AND "AutoUpdateCategory" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_chunk_content_item_id"
    ON __mj."ContentItemChunk" ("ContentItemID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_chunk_parent_chunk_id"
    ON __mj."ContentItemChunk" ("ParentChunkID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_content_item_chunk_parent_chunk_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentChunkID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."ContentItemChunk"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentChunkID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."ContentItemChunk" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentChunkID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentChunkID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: vwContentItemChunks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Chunks
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentItemChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentItemChunks"
AS
SELECT
    c.*,
    MJContentItem_ContentItemID."Name" AS "ContentItem",
    MJContentItemChunk_ParentChunkID."SegmentTitle" AS "ParentChunk",
    root_ParentChunkID.root_id AS "RootParentChunkID"
FROM
    __mj."ContentItemChunk" AS c
INNER JOIN
    __mj."ContentItem" AS MJContentItem_ContentItemID
  ON
    "c"."ContentItemID" = MJContentItem_ContentItemID."ID"
LEFT OUTER JOIN
    __mj."ContentItemChunk" AS MJContentItemChunk_ParentChunkID
  ON
    "c"."ParentChunkID" = MJContentItemChunk_ParentChunkID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_content_item_chunk_parent_chunk_id_get_root_id"(c."ID", c."ParentChunkID") AS root_id
) AS root_ParentChunkID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwContentItemChunks'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwContentItemChunks'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwContentItemChunks'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwContentItemChunks" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_UI";
GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_Developer";
GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateContentItemChunk"(
    p_id UUID DEFAULT NULL,
    p_contentitemid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_text TEXT DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_lastdeletedat_clear boolean DEFAULT false,
    p_lastdeletedat TIMESTAMPTZ DEFAULT NULL,
    p_modality varchar(20) DEFAULT NULL,
    p_startoffset_clear boolean DEFAULT false,
    p_startoffset int DEFAULT NULL,
    p_endoffset_clear boolean DEFAULT false,
    p_endoffset int DEFAULT NULL,
    p_startms_clear boolean DEFAULT false,
    p_startms int DEFAULT NULL,
    p_endms_clear boolean DEFAULT false,
    p_endms int DEFAULT NULL,
    p_pagenumber_clear boolean DEFAULT false,
    p_pagenumber int DEFAULT NULL,
    p_segmenttitle_clear boolean DEFAULT false,
    p_segmenttitle varchar(500) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transcript_clear boolean DEFAULT false,
    p_transcript TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_parentchunkid_clear boolean DEFAULT false,
    p_parentchunkid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwContentItemChunks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ContentItemChunk"
        (
            "ID",
            "ContentItemID",
                "Sequence",
                "Text",
                "VectorRecordID",
                "EmbeddingStatus",
                "TaggingStatus",
                "DeleteStatus",
                "LastEmbeddedAt",
                "LastTaggedAt",
                "LastDeletedAt",
                "Modality",
                "StartOffset",
                "EndOffset",
                "StartMs",
                "EndMs",
                "PageNumber",
                "SegmentTitle",
                "Description",
                "Transcript",
                "SegmenterKey",
                "ParentChunkID"
        )
    VALUES
        (
            v_new_id,
            p_contentitemid,
                p_sequence,
                p_text,
                CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, NULL) END,
                COALESCE(p_embeddingstatus, 'Pending'),
                COALESCE(p_taggingstatus, 'Pending'),
                CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, NULL) END,
                CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, NULL) END,
                CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, NULL) END,
                CASE WHEN p_lastdeletedat_clear = true THEN NULL ELSE COALESCE(p_lastdeletedat, NULL) END,
                COALESCE(p_modality, 'text'),
                CASE WHEN p_startoffset_clear = true THEN NULL ELSE COALESCE(p_startoffset, NULL) END,
                CASE WHEN p_endoffset_clear = true THEN NULL ELSE COALESCE(p_endoffset, NULL) END,
                CASE WHEN p_startms_clear = true THEN NULL ELSE COALESCE(p_startms, NULL) END,
                CASE WHEN p_endms_clear = true THEN NULL ELSE COALESCE(p_endms, NULL) END,
                CASE WHEN p_pagenumber_clear = true THEN NULL ELSE COALESCE(p_pagenumber, NULL) END,
                CASE WHEN p_segmenttitle_clear = true THEN NULL ELSE COALESCE(p_segmenttitle, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_transcript_clear = true THEN NULL ELSE COALESCE(p_transcript, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_parentchunkid_clear = true THEN NULL ELSE COALESCE(p_parentchunkid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwContentItemChunks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemChunk" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentItemChunk"(
    p_id UUID,
    p_contentitemid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_text TEXT DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_lastdeletedat_clear boolean DEFAULT false,
    p_lastdeletedat TIMESTAMPTZ DEFAULT NULL,
    p_modality varchar(20) DEFAULT NULL,
    p_startoffset_clear boolean DEFAULT false,
    p_startoffset int DEFAULT NULL,
    p_endoffset_clear boolean DEFAULT false,
    p_endoffset int DEFAULT NULL,
    p_startms_clear boolean DEFAULT false,
    p_startms int DEFAULT NULL,
    p_endms_clear boolean DEFAULT false,
    p_endms int DEFAULT NULL,
    p_pagenumber_clear boolean DEFAULT false,
    p_pagenumber int DEFAULT NULL,
    p_segmenttitle_clear boolean DEFAULT false,
    p_segmenttitle varchar(500) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transcript_clear boolean DEFAULT false,
    p_transcript TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_parentchunkid_clear boolean DEFAULT false,
    p_parentchunkid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwContentItemChunks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ContentItemChunk"
    SET
        "ContentItemID" = COALESCE(p_contentitemid, "ContentItemID"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Text" = COALESCE(p_text, "Text"),
        "VectorRecordID" = CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, "VectorRecordID") END,
        "EmbeddingStatus" = COALESCE(p_embeddingstatus, "EmbeddingStatus"),
        "TaggingStatus" = COALESCE(p_taggingstatus, "TaggingStatus"),
        "DeleteStatus" = CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, "DeleteStatus") END,
        "LastEmbeddedAt" = CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, "LastEmbeddedAt") END,
        "LastTaggedAt" = CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, "LastTaggedAt") END,
        "LastDeletedAt" = CASE WHEN p_lastdeletedat_clear = true THEN NULL ELSE COALESCE(p_lastdeletedat, "LastDeletedAt") END,
        "Modality" = COALESCE(p_modality, "Modality"),
        "StartOffset" = CASE WHEN p_startoffset_clear = true THEN NULL ELSE COALESCE(p_startoffset, "StartOffset") END,
        "EndOffset" = CASE WHEN p_endoffset_clear = true THEN NULL ELSE COALESCE(p_endoffset, "EndOffset") END,
        "StartMs" = CASE WHEN p_startms_clear = true THEN NULL ELSE COALESCE(p_startms, "StartMs") END,
        "EndMs" = CASE WHEN p_endms_clear = true THEN NULL ELSE COALESCE(p_endms, "EndMs") END,
        "PageNumber" = CASE WHEN p_pagenumber_clear = true THEN NULL ELSE COALESCE(p_pagenumber, "PageNumber") END,
        "SegmentTitle" = CASE WHEN p_segmenttitle_clear = true THEN NULL ELSE COALESCE(p_segmenttitle, "SegmentTitle") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Transcript" = CASE WHEN p_transcript_clear = true THEN NULL ELSE COALESCE(p_transcript, "Transcript") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "ParentChunkID" = CASE WHEN p_parentchunkid_clear = true THEN NULL ELSE COALESCE(p_parentchunkid, "ParentChunkID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwContentItemChunks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemChunk" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemChunk table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_content_item_chunk"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_item_chunk" ON __mj."ContentItemChunk";

CREATE TRIGGER "trg_update_content_item_chunk"
BEFORE UPDATE ON __mj."ContentItemChunk"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_content_item_chunk"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemChunk"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ContentItemChunk"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemChunk" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_content_type_id"
    ON __mj."ContentSource" ("ContentTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_content_source_type_id"
    ON __mj."ContentSource" ("ContentSourceTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_content_file_type_id"
    ON __mj."ContentSource" ("ContentFileTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_embedding_model_id"
    ON __mj."ContentSource" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_vector_index_id"
    ON __mj."ContentSource" ("VectorIndexID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_entity_id"
    ON __mj."ContentSource" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_entity_document_id"
    ON __mj."ContentSource" ("EntityDocumentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_source_scheduled_action_id"
    ON __mj."ContentSource" ("ScheduledActionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: vwContentSources
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Sources
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentSources"
AS
SELECT
    c.*,
    MJContentType_ContentTypeID."Name" AS "ContentType",
    MJContentSourceType_ContentSourceTypeID."Name" AS "ContentSourceType",
    MJContentFileType_ContentFileTypeID."Name" AS "ContentFileType",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJVectorIndex_VectorIndexID."Name" AS "VectorIndex",
    MJEntity_EntityID."Name" AS "Entity",
    MJEntityDocument_EntityDocumentID."Name" AS "EntityDocument",
    MJScheduledAction_ScheduledActionID."Name" AS "ScheduledAction"
FROM
    __mj."ContentSource" AS c
INNER JOIN
    __mj."ContentType" AS MJContentType_ContentTypeID
  ON
    "c"."ContentTypeID" = MJContentType_ContentTypeID."ID"
INNER JOIN
    __mj."ContentSourceType" AS MJContentSourceType_ContentSourceTypeID
  ON
    "c"."ContentSourceTypeID" = MJContentSourceType_ContentSourceTypeID."ID"
INNER JOIN
    __mj."ContentFileType" AS MJContentFileType_ContentFileTypeID
  ON
    "c"."ContentFileTypeID" = MJContentFileType_ContentFileTypeID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "c"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS MJVectorIndex_VectorIndexID
  ON
    "c"."VectorIndexID" = MJVectorIndex_VectorIndexID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_EntityID
  ON
    "c"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    __mj."EntityDocument" AS MJEntityDocument_EntityDocumentID
  ON
    "c"."EntityDocumentID" = MJEntityDocument_EntityDocumentID."ID"
LEFT OUTER JOIN
    __mj."ScheduledAction" AS MJScheduledAction_ScheduledActionID
  ON
    "c"."ScheduledActionID" = MJScheduledAction_ScheduledActionID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwContentSources'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwContentSources'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwContentSources'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwContentSources" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwContentSources" TO "cdp_UI";
GRANT SELECT ON __mj."vwContentSources" TO "cdp_Developer";
GRANT SELECT ON __mj."vwContentSources" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spCreateContentSource
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateContentSource"(
    p_id UUID DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_entitydocumentid_clear boolean DEFAULT false,
    p_entitydocumentid UUID DEFAULT NULL,
    p_scheduledactionid_clear boolean DEFAULT false,
    p_scheduledactionid UUID DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL
) RETURNS SETOF __mj."vwContentSources" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ContentSource"
        (
            "ID",
            "Name",
                "ContentTypeID",
                "ContentSourceTypeID",
                "ContentFileTypeID",
                "URL",
                "EmbeddingModelID",
                "VectorIndexID",
                "Configuration",
                "EntityID",
                "EntityDocumentID",
                "ScheduledActionID",
                "SegmenterKey",
                "CleanerKey"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, NULL) END,
                p_contenttypeid,
                p_contentsourcetypeid,
                p_contentfiletypeid,
                p_url,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, NULL) END,
                CASE WHEN p_entitydocumentid_clear = true THEN NULL ELSE COALESCE(p_entitydocumentid, NULL) END,
                CASE WHEN p_scheduledactionid_clear = true THEN NULL ELSE COALESCE(p_scheduledactionid, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwContentSources"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateContentSource" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spUpdateContentSource
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentSource"(
    p_id UUID,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_entitydocumentid_clear boolean DEFAULT false,
    p_entitydocumentid UUID DEFAULT NULL,
    p_scheduledactionid_clear boolean DEFAULT false,
    p_scheduledactionid UUID DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL
) RETURNS SETOF __mj."vwContentSources" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ContentSource"
    SET
        "Name" = CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, "Name") END,
        "ContentTypeID" = COALESCE(p_contenttypeid, "ContentTypeID"),
        "ContentSourceTypeID" = COALESCE(p_contentsourcetypeid, "ContentSourceTypeID"),
        "ContentFileTypeID" = COALESCE(p_contentfiletypeid, "ContentFileTypeID"),
        "URL" = COALESCE(p_url, "URL"),
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "VectorIndexID" = CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, "VectorIndexID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "EntityID" = CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, "EntityID") END,
        "EntityDocumentID" = CASE WHEN p_entitydocumentid_clear = true THEN NULL ELSE COALESCE(p_entitydocumentid, "EntityDocumentID") END,
        "ScheduledActionID" = CASE WHEN p_scheduledactionid_clear = true THEN NULL ELSE COALESCE(p_scheduledactionid, "ScheduledActionID") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "CleanerKey" = CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, "CleanerKey") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwContentSources"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateContentSource" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_content_source"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_source" ON __mj."ContentSource";

CREATE TRIGGER "trg_update_content_source"
BEFORE UPDATE ON __mj."ContentSource"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_content_source"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spDeleteContentSource
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentSource'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentSource"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ContentSource"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteContentSource" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Types
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_type_ai_model_id"
    ON __mj."ContentType" ("AIModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_type_embedding_model_id"
    ON __mj."ContentType" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_type_vector_index_id"
    ON __mj."ContentType" ("VectorIndexID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Types
-- Item: vwContentTypes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentTypes"
AS
SELECT
    c.*,
    MJAIModel_AIModelID."Name" AS "AIModel",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJVectorIndex_VectorIndexID."Name" AS "VectorIndex"
FROM
    __mj."ContentType" AS c
INNER JOIN
    __mj."AIModel" AS MJAIModel_AIModelID
  ON
    "c"."AIModelID" = MJAIModel_AIModelID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "c"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS MJVectorIndex_VectorIndexID
  ON
    "c"."VectorIndexID" = MJVectorIndex_VectorIndexID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwContentTypes'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwContentTypes'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwContentTypes'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwContentTypes" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwContentTypes" TO "cdp_UI";
GRANT SELECT ON __mj."vwContentTypes" TO "cdp_Developer";
GRANT SELECT ON __mj."vwContentTypes" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Types
-- Item: spCreateContentType
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateContentType"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_aimodelid UUID DEFAULT NULL,
    p_mintags int DEFAULT NULL,
    p_maxtags int DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL
) RETURNS SETOF __mj."vwContentTypes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ContentType"
        (
            "ID",
            "Name",
                "Description",
                "AIModelID",
                "MinTags",
                "MaxTags",
                "EmbeddingModelID",
                "VectorIndexID",
                "Configuration",
                "SegmenterKey",
                "CleanerKey"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_aimodelid,
                p_mintags,
                p_maxtags,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwContentTypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateContentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateContentType" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Types
-- Item: spUpdateContentType
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentType"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_aimodelid UUID DEFAULT NULL,
    p_mintags int DEFAULT NULL,
    p_maxtags int DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL
) RETURNS SETOF __mj."vwContentTypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ContentType"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "AIModelID" = COALESCE(p_aimodelid, "AIModelID"),
        "MinTags" = COALESCE(p_mintags, "MinTags"),
        "MaxTags" = COALESCE(p_maxtags, "MaxTags"),
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "VectorIndexID" = CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, "VectorIndexID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "CleanerKey" = CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, "CleanerKey") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwContentTypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateContentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateContentType" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentType table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_content_type"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_type" ON __mj."ContentType";

CREATE TRIGGER "trg_update_content_type"
BEFORE UPDATE ON __mj."ContentType"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_content_type"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Types
-- Item: spDeleteContentType
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentType'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentType"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ContentType"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteContentType" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteContentType" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_type_id"
    ON __mj."EntityDocument" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_entity_id"
    ON __mj."EntityDocument" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_vector_database_id"
    ON __mj."EntityDocument" ("VectorDatabaseID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_template_id"
    ON __mj."EntityDocument" ("TemplateID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_ai_model_id"
    ON __mj."EntityDocument" ("AIModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_vector_index_id"
    ON __mj."EntityDocument" ("VectorIndexID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_reasoning_prompt_id"
    ON __mj."EntityDocument" ("ReasoningPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_reasoning_agent_id"
    ON __mj."EntityDocument" ("ReasoningAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: vwEntityDocuments
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Documents
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityDocuments"
AS
SELECT
    e.*,
    MJEntityDocumentType_TypeID."Name" AS "Type",
    MJEntity_EntityID."Name" AS "Entity",
    MJVectorDatabase_VectorDatabaseID."Name" AS "VectorDatabase",
    MJTemplate_TemplateID."Name" AS "Template",
    MJAIModel_AIModelID."Name" AS "AIModel",
    MJVectorIndex_VectorIndexID."Name" AS "VectorIndex",
    MJAIPrompt_ReasoningPromptID."Name" AS "ReasoningPrompt",
    MJAIAgent_ReasoningAgentID."Name" AS "ReasoningAgent"
FROM
    __mj."EntityDocument" AS e
INNER JOIN
    __mj."EntityDocumentType" AS MJEntityDocumentType_TypeID
  ON
    "e"."TypeID" = MJEntityDocumentType_TypeID."ID"
INNER JOIN
    __mj."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
INNER JOIN
    __mj."VectorDatabase" AS MJVectorDatabase_VectorDatabaseID
  ON
    "e"."VectorDatabaseID" = MJVectorDatabase_VectorDatabaseID."ID"
INNER JOIN
    __mj."Template" AS MJTemplate_TemplateID
  ON
    "e"."TemplateID" = MJTemplate_TemplateID."ID"
INNER JOIN
    __mj."AIModel" AS MJAIModel_AIModelID
  ON
    "e"."AIModelID" = MJAIModel_AIModelID."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS MJVectorIndex_VectorIndexID
  ON
    "e"."VectorIndexID" = MJVectorIndex_VectorIndexID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ReasoningPromptID
  ON
    "e"."ReasoningPromptID" = MJAIPrompt_ReasoningPromptID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_ReasoningAgentID
  ON
    "e"."ReasoningAgentID" = MJAIAgent_ReasoningAgentID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwEntityDocuments'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwEntityDocuments'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwEntityDocuments'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwEntityDocuments" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwEntityDocuments" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntityDocuments" TO "cdp_UI";
GRANT SELECT ON __mj."vwEntityDocuments" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: spCreateEntityDocument
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityDocument"(
    p_id UUID DEFAULT NULL,
    p_name varchar(250) DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_vectordatabaseid UUID DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_aimodelid UUID DEFAULT NULL,
    p_potentialmatchthreshold numeric(12, 11) DEFAULT NULL,
    p_absolutematchthreshold numeric(12, 11) DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_enablellmreasoning BOOLEAN DEFAULT NULL,
    p_reasoningmode varchar(20) DEFAULT NULL,
    p_reasoningthreshold_clear boolean DEFAULT false,
    p_reasoningthreshold numeric(12, 11) DEFAULT NULL,
    p_reasoningpromptid_clear boolean DEFAULT false,
    p_reasoningpromptid UUID DEFAULT NULL,
    p_reasoningagentid_clear boolean DEFAULT false,
    p_reasoningagentid UUID DEFAULT NULL,
    p_automationlevel varchar(30) DEFAULT NULL
) RETURNS SETOF __mj."vwEntityDocuments" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."EntityDocument"
        (
            "ID",
            "Name",
                "TypeID",
                "EntityID",
                "VectorDatabaseID",
                "Status",
                "TemplateID",
                "AIModelID",
                "PotentialMatchThreshold",
                "AbsoluteMatchThreshold",
                "VectorIndexID",
                "Configuration",
                "EnableLLMReasoning",
                "ReasoningMode",
                "ReasoningThreshold",
                "ReasoningPromptID",
                "ReasoningAgentID",
                "AutomationLevel"
        )
    VALUES
        (
            v_new_id,
            p_name,
                p_typeid,
                p_entityid,
                p_vectordatabaseid,
                COALESCE(p_status, 'Active'),
                p_templateid,
                p_aimodelid,
                COALESCE(p_potentialmatchthreshold, 0.7),
                COALESCE(p_absolutematchthreshold, 0.95),
                CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                COALESCE(p_enablellmreasoning, FALSE),
                COALESCE(p_reasoningmode, 'Prompt'),
                CASE WHEN p_reasoningthreshold_clear = true THEN NULL ELSE COALESCE(p_reasoningthreshold, NULL) END,
                CASE WHEN p_reasoningpromptid_clear = true THEN NULL ELSE COALESCE(p_reasoningpromptid, NULL) END,
                CASE WHEN p_reasoningagentid_clear = true THEN NULL ELSE COALESCE(p_reasoningagentid, NULL) END,
                COALESCE(p_automationlevel, 'ReviewAll')
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwEntityDocuments"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spCreateEntityDocument" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: spUpdateEntityDocument
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityDocument"(
    p_id UUID,
    p_name varchar(250) DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_vectordatabaseid UUID DEFAULT NULL,
    p_status varchar(15) DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_aimodelid UUID DEFAULT NULL,
    p_potentialmatchthreshold numeric(12, 11) DEFAULT NULL,
    p_absolutematchthreshold numeric(12, 11) DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_enablellmreasoning BOOLEAN DEFAULT NULL,
    p_reasoningmode varchar(20) DEFAULT NULL,
    p_reasoningthreshold_clear boolean DEFAULT false,
    p_reasoningthreshold numeric(12, 11) DEFAULT NULL,
    p_reasoningpromptid_clear boolean DEFAULT false,
    p_reasoningpromptid UUID DEFAULT NULL,
    p_reasoningagentid_clear boolean DEFAULT false,
    p_reasoningagentid UUID DEFAULT NULL,
    p_automationlevel varchar(30) DEFAULT NULL
) RETURNS SETOF __mj."vwEntityDocuments" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."EntityDocument"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "VectorDatabaseID" = COALESCE(p_vectordatabaseid, "VectorDatabaseID"),
        "Status" = COALESCE(p_status, "Status"),
        "TemplateID" = COALESCE(p_templateid, "TemplateID"),
        "AIModelID" = COALESCE(p_aimodelid, "AIModelID"),
        "PotentialMatchThreshold" = COALESCE(p_potentialmatchthreshold, "PotentialMatchThreshold"),
        "AbsoluteMatchThreshold" = COALESCE(p_absolutematchthreshold, "AbsoluteMatchThreshold"),
        "VectorIndexID" = CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, "VectorIndexID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "EnableLLMReasoning" = COALESCE(p_enablellmreasoning, "EnableLLMReasoning"),
        "ReasoningMode" = COALESCE(p_reasoningmode, "ReasoningMode"),
        "ReasoningThreshold" = CASE WHEN p_reasoningthreshold_clear = true THEN NULL ELSE COALESCE(p_reasoningthreshold, "ReasoningThreshold") END,
        "ReasoningPromptID" = CASE WHEN p_reasoningpromptid_clear = true THEN NULL ELSE COALESCE(p_reasoningpromptid, "ReasoningPromptID") END,
        "ReasoningAgentID" = CASE WHEN p_reasoningagentid_clear = true THEN NULL ELSE COALESCE(p_reasoningagentid, "ReasoningAgentID") END,
        "AutomationLevel" = COALESCE(p_automationlevel, "AutomationLevel")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwEntityDocuments"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityDocument" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityDocument table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_entity_document"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_document" ON __mj."EntityDocument";

CREATE TRIGGER "trg_update_entity_document"
BEFORE UPDATE ON __mj."EntityDocument"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_entity_document"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: spDeleteEntityDocument
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocument"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Content Sources.EntityDocumentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ContentSource"
        WHERE "EntityDocumentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ContentSource"
        SET "EntityDocumentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Entity Document Runs records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityDocumentRun"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM __mj."spDeleteEntityDocumentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Document Settings records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityDocumentSetting"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM __mj."spDeleteEntityDocumentSetting"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Record Documents records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityRecordDocument"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM __mj."spDeleteEntityRecordDocument"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."EntityDocument"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Developer";
