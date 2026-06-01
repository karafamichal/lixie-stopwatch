import os
import json
import threading
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory, abort
from flask_cors import CORS
from flask_sock import Sock
from sqlalchemy import text, inspect as sa_inspect
from models import db, Client, Project, App, Device, TimeLog, BUILTIN_APPS


# ─── Real-time hub ───────────────────────────────────────────────────────────
# In-memory: snapshot of every device's current state + the set of dashboards
# subscribed to live updates. Single-worker deployment assumed (see README /
# service file). For multi-worker scaling, swap this for a Redis pub/sub.
_live_lock        = threading.Lock()
_live_states      = {}    # hardware_id -> last state dict
_live_subscribers = set() # subscriber WebSocket handles (dashboards)
_device_sockets   = {}    # hardware_id -> active device WebSocket handle
_device_settings  = {}    # hardware_id -> {"color": "#RRGGBB", "brightness": int}


def _broadcast(payload: str):
    """Send a serialized JSON string to every dashboard subscriber.
    Dead sockets are silently dropped from the set.
    """
    dead = []
    with _live_lock:
        targets = list(_live_subscribers)
    for ws in targets:
        try:
            ws.send(payload)
        except Exception:
            dead.append(ws)
    if dead:
        with _live_lock:
            for d in dead:
                _live_subscribers.discard(d)


def _send_to_device(hw_id: str, payload: dict) -> bool:
    """Push a JSON payload to a specific device's WebSocket. Returns True if
    the device is currently online; False otherwise (caller can choose to
    cache the payload for the next reconnect).
    """
    with _live_lock:
        ws = _device_sockets.get(hw_id)
    if ws is None:
        return False
    try:
        ws.send(json.dumps(payload))
        return True
    except Exception:
        with _live_lock:
            if _device_sockets.get(hw_id) is ws:
                _device_sockets.pop(hw_id, None)
        return False


def _migrate(app):
    """Add new columns to existing tables without losing data."""
    with app.app_context():
        inspector = sa_inspect(db.engine)
        existing_tables = inspector.get_table_names()

        def cols(table):
            if table not in existing_tables:
                return set()
            return {c['name'] for c in inspector.get_columns(table)}

        pending = []

        if 'client' in existing_tables:
            if 'color' not in cols('client'):
                pending.append("ALTER TABLE client ADD COLUMN color VARCHAR(7) NOT NULL DEFAULT '#FF8000'")

        if 'project' in existing_tables:
            if 'color' not in cols('project'):
                pending.append("ALTER TABLE project ADD COLUMN color VARCHAR(7) NOT NULL DEFAULT '#FF8000'")
            if 'completed' not in cols('project'):
                pending.append('ALTER TABLE project ADD COLUMN completed BOOLEAN NOT NULL DEFAULT 0')
            if 'completed_at' not in cols('project'):
                pending.append('ALTER TABLE project ADD COLUMN completed_at DATETIME')

        if 'app' in existing_tables:
            if 'hourly_rate' not in cols('app'):
                pending.append('ALTER TABLE app ADD COLUMN hourly_rate REAL')
            if 'logo' not in cols('app'):
                pending.append('ALTER TABLE app ADD COLUMN logo TEXT')

        for tbl in ('client', 'project'):
            if tbl in existing_tables:
                if 'logo' not in cols(tbl):
                    pending.append(f'ALTER TABLE {tbl} ADD COLUMN logo TEXT')

        if 'time_log' in existing_tables:
            if 'app_id' not in cols('time_log'):
                pending.append('ALTER TABLE time_log ADD COLUMN app_id INTEGER REFERENCES app(id)')
            if 'notes' not in cols('time_log'):
                pending.append('ALTER TABLE time_log ADD COLUMN notes TEXT')

        if pending:
            with db.engine.connect() as conn:
                for stmt in pending:
                    conn.execute(text(stmt))
                conn.commit()


def _seed_apps(app):
    """Insert built-in apps that don't exist yet."""
    with app.app_context():
        existing = {a.name for a in App.query.filter_by(is_builtin=True).all()}
        new_apps = [
            App(
                name=d['name'],
                category=d['category'],
                icon=d['icon'],
                color=d['color'],
                is_builtin=True,
            )
            for d in BUILTIN_APPS
            if d['name'] not in existing
        ]
        if new_apps:
            db.session.add_all(new_apps)
            db.session.commit()


