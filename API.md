# Lixie StopWatch — API Reference

Base URL: `http://<server>:5000/api/v1`

All request bodies are JSON (`Content-Type: application/json`).
All responses are JSON. Dates are ISO 8601 strings (`2026-05-26T14:30:00`).

The server exposes a REST API for everything that doesn't need to be live
(CRUD, reports) and a single WebSocket channel for live state push and
remote control. ESP32 stopwatches and the React dashboard both use the same
endpoints.

### Authentication

The dashboard can be locked with a password (Settings → Dashboard password).
Until one is set, every endpoint is open. Once it is set, every endpoint
answers `401 {"error": "login required"}` without a session cookie, **except**
the ones the ESP32 uses, which stay open so devices need no credentials:

`GET /clients`, `GET /projects`, `GET /apps`, `POST /timelogs`,
`POST /devices/heartbeat`, `GET /firmware/<token>.bin` and the WebSocket
(devices may push `state`; a `subscribe` from a browser without a session
closes the socket).

| Endpoint | Body | Notes |
|----------|------|-------|
| `GET /auth` | – | `{ "enabled": bool, "authenticated": bool }` |
| `POST /auth/login` | `{ "password": "…" }` | Sets a 30-day session cookie. Wrong password: `401` after a 1 s delay. |
| `POST /auth/logout` | – | Clears the session. |
| `PUT /auth/password` | `{ "current": "…", "new": "…" }` | Sets, changes or (with an empty `new`) removes the password. `current` is required once a password exists; `new` needs at least 6 characters. |

---

## Data model overview

```
client  ──<  project  ──<  time_log  >──  app
                                 \
                                  >──  device
```

One `time_log` row = one completed work session: **who worked, on what
project, for which client, using which app, for how long, on which device.**

### Tables

| Table | Notable columns | Cascade |
|-------|-----------------|---------|
| `client`   | `name`, `active`, `color`, `logo`, `created_at` | — |
| `project`  | `name`, `client_id`, `active`, `color`, `logo`, `completed`, `completed_at` | deleted when client is deleted |
| `app`      | `name`, `category`, `icon`, `color`, `logo`, `is_builtin`, `hourly_rate`, `active` | — |
| `device`   | `hardware_id`, `label`, `last_seen` | — |
| `time_log` | `device_id`, `client_id`, `project_id`, `app_id`, `start_timestamp`, `duration_seconds`, `notes`, `status`, `synced_at` | `client_id`/`project_id` delete cascades; `app_id`/`device_id` are nullable and kept on delete |

---

## Clients

### `GET /clients`

Returns all clients ordered by name.

```json
[
  {
    "id": 1,
    "name": "Acme Corp",
    "active": true,
    "color": "#FF8000",
    "logo": null,
    "created_at": "2026-05-01T10:00:00"
  }
]
```

### `POST /clients`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | string | yes | — |
| `active` | boolean | no | `true` |
| `color` | string `#RRGGBB` | no | `#FF8000` |
| `logo` | data URL string | no | `null` |

Returns `201` with the created object.

### `PUT /clients/<id>`

Any subset of `name`, `active`, `color`, `logo`. Returns the updated object.

### `DELETE /clients/<id>`

Cascades: all projects and time logs for this client are also deleted.
`204 No Content`.

---

## Projects

### `GET /projects?client_id=<id>`

**Active** projects only — what the ESP32 consumes when building the
project picker.

```json
[
  {
    "id": 7,
    "client_id": 3,
    "client_name": "Acme Corp",
    "client_color": "#FF8000",
    "client_logo": null,
    "name": "Website Redesign",
    "active": true,
    "color": "#2D8CFF",
    "logo": null,
    "completed": false,
    "completed_at": null,
    "created_at": "2026-05-10T09:00:00"
  }
]
```

### `GET /projects/all?client_id=<id>`

Every project including inactive and completed ones, each with two extra
fields: `budget_hours` (planned hours, `null` = no budget) and
`tracked_seconds` (total logged time).

All projects (active **and** inactive). Dashboard only.

