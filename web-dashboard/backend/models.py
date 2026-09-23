from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Pre-seeded built-in application catalog
BUILTIN_APPS = [
    # Design
    {'name': 'Photoshop',     'category': 'Design',        'icon': '🎨', 'color': '#31A8FF'},
    {'name': 'Illustrator',   'category': 'Design',        'icon': '✏️',  'color': '#FF9A00'},
    {'name': 'InDesign',      'category': 'Design',        'icon': '📐', 'color': '#FF3366'},
    {'name': 'Figma',         'category': 'Design',        'icon': '🔵', 'color': '#F24E1E'},
    {'name': 'Sketch',        'category': 'Design',        'icon': '💎', 'color': '#F7B500'},
    {'name': 'Canva',         'category': 'Design',        'icon': '🖼️',  'color': '#00C4CC'},
    {'name': 'AutoCAD',       'category': 'Design',        'icon': '📏', 'color': '#E51837'},
    # 3D / Video
    {'name': 'Blender',       'category': '3D / Video',    'icon': '🌀', 'color': '#F5792A'},
    {'name': 'Lightroom',     'category': '3D / Video',    'icon': '📷', 'color': '#31A8FF'},
    {'name': 'Premiere Pro',  'category': '3D / Video',    'icon': '🎬', 'color': '#9999FF'},
    {'name': 'After Effects', 'category': '3D / Video',    'icon': '💫', 'color': '#9999FF'},
    # Office
    {'name': 'Word',          'category': 'Office',        'icon': '📝', 'color': '#2B579A'},
    {'name': 'Excel',         'category': 'Office',        'icon': '📊', 'color': '#217346'},
    {'name': 'PowerPoint',    'category': 'Office',        'icon': '📈', 'color': '#D24726'},
    {'name': 'Outlook',       'category': 'Office',        'icon': '📧', 'color': '#0078D4'},
    {'name': 'OneNote',       'category': 'Office',        'icon': '📓', 'color': '#7719AA'},
    {'name': 'Acrobat',       'category': 'Office',        'icon': '📄', 'color': '#FF0000'},
    # Development
    {'name': 'VS Code',       'category': 'Development',   'icon': '💻', 'color': '#007ACC'},
    {'name': 'GitHub',        'category': 'Development',   'icon': '🐙', 'color': '#6E40C9'},
    # Communication
    {'name': 'Teams',         'category': 'Communication', 'icon': '💬', 'color': '#6264A7'},
    {'name': 'Slack',         'category': 'Communication', 'icon': '🟣', 'color': '#4A154B'},
    {'name': 'Zoom',          'category': 'Communication', 'icon': '📹', 'color': '#2D8CFF'},
    {'name': 'Meeting',       'category': 'Communication', 'icon': '🤝', 'color': '#00A2ED'},
    {'name': 'Email',         'category': 'Communication', 'icon': '📩', 'color': '#0078D4'},
    # Productivity
    {'name': 'Notion',        'category': 'Productivity',  'icon': '📋', 'color': '#37352F'},
    {'name': 'Research',      'category': 'Productivity',  'icon': '🔍', 'color': '#34A853'},
    {'name': 'Planning',      'category': 'Productivity',  'icon': '📅', 'color': '#FBBC04'},
    # Other
    {'name': 'Browser',       'category': 'Other',         'icon': '🌐', 'color': '#4285F4'},
]


class Client(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)
    color = db.Column(db.String(7), default='#FF8000', nullable=False)
    logo = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    projects = db.relationship('Project', backref='client', cascade='all, delete-orphan', lazy='select')
    timelogs = db.relationship('TimeLog', backref='client', cascade='all, delete-orphan', lazy='select')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'active': self.active,
            'color': self.color,
            'logo': self.logo,
            'created_at': self.created_at.isoformat(),
        }


class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey('client.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)
    color = db.Column(db.String(7), default='#FF8000', nullable=False)
    logo = db.Column(db.Text, nullable=True)
    completed = db.Column(db.Boolean, default=False, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)
    budget_hours = db.Column(db.Float, nullable=True)   # planned hours; None = no budget
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    timelogs = db.relationship('TimeLog', backref='project', cascade='all, delete-orphan', lazy='select')

    def to_dict(self):
        return {
            'id': self.id,
            'client_id': self.client_id,
            'client_name': self.client.name if self.client else None,
            'client_color': self.client.color if self.client else None,
            'client_logo': self.client.logo if self.client else None,
            'name': self.name,
            'active': self.active,
            'completed': self.completed,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'color': self.color,
            'logo': self.logo,
            'budget_hours': self.budget_hours,
            'created_at': self.created_at.isoformat(),
        }


class App(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(100), default='Other', nullable=False)
    icon = db.Column(db.String(10), default='🖥️', nullable=False)
    color = db.Column(db.String(7), default='#FF8000', nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)
    is_builtin = db.Column(db.Boolean, default=False, nullable=False)
    hourly_rate = db.Column(db.Float, nullable=True)
    logo = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    timelogs = db.relationship('TimeLog', backref='app', lazy='select')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'icon': self.icon,
            'color': self.color,
            'active': self.active,
            'is_builtin': self.is_builtin,
            'hourly_rate': self.hourly_rate,
            'logo': self.logo,
            'created_at': self.created_at.isoformat(),
        }


class Device(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    hardware_id = db.Column(db.String(100), unique=True, nullable=False)
    label = db.Column(db.String(200))
    last_seen = db.Column(db.DateTime)

    timelogs = db.relationship('TimeLog', backref='device', lazy='select')

    def to_dict(self):
        return {
            'id': self.id,
            'hardware_id': self.hardware_id,
            'label': self.label,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
        }


class TimeLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey('device.id'), nullable=True)
    client_id = db.Column(db.Integer, db.ForeignKey('client.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    app_id = db.Column(db.Integer, db.ForeignKey('app.id'), nullable=True)
    start_timestamp = db.Column(db.DateTime, nullable=False)
    duration_seconds = db.Column(db.Integer, nullable=False)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), default='completed', nullable=False)
    synced_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'device_id': self.device_id,
            'hardware_id': self.device.hardware_id if self.device else None,
            'device_label': self.device.label if self.device else None,
            'client_id': self.client_id,
            'client_name': self.client.name if self.client else None,
            'project_id': self.project_id,
            'project_name': self.project.name if self.project else None,
            'app_id': self.app_id,
            'app_name': self.app.name if self.app else None,
            'app_icon': self.app.icon if self.app else None,
            'app_color': self.app.color if self.app else None,
            'start_timestamp': self.start_timestamp.isoformat(),
            'duration_seconds': self.duration_seconds,
            'notes': self.notes,
            'status': self.status,
            'synced_at': self.synced_at.isoformat(),
        }


class AppSetting(db.Model):
    """Server-wide key/value settings (dashboard password hash, currency,
    uploaded firmware metadata)."""
    key = db.Column(db.String(64), primary_key=True)
    value = db.Column(db.Text, nullable=True)
