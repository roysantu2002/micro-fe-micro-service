# Backend Communication Guide

How the Topic Service (Spring Boot) and Content Service (FastAPI) communicate
using Kafka event-driven architecture. The two services **never call each other's
APIs directly** -- they exchange messages through Kafka topics.

---

## Architecture Overview

```
┌─────────────────────┐                              ┌──────────────────────┐
│   TOPIC SERVICE     │                              │   CONTENT SERVICE    │
│   (Spring Boot)     │                              │   (FastAPI)          │
│   Port 8081         │                              │   Port 8082          │
│                     │                              │                      │
│  ┌───────────────┐  │    ┌──────────────────┐      │  ┌────────────────┐  │
│  │ Kafka Producer│──┼───▶│  KAFKA TOPIC      │─────┼─▶│ Kafka Consumer │  │
│  │               │  │    │  "topic-created"  │     │  │                │  │
│  └───────────────┘  │    └──────────────────┘      │  └───────┬────────┘  │
│                     │                              │          │           │
│  ┌───────────────┐  │    ┌──────────────────┐      │          ▼           │
│  │ Kafka Consumer│◀─┼────│  KAFKA TOPIC      │◀────┼──┌──────────────┐   │
│  │               │  │    │"content-generated"│     │  │Kafka Producer│   │
│  └───────┬───────┘  │    └──────────────────┘      │  └──────────────┘   │
│          │          │                              │          ▲           │
│          ▼          │                              │          │           │
│  ┌───────────────┐  │                              │  ┌───────┴────────┐  │
│  │  PostgreSQL   │  │                              │  │   OpenAI API   │  │
│  │  (save content│  │                              │  │  (gpt-4o-mini) │  │
│  │   + update    │  │                              │  └────────────────┘  │
│  │   status)     │  │                              │          ▲           │
│  └───────────────┘  │                              │          │           │
│                     │                              │  ┌───────┴────────┐  │
│                     │                              │  │     Redis      │  │
│                     │                              │  │  (cache check  │  │
│                     │                              │  │   before call) │  │
│                     │                              │  └────────────────┘  │
└─────────────────────┘                              └──────────────────────┘
```

---

## Communication Flow (Step by Step)

### Phase 1: Client Triggers Generation

The client sends a POST request to the Topic Service.

```
CLIENT ──POST /api/topics/{id}/generate──▶ TOPIC SERVICE
```

**What happens inside Topic Service:**

| Step | File | Action |
|------|------|--------|
| 1 | `TopicController.java:49` | Receives the HTTP POST request |
| 2 | `TopicService.java:80` | Finds topic in PostgreSQL by UUID |
| 3 | `TopicService.java:85` | Updates topic status from `draft` to `generating` |
| 4 | `TopicService.java:88-95` | Builds a `TopicCreatedEvent` with topic data |
| 5 | `TopicKafkaProducer.java:18-19` | Publishes event to Kafka topic `topic-created` |
| 6 | `TopicController.java:50` | Returns response immediately with `status: "generating"` |

The client gets an instant response. Content generation happens asynchronously.

---

### Phase 2: Content Service Picks Up the Event

The Content Service has a background Kafka consumer running since startup.

```
KAFKA ("topic-created") ──message──▶ CONTENT SERVICE
```

**What happens inside Content Service:**

| Step | File | Action |
|------|------|--------|
| 1 | `kafka_service.py:114-136` | Consumer loop receives the message |
| 2 | `kafka_service.py:66-71` | Parses JSON bytes into `TopicCreatedEvent` |
| 3 | `redis_service.py` (get) | Checks Redis cache: `GET content:{topicId}` |
| 4a | **Cache HIT** | Uses cached content, skips OpenAI (go to step 6) |
| 4b | **Cache MISS** | Calls OpenAI API (continue to step 5) |
| 5 | `openai_service.py` | Sends prompt to `gpt-4o-mini`, gets JSON response |
| 6 | `redis_service.py` (set) | Caches result: `SET content:{topicId}` with 24h TTL |
| 7 | `kafka_service.py:110-111` | Publishes `ContentGeneratedEvent` to Kafka topic `content-generated` |

---

### Phase 3: Topic Service Receives Generated Content

The Topic Service has a `@KafkaListener` running on the `content-generated` topic.

```
KAFKA ("content-generated") ──message──▶ TOPIC SERVICE
```

**What happens inside Topic Service:**

| Step | File | Action |
|------|------|--------|
| 1 | `ContentKafkaConsumer.java:25` | `@KafkaListener` receives the message |
| 2 | `ContentKafkaConsumer.java:32-40` | Builds `TopicContent` entity from event data |
| 3 | `ContentKafkaConsumer.java:42` | Saves content to `topic_content` table in PostgreSQL |
| 4 | `ContentKafkaConsumer.java:45-50` | Updates topic status from `generating` to `completed` |