### `POST /projects`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | string | yes | — |
| `client_id` | integer | yes | — |
| `active` | boolean | no | `true` |
| `color` | hex | no | `#FF8000` |
| `logo` | data URL | no | `null` |

Returns `201`.

### `PUT /projects/<id>`

`POST /projects` and `PUT /projects/<id>` accept `budget_hours` (number ≥ 0;
`null`, `""` or `0` removes the budget).

Any subset of the create fields, plus:

| Field | Type | Notes |
|-------|------|-------|
| `completed` | boolean | When set `true` the project is auto-deactivated and `completed_at` is stamped to `now`. Setting back to `false` clears `completed_at`. |

### `GET /projects/<id>/billing`

Per-app time and earnings breakdown for one project.

```json
{
  "project_id": 7,
  "project_name": "Website Redesign",
  "total_seconds": 36000,
  "total_earnings": 950.00,
  "breakdown": [
    {
      "app_id": 2,
      "app_name": "Photoshop",
      "app_icon": "🎨",
      "app_color": "#31A8FF",
      "hourly_rate": 95.00,
      "seconds": 18000,
      "hours": 5.0,
      "earnings": 475.00
    }
  ]
}
```

The billing response also carries `client_name`, `first_log` and
`last_log` (ISO timestamps of the earliest and latest time log), used by the
dashboard's printable billing statement.

### `DELETE /projects/<id>`

Cascades all time logs for this project. `204`.

---

## Apps (a.k.a. Pricing tools)

### `GET /apps`

Active apps only, ordered by category then name. Used by the ESP32.

```json
[
  {
    "id": 2,
    "name": "Photoshop",
    "category": "Design",
    "icon": "🎨",
    "color": "#31A8FF",
    "logo": null,
    "active": true,
    "is_builtin": true,
    "hourly_rate": 95.00,
    "created_at": "2026-05-01T10:00:00"
  }
]
```

### `GET /apps/all`

All apps including inactive. Dashboard only.

### `POST /apps`

Create a **custom** (non-built-in) app.

| Field | Type | Default |
|-------|------|---------|
| `name` | string | required |
| `category` | string | `Other` |
| `icon` | string (emoji) | `🖥️` |
| `color` | hex | `#FF8000` |
| `hourly_rate` | float | `null` |
| `logo` | data URL | `null` |

### `PUT /apps/<id>`

For **built-in** apps only `active`, `hourly_rate` and `logo` can be
changed (name / category / icon / color stay locked). Custom apps accept
the full set.

### `DELETE /apps/<id>`

Returns `400` if `is_builtin`. Time logs that referenced this app keep
their `app_id` value — it's nullable, not cascaded.

---

## Time Logs

### `GET /timelogs`

List time logs, newest first. Filters:

| Param | Type | Description |
|-------|------|-------------|
| `client_id` | integer | filter by client |
| `project_id` | integer | filter by project |
| `app_id` | integer | filter by app |
| `from` | `YYYY-MM-DD` | start of date range (inclusive) |
| `to` | `YYYY-MM-DD` | end of date range (inclusive) |

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

### `POST /timelogs` — primary ESP32 endpoint

Submit a completed session.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `hardware_id` | string | no | Auto-creates a `device` row on first sight and updates `last_seen` on every submission. |
| `client_id` | integer | yes | Must exist. |
| `project_id` | integer | yes | Must exist. |
| `app_id` | integer | no | If omitted/`null`, the session is logged without an app. |
| `start_timestamp` | ISO 8601 | no | UTC preferred (trailing `Z` accepted). Defaults to server time if omitted. |
| `duration_seconds` | integer | yes | Total elapsed seconds the timer ran. |
| `notes` | string | no | Free-text memo. |
| `status` | string | no | `completed` / `pending` / `synced`. Defaults to `completed`. |

Returns `201` with the full time log object.

### `PUT /timelogs/<id>` / `DELETE /timelogs/<id>`

Edit / remove a single entry (dashboard).

---

## Devices

Devices are auto-registered the first time their `hardware_id` appears in
either a `POST /timelogs` call, a heartbeat, or a WebSocket connection.

### `GET /devices`

All known devices, most recently seen first.