def create_app():
    basedir = os.path.abspath(os.path.dirname(__file__))
    static_dir = os.path.join(basedir, 'static')

    # static_folder=None disables Flask's built-in static handler so our
    # SPA catch-all route runs for every non-API path instead of getting a 404.
    app = Flask(__name__, static_folder=None)
    app.config['SQLALCHEMY_DATABASE_URI'] = (
        'sqlite:///' + os.path.join(basedir, 'instance', 'nixie.db')
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    CORS(app, resources={r'/api/*': {'origins': '*'}})
    db.init_app(app)
    sock = Sock(app)

    with app.app_context():
        os.makedirs(os.path.join(basedir, 'instance'), exist_ok=True)
        db.create_all()

    _migrate(app)
    _seed_apps(app)

    # ── Clients ──────────────────────────────────────────────────────────────

    @app.route('/api/v1/clients', methods=['GET'])
    def get_clients():
        clients = Client.query.order_by(Client.name).all()
        return jsonify([c.to_dict() for c in clients])

    @app.route('/api/v1/clients', methods=['POST'])
    def create_client():
        data = request.get_json() or {}
        if not data.get('name', '').strip():
            abort(400, description='name is required')
        client = Client(
            name=data['name'].strip(),
            active=data.get('active', True),
            color=data.get('color', '#FF8000'),
            logo=data.get('logo'),
        )
        db.session.add(client)
        db.session.commit()
        return jsonify(client.to_dict()), 201

    @app.route('/api/v1/clients/<int:cid>', methods=['PUT'])
    def update_client(cid):
        client = db.get_or_404(Client, cid)
        data = request.get_json() or {}
        if 'name' in data:
            client.name = data['name'].strip()
        if 'active' in data:
            client.active = bool(data['active'])
        if 'color' in data:
            client.color = data['color']
        if 'logo' in data:
            client.logo = data['logo']
        db.session.commit()
        return jsonify(client.to_dict())

    @app.route('/api/v1/clients/<int:cid>', methods=['DELETE'])
    def delete_client(cid):
        client = db.get_or_404(Client, cid)
        db.session.delete(client)
        db.session.commit()
        return '', 204

    # ── Projects ─────────────────────────────────────────────────────────────

    @app.route('/api/v1/projects', methods=['GET'])
    def get_projects():
        client_id = request.args.get('client_id', type=int)
        q = Project.query
        if client_id:
            q = q.filter_by(client_id=client_id, active=True)
        return jsonify([p.to_dict() for p in q.order_by(Project.name).all()])

    @app.route('/api/v1/projects/all', methods=['GET'])
    def get_all_projects():
        client_id = request.args.get('client_id', type=int)
        q = Project.query
        if client_id:
            q = q.filter_by(client_id=client_id)
        return jsonify([p.to_dict() for p in q.order_by(Project.name).all()])

    @app.route('/api/v1/projects', methods=['POST'])
    def create_project():
        data = request.get_json() or {}
        if not data.get('name', '').strip() or not data.get('client_id'):
            abort(400, description='name and client_id are required')
        project = Project(
            name=data['name'].strip(),
            client_id=int(data['client_id']),
            active=data.get('active', True),
            color=data.get('color', '#FF8000'),
            logo=data.get('logo'),
        )
        db.session.add(project)
        db.session.commit()
        return jsonify(project.to_dict()), 201

    @app.route('/api/v1/projects/<int:pid>', methods=['PUT'])
    def update_project(pid):
        project = db.get_or_404(Project, pid)
        data = request.get_json() or {}
        if 'name' in data:
            project.name = data['name'].strip()
        if 'active' in data:
            project.active = bool(data['active'])
        if 'client_id' in data:
            project.client_id = int(data['client_id'])
        if 'color' in data:
            project.color = data['color']
        if 'logo' in data:
            project.logo = data['logo']
        if 'completed' in data:
            val = bool(data['completed'])
            if val and not project.completed:
                project.completed = True
                project.active = False
                project.completed_at = datetime.utcnow()
            elif not val:
                project.completed = False
                project.completed_at = None
        db.session.commit()
        return jsonify(project.to_dict())

    @app.route('/api/v1/projects/<int:pid>/billing', methods=['GET'])
    def project_billing(pid):
        project = db.get_or_404(Project, pid)
        rows = db.session.query(
            App.id,
            App.name,
            App.icon,
            App.color,
            App.hourly_rate,
            db.func.sum(TimeLog.duration_seconds).label('seconds'),
        ).select_from(TimeLog).outerjoin(
            App, TimeLog.app_id == App.id
        ).filter(TimeLog.project_id == pid).group_by(
            App.id, App.name, App.icon, App.color, App.hourly_rate
        ).all()

        total_seconds = db.session.query(
            db.func.coalesce(db.func.sum(TimeLog.duration_seconds), 0)
        ).filter(TimeLog.project_id == pid).scalar()

        breakdown = []
        total_earnings = 0.0
        for r in rows:
            hours = (r.seconds or 0) / 3600.0
            earnings = round(hours * r.hourly_rate, 2) if r.hourly_rate else 0.0
            total_earnings += earnings
            breakdown.append({
                'app_id': r.id,
                'app_name': r.name or 'No app',
                'app_icon': r.icon or '–',
                'app_color': r.color or '#64748b',
                'hourly_rate': r.hourly_rate,
                'seconds': int(r.seconds or 0),
                'hours': round(hours, 2),
                'earnings': earnings,
            })

        return jsonify({
            'project_id': pid,
            'project_name': project.name,
            'total_seconds': int(total_seconds or 0),
            'total_earnings': round(total_earnings, 2),
            'breakdown': breakdown,
        })

    @app.route('/api/v1/projects/<int:pid>', methods=['DELETE'])
    def delete_project(pid):
        project = db.get_or_404(Project, pid)
        db.session.delete(project)
        db.session.commit()
        return '', 204

    # ── Apps ─────────────────────────────────────────────────────────────────

    @app.route('/api/v1/apps', methods=['GET'])
    def get_apps():
        """Active apps only — used by ESP32."""
        apps = App.query.filter_by(active=True).order_by(App.category, App.name).all()
        return jsonify([a.to_dict() for a in apps])

    @app.route('/api/v1/apps/all', methods=['GET'])
    def get_all_apps():
        """All apps including inactive — used by dashboard."""
        apps = App.query.order_by(App.category, App.name).all()
        return jsonify([a.to_dict() for a in apps])

    @app.route('/api/v1/apps', methods=['POST'])
    def create_app_entry():
        data = request.get_json() or {}
        if not data.get('name', '').strip():
            abort(400, description='name is required')
        entry = App(
            name=data['name'].strip(),
            category=data.get('category', 'Other').strip(),
            icon=data.get('icon', '🖥️').strip(),
            color=data.get('color', '#FF8000'),
            hourly_rate=float(data['hourly_rate']) if data.get('hourly_rate') else None,
            logo=data.get('logo'),
            is_builtin=False,
        )
        db.session.add(entry)
        db.session.commit()
        return jsonify(entry.to_dict()), 201

    @app.route('/api/v1/apps/<int:aid>', methods=['PUT'])
    def update_app_entry(aid):
        entry = db.get_or_404(App, aid)
        data = request.get_json() or {}
        if 'active' in data:
            entry.active = bool(data['active'])
        if 'hourly_rate' in data:
            entry.hourly_rate = float(data['hourly_rate']) if data['hourly_rate'] else None
        if 'logo' in data:
            entry.logo = data['logo']
        if not entry.is_builtin:
            if 'name' in data:
                entry.name = data['name'].strip()
            if 'category' in data:
                entry.category = data['category'].strip()
            if 'icon' in data:
                entry.icon = data['icon'].strip()
            if 'color' in data:
                entry.color = data['color']
        db.session.commit()
        return jsonify(entry.to_dict())

    @app.route('/api/v1/apps/<int:aid>', methods=['DELETE'])
    def delete_app_entry(aid):
        entry = db.get_or_404(App, aid)
        if entry.is_builtin:
            abort(400, description='Built-in apps cannot be deleted. Deactivate them instead.')
        db.session.delete(entry)
        db.session.commit()
        return '', 204

    # ── Time Logs ─────────────────────────────────────────────────────────────

    @app.route('/api/v1/timelogs', methods=['GET'])
    def get_timelogs():
        client_id = request.args.get('client_id', type=int)
        project_id = request.args.get('project_id', type=int)
        app_id = request.args.get('app_id', type=int)
        from_date = request.args.get('from')
        to_date = request.args.get('to')

        q = TimeLog.query
        if client_id:
            q = q.filter_by(client_id=client_id)
        if project_id:
            q = q.filter_by(project_id=project_id)
        if app_id:
            q = q.filter_by(app_id=app_id)
        if from_date:
            q = q.filter(TimeLog.start_timestamp >= datetime.fromisoformat(from_date))
        if to_date:
            q = q.filter(TimeLog.start_timestamp < datetime.fromisoformat(to_date) + timedelta(days=1))

        logs = q.order_by(TimeLog.start_timestamp.desc()).all()
        return jsonify([l.to_dict() for l in logs])

    @app.route('/api/v1/timelogs', methods=['POST'])
    def create_timelog():
        data = request.get_json() or {}

        device = None
        hw_id = data.get('hardware_id')
        if hw_id:
            device = Device.query.filter_by(hardware_id=hw_id).first()
            if not device:
                device = Device(hardware_id=hw_id)
                db.session.add(device)
            device.last_seen = datetime.utcnow()

        client = db.session.get(Client, int(data.get('client_id', 0)))
        if not client:
            abort(400, description=f"client {data.get('client_id')} not found")
        project = db.session.get(Project, int(data.get('project_id', 0)))
        if not project:
            abort(400, description=f"project {data.get('project_id')} not found")

        app_entry = None
        if data.get('app_id'):
            app_entry = db.session.get(App, int(data['app_id']))

        raw_ts = data.get('start_timestamp')
        start_ts = (
            datetime.fromisoformat(raw_ts.replace('Z', '+00:00'))
            if raw_ts else datetime.utcnow()
        )

        log = TimeLog(
            device=device,
            client_id=client.id,
            project_id=project.id,
            app=app_entry,
            start_timestamp=start_ts,
            duration_seconds=int(data.get('duration_seconds', 0)),
            notes=(data.get('notes') or '').strip() or None,
            status=data.get('status', 'completed'),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify(log.to_dict()), 201

    @app.route('/api/v1/timelogs/<int:lid>', methods=['PUT'])
    def update_timelog(lid):
        log = db.get_or_404(TimeLog, lid)
        data = request.get_json() or {}
        if 'client_id' in data:
            log.client_id = int(data['client_id'])
        if 'project_id' in data:
            log.project_id = int(data['project_id'])
        if 'app_id' in data:
            log.app_id = int(data['app_id']) if data['app_id'] else None
        if 'duration_seconds' in data:
            log.duration_seconds = int(data['duration_seconds'])
        if 'status' in data:
            log.status = data['status']
        if 'start_timestamp' in data:
            log.start_timestamp = datetime.fromisoformat(data['start_timestamp'])
        if 'notes' in data:
            log.notes = (data['notes'] or '').strip() or None
        db.session.commit()
        return jsonify(log.to_dict())

    @app.route('/api/v1/timelogs/<int:lid>', methods=['DELETE'])
    def delete_timelog(lid):
        log = db.get_or_404(TimeLog, lid)
        db.session.delete(log)
        db.session.commit()
        return '', 204

    # ── Devices ───────────────────────────────────────────────────────────────

    @app.route('/api/v1/devices', methods=['GET'])
    def get_devices():
        devices = Device.query.order_by(Device.last_seen.desc()).all()
        return jsonify([d.to_dict() for d in devices])

    @app.route('/api/v1/devices/heartbeat', methods=['POST'])
    def device_heartbeat():
        """Touch device.last_seen so the dashboard's 'Online' check stays
        accurate between time-log submissions. Called by the ESP32 on a
        60-second cadence; first call auto-registers the device.
        """
        data = request.get_json(silent=True) or {}
        hw_id = (data.get('hardware_id') or '').strip()
        if not hw_id:
            abort(400, description="hardware_id required")
        device = Device.query.filter_by(hardware_id=hw_id).first()
        if not device:
            device = Device(hardware_id=hw_id)
            db.session.add(device)
        device.last_seen = datetime.utcnow()
        db.session.commit()
        return '', 204

    @app.route('/api/v1/devices/<int:did>', methods=['PUT'])
    def update_device(did):
        device = db.get_or_404(Device, did)
        data = request.get_json() or {}
        if 'label' in data:
            device.label = data['label']
        db.session.commit()
        return jsonify(device.to_dict())

    @app.route('/api/v1/devices/<int:did>/settings', methods=['GET', 'PUT'])
    def device_settings(did):
        """Read or push LED matrix settings to a device.

        Tracked fields:
          - color         clock / stopwatch digit colour ("#RRGGBB")
          - colon_color   the two blinking colon dots ("#RRGGBB")
          - colon_linked  when True the colon mirrors `color` automatically;
                          when False `colon_color` is user-picked
          - brightness    0..255 (single global FastLED brightness)

        Settings are cached server-side so they survive both dashboard
        refreshes and brief device disconnects — when the device next sends a
        state message we resend the latest cached values. The device sees
        only `color`, `colon_color`, `brightness` — the link flag stays here.
        """
        device = db.get_or_404(Device, did)
        hw_id  = device.hardware_id

        if request.method == 'GET':
            with _live_lock:
                cached = _device_settings.get(hw_id, {})
                online = hw_id in _device_sockets
            return jsonify({
                'hardware_id':  hw_id,
                'color':        cached.get('color'),
                'colon_color':  cached.get('colon_color'),
                'colon_linked': cached.get('colon_linked', True),
                'brightness':   cached.get('brightness'),
                'online':       online,
            })

        data = request.get_json() or {}
        update = {}

        if 'color' in data:
            c = (data['color'] or '').strip()
            if not (len(c) == 7 and c.startswith('#')):
                abort(400, description="color must be #RRGGBB")
            update['color'] = c.upper()
        if 'colon_color' in data:
            c = (data['colon_color'] or '').strip()
            if not (len(c) == 7 and c.startswith('#')):
                abort(400, description="colon_color must be #RRGGBB")
            update['colon_color'] = c.upper()
        if 'colon_linked' in data:
            update['colon_linked'] = bool(data['colon_linked'])
        if 'brightness' in data:
            try:
                b = int(data['brightness'])
            except Exception:
                abort(400, description="brightness must be an integer")
            if b < 0 or b > 255:
                abort(400, description="brightness must be 0..255")
            update['brightness'] = b
        if not update:
            abort(400, description="nothing to update")

        with _live_lock:
            merged = {**_device_settings.get(hw_id, {}), **update}
            # Linking rule: if linked, colon mirrors the digit colour. If the
            # user explicitly set a colon_color in the same request, unlink so
            # we don't immediately stomp on their choice.
            if 'colon_color' in update and 'colon_linked' not in update:
                merged['colon_linked'] = False
            if merged.get('colon_linked', True) and merged.get('color'):
                merged['colon_color'] = merged['color']
            _device_settings[hw_id] = merged

        # The device payload never includes the link flag — only the resolved
        # colours and brightness.
        device_payload = {'type': 'settings'}
        for k in ('color', 'colon_color', 'brightness'):
            if k in merged:
                device_payload[k] = merged[k]
        delivered = _send_to_device(hw_id, device_payload)
        return jsonify({
            'hardware_id': hw_id,
            **merged,
            'delivered':   delivered,
        })

    @app.route('/api/v1/devices/<int:did>', methods=['DELETE'])
    def delete_device(did):
        device = db.get_or_404(Device, did)
        db.session.delete(device)
        db.session.commit()
        return '', 204

    # ── Stats ─────────────────────────────────────────────────────────────────

    @app.route('/api/v1/stats', methods=['GET'])
    def get_stats():
        now = datetime.utcnow()
        week_start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        week_secs = db.session.query(
            db.func.coalesce(db.func.sum(TimeLog.duration_seconds), 0)
        ).filter(TimeLog.start_timestamp >= week_start).scalar()

        month_secs = db.session.query(
            db.func.coalesce(db.func.sum(TimeLog.duration_seconds), 0)
        ).filter(TimeLog.start_timestamp >= month_start).scalar()

        return jsonify({
            'clients': Client.query.count(),
            'active_clients': Client.query.filter_by(active=True).count(),
            'projects': Project.query.count(),
            'active_projects': Project.query.filter_by(active=True).count(),
            'apps': App.query.filter_by(active=True).count(),
            'timelogs': TimeLog.query.count(),
            'devices': Device.query.count(),
            'week_seconds': int(week_secs),
            'month_seconds': int(month_secs),
        })

    # ── Reports ───────────────────────────────────────────────────────────────

    def _report_filters(q, args):
        """Apply common date/client/project filters to a TimeLog query."""
        if args.get('client_id'):
            q = q.filter(TimeLog.client_id == int(args['client_id']))
        if args.get('project_id'):
            q = q.filter(TimeLog.project_id == int(args['project_id']))
        if args.get('from'):
            q = q.filter(TimeLog.start_timestamp >= datetime.fromisoformat(args['from']))
        if args.get('to'):
            q = q.filter(
                TimeLog.start_timestamp < datetime.fromisoformat(args['to']) + timedelta(days=1)
            )
        return q

    @app.route('/api/v1/reports/daily', methods=['GET'])
    def report_daily():
        q = db.session.query(
            db.func.date(TimeLog.start_timestamp).label('day'),
            db.func.sum(TimeLog.duration_seconds).label('seconds'),
        )
        q = _report_filters(q, request.args)
        rows = q.group_by('day').order_by('day').all()
        return jsonify([{'date': r.day, 'seconds': int(r.seconds)} for r in rows])

    @app.route('/api/v1/reports/by-client', methods=['GET'])
    def report_by_client():
        earnings_col = db.func.sum(
            TimeLog.duration_seconds * db.func.coalesce(App.hourly_rate, 0.0) / 3600.0
        ).label('earnings')
        q = db.session.query(
            Client.id,
            Client.name,
            Client.color,
            db.func.sum(TimeLog.duration_seconds).label('seconds'),
            earnings_col,
        ).join(TimeLog, TimeLog.client_id == Client.id
        ).outerjoin(App, TimeLog.app_id == App.id)
        q = _report_filters(q, request.args)
        rows = q.group_by(Client.id).order_by(db.desc('seconds')).all()
        return jsonify([
            {'id': r.id, 'name': r.name, 'color': r.color, 'seconds': int(r.seconds),
             'earnings': round(float(r.earnings or 0), 2)}
            for r in rows
        ])

    @app.route('/api/v1/reports/by-project', methods=['GET'])
    def report_by_project():
        earnings_col = db.func.sum(
            TimeLog.duration_seconds * db.func.coalesce(App.hourly_rate, 0.0) / 3600.0
        ).label('earnings')
        q = db.session.query(
            Project.id,
            Project.name,
            Project.color,
            Project.completed,
            Client.name.label('client_name'),
            db.func.sum(TimeLog.duration_seconds).label('seconds'),
            earnings_col,
        ).join(TimeLog, TimeLog.project_id == Project.id
        ).join(Client, Client.id == Project.client_id
        ).outerjoin(App, TimeLog.app_id == App.id)
        q = _report_filters(q, request.args)
        rows = q.group_by(Project.id).order_by(db.desc('seconds')).all()
        return jsonify([
            {
                'id': r.id, 'name': r.name, 'color': r.color, 'completed': r.completed,
                'client_name': r.client_name, 'seconds': int(r.seconds),
                'earnings': round(float(r.earnings or 0), 2),
            }
            for r in rows
        ])

    @app.route('/api/v1/reports/by-app', methods=['GET'])
    def report_by_app():
        q = db.session.query(
            App.id,
            App.name,
            App.icon,
            App.color,
            App.category,
            db.func.sum(TimeLog.duration_seconds).label('seconds'),
        ).join(TimeLog, TimeLog.app_id == App.id)
        q = _report_filters(q, request.args)
        rows = q.group_by(App.id).order_by(db.desc('seconds')).all()
        return jsonify([
            {
                'id': r.id, 'name': r.name, 'icon': r.icon,
                'color': r.color, 'category': r.category, 'seconds': int(r.seconds),
            }
            for r in rows
        ])

    # ── Live state (REST snapshot + WebSocket stream) ────────────────────────

    @app.route('/api/v1/live', methods=['GET'])
    def live_snapshot():
        """Plain HTTP snapshot of every device's current state. Useful for
        cold-start renders on the dashboard before its WS connection lands.
        """
        with _live_lock:
            return jsonify(list(_live_states.values()))

    @sock.route('/api/v1/ws')
    def ws_handler(ws):
        """Bidirectional channel.

        Devices push:
            { "type": "state", "hardware_id": "...", ...all-fields... }
        Dashboards push once on connect:
            { "type": "subscribe" }

        Server pushes to dashboards:
            { "type": "device_state", ...same shape as device push... }
        """
        role = None
        device_hw = None
        try:
            while True:
                raw = ws.receive(timeout=120)
                if raw is None:
                    break
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue

                mtype = msg.get('type')

                if mtype == 'state':
                    hw_id = (msg.get('hardware_id') or '').strip()
                    if not hw_id:
                        continue
                    first_msg = (role is None)
                    role = 'device'
                    device_hw = hw_id

                    msg['received_at'] = datetime.utcnow().isoformat() + 'Z'
                    msg['type'] = 'device_state'
                    cached_settings = None
                    with _live_lock:
                        _live_states[hw_id] = msg
                        _device_sockets[hw_id] = ws
                        cached_settings = _device_settings.get(hw_id)

                    # Keep the existing "Online" indicator working — same
                    # last_seen field the dashboard polls.
                    device = Device.query.filter_by(hardware_id=hw_id).first()
                    if not device:
                        device = Device(hardware_id=hw_id)
                        db.session.add(device)
                    device.last_seen = datetime.utcnow()
                    try:
                        db.session.commit()
                    except Exception:
                        db.session.rollback()
                    _broadcast(json.dumps(msg))

                    # If the dashboard pushed settings while this device was
                    # offline, deliver them the moment it comes back. Strip
                    # the dashboard-only `colon_linked` field — the firmware
                    # only handles resolved colours and brightness.
                    if first_msg and cached_settings:
                        payload = {'type': 'settings'}
                        for k in ('color', 'colon_color', 'brightness'):
                            if k in cached_settings:
                                payload[k] = cached_settings[k]
                        try:
                            ws.send(json.dumps(payload))
                        except Exception:
                            pass

                elif mtype == 'subscribe':
                    role = 'subscriber'
                    with _live_lock:
                        _live_subscribers.add(ws)
                        snapshot = list(_live_states.values())
                    # Replay current snapshot so the new client has every
                    # active device immediately.
                    for s in snapshot:
                        try:
                            ws.send(json.dumps(s))
                        except Exception:
                            break
        finally:
            if role == 'subscriber':
                with _live_lock:
                    _live_subscribers.discard(ws)
            if role == 'device' and device_hw:
                with _live_lock:
                    if _device_sockets.get(device_hw) is ws:
                        _device_sockets.pop(device_hw, None)

    # ── SPA fallback ──────────────────────────────────────────────────────────

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_spa(path):
        if path.startswith('api/'):
            abort(404)
        target = os.path.join(static_dir, path)
        if path and os.path.isfile(target):
            return send_from_directory(static_dir, path)
        index = os.path.join(static_dir, 'index.html')
        if not os.path.exists(index):
            return jsonify({'status': 'api running, dashboard not built yet'}), 200
        return send_from_directory(static_dir, 'index.html')

    # ── Error handlers ────────────────────────────────────────────────────────

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({'error': str(e.description)}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({'error': 'not found'}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({'error': 'internal server error'}), 500

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, host='0.0.0.0', port=5000)
