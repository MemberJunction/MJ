"""
The column model for the per-connection integration catalog (MJC-264 / register MJ-CAT-1).

WHY A GENERATOR AND NOT A HAND-WRITTEN MIGRATION.
Two facts make hand-authoring wrong rather than merely tedious (register MJ-CAT-8, MJ-CAT-9):

  * On Postgres NOTHING reconciles entity-field metadata at migrate time. SQL Server's repeatable
    refresh heals type, length, precision, scale, nullability, default, sequence and description
    from the live catalog; the Postgres one heals ONLY nullability, and the Postgres reconcilers
    have no migrate-time caller at all. Four of six tenants are Postgres. Every value must be
    exactly right at insert time.
  * Entity-field metadata records SQL Server type names and BYTE lengths on EVERY dialect. A
    Postgres `character varying(255)` is recorded as `nvarchar` with length 510, `text` as
    length -1, `uuid` as `uniqueidentifier` length 16. Hand-typing against the Postgres catalog
    produces metadata that is wrong and that nothing will ever correct.

So the generator does not invent any of it. It LIFTS the real definitions of
`IntegrationObject` / `IntegrationObjectField` out of the MemberJunction v5.51.0 baseline — the
table DDL, the defaults, the view, the CRUD procedures and every EntityField row — and rewrites
them for the new tables. Anything it cannot lift is declared explicitly below, once, with its
metadata spelled out in the same shape the baseline uses.

SOURCE ENTITY IDS (v5.51.0 baseline, both dialects):
  MJ: Integration Objects        86D3ED6F-2D1D-43F6-9777-FD9672FA9021   (44 field rows: 43 real + 1 virtual)
  MJ: Integration Object Fields  3630CBFD-4C85-4B24-8A51-88D67389373E   (27 field rows: 25 real + 2 virtual)
"""

# ---------------------------------------------------------------------------
# Reserved identities. Chosen ONCE and reused verbatim in the upstream PR, so the
# tenant lineage and the upstream lineage agree on the same rows forever.
# ---------------------------------------------------------------------------
ENTITY_ID_CIO  = 'B1E7A4C2-3D6F-4A18-9C05-7E2B84F13A60'
ENTITY_ID_CIOF = 'C4F82D19-6A53-4E7B-8D21-05C93A7E6B48'

SOURCE_ENTITY_ID_IO  = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021'
SOURCE_ENTITY_ID_IOF = '3630CBFD-4C85-4B24-8A51-88D67389373E'

ENTITY_NAME_CIO  = 'MJ: Company Integration Objects'
ENTITY_NAME_CIOF = 'MJ: Company Integration Object Fields'

TABLE_CIO  = 'CompanyIntegrationObject'
TABLE_CIOF = 'CompanyIntegrationObjectField'
VIEW_CIO   = 'vwCompanyIntegrationObjects'
VIEW_CIOF  = 'vwCompanyIntegrationObjectFields'

