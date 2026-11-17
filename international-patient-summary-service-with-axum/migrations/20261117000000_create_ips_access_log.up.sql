-- One row per request that reached a stored document's id (spec S-AUDIT-1).
-- It names the caller by the token's subject and issuer, never by name or email,
-- and holds no document content. No foreign key: a deleted document keeps its log.
CREATE TABLE ips_access_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    subject text,
    issuer text,
    action text NOT NULL CHECK (action IN ('create', 'read', 'delete')),
    bundle_id uuid NOT NULL,
    status smallint NOT NULL
);
CREATE INDEX ips_access_log_bundle_id ON ips_access_log (bundle_id, at);
CREATE INDEX ips_access_log_subject ON ips_access_log (subject, at);