---

### Phase 4: Client Retrieves Content

The client polls or fetches the generated content.

```
CLIENT ──GET /api/topics/{id}/content──▶ TOPIC SERVICE ──query──▶ PostgreSQL
```

---

## Kafka Topics

| Topic Name | Producer | Consumer | Payload |
|------------|----------|----------|---------|
| `topic-created` | Topic Service (Spring Boot) | Content Service (FastAPI) | Topic metadata |
| `content-generated` | Content Service (FastAPI) | Topic Service (Spring Boot) | AI-generated content |

### topic-created Event

```json
{
    "topicId": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Docker for Beginners",
    "description": "Complete guide to Docker containers and images",
    "tags": ["docker", "devops", "containers"]
}
```

### content-generated Event

```json
{
    "topicId": "550e8400-e29b-41d4-a716-446655440000",
    "hook": "Ever wondered why every tech company is adopting Docker?...",
    "scriptOutline": "1. Introduction\n2. What is Docker?\n3. Containers vs VMs...",
    "keyPoints": "1. Docker simplifies deployment\n2. Containers are lightweight...",
    "callToAction": "If you found this helpful, hit that subscribe button..."
}
```

---

## Topic Status Lifecycle

```
  ┌───────┐     POST /generate     ┌────────────┐    Kafka round-trip    ┌───────────┐
  │ draft │ ──────────────────────▶ │ generating │ ─────────────────────▶ │ completed │
  └───────┘                        └────────────┘                        └───────────┘
     │                                   │
     │ (initial state                    │ (if OpenAI or
     │  after POST                       │  Kafka fails)
     │  /api/topics)                     ▼
     │                             ┌──────────┐
     │                             │  failed  │
     │                             └──────────┘
```

---

## Redis Caching Strategy

```
Content Service receives topic-created event
         │
         ▼
   ┌─────────────┐
   │ Redis GET    │
   │ content:{id} │
   └──────┬──────┘
          │
    ┌─────┴─────┐
    │           │
 HIT ▼       MISS ▼
    │     ┌──────────┐
    │     │ Call      │
    │     │ OpenAI    │
    │     │ API       │
    │     └────┬─────┘
    │          │
    │          ▼
    │     ┌──────────┐
    │     │ Redis SET │
    │     │ TTL: 24h  │
    │     └────┬─────┘
    │          │
    └────┬─────┘
         │
         ▼
   Publish to Kafka
   "content-generated"
```

- Cache key format: `content:{topicId}`
- TTL: 86400 seconds (24 hours)
- If the same topic triggers generation again within 24 hours, OpenAI is not called

---

## Key Source Files

### Topic Service (Spring Boot)

| File | Path | Role |
|------|------|------|
| TopicController | `backend/topic-service/src/main/java/.../controller/TopicController.java` | REST endpoints |
| TopicService | `backend/topic-service/src/main/java/.../service/TopicService.java` | Business logic, triggers Kafka |
| TopicKafkaProducer | `backend/topic-service/src/main/java/.../kafka/TopicKafkaProducer.java` | Publishes `topic-created` |
| ContentKafkaConsumer | `backend/topic-service/src/main/java/.../kafka/ContentKafkaConsumer.java` | Consumes `content-generated` |
| TopicCreatedEvent | `backend/topic-service/src/main/java/.../kafka/TopicCreatedEvent.java` | Event payload (outgoing) |
| ContentGeneratedEvent | `backend/topic-service/src/main/java/.../kafka/ContentGeneratedEvent.java` | Event payload (incoming) |

### Content Service (FastAPI)

| File | Path | Role |
|------|------|------|
| main.py | `backend/content-service/main.py` | App entry, lifecycle, sync endpoint |
| kafka_service.py | `backend/content-service/kafka_service.py` | Consumer + producer, message handler |
| openai_service.py | `backend/content-service/openai_service.py` | Calls OpenAI API |
| redis_service.py | `backend/content-service/redis_service.py` | Cache get/set operations |
| prompt_template.py | `backend/content-service/prompt_template.py` | Builds OpenAI prompt |
| models.py | `backend/content-service/models.py` | Pydantic event and request models |
| config.py | `backend/content-service/config.py` | Environment-based settings |

---

## Testing the Communication

### Prerequisites

Both services must be running (see `05-BACKEND-EXECUTION-GUIDE.md`), along with
PostgreSQL, Redis, and Kafka in Docker.

### Test 1: Create a Topic