```json
[
  { "id": 1, "hardware_id": "esp32_lixie_001", "label": "Studio Device", "last_seen": "2026-05-26T15:30:00" }
]
```

### `POST /devices/heartbeat`

Body: `{ "hardware_id": "esp32_lixie_001" }`. Touches `last_seen` so the
dashboard's online indicator stays accurate between time-log submissions.
First call also auto-registers the device. `204`.

### `PUT /devices/<id>`

Body `{ "label": "Studio Device" }`. Returns the updated device.

### `GET /devices/<id>/settings`

Read the currently-cached LED + display settings for one device.

```json
{
  "hardware_id":        "esp32_lixie_001",
  "color":              "#FF8000",
  "colon_color":        "#FF8000",
  "colon_linked":       true,
  "brightness":         150,
  "display_brightness": 100,
  "sleep_timeout_sec":  30,
  "sleep_on_idle":      false,
  "language":           "en",
  "pomodoro_min":       25,
  "break_min":          5,
  "reminder_min":       0,
  "night_start":        22,
  "night_end":          7,
  "night_brightness":   10,
  "online":             true
}
```

### `PUT /devices/<id>/settings`

Push new LED + display settings to a device. Any subset of fields may
be sent.

| Field | Type | Notes |
|-------|------|-------|
| `color` | `#RRGGBB` | Clock / stopwatch digit colour |
| `colon_color` | `#RRGGBB` | The two blinking colon dots (independent colour) |
| `colon_linked` | boolean | When `true` the colon colour automatically mirrors `color`; PUTting `colon_color` without an explicit `colon_linked` flips it to `false` |
| `brightness` | `0..255` | LED matrix brightness (single global FastLED setting) |
| `display_brightness` | `0..100` | Nextion backlight, in percent. `0` turns the backlight all the way off (controller still responds to commands). |
| `sleep_timeout_sec` | `0..65535` | Seconds of inactivity before the touch display dims to the icon-only sleep view. `0` disables auto-sleep entirely. |
| `sleep_on_idle` | boolean | When `true`, the sleep timeout also applies to the idle / home screen (coffee-cup icon). When `false`, sleep only triggers from the running session view. |
| `pomodoro_min` | `0..120` | Pomodoro focus block in minutes; `0` turns pomodoro off. The LEDs count down each block, then the session auto-pauses for the break. |
| `break_min` | `1..60` | Break length after each focus block. |
| `reminder_min` | `0..480` | Minutes on the home screen without a touch before the "Forgot to start?" prompt (LEDs blink). `0` = off. Suppressed during night mode. |
| `night_start`, `night_end` | `0..23` | Local hours of the night window (may wrap past midnight). Equal values turn night mode off. |
| `night_brightness` | `0..255` | LED brightness inside the night window (`0` = LEDs off). Normal brightness returns while a session runs. |
| `language` | `"en"` \| `"de"` | UI language of the Nextion touch screen. Also switchable on the device itself (Settings → Language); the device reports its current language in every state push and the server adopts that value, so the two never fight. |

The dashboard-only `colon_linked` flag is stripped before pushing to the
device — the firmware only ever sees `{type:"settings", color,
colon_color, brightness, display_brightness, sleep_timeout_sec,
sleep_on_idle, language}`. Settings are cached server-side and re-sent to the
device the moment it next connects.

Response includes the merged state plus `delivered: true|false`
(`false` = device is currently offline; the cached value will be replayed
on reconnect).

### `POST /devices/<id>/ota`

Tell a connected device to install the firmware uploaded via
`POST /firmware`. The device keeps the request until no session is running,
downloads `GET /firmware/<token>.bin`, verifies it against the `x-MD5`
header and reboots into it. Returns `{ "delivered": bool }` (`false` =
offline, nothing queued). Progress shows up as `ota_status` in the device's
state push.

### `POST /devices/<id>/remote/touch`

Inject a synthetic Nextion touch — used by the Remote Control modal in
the dashboard to operate the device as if you were tapping the physical
screen.

Body:

```json
{ "x": 200, "y": 120, "pressed": true }
```

