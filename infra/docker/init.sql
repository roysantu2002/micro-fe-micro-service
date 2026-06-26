-- YouTube Content Planner - Database Initialization

CREATE TABLE IF NOT EXISTS topics (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         VARCHAR(255) NOT NULL,
    description   TEXT,
    tags          TEXT[],
    status        VARCHAR(20) DEFAULT 'draft',
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_content (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id        UUID REFERENCES topics(id) ON DELETE CASCADE,
    hook            TEXT,
    script_outline  TEXT,
    key_points      TEXT,
    call_to_action  TEXT,
    generated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_topic_content_topic_id ON topic_content(topic_id);