```bash
curl -s -X POST http://localhost:8081/api/topics \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Docker for Beginners",
    "description": "Complete guide to Docker containers and images",
    "tags": ["docker", "devops", "containers"]
  }' | python3 -m json.tool
```

Copy the `id` from the response:

```bash
TOPIC_ID="paste-uuid-here"
```

### Test 2: Trigger Content Generation

```bash
curl -s -X POST http://localhost:8081/api/topics/$TOPIC_ID/generate | python3 -m json.tool
```

Expected: `"status": "generating"`

Now check the logs in both terminals. You should see the full flow:

**Terminal 1 (Spring Boot) logs:**
```
Publishing topic-created event for topicId: <uuid>
Successfully published topic-created event for topicId: <uuid>
```

**Terminal 2 (FastAPI) logs:**
```
Received topic-created event for topicId=<uuid>
Cache miss for key=content:<uuid>
Requesting content generation from OpenAI for title='Docker for Beginners'
Content generated successfully for title='Docker for Beginners'
Cached content for key=content:<uuid> (TTL=86400s)
Published content-generated event for topicId=<uuid>
```

**Terminal 1 (Spring Boot) logs (continued):**
```
Received content-generated event for topicId: <uuid>
Saved generated content for topicId: <uuid>
Updated topic status to 'completed' for topicId: <uuid>
```

### Test 3: Verify Status Changed

```bash
curl -s http://localhost:8081/api/topics/$TOPIC_ID | python3 -m json.tool
```

Expected: `"status": "completed"`

### Test 4: Retrieve Generated Content

```bash
curl -s http://localhost:8081/api/topics/$TOPIC_ID/content | python3 -m json.tool
```

Expected:

```json
{
    "id": "...",
    "topicId": "...",
    "hook": "Ever wondered why Docker has taken the tech world by storm?...",
    "scriptOutline": "1. Introduction\n2. What is Docker?...",
    "keyPoints": "1. Docker containers vs VMs\n2. Images and layers...",
    "callToAction": "If this helped, smash that like button and subscribe...",
    "generatedAt": "2026-06-26T..."
}
```

### Test 5: Verify Redis Cache

```bash
docker exec -it yt-planner-redis redis-cli KEYS "content:*"
```

Expected: `1) "content:<uuid>"`

```bash
docker exec -it yt-planner-redis redis-cli TTL "content:$TOPIC_ID"
```

Expected: A number close to `86400` (24 hours in seconds, decreasing).

### Test 6: Trigger Again (Cache Hit)

```bash
curl -s -X POST http://localhost:8081/api/topics/$TOPIC_ID/generate | python3 -m json.tool
```

Check Terminal 2 (FastAPI) logs this time:

```
Received topic-created event for topicId=<uuid>
Cache hit for key=content:<uuid>
Using cached content for topicId=<uuid>
Published content-generated event for topicId=<uuid>
```

No OpenAI call this time -- Redis served the cached result.

### Test 7: Verify Kafka Messages

```bash
# Messages published by Topic Service
docker exec -it yt-planner-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic topic-created \
  --from-beginning \
  --max-messages 5

# Messages published by Content Service
docker exec -it yt-planner-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic content-generated \
  --from-beginning \
  --max-messages 5
```

### Test 8: Check PostgreSQL Data

```bash
docker exec -it yt-planner-postgres psql -U planner -d youtube_planner
```

Inside psql:

```sql
-- Check topic status
SELECT id, title, status FROM topics;

-- Check generated content
SELECT topic_id, LEFT(hook, 60) AS hook_preview, generated_at FROM topic_content;

-- Exit
\q
```

### Test 9: Sync Fallback (Direct REST, Bypasses Kafka)

The Content Service also exposes a REST endpoint for synchronous generation:

```bash
curl -s -X POST http://localhost:8082/api/content/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topicId": "test-sync-001",
    "title": "React Hooks Deep Dive",
    "description": "Understanding useState, useEffect, and custom hooks",
    "tags": ["react", "hooks", "frontend"]
  }' | python3 -m json.tool
```

This calls OpenAI directly and returns the response without going through Kafka.
Useful when Kafka is down or for quick testing.

---

## Why Kafka Instead of Direct REST Calls?

| Direct REST Calls | Kafka Event-Driven |
|-------------------|--------------------|
| Content Service must be running when Topic Service calls it | Services are decoupled; either can restart independently |
| Topic Service waits for OpenAI response (slow, blocks the request) | Client gets instant response; processing happens in background |
| Retry logic must be built into the caller | Kafka retains messages; consumer picks up missed events |
| Tight coupling between services | Loose coupling; services only know about Kafka topics |
| Hard to add new consumers | New services can subscribe to existing topics easily |
| Single point of failure | Kafka acts as a buffer if one service is temporarily down |