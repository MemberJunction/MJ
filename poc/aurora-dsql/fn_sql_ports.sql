CREATE FUNCTION __mj."GetClassNameSchemaPrefix"("p_SchemaName" character varying) RETURNS character varying
    LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(trim("p_SchemaName")) = '__mj' THEN 'MJ'
    WHEN lower(trim("p_SchemaName")) = 'mj' THEN 'MJCustom'
    WHEN c IS NULL OR c = '' THEN ''
    WHEN left(c, 1) ~ '[0-9]' THEN '_' || c
    ELSE c END
  FROM (SELECT regexp_replace(trim("p_SchemaName"), '[^A-Za-z0-9]', '', 'g') AS c) s
$$;

CREATE FUNCTION __mj."GetProgrammaticName"("p_InputString" text) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$ SELECT regexp_replace("p_InputString", '[^A-Za-z0-9_]', '', 'g') $$;
