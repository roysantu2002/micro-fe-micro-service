# Backend Execution Guide

Complete step-by-step guide to run and test both backend microservices locally.
Two options are provided: **Option A (Docker Compose)** runs everything in containers,
**Option B (Local Dev)** runs application services on your machine with only infra in Docker.

---

## Prerequisites Check

Run each command to verify your setup:

```bash
docker --version          # Docker 20+ required (both options)
docker compose version    # Docker Compose v2+ required (both options)
curl --version            # For testing API endpoints (both options)
```

Additional prerequisites for **Option B (Local Dev)** only:

```bash
java -version             # Java 21 required
mvn -version              # Maven 3.9+ required
python3 --version         # Python 3.12+ required
pip3 --version            # pip for Python packages
```

---

## Step 1: Environment Setup (Both Options)

```bash
# Navigate to the project root
cd /Users/santuroy/Documents/micro-fe-micro-service

# Create .env from the example file
cp .env.example .env
```

Now open `.env` in your editor and replace the OpenAI API key:

```bash
# Open in your preferred editor
nano .env
# OR
code .env
```

Change this line:
```
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
```

Leave all other values as defaults. Save and close.

---

## Step 2: Start Infrastructure (Both Options)

Both options need PostgreSQL, Redis, Kafka, and Zookeeper running in Docker.

```bash
# Navigate to project root (if not already there)
cd /Users/santuroy/Documents/micro-fe-micro-service

# Start infrastructure services
docker compose up -d postgres redis zookeeper
```

Wait ~15 seconds for Zookeeper to be ready, then start Kafka:

```bash
docker compose up -d kafka
```

Start Kafka UI (optional but recommended for debugging):

```bash
docker compose up -d kafka-ui
```

### Verify all infrastructure is healthy

```bash
docker compose ps
```

Expected output (wait until all show "healthy" or "running"):
```
NAME                      STATUS              PORTS
yt-planner-kafka          running (healthy)   0.0.0.0:9092->9092/tcp
yt-planner-kafka-ui       running             0.0.0.0:9090->8080/tcp
yt-planner-postgres       running (healthy)   0.0.0.0:5432->5432/tcp
yt-planner-redis          running (healthy)   0.0.0.0:6379->6379/tcp
yt-planner-zookeeper      running             0.0.0.0:2181->2181/tcp
```

If Kafka shows "starting" or "unhealthy", wait 30 seconds and run `docker compose ps` again.

### Verify PostgreSQL tables

```bash
docker exec -it yt-planner-postgres psql -U planner -d youtube_planner -c "\dt"
```

Expected:
```
 Schema |     Name      | Type  |  Owner
--------+---------------+-------+---------
 public | topic_content | table | planner
 public | topics        | table | planner
```

### Verify Redis

```bash
docker exec -it yt-planner-redis redis-cli ping
```

Expected: `PONG`

### Verify Kafka

```bash
docker exec -it yt-planner-kafka kafka-topics --bootstrap-server localhost:9092 --list
```

Expected: empty list or internal Kafka topics. This is fine -- application topics auto-create on first use.

---

## Step 3: Start Backend Services

Choose **ONE** of the two options below.

---

### OPTION A: Docker Compose (Everything in Containers)

Best for: testing the full setup as it will run in production, no local Java/Python needed.

#### A.1 Build and start both services + gateway

```bash
cd /Users/santuroy/Documents/micro-fe-micro-service

docker compose up -d --build topic-service content-service nginx
```

This command will:
- Build Spring Boot JAR inside a Docker container (multi-stage Dockerfile)
- Build FastAPI Docker image
- Wait for PostgreSQL and Kafka health checks to pass
- Start Topic Service on port 8081
- Start Content Service on port 8082
- Start Nginx API Gateway on port 8080

**Note:** The first build downloads all Maven and Python dependencies, so it will be slow. Subsequent builds use Docker layer cache.

#### A.2 Watch build progress

```bash
# Watch build and startup logs in real time
docker compose logs -f topic-service content-service
```

Press `Ctrl+C` to stop following logs.

#### A.3 Verify both services started

Wait for logs to show "Started TopicServiceApplication" (Spring Boot) and "Uvicorn running" (FastAPI), then:

```bash
# Check container status
docker compose ps
```

