-- One row per stored International Patient Summary document Bundle.
-- The Bundle is kept as the client sent it, except that `id` is set to the row's id.
CREATE TABLE ips_documents (
    id uuid PRIMARY KEY,
    bundle jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ips_documents_is_document_bundle CHECK (
        bundle->>'resourceType' = 'Bundle'
        AND bundle->>'type' = 'document'
        AND bundle->>'id' = id::text
    )
);
