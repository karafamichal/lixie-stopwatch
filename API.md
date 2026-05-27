# Nixie Stopky — API Reference

Base URL: `http://<server>:5000/api/v1`

All request bodies are JSON (`Content-Type: application/json`).  
All responses are JSON. Dates are ISO 8601 strings (`2026-05-26T14:30:00`).

---

## Data model overview

The database has five tables. The hierarchy that ties a work session together is:

```
client  ──<  project  ──<  time_log  >──  app
                                 \
                                  >──  device
```

One `time_log` row = one completed work session.  
It answers **"who worked, on what project, for which client, using which app, for how long, on which device."**

### Table relationships

| Table | Foreign keys | Cascade |
|-------|-------------|---------|
| `project` | `client_id → client.id` | deleted when client is deleted |
| `time_log` | `client_id → client.id` | deleted when client is deleted |
| `time_log` | `project_id → project.id` | deleted when project is deleted |
| `time_log` | `app_id → app.id` (nullable) | app deletion does NOT remove logs |
| `time_log` | `device_id → device.id` (nullable) | kept when device is deleted |

---

## Clients

### `GET /clients`

Returns all clients ordered by name.

**Response**
```json
[
  {
    "id": 1,
    "name": "Acme Corp",
    "active": true,
    "color": "#FF8000",
    "created_at": "2026-05-01T10:00:00"
  }
]
```

Used by: ESP32 (to build the selection menu), dashboard.

---

### `POST /clients`

Create a new client.

**Request body**
```json
{
  "name": "Acme Corp",
  "active": true,
  "color": "#FF8000"
}
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | string | yes | — |
| `active` | boolean | no | `true` |
| `color` | string (hex) | no | `#FF8000` |

**Response** — `201 Created`, same shape as GET item.

---

### `PUT /clients/<id>`

Update any subset of fields on an existing client.

**Request body** (all fields optional)
```json
{
  "name": "Acme Corp Renamed",
  "active": false,
  "color": "#31A8FF"
}
```

**Response** — `200 OK`, updated client object.

---

### `DELETE /clients/<id>`

Delete a client. **Cascades**: all projects and all time logs belonging to this client are also deleted.

**Response** — `204 No Content`

---

## Projects

### `GET /projects?client_id=<id>`

Returns **active** projects only. Used by the ESP32 — it passes a `client_id` to get only that client's projects.

```
GET /projects              → all active projects across all clients
GET /projects?client_id=3  → only active projects of client 3
```

**Response**
```json
[
  {
    "id": 7,
    "client_id": 3,
    "client_name": "Acme Corp",
    "client_color": "#FF8000",
    "name": "Website Redesign",
    "active": true,
    "color": "#2D8CFF",
    "created_at": "2026-05-10T09:00:00"
  }
]
```

---

### `GET /projects/all?client_id=<id>`

Returns **all** projects (active and inactive). Dashboard only.

---

### `POST /projects`

Create a new project.

**Request body**
```json
{
  "name": "Website Redesign",
  "client_id": 3,
  "active": true,
  "color": "#2D8CFF"
}
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | string | yes | — |
| `client_id` | integer | yes | — |
| `active` | boolean | no | `true` |
| `color` | string (hex) | no | `#FF8000` |

**Response** — `201 Created`

---

### `PUT /projects/<id>`

Update project fields.

**Request body** (all optional)
```json
{
  "name": "New Name",
  "client_id": 4,
  "active": false,
  "color": "#217346"
}
```

**Response** — `200 OK`

---

### `DELETE /projects/<id>`

Delete a project. **Cascades**: all time logs for this project are also deleted.

**Response** — `204 No Content`

---

## Apps

### `GET /apps`

Returns **active** apps only, ordered by category then name. Used by the ESP32.

**Response**
```json
[
  {
    "id": 2,
    "name": "Photoshop",
    "category": "Design",
    "icon": "🎨",
    "color": "#31A8FF",
    "active": true,
    "is_builtin": true,
    "hourly_rate": 95.00,
    "created_at": "2026-05-01T10:00:00"
  }
]
```

---

### `GET /apps/all`

Returns all apps including inactive. Dashboard only.

---

### `POST /apps`

Create a custom app (non-built-in).

**Request body**
```json
{
  "name": "My Tool",
  "category": "Design",
  "icon": "🛠️",
  "color": "#FF8000",
  "hourly_rate": 80.00
}
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | string | yes | — |
| `category` | string | no | `Other` |
| `icon` | string (emoji) | no | `🖥️` |
| `color` | string (hex) | no | `#FF8000` |
| `hourly_rate` | float | no | `null` |