Expected:
```
NAME                          STATUS              PORTS
yt-planner-content-service    running             0.0.0.0:8082->8082/tcp
yt-planner-gateway            running             0.0.0.0:8080->80/tcp
yt-planner-kafka              running (healthy)   0.0.0.0:9092->9092/tcp
yt-planner-kafka-ui           running             0.0.0.0:9090->8080/tcp
yt-planner-postgres           running (healthy)   0.0.0.0:5432->5432/tcp
yt-planner-redis              running (healthy)   0.0.0.0:6379->6379/tcp
yt-planner-topic-service      running             0.0.0.0:8081->8081/tcp
yt-planner-zookeeper          running             0.0.0.0:2181->2181/tcp
```

#### A.4 Health checks

```bash
# Topic Service (Spring Boot Actuator)
curl -s http://localhost:8081/actuator/health | python3 -m json.tool
```

Expected:
```json
{
    "status": "UP"
}
```

```bash
# Content Service (FastAPI)
curl -s http://localhost:8082/health | python3 -m json.tool
```

Expected:
```json
{
    "status": "ok"
}
```

```bash
# Nginx API Gateway
curl -s http://localhost:8080/health | python3 -m json.tool
```

Expected:
```json
{
    "status": "ok"
}
```

#### A.5 If a service fails to start

```bash
# Check Topic Service logs
docker compose logs topic-service --tail 100

# Check Content Service logs
docker compose logs content-service --tail 100

# Rebuild a single service after fixing code
docker compose up -d --build topic-service

# Restart a service without rebuilding
docker compose restart content-service
```

#### A.6 Skip to Step 4 (Testing)

Once all three health checks pass, skip to **Step 4** below.

---

### OPTION B: Local Development (Services on your machine)

Best for: faster iteration, live reload, IDE debugging.

Infrastructure (Postgres, Redis, Kafka) still runs in Docker from Step 2. Only the application services run locally.

#### B.1 Start Topic Service (Spring Boot) -- Terminal 1

Open a new terminal window:

```bash
# Navigate to the topic service directory
cd /Users/santuroy/Documents/micro-fe-micro-service/backend/topic-service

# Set environment variables
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=youtube_planner
export POSTGRES_USER=planner
export POSTGRES_PASSWORD=planner_secret
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Build and run (first run downloads all Maven dependencies)
mvn clean install -DskipTests

# Start the application
mvn spring-boot:run
```

Wait for this output:
```
Started TopicServiceApplication in X.XXX seconds
```

Verify in the same terminal or a new one:
```bash
curl -s http://localhost:8081/actuator/health | python3 -m json.tool
```

Expected:
```json
{
    "status": "UP"
}
```

**Leave this terminal running.** Do not close it.

#### B.2 Start Content Service (FastAPI) -- Terminal 2

Open a **second** terminal window:

```bash
# Navigate to the content service directory
cd /Users/santuroy/Documents/micro-fe-micro-service/backend/content-service

# Create a Python virtual environment
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate

# Install all Python dependencies
pip install -r requirements.txt
```

Now set the environment variables and start:

```bash
# Set environment variables (still in the same terminal with venv activated)
export OPENAI_API_KEY=sk-your-actual-openai-api-key-here
export REDIS_HOST=localhost
export REDIS_PORT=6379
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092

# Start FastAPI with auto-reload
uvicorn main:app --host 0.0.0.0 --port 8082 --reload
```

Wait for this output:
```
INFO:     Uvicorn running on http://0.0.0.0:8082 (Press CTRL+C to quit)
INFO:     Kafka consumer background task started
```

Verify in a new terminal:
```bash
curl -s http://localhost:8082/health | python3 -m json.tool
```

Expected:
```json
{
    "status": "ok"
}
```

**Leave this terminal running.** Do not close it.

#### B.3 (Optional) Start Nginx Gateway -- Terminal 3

If you want the API Gateway routing (port 8080), you need to adjust the nginx config for local services. Since your services are on your host machine (not in Docker), the nginx container cannot resolve `topic-service` and `content-service` hostnames.

**Skip Nginx for Option B.** Access services directly:
- Topic Service: `http://localhost:8081`
- Content Service: `http://localhost:8082`

#### B.4 Verify both services

Open a **third** terminal for running test commands:

```bash
# Topic Service health
curl -s http://localhost:8081/actuator/health | python3 -m json.tool

# Content Service health
curl -s http://localhost:8082/health | python3 -m json.tool
```