# Canonical role ids (v5.51.0 baseline). UI is read-only; the other two are full.
ROLES = [
    ('UI',          'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0),
    ('Developer',   'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1),
    ('Integration', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1),
]

# Core-schema entities go to the application whose SchemaAutoAddNewEntities is the core schema.
APPLICATION_ID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'

# ---------------------------------------------------------------------------
# Columns the two source tables do NOT have. Each carries its own metadata,
# expressed the way the baseline expresses it, so the generator never guesses.
#
#   ss / pg      : the column type in each dialect
#   ef_type      : EntityField.Type   — SQL Server vocabulary on BOTH dialects
#   ef_len       : EntityField.Length — BYTE length; -1 means MAX/unbounded
#   ef_prec/scale: EntityField.Precision / .Scale
#   nullable     : whether the column allows NULL
#   default      : (ss_default, pg_default) or None
#   fk           : (schema.table, column) when it is a foreign key
#   why          : the extended property / COMMENT ON text, and the reason it exists
# ---------------------------------------------------------------------------
def col(name, ss, pg, ef_type, ef_len, nullable, why,
        ef_prec=0, ef_scale=0, default=None, fk=None, check=None):
    return dict(name=name, ss=ss, pg=pg, ef_type=ef_type, ef_len=ef_len, ef_prec=ef_prec,
                ef_scale=ef_scale, nullable=nullable, default=default, fk=fk, check=check, why=why)

_SEEN = [
    col('FirstSeenAt', 'DATETIMEOFFSET(7)', 'timestamp with time zone', 'datetimeoffset', 10, True,
        'When this connection first observed this item. Set once and never updated, so a catalog '
        'can be read as a history of what the source exposed and when.', ef_prec=34, ef_scale=7),
    col('LastSeenAt', 'DATETIMEOFFSET(7)', 'timestamp with time zone', 'datetimeoffset', 10, True,
        'When this connection most recently observed this item. A row whose LastSeenAt is older '
        'than the connection last discovery is what "absent from the source" means.', ef_prec=34, ef_scale=7),
    col('LastSampledAt', 'DATETIMEOFFSET(7)', 'timestamp with time zone', 'datetimeoffset', 10, True,
        'When sampling last streamed records for this item. Distinct from LastSeenAt: an item can '
        'be listed by an endpoint without ever being sampled, and unsampled items are exactly the '
        'ones whose widths and keys came from the declared catalog rather than from data.',
        ef_prec=34, ef_scale=7),
]

_SELECTION = [
    col('IsSelected', 'BIT', 'boolean', 'bit', 1, False,
        'Whether this connection syncs this item. THE AXIS THAT MAKES THE CONTRACT SATISFIABLE: '
        'Status says whether the item is in the catalog at all, IsSelected says whether the '
        'customer chose it. Conflating the two is why a newly discovered object had to arrive '
        'ENABLED — a disabled object was excluded from schema introspection, so it never reached '
        'key inference and never reached a migration.',
        default=('((0))', 'false')),
    col('SelectedAt', 'DATETIMEOFFSET(7)', 'timestamp with time zone', 'datetimeoffset', 10, True,
        'When the selection last changed. Lets the UI distinguish "never chosen" from '
        '"deliberately deselected".', ef_prec=34, ef_scale=7),
]

_PROVENANCE = [
    col('Provenance', 'NVARCHAR(20)', 'character varying(20)', 'nvarchar', 40, False,
        'Where this row came from: Declared (the connector shipped catalog), Endpoint (the source '
        'listed it) or Sampled (only streaming records revealed it). Answers "whose is this" for a '
        'connection whose catalog no longer matches the connector default.',
        default=("('Declared')", "'Declared'::character varying"),
        check="Provenance IN ('Declared','Endpoint','Sampled')"),
    col('ProvenanceDetail', 'NVARCHAR(MAX)', 'text', 'nvarchar', -1, True,
        'The per-attribute merge log for this row: which side won each overlay decision and why. '
        'The persist already computes this and throws it away, so the operator has never been able '
        'to see why a width or a key looks the way it does.'),
]

# --- CompanyIntegrationObject: source columns + these -----------------------
CIO_EXTRA = [
    col('CompanyIntegrationID', 'UNIQUEIDENTIFIER', 'uuid', 'uniqueidentifier', 16, False,
        'The connection this catalog row belongs to. The whole point of the table.',
        fk=('CompanyIntegration', 'ID')),
    col('IntegrationObjectID', 'UNIQUEIDENTIFIER', 'uuid', 'uniqueidentifier', 16, True,
        'The declared catalog row this was derived from, when there is one. NULL means the object '
        'exists only for this connection — a genuinely custom object the connector catalog has '
        'never heard of.',
        fk=('IntegrationObject', 'ID')),
] + _PROVENANCE + _SELECTION + _SEEN

# --- CompanyIntegrationObjectField: source columns + these ------------------
CIOF_EXTRA = [
    col('CompanyIntegrationObjectID', 'UNIQUEIDENTIFIER', 'uuid', 'uniqueidentifier', 16, False,
        'The per-connection object this field belongs to.',
        fk=('CompanyIntegrationObject', 'ID')),
    col('RelatedCompanyIntegrationObjectID', 'UNIQUEIDENTIFIER', 'uuid', 'uniqueidentifier', 16, True,
        'The per-connection object this field points at — the dependency edge the sync walks. '
        'Per-connection because two connections of one connector can legitimately have different '
        'relationship shapes.',
        fk=('CompanyIntegrationObject', 'ID')),
    col('IntegrationObjectFieldID', 'UNIQUEIDENTIFIER', 'uuid', 'uniqueidentifier', 16, True,
        'The declared field row this was derived from, when there is one.',
        fk=('IntegrationObjectField', 'ID')),
    col('ObservedMaxLength', 'INT', 'integer', 'int', 4, True,
        'The longest value sampling actually saw, kept SEPARATE from Length. Length carries the '
        'padded width the schema builder will use; this carries the evidence. Without both, a '
        'width cannot be audited and a truncation cannot be distinguished from a bad guess.',
        ef_prec=10),
] + _PROVENANCE + _SELECTION + _SEEN

# ---------------------------------------------------------------------------
# Source columns that must NOT become real columns on the new tables, because
# the base view exposes them as VIRTUAL aliases instead. That is what lets the
# connector repository keep reading `IntegrationObjectID`,
# `RelatedIntegrationObjectID` and the `RelatedIntegrationObject` name with ZERO
# changes, while the values it gets back are per-connection ids.
# ---------------------------------------------------------------------------
CIOF_DROP_REAL = ['IntegrationObjectID', 'RelatedIntegrationObjectID']

# name -> (expression on the new view, source column it replaces)
CIOF_VIRTUAL_ALIASES = {
    'IntegrationObjectID':        'CompanyIntegrationObjectID',
    'RelatedIntegrationObjectID': 'RelatedCompanyIntegrationObjectID',
}
