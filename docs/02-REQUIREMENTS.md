# Requirements: YouTube Content Planner

## Functional Requirements

### Topic Manager (MFE 1)

| ID | Requirement |
|----|-------------|
| FR-1 | User can create a new topic (title, description, tags) |
| FR-2 | User can view a list of all topics |
| FR-3 | User can edit an existing topic |
| FR-4 | User can delete a topic |
| FR-5 | User can trigger AI content generation for a topic |
| FR-6 | User can see generation status (pending, generating, completed, failed) |

### Content Writer (MFE 2)

| ID | Requirement |
|----|-------------|
| FR-7 | User can view AI-generated content for a selected topic |
| FR-8 | Generated content includes: script outline, hook, key points, call-to-action |
| FR-9 | User can manually edit the generated content |
| FR-10 | User can regenerate content for a topic |

### Topic Service (Spring Boot)

| ID | Requirement |
|----|-------------|
| FR-11 | REST API: CRUD for topics (`/api/topics`) |
| FR-12 | REST API: Get/Update content for a topic (`/api/topics/{id}/content`) |
| FR-13 | Publish `topic-created` event to Kafka when generation is triggered |
| FR-14 | Consume `content-generated` event from Kafka and persist content |
| FR-15 | Health check endpoint (`/actuator/health`) |

### Content Service (FastAPI)

| ID | Requirement |
|----|-------------|
| FR-16 | Consume `topic-created` event from Kafka |
| FR-17 | Check Redis cache before calling OpenAI |
| FR-18 | Generate content using OpenAI API with a prompt template |
| FR-19 | Cache generated content in Redis (TTL: 24 hours) |
| FR-20 | Publish `content-generated` event to Kafka |
| FR-21 | Health check endpoint (`/health`) |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | All services containerized with Docker |
| NFR-2 | Local environment runs entirely via `docker-compose up` |
| NFR-3 | Kubernetes-ready with manifests for AKS deployment |
| NFR-4 | Environment-specific configuration via env variables |
| NFR-5 | API Gateway routes: `/api/topics/**` -> Topic Service, `/api/content/**` -> Content Service |
| NFR-6 | Each service independently deployable |

## Data Models

### Topic (PostgreSQL)

```sql
CREATE TABLE topics (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title         VARCHAR(255) NOT NULL,
    description   TEXT,
    tags          TEXT[],
    status        VARCHAR(20) DEFAULT 'draft',  -- draft, generating, completed, failed
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE topic_content (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id      UUID REFERENCES topics(id) ON DELETE CASCADE,
    hook          TEXT,
    script_outline TEXT,
    key_points    TEXT,
    call_to_action TEXT,
    generated_at  TIMESTAMP DEFAULT NOW()
);
```

### Kafka Events

**topic-created** (Topic Service -> Content Service)
```json
{
  "topicId": "uuid",
  "title": "string",
  "description": "string",
  "tags": ["string"]
}
```

**content-generated** (Content Service -> Topic Service)
```json
{
  "topicId": "uuid",
  "hook": "string",
  "scriptOutline": "string",
  "keyPoints": "string",
  "callToAction": "string"
}
```

## API Endpoints

### Topic Service (Spring Boot) - Base: `/api/topics`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/topics` | List all topics |
| GET | `/api/topics/{id}` | Get topic by ID |
| POST | `/api/topics` | Create topic |
| PUT | `/api/topics/{id}` | Update topic |
| DELETE | `/api/topics/{id}` | Delete topic |
| POST | `/api/topics/{id}/generate` | Trigger content generation |
| GET | `/api/topics/{id}/content` | Get generated content |

### Content Service (FastAPI) - Base: `/api/content`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/content/health` | Health check |
| POST | `/api/content/generate` | Sync generation (fallback if Kafka is down) |