Both should return healthy responses. Proceed to **Step 4**.

#### B.5 Stopping local services

When done, go back to each terminal and press `Ctrl+C` to stop:
- Terminal 1: Stops Spring Boot
- Terminal 2: Stops FastAPI + deactivate venv with `deactivate`

---

## Step 4: Test Topic CRUD API

Use a **separate terminal** for running these curl commands. All commands hit port 8081 (Topic Service).

If using Option A with Nginx, you can substitute `localhost:8081` with `localhost:8080` to test through the gateway.

### 4.1 Create First Topic

```bash
curl -s -X POST http://localhost:8081/api/topics \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Docker for Beginners",
    "description": "Complete guide to Docker containers, images, and Docker Compose for beginners",
    "tags": ["docker", "devops", "containers", "beginners"]
  }' | python3 -m json.tool
```

Expected response (HTTP 201):
```json
{
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Docker for Beginners",
    "description": "Complete guide to Docker containers, images, and Docker Compose for beginners",
    "tags": [
        "docker",
        "devops",
        "containers",
        "beginners"
    ],
    "status": "draft",
    "createdAt": "2026-06-26T12:00:00.000000",
    "updatedAt": "2026-06-26T12:00:00.000000"
}
```

**Copy the `id` value from your response.** You will need it for all following commands. Set it as a variable:

```bash
# Replace with the actual UUID from your response
TOPIC_ID="paste-your-uuid-here"
```

### 4.2 Create Second Topic

```bash
curl -s -X POST http://localhost:8081/api/topics \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Kubernetes in Production",
    "description": "How to deploy and manage applications on Kubernetes in production environments",
    "tags": ["kubernetes", "k8s", "devops", "production"]
  }' | python3 -m json.tool
```

Save this ID too:
```bash
TOPIC_ID_2="paste-second-uuid-here"
```

### 4.3 List All Topics

```bash
curl -s http://localhost:8081/api/topics | python3 -m json.tool
```

Expected: JSON array with 2 topics, most recently created first.

### 4.4 Get Single Topic by ID

```bash
curl -s http://localhost:8081/api/topics/$TOPIC_ID | python3 -m json.tool
```

Expected: Single topic object matching the ID.

### 4.5 Update a Topic

```bash
curl -s -X PUT http://localhost:8081/api/topics/$TOPIC_ID \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Docker for Beginners - Complete Guide 2026",
    "description": "Updated: Complete guide to Docker including multi-stage builds and Docker Compose",
    "tags": ["docker", "devops", "containers", "beginners", "multi-stage"]
  }' | python3 -m json.tool
```

Expected: Updated topic with new title, description, and tags. `updatedAt` should be newer than `createdAt`.

### 4.6 Delete a Topic

```bash
curl -s -X DELETE http://localhost:8081/api/topics/$TOPIC_ID_2 -w "\nHTTP Status: %{http_code}\n"
```

Expected:
```
HTTP Status: 204
```

### 4.7 Verify Deletion

```bash
curl -s http://localhost:8081/api/topics | python3 -m json.tool
```

Expected: Array with only 1 topic remaining (the first one).

---

## Step 5: Test End-to-End Content Generation (Kafka Flow)

This tests the full asynchronous pipeline:

```
Topic Service         Kafka              Content Service       OpenAI       Redis
     │                  │                      │                  │           │
     │─POST /generate──▶│                      │                  │           │
     │  status=generating                      │                  │           │
     │                  │──topic-created──────▶│                  │           │
     │                  │                      │──check cache────▶│           │
     │                  │                      │◀──cache miss──── │           │
     │                  │                      │──generate───────▶│           │
     │                  │                      │◀──content─────── │           │
     │                  │                      │──cache result───▶│           │──▶Redis
     │                  │◀──content-generated──│                  │           │
     │◀─save content────│                      │                  │           │
     │  status=completed │                      │                  │           │
```

### 5.1 Trigger Content Generation

```bash
curl -s -X POST http://localhost:8081/api/topics/$TOPIC_ID/generate | python3 -m json.tool
```

Expected response:
```json
{
    "id": "...",
    "title": "Docker for Beginners - Complete Guide 2026",
    "description": "Updated: Complete guide to Docker...",
    "tags": ["docker", "devops", "containers", "beginners", "multi-stage"],
    "status": "generating",
    "createdAt": "...",
    "updatedAt": "..."
}
```

