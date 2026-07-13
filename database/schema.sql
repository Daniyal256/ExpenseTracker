CREATE TABLE IF NOT EXISTS projects (
    project_id SERIAL PRIMARY KEY,
    viewer_code VARCHAR(7) UNIQUE,
    modifier_code VARCHAR(7) UNIQUE,
    name VARCHAR(120) NOT NULL,
    budget NUMERIC(12,2) NOT NULL CHECK (budget >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_code VARCHAR(16);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS viewer_code VARCHAR(7);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS modifier_code VARCHAR(7);

CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_share_code ON projects(share_code);
CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_viewer_code ON projects(viewer_code);
CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_modifier_code ON projects(modifier_code);

UPDATE projects
SET share_code = UPPER(SUBSTRING(MD5(project_id::text || created_at::text), 1, 8))
WHERE share_code IS NULL;

UPDATE projects
SET viewer_code = UPPER(SUBSTRING(COALESCE(share_code, MD5(project_id::text || created_at::text || 'VIEW')), 1, 7))
WHERE viewer_code IS NULL;

UPDATE projects
SET modifier_code = UPPER(SUBSTRING(MD5(project_id::text || created_at::text || 'MOD'), 1, 7))
WHERE modifier_code IS NULL;

ALTER TABLE projects ALTER COLUMN share_code SET NOT NULL;
ALTER TABLE projects ALTER COLUMN viewer_code SET NOT NULL;
ALTER TABLE projects ALTER COLUMN modifier_code SET NOT NULL;

CREATE TABLE IF NOT EXISTS members (
    member_id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
    category_id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_items (
    expense_item_id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(category_id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(member_id),
    name VARCHAR(160) NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'online')),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_members_project_id ON members(project_id);
CREATE INDEX IF NOT EXISTS ix_categories_project_id ON categories(project_id);
CREATE INDEX IF NOT EXISTS ix_expense_items_category_id ON expense_items(category_id);
CREATE INDEX IF NOT EXISTS ix_expense_items_member_id ON expense_items(member_id);
