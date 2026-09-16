-- Freeze each new cycle's procedural descriptor and renderer version at enrollment.
-- Existing cycles intentionally retain the original renderer, not a silent upgrade.
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS plant_descriptor jsonb;