| Field | Type | Range / default |
|-------|------|-----------------|
| `x` | integer | `0..399` (matches device screen) |
| `y` | integer | `0..239` |
| `pressed` | boolean | default `true` (the firmware acts on press, ignores release) |

Response `{ "delivered": true|false }` — `false` means the device was
offline and the touch was dropped (not queued).

### `DELETE /devices/<id>`

Remove the device row. Time logs from this device keep their `device_id`
(orphaned reference, kept for history).

---

## Server settings, backup, firmware

### `GET /settings` / `PUT /settings`

`{ "currency": "EUR" }` — ISO 4217 code used for rates, earnings and
statements. Amounts are stored as plain numbers and never converted.

### `GET /backup`

Downloads a consistent snapshot of the SQLite database
(`lixie-backup-YYYYMMDD-HHMM.db`).

### `POST /backup`

Multipart upload (`file`). The file must be a SQLite database that passes
`PRAGMA integrity_check` and contains the `client`, `project` and `time_log`
tables; it then **replaces all data**, including the dashboard password.

### `GET /firmware` / `POST /firmware`

`POST` takes a multipart `file`: an ESP32 app image (first byte `0xE9`,
max 4 MB — use Arduino IDE ▸ Sketch ▸ Export Compiled Binary). Only the
latest upload is kept. Both return
`{ "name", "size", "md5", "uploaded_at" }` (`GET` returns `null` before the
first upload).

### `GET /firmware/<token>.bin`

The image itself, for devices. The token changes with every upload, so the
URL can't be guessed and old links stop working.

---

## Stats

### `GET /stats`

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

Week starts on Monday. Ranges are UTC-based.

---

## Reports

All four report endpoints share the same optional filters:

| Param | Type | Description |
|-------|------|-------------|
| `from` | `YYYY-MM-DD` | start of range (inclusive) |
| `to` | `YYYY-MM-DD` | end of range (inclusive) |
| `client_id` | integer | limit to one client |
| `project_id` | integer | limit to one project |

### `GET /reports/daily`

Total tracked seconds per calendar day. Days with zero activity are not
included — the dashboard fills the gaps.

```json
[
  { "date": "2026-05-24", "seconds": 18000 },
  { "date": "2026-05-25", "seconds": 25200 }
]
```

### `GET /reports/by-client`

Total seconds and earnings per client, descending.

```json
[
  { "id": 3, "name": "Acme Corp", "color": "#FF8000", "seconds": 54000, "earnings": 1425.00 }
]
```

### `GET /reports/by-project`

Total seconds and earnings per project, descending. Includes the
`completed` flag so the dashboard can colour finished projects differently.

```json
[
  {
    "id": 7,
    "name": "Website Redesign",
    "color": "#2D8CFF",
    "completed": false,
    "client_name": "Acme Corp",
    "seconds": 36000,
    "earnings": 950.00
  }
]
```

### `GET /reports/by-app`

Total seconds per app, descending. Only apps with at least one log are
returned.

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

## Live state

### `GET /live`

A plain HTTP snapshot of every device's last-known state — useful for
cold-start renders in the dashboard before its WebSocket connection lands.

```json
[
  {
    "type": "device_state",
    "hardware_id": "esp32_lixie_001",
    "state": "running",
    "screen": "running",
    "paused": false,
    "elapsed_seconds": 1234,
    "client_id": 3, "client_name": "Acme Corp", "client_color": "#FF8000",
    "project_id": 7, "project_name": "Website Redesign", "project_color": "#2D8CFF",
    "app_id": 2, "app_name": "Photoshop",
    "category_name": "Design",
    "start_timestamp": "2026-05-26T14:00:00Z",
    "received_at": "2026-05-26T14:20:34Z"
  }
]
```

### `/api/v1/ws` — WebSocket

A single bidirectional channel used by both ESP32 devices and dashboards.

**Device → server (state push)**

The device sends a state message immediately on every state-or-screen
change, then every 1 s while active and every 5 s while idle.

