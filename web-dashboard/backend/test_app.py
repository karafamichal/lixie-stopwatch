"""Smoke test for the backend API.

Runs against a throw-away copy of the backend in a temp dir, so it never
touches the real instance/lixie.db:

    python test_app.py
"""
import io
import os
import shutil
import sys
import tempfile

here = os.path.dirname(os.path.abspath(__file__))
tmp = tempfile.mkdtemp()
for f in ('app.py', 'models.py'):
    shutil.copy(os.path.join(here, f), tmp)
sys.path.insert(0, tmp)

from app import create_app  # noqa: E402


def main():
    c = create_app().test_client()

    # Open until a password is set.
    assert c.get('/api/v1/auth').json == {'enabled': False, 'authenticated': True}
    cl = c.post('/api/v1/clients', json={'name': 'Acme'}).json

    # Budget + tracked time.
    p = c.post('/api/v1/projects', json={'name': 'Site', 'client_id': cl['id'], 'budget_hours': 10}).json
    assert p['budget_hours'] == 10
    c.post('/api/v1/timelogs', json={'client_id': cl['id'], 'project_id': p['id'],
                                     'duration_seconds': 5400, 'hardware_id': 'esp_t'})
    row = c.get('/api/v1/projects/all').json[0]
    assert row['tracked_seconds'] == 5400, row
    bill = c.get(f"/api/v1/projects/{p['id']}/billing").json
    assert bill['client_name'] == 'Acme' and bill['total_seconds'] == 5400 and bill['first_log']
    assert c.put(f"/api/v1/projects/{p['id']}", json={'budget_hours': -1}).status_code == 400
    assert c.put(f"/api/v1/projects/{p['id']}", json={'budget_hours': ''}).json['budget_hours'] is None

    # Device settings validation.
    dev = c.get('/api/v1/devices').json[0]
    r = c.put(f"/api/v1/devices/{dev['id']}/settings", json={'pomodoro_min': 25, 'night_start': 22, 'night_end': 6})
    assert r.status_code == 200 and r.json['pomodoro_min'] == 25 and r.json['delivered'] is False
    assert c.put(f"/api/v1/devices/{dev['id']}/settings", json={'night_start': 24}).status_code == 400
    assert c.get(f"/api/v1/devices/{dev['id']}/settings").json['night_end'] == 6

    # Currency.
    assert c.put('/api/v1/settings', json={'currency': 'usd'}).json['currency'] == 'USD'
    assert c.put('/api/v1/settings', json={'currency': 'dollars'}).status_code == 400

    # Backup, change something, restore.
    backup = c.get('/api/v1/backup')
    assert backup.status_code == 200 and backup.data.startswith(b'SQLite format 3')
    c.post('/api/v1/clients', json={'name': 'Temp'})
    assert len(c.get('/api/v1/clients').json) == 2
    r = c.post('/api/v1/backup', data={'file': (io.BytesIO(backup.data), 'b.db')},
               content_type='multipart/form-data')
    assert r.status_code == 200, r.json
    assert [x['name'] for x in c.get('/api/v1/clients').json] == ['Acme']
    bad = c.post('/api/v1/backup', data={'file': (io.BytesIO(b'hello'), 'b.db')},
                 content_type='multipart/form-data')
    assert bad.status_code == 400

    # Firmware upload + tokenised download.
    assert c.post('/api/v1/firmware', data={'file': (io.BytesIO(b'nope'), 'x.bin')},
                  content_type='multipart/form-data').status_code == 400
    bootloader = b'\xe9' + b'\x00' * 31 + b'\x50\x00\x00\x00' + b'\x00' * 988
    assert c.post('/api/v1/firmware', data={'file': (io.BytesIO(bootloader), 'x.bootloader.bin')},
                  content_type='multipart/form-data').status_code == 400
    img = b'\xe9' + b'\x00' * 31 + b'\x32\x54\xcd\xab' + b'\x00' * 988
    info = c.post('/api/v1/firmware', data={'file': (io.BytesIO(img), 'fw.bin')},
                  content_type='multipart/form-data').json
    assert info['size'] == 1024
    assert c.get('/api/v1/firmware/wrong.bin').status_code == 404

    # Password on: dashboard endpoints lock, device endpoints stay open.
    assert c.put('/api/v1/auth/password', json={'new': '123'}).status_code == 400
    assert c.put('/api/v1/auth/password', json={'new': 'secret1'}).json['enabled'] is True
    c.post('/api/v1/auth/logout')
    assert c.get('/api/v1/stats').status_code == 401
    assert c.get('/api/v1/backup').status_code == 401
    assert c.get('/api/v1/clients').status_code == 200            # ESP32 picker
    assert c.post('/api/v1/devices/heartbeat', json={'hardware_id': 'esp_t'}).status_code == 204
    assert c.post('/api/v1/auth/login', json={'password': 'wrong'}).status_code == 401
    assert c.post('/api/v1/auth/login', json={'password': 'secret1'}).json['authenticated']
    assert c.get('/api/v1/stats').status_code == 200
    # Changing the password needs the current one; empty new removes it.
    assert c.put('/api/v1/auth/password', json={'current': 'x', 'new': ''}).status_code == 400
    assert c.put('/api/v1/auth/password', json={'current': 'secret1', 'new': ''}).json['enabled'] is False

    print('all backend checks passed')


if __name__ == '__main__':
    try:
        main()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
