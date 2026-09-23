// Header for server communication.
// Defines the Entity structure (id, name, color, extra info) and
// functions to fetch lists (clients, projects, apps) and post a timelog.
// ============================================================================

#ifndef API_H
#define API_H

#include <Arduino.h>

// Simple POD for list items the UI needs to render and remember.
struct Entity {
    int     id;
    String  name;
    String  color;   // "#RRGGBB"
    String  extra;   // icon (apps) or client_name (projects) — context-dependent
};

#define MAX_ENTITIES 24

namespace Api {

// GET /clients — returns count, or -1 on error.
int fetchClients(Entity* out, int max);

// GET /projects?client_id=...
int fetchProjects(int clientId, Entity* out, int max);

// GET /apps
int fetchApps(Entity* out, int max);

// POST /timelogs. start_ts is ISO 8601 UTC (e.g. "2026-05-28T14:00:00Z").
// app_id < 0 means "no app". Returns the HTTP status (2xx = saved), or a
// value <= 0 when the server could not be reached at all.
int postTimelog(int clientId, int projectId, int appId,
                const String& start_ts, uint32_t duration_seconds);

// True when a postTimelog() result is worth retrying later (no network,
// timeout, server error). 4xx means the server rejected the data itself.
inline bool isRetryable(int httpCode) { return httpCode <= 0 || httpCode >= 500; }

// Offline queue, persisted in NVS. queueTimelog() returns false when the
// queue is full (OFFLINE_QUEUE_MAX). flushQueue() re-sends queued sessions
// in order and stops at the first one the server can't take yet.
bool queueTimelog(int clientId, int projectId, int appId,
                  const String& start_ts, uint32_t duration_seconds);
int  queuedCount();
void flushQueue();

// POST /devices/heartbeat — keeps the dashboard's "Online" status truthful
// in the gaps between time-log submissions.
bool sendHeartbeat();

}  // namespace Api

#endif