The status is now `"generating"`. The Topic Service has published a `topic-created` event to Kafka.

### 5.2 Watch Logs

**Option A (Docker Compose)** -- open a new terminal:
```bash
cd /Users/santuroy/Documents/micro-fe-micro-service
docker compose logs -f topic-service content-service
```

**Option B (Local Dev)** -- check Terminal 1 and Terminal 2 output directly.

You should see this sequence in the logs:
```
topic-service:    Publishing topic-created event for topicId: <uuid>
topic-service:    Successfully published topic-created event for topicId: <uuid>
content-service:  Received topic-created event for topicId=<uuid>
content-service:  Cache miss -- calling OpenAI for topicId=<uuid>
content-service:  Content generated for topicId=<uuid>
content-service:  Published content-generated event for topicId=<uuid>
topic-service:    Received content-generated event for topicId: <uuid>
topic-service:    Saved generated content for topicId: <uuid>
topic-service:    Updated topic status to 'completed' for topicId: <uuid>
```

### 5.3 Poll Topic Status Until "completed"

OpenAI takes a few seconds to respond. Poll the topic status:

```bash
# Run this every few seconds until status shows "completed"
curl -s http://localhost:8081/api/topics/$TOPIC_ID | python3 -m json.tool
```

Wait until you see:
```json
{
    "status": "completed"
}
```

If the status stays at `"generating"` for more than 30 seconds, check the Content Service logs for errors (OpenAI key issues, Kafka connection problems, etc.).

### 5.4 Retrieve Generated Content

```bash
curl -s http://localhost:8081/api/topics/$TOPIC_ID/content | python3 -m json.tool
```

Expected response:
```json
{
    "id": "...",
    "topicId": "...",
    "hook": "Ever wondered why Docker has taken the tech world by storm? In the next few minutes...",
    "scriptOutline": "## Introduction\n- What is Docker?\n- Why should you care?\n\n## Section 1: ...",
    "keyPoints": "1. Docker containers vs Virtual Machines\n2. Images and Layers\n3. ...",
    "callToAction": "If you found this video helpful, hit that like button and subscribe for more...",
    "generatedAt": "2026-06-26T..."
}
```

This content was generated by OpenAI, cached in Redis, and stored in PostgreSQL.

---

## Step 6: Test Content Service Directly (Sync Fallback)

The Content Service also exposes a direct REST endpoint that bypasses Kafka entirely. Useful as a fallback or for testing OpenAI integration independently.

```bash
curl -s -X POST http://localhost:8082/api/content/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topicId": "test-sync-001",
    "title": "React Hooks Deep Dive",
    "description": "Understanding useState, useEffect, useContext, and custom hooks in React",
    "tags": ["react", "hooks", "frontend", "javascript"]
  }' | python3 -m json.tool
```

Expected response:
```json
{
    "topicId": "test-sync-001",
    "hook": "React Hooks changed everything about how we write components...",
    "scriptOutline": "...",
    "keyPoints": "...",
    "callToAction": "..."
}
```

This directly called OpenAI, cached the result in Redis, and published a `content-generated` event to Kafka.

---

## Step 7: Test API Gateway Routing (Option A Only)

If you started Nginx via Docker Compose (Option A), test that API Gateway routing works on port 8080:

```bash
# Route /api/topics -> Topic Service (port 8081)
curl -s http://localhost:8080/api/topics | python3 -m json.tool

# Get a specific topic through gateway
curl -s http://localhost:8080/api/topics/$TOPIC_ID | python3 -m json.tool

# Create a topic through gateway
curl -s -X POST http://localhost:8080/api/topics \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Testing via API Gateway",
    "description": "This topic was created through the Nginx API Gateway",
    "tags": ["nginx", "gateway", "test"]
  }' | python3 -m json.tool

# Gateway health check
curl -s http://localhost:8080/health | python3 -m json.tool
```

All responses should be identical to hitting port 8081 directly.

---

## Step 8: Verify Redis Cache

```bash
# List all cached content keys
docker exec -it yt-planner-redis redis-cli KEYS "content:*"
```

Expected output (after generating content):
```
1) "content:<topic-uuid>"
2) "content:test-sync-001"
```