**Response** — `201 Created`

---

### `PUT /apps/<id>`

Update an app. For **built-in** apps only `active` and `hourly_rate` can be changed — name/category/icon/color are locked.

**Request body** (all optional)
```json
{
  "active": true,
  "hourly_rate": 120.00,
  "name": "My Tool v2",
  "category": "Development",
  "icon": "🔧",
  "color": "#007ACC"
}
```

**Response** — `200 OK`

---

### `DELETE /apps/<id>`

Delete a custom app. Returns `400` if the app is built-in.  
Time logs that referenced this app **keep their `app_id`** — the foreign key is nullable and is not cascade-deleted.

**Response** — `204 No Content`

---

## Time Logs

This is the core endpoint. Every session the ESP32 records ends up here.

### `GET /timelogs`

List time logs, newest first. Supports filters via query parameters.

```
GET /timelogs
GET /timelogs?client_id=3
GET /timelogs?client_id=3&project_id=7
GET /timelogs?app_id=2
GET /timelogs?from=2026-05-01&to=2026-05-31
```

| Param | Type | Description |
|-------|------|-------------|
| `client_id` | integer | Filter by client |
| `project_id` | integer | Filter by project |
| `app_id` | integer | Filter by app |
| `from` | date (YYYY-MM-DD) | Start of date range (inclusive) |
| `to` | date (YYYY-MM-DD) | End of date range (inclusive) |

**Response**
```json
[
  {
    "id": 42,
    "device_id": 1,
    "hardware_id": "esp32_lixie_001",
    "device_label": "Studio Device",
    "client_id": 3,
    "client_name": "Acme Corp",
    "project_id": 7,
    "project_name": "Website Redesign",
    "app_id": 2,
    "app_name": "Photoshop",
    "app_icon": "🎨",
    "app_color": "#31A8FF",
    "start_timestamp": "2026-05-26T14:00:00",
    "duration_seconds": 5400,
    "notes": "Homepage banner mockups",
    "status": "completed",
    "synced_at": "2026-05-26T15:30:00"
  }
]
```

---

### `POST /timelogs` — primary ESP32 endpoint

Submit a completed work session. This is the main call the device makes after the user stops the timer.

