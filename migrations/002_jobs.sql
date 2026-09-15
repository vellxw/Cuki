CREATE TABLE billing_refresh(actor_id text PRIMARY KEY,requested_at timestamptz NOT NULL);
ALTER TABLE privacy_jobs ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE privacy_jobs ADD COLUMN lease_until timestamptz;
ALTER TABLE privacy_jobs ADD COLUMN error text;
CREATE INDEX privacy_queue ON privacy_jobs(state,created_at);
ALTER TABLE jobs ADD COLUMN lease_token text;
ALTER TABLE jobs ADD COLUMN next_attempt_at timestamptz;
CREATE INDEX jobs_actor_created ON jobs(actor_id,created_at);
CREATE INDEX entities_public_recipes ON entities(entity_type,(payload->>'visibility'),updated_at) WHERE NOT deleted;
ALTER TABLE quota DROP CONSTRAINT quota_kind_check;
ALTER TABLE quota ADD CONSTRAINT quota_kind_check CHECK(kind IN ('capture','action','review'));
CREATE UNIQUE INDEX public_reference_ids ON entities(entity_type,id) WHERE entity_type IN ('recipe','food','comment');
CREATE INDEX entities_search ON entities USING gin(to_tsvector('spanish',coalesce(payload->>'title',payload->>'name','')));
CREATE POLICY published_recipe_media ON media FOR SELECT TO cuki_runtime USING (
 state='ready' AND EXISTS(SELECT 1 FROM entities e WHERE e.entity_type='recipe' AND NOT e.deleted AND e.actor_id=media.actor_id AND e.payload->>'visibility'='public' AND e.payload->'assetIds' ? media.id)
);