```bash
# View the cached content for your topic
docker exec -it yt-planner-redis redis-cli GET "content:$TOPIC_ID"
```

Expected: JSON string with hook, scriptOutline, keyPoints, callToAction fields.

```bash
# Check TTL (should be ~86400 seconds = 24 hours, decreasing)
docker exec -it yt-planner-redis redis-cli TTL "content:$TOPIC_ID"
```

Expected: A number like `86352` (seconds remaining).

```bash
# Manually delete cache to test regeneration
docker exec -it yt-planner-redis redis-cli DEL "content:$TOPIC_ID"
```

---

## Step 9: Verify Kafka Topics and Messages

### List all Kafka topics

```bash
docker exec -it yt-planner-kafka kafka-topics --bootstrap-server localhost:9092 --list
```

Expected:
```
content-generated
topic-created
```

### Read messages from topic-created

```bash
docker exec -it yt-planner-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic topic-created \
  --from-beginning \
  --max-messages 5
```

Expected: JSON messages like:
```json
{"topicId":"<uuid>","title":"Docker for Beginners...","description":"...","tags":["docker",...]}
```

Press `Ctrl+C` if it hangs after displaying messages.

### Read messages from content-generated

```bash
docker exec -it yt-planner-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic content-generated \
  --from-beginning \
  --max-messages 5
```

Expected: JSON messages with generated content fields.

### Kafka UI (Browser)

Open your browser and go to:

```
http://localhost:9090
```

You can see:
- Topics list (topic-created, content-generated)
- Click a topic to see all messages
- Consumer groups (topic-service, content-service)
- Broker details

---

## Step 10: Verify PostgreSQL Data

```bash
# Connect to PostgreSQL
docker exec -it yt-planner-postgres psql -U planner -d youtube_planner
```

Inside the psql shell:

```sql
-- List all topics
SELECT id, title, status, created_at FROM topics ORDER BY created_at DESC;

-- List all generated content
SELECT id, topic_id, LEFT(hook, 50) AS hook_preview, generated_at FROM topic_content;

-- Get full content for a topic
SELECT * FROM topic_content WHERE topic_id = '<paste-topic-uuid>';

-- Check topic count
SELECT COUNT(*) FROM topics;

-- Exit psql
\q
```

---

## Stopping Services

### Option A: Docker Compose

```bash
cd /Users/santuroy/Documents/micro-fe-micro-service

# Stop all services (containers preserved)
docker compose stop

# Stop and remove containers (data volumes preserved)
docker compose down

# Stop, remove containers AND delete all data (database, cache)
docker compose down -v

# Stop only app services, keep infrastructure running
docker compose stop topic-service content-service nginx
```

### Option B: Local Development

```bash
# Terminal 1 (Spring Boot): Press Ctrl+C

# Terminal 2 (FastAPI): Press Ctrl+C, then deactivate venv
deactivate

# Stop Docker infrastructure
cd /Users/santuroy/Documents/micro-fe-micro-service
docker compose stop postgres redis kafka zookeeper kafka-ui

# Or remove everything including data
docker compose down -v
```

---

## Troubleshooting

### Topic Service (Spring Boot) won't start

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Connection refused: localhost:5432` | PostgreSQL not running | `docker compose up -d postgres` and wait for healthy |
| `Table "topics" not found` | init.sql didn't run on first startup | `docker compose down -v && docker compose up -d postgres` |
| `Kafka broker not available` | Kafka not healthy yet | `docker compose ps` -- wait until healthy |
| `Error creating bean` | Code compilation issue | Check `docker compose logs topic-service` for stack trace |
| Maven build fails locally | Wrong Java version | Run `java -version` -- must be 21 |
| Port 8081 already in use | Another process on that port | `lsof -i :8081` to find it, then kill or change port |

### Content Service (FastAPI) won't start

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ModuleNotFoundError` | Dependencies not installed | `pip install -r requirements.txt` |
| `ValidationError: openai_api_key` | Empty API key | Set `export OPENAI_API_KEY=sk-...` |
| `Cannot connect to Redis` | Redis not running | `docker compose up -d redis` |
| `KafkaConnectionError` | Kafka not ready | Wait for `docker compose ps` to show healthy |
| `openai.AuthenticationError` | Invalid API key | Verify key at https://platform.openai.com/api-keys |
| Port 8082 already in use | Another process on that port | `lsof -i :8082` to find it, then kill or change port |