**Request body**
```json
{
  "hardware_id": "esp32_lixie_001",
  "client_id": 3,
  "project_id": 7,
  "app_id": 2,
  "start_timestamp": "2026-05-26T14:00:00Z",
  "duration_seconds": 5400,
  "notes": "Homepage banner mockups",
  "status": "completed"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `hardware_id` | string | no | Identifies the physical device. Auto-creates a `device` row on first sight and updates `last_seen` on every submission. |
| `client_id` | integer | yes | Must exist in the database. |
| `project_id` | integer | yes | Must exist in the database. |
| `app_id` | integer | no | If omitted or `null`, the session is logged without an app. |
| `start_timestamp` | ISO 8601 string | no | UTC preferred (trailing `Z` accepted). Defaults to server time if omitted. |
| `duration_seconds` | integer | yes | Total elapsed seconds the timer ran. |
| `notes` | string | no | Free-text memo. |
| `status` | string | no | `completed` / `pending` / `synced`. Defaults to `completed`. |

**Response** — `201 Created`, full time log object (same shape as GET list item).

---

### `PUT /timelogs/<id>`

Edit an existing log entry. Dashboard only.

**Request body** (all optional)
```json
{
  "client_id": 3,
  "project_id": 7,
  "app_id": 2,
  "start_timestamp": "2026-05-26T14:00:00",
  "duration_seconds": 3600,
  "notes": "Corrected duration",
  "status": "completed"
}
```

**Response** — `200 OK`

---

### `DELETE /timelogs/<id>`

Delete a single log entry.

**Response** — `204 No Content`

---

## Devices

Devices are auto-registered the first time a `hardware_id` appears in a `POST /timelogs` call. The only manual operation is assigning a human-readable label.

### `GET /devices`

Returns all known devices, ordered by most recently seen.

**Response**
```json
[
  {
    "id": 1,
    "hardware_id": "esp32_lixie_001",
    "label": "Studio Device",
    "last_seen": "2026-05-26T15:30:00"
  }
]
```

---

### `PUT /devices/<id>`

Assign or update the label.

**Request body**
```json
{
  "label": "Studio Device"
}
```

**Response** — `200 OK`

---

### `DELETE /devices/<id>`

Remove a device record. Does not affect time logs — `device_id` in existing logs becomes orphaned but is kept for historical display.

**Response** — `204 No Content`

---

## Stats

### `GET /stats`

Summary counts and time totals for the Overview page.

**Response**
```json
{
  "clients": 5,
  "active_clients": 4,
  "projects": 12,
  "active_projects": 9,
  "apps": 28,
  "timelogs": 347,
  "devices": 2,
  "week_seconds": 72000,
  "month_seconds": 540000
}
```

Week starts on Monday. Both ranges are UTC-based.

---

## Reports

All report endpoints share the same optional query parameters:

| Param | Type | Description |
|-------|------|-------------|
| `from` | date (YYYY-MM-DD) | Start of range (inclusive) |
| `to` | date (YYYY-MM-DD) | End of range (inclusive) |
| `client_id` | integer | Limit to one client |
| `project_id` | integer | Limit to one project |

---

### `GET /reports/daily`

Total tracked seconds per calendar day. Used for the trend chart.

**Response**
```json
[
  { "date": "2026-05-24", "seconds": 18000 },
  { "date": "2026-05-25", "seconds": 25200 },
  { "date": "2026-05-26", "seconds": 9000 }
]
```

Days with zero activity are **not** included — the frontend fills gaps.

---

### `GET /reports/by-client`

Total seconds per client, descending. Ignores `client_id` filter (always all clients).

**Response**
```json
[
  { "id": 3, "name": "Acme Corp", "color": "#FF8000", "seconds": 54000 },
  { "id": 1, "name": "Beta Ltd",  "color": "#2D8CFF", "seconds": 18000 }
]
```

---

### `GET /reports/by-project`

Total seconds per project, descending.

**Response**
```json
[
  {
    "id": 7,
    "name": "Website Redesign",
    "color": "#2D8CFF",
    "client_name": "Acme Corp",
    "seconds": 36000
  }
]
```

---

### `GET /reports/by-app`

Total seconds per app, descending. Only apps that appear in at least one log are returned.

**Response**
```json
[
  {
    "id": 2,
    "name": "Photoshop",
    "icon": "🎨",
    "color": "#31A8FF",
    "category": "Design",
    "seconds": 21600
  }
]
```

---

## How a session is stored end-to-end

```
ESP32 user flow                     Database result
─────────────────────────────────   ───────────────────────────────────────────
1. Turn encoder → fetch clients     SELECT * FROM client WHERE active = 1
2. Select "Acme Corp" (id=3)
3. Fetch projects for client 3      SELECT * FROM project WHERE client_id=3
                                                               AND active=1
4. Select "Website Redesign" (id=7)
5. Fetch active apps                SELECT * FROM app WHERE active = 1
6. Select "Photoshop" (id=2)
7. Start timer (14:00:00 UTC)
8. Press encoder to stop (15:30:00) → duration = 5400 s

POST /api/v1/timelogs
{
  "hardware_id":      "esp32_lixie_001",   ← device auto-registered/updated
  "client_id":        3,
  "project_id":       7,
  "app_id":           2,
  "start_timestamp":  "2026-05-26T14:00:00Z",
  "duration_seconds": 5400,
  "status":           "completed"
}

INSERT INTO time_log
  (device_id, client_id, project_id, app_id,
   start_timestamp, duration_seconds, status, synced_at)
VALUES
  (1,          3,         7,          2,
   '2026-05-26 14:00:00', 5400, 'completed', <now>);
```

To reconstruct the full picture of that row later:

```sql
SELECT
    tl.id,
    tl.start_timestamp,
    tl.duration_seconds,
    tl.status,
    c.name  AS client,
    p.name  AS project,
    a.name  AS app,
    a.icon  AS app_icon,
    a.hourly_rate,
    d.label AS device
FROM time_log tl
JOIN client  c ON c.id = tl.client_id
JOIN project p ON p.id = tl.project_id
LEFT JOIN app    a ON a.id = tl.app_id
LEFT JOIN device d ON d.id = tl.device_id
WHERE tl.id = 42;
```

`app` and `device` use `LEFT JOIN` because both are nullable — a session can be logged without selecting an app, and manual entries created in the dashboard have no device.

---

## Error responses

All errors return JSON.

```json
{ "error": "name is required" }
```

| Status | When |
|--------|------|
| `400` | Missing required field, invalid reference (unknown client/project ID) |
| `404` | Record not found for the given ID |
| `500` | Unexpected server error |