```json
{
  "type": "state",
  "hardware_id": "esp32_lixie_001",
  "state": "running",
  "screen": "running",
  "paused": false,
  "elapsed_seconds": 1234,
  "language": "en",
  "fw": "1.1.0",
  "queued": 0,
  "ota_status": "waiting",
  "client_id": 3, "client_name": "Acme Corp", "client_color": "#FF8000",
  "project_id": 7, "project_name": "Website Redesign", "project_color": "#2D8CFF",
  "app_id": 2, "app_name": "Photoshop",
  "category_name": "Design",
  "start_timestamp": "2026-05-26T14:00:00Z",

  /* Screen-specific extras filled by the firmware so the dashboard can
     mirror the device's screen faithfully without a side fetch. */
  "weather":       { "city": "Bratislava", "temp_c": 23.2, "condition": "Partly cloudy" },
  "news_headline": "* Top story...",
  "idle_date":     "26.05.2026",
  "list_rows":     [ { "name": "Acme Corp", "color": "#FF8000" } ],
  "list_offset":   0,
  "list_count":    7,
  "toast_message": "Saved",
  "pomo_phase":    "focus",
  "pomo_left":     742
}
```

The `screen` string is one of
`boot | idle | client | project | category | app | running | confirm |
discard_confirm | settings | toast | sleep | reminder` (matching the device's
internal screen enum). On the `category` and `app` screens the `list_*`
extras carry the category list (or the in-category app list)
respectively, so the dashboard mirror can render the same rows the
device is showing.

The `project_color`, `category_name`, `weather`, `news_headline`,
`idle_date`, `list_*` and `toast_message` keys are only present when
their corresponding context is active (e.g. `category_name` shows up
once the user has picked a category; `idle_date` only on the idle
screen). `screen: "sleep"` keeps the underlying `state` value
(`running` / `paused` / `idle`) so dashboards still know what the
session is doing while the touch panel is dimmed.

`fw` is the firmware version (`FW_VERSION` in `config.h`). `queued` is the
number of sessions saved on the device while the server was unreachable;
they are re-sent once a minute while the device is idle. `ota_status` is
only present after an update request: `"waiting"` (held until no session
runs) or `"failed"`. `pomo_phase` (`focus` / `break` / `break_over`) and
`pomo_left` (seconds) appear on the running screen while pomodoro is on.

`language` (`"en"` / `"de"`) is the UI language the touch screen is
currently showing. The dashboard's remote-control mirror uses it to
render its labels in the same language, and `weather.condition` is
already localized by the firmware.

**Dashboard → server (subscribe)**

```json
{ "type": "subscribe" }
```

The server then broadcasts every device-state push it receives to all
subscribed dashboards, re-typed as `device_state`:

```json
{
  "type": "device_state",
  "hardware_id": "esp32_lixie_001",
  /* ...identical payload to the device push above... */
  "received_at": "2026-05-26T14:20:34Z"
}
```

The first device-state message after a (re)connect also triggers a replay
of any cached settings (`color`, `colon_color`, `brightness`,
`display_brightness`, `sleep_timeout_sec`, `sleep_on_idle`, `language`)
so a dashboard-driven setting survives the device dropping offline.

**Server → device (control)**

```json
{
  "type":               "settings",
  "color":              "#FF8000",
  "colon_color":        "#FF8000",
  "brightness":         150,
  "display_brightness": 100,
  "sleep_timeout_sec":  30,
  "sleep_on_idle":      false,
  "language":           "de",
  "pomodoro_min":       25,
  "break_min":          5,
  "reminder_min":       30,
  "night_start":        22,
  "night_end":          7,
  "night_brightness":   10
}
{ "type": "remote_touch", "x": 200, "y": 120, "pressed": true }
{ "type": "ota", "path": "/firmware/<token>.bin" }
```

A `settings` payload may include any subset of the keys above; the
firmware applies only the keys present. These are sent in response to
`PUT /devices/<id>/settings` and `POST /devices/<id>/remote/touch`
respectively.

---

## Error responses

```json
{ "error": "name is required" }
```

| Status | When |
|--------|------|
| `400` | Missing required field, invalid reference, bad colour / coordinate / brightness range |
| `404` | Record not found for the given ID |
| `500` | Unexpected server error |
