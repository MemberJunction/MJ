-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609231300__v6.2.x__Repoint_STT_Model_Type_To_Speech_To_Text.sql
-- ============================================================================
--
-- Hand-ported. The source is two data UPDATEs inside an `IF EXISTS … AND EXISTS … BEGIN … END`
-- guard — the shape the converter drops whole, guard and body together (DEPLOYMENT.md Step 8,
-- converter behaviour 7). The guard matters: it no-ops on a database that lacks either
-- AIModelType row instead of repointing models at a type that does not exist.

DO $mj$
BEGIN
    IF EXISTS (SELECT 1 FROM __mj."AIModelType" WHERE "ID" = '5E527CEF-46EC-421F-9AAC-C69E22426402')
       AND EXISTS (SELECT 1 FROM __mj."AIModelType" WHERE "ID" = '583D65B5-F2EB-458E-8F5B-7F53FEBB12A4') THEN

        UPDATE __mj."AIModel"
           SET "AIModelTypeID" = '583D65B5-F2EB-458E-8F5B-7F53FEBB12A4'
         WHERE "AIModelTypeID" = '5E527CEF-46EC-421F-9AAC-C69E22426402';

        UPDATE __mj."AIPrompt"
           SET "AIModelTypeID" = '583D65B5-F2EB-458E-8F5B-7F53FEBB12A4'
         WHERE "AIModelTypeID" = '5E527CEF-46EC-421F-9AAC-C69E22426402';
    END IF;
END
$mj$;
