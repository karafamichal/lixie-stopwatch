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
// app_id < 0 means "no app".
bool postTimelog(int clientId, int projectId, int appId,
                 const String& start_ts, uint32_t duration_seconds);

// POST /devices/heartbeat — keeps the dashboard's "Online" status truthful
// in the gaps between time-log submissions.
bool sendHeartbeat();

}  // namespace Api

#endif