### Content generation stuck at "generating" status

1. Check Content Service is running:
   ```bash
   curl -s http://localhost:8082/health
   ```

2. Check Content Service logs for errors:
   ```bash
   # Option A
   docker compose logs content-service --tail 50

   # Option B
   # Check Terminal 2 output directly
   ```

3. Check if the Kafka message was published:
   ```bash
   docker exec -it yt-planner-kafka kafka-console-consumer \
     --bootstrap-server localhost:9092 \
     --topic topic-created \
     --from-beginning \
     --max-messages 10
   ```

4. Check if the content-generated response came back:
   ```bash
   docker exec -it yt-planner-kafka kafka-console-consumer \
     --bootstrap-server localhost:9092 \
     --topic content-generated \
     --from-beginning \
     --max-messages 10
   ```

5. Check OpenAI API key has credits:
   - Go to https://platform.openai.com/usage
   - Verify you have remaining quota

6. Try the sync fallback to isolate the issue:
   ```bash
   curl -s -X POST http://localhost:8082/api/content/generate \
     -H "Content-Type: application/json" \
     -d '{
       "topicId": "debug-test",
       "title": "Test Topic",
       "description": "Test description",
       "tags": ["test"]
     }' | python3 -m json.tool
   ```
   If this works, the issue is in Kafka connectivity. If this fails, the issue is in OpenAI.

### Port conflicts

```bash
# Find what's using a specific port
lsof -i :5432    # PostgreSQL
lsof -i :6379    # Redis
lsof -i :9092    # Kafka
lsof -i :8081    # Topic Service
lsof -i :8082    # Content Service
lsof -i :8080    # Nginx Gateway
lsof -i :9090    # Kafka UI

# Kill a process by PID
kill -9 <PID>
```

### Reset everything and start fresh

```bash
cd /Users/santuroy/Documents/micro-fe-micro-service

# Remove all containers and volumes (deletes all data)
docker compose down -v

# Remove Docker build cache for this project
docker compose build --no-cache topic-service content-service

# Start fresh
docker compose up -d postgres redis zookeeper
# Wait 15 seconds
docker compose up -d kafka kafka-ui
# Wait 30 seconds for Kafka to be healthy
docker compose up -d --build topic-service content-service nginx
```

---

## Quick Reference

### All Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| GET | `http://localhost:8081/actuator/health` | Topic Service health |
| GET | `http://localhost:8081/api/topics` | List all topics |
| GET | `http://localhost:8081/api/topics/{id}` | Get topic by ID |
| POST | `http://localhost:8081/api/topics` | Create new topic |
| PUT | `http://localhost:8081/api/topics/{id}` | Update topic |
| DELETE | `http://localhost:8081/api/topics/{id}` | Delete topic |
| POST | `http://localhost:8081/api/topics/{id}/generate` | Trigger AI content generation |
| GET | `http://localhost:8081/api/topics/{id}/content` | Get generated content |
| GET | `http://localhost:8082/health` | Content Service health |
| POST | `http://localhost:8082/api/content/generate` | Sync content generation |
| GET | `http://localhost:8080/health` | API Gateway health (Option A) |
| GET | `http://localhost:8080/api/topics` | Topics via gateway (Option A) |
| - | `http://localhost:9090` | Kafka UI (browser) |

### Port Map

```
┌──────────────────────────────────────────────────┐
│                    PORTS                          │
├──────────────────────────────────────────────────┤
│  Backend Services                                │
│    8080 - Nginx API Gateway (Option A only)      │
│    8081 - Topic Service (Spring Boot)            │
│    8082 - Content Service (FastAPI)              │
├──────────────────────────────────────────────────┤
│  Infrastructure (Docker)                         │
│    5432 - PostgreSQL                             │
│    6379 - Redis                                  │
│    9092 - Kafka (host access)                    │
│   29092 - Kafka (inter-container)                │
│    2181 - Zookeeper                              │
│    9090 - Kafka UI                               │
├──────────────────────────────────────────────────┤
│  Frontend (Phase 2)                              │
│    3000 - Shell App                              │
│    3001 - Topic Manager MFE                      │
│    3002 - Content Writer MFE                     │
└──────────────────────────────────────────────────┘
```
