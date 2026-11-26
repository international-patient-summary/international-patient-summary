-- Listing pages through the documents newest first (spec §4.4).
CREATE INDEX ips_documents_created_at ON ips_documents (created_at DESC, id DESC);
