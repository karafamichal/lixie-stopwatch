// Dashboard UI language + per-browser preferences.
//
// The English text *is* the key: t('Clients') returns the German entry when
// the dashboard is set to German, otherwise the English string itself. A
// missing translation therefore falls back to English instead of breaking.
// `{name}` placeholders are filled from the second argument.
//
// Preferences live in localStorage (per browser, not per device). Changing
// the language remounts the app (see App.jsx) so every t() call re-runs.

import { useSyncExternalStore } from 'react';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
];

const DE = {
  // navigation / chrome
  'Homepage': 'Startseite',
  'Clients': 'Kunden',
  'Projects': 'Projekte',
  'Pricing': 'Preise',
  'Time Logs': 'Zeiteinträge',
  'Devices': 'Geräte',
  'Reports': 'Berichte',
  'Settings': 'Einstellungen',
  'Open navigation': 'Navigation öffnen',
  'Close navigation': 'Navigation schließen',
  'Close': 'Schließen',

  // common
  'Name': 'Name',
  'Colour': 'Farbe',
  'Status': 'Status',
  'Created': 'Erstellt',
  'Actions': 'Aktionen',
  'Active': 'Aktiv',
  'Inactive': 'Inaktiv',
  'Activate': 'Aktivieren',
  'Deactivate': 'Deaktivieren',
  'Edit': 'Bearbeiten',
  'Delete': 'Löschen',
  'Cancel': 'Abbrechen',
  'Save Changes': 'Änderungen speichern',
  'Loading…': 'Lädt…',
  'Something went wrong': 'Etwas ist schiefgelaufen',
  'Client': 'Kunde',
  'Project': 'Projekt',
  'App': 'App',
  'Device': 'Gerät',
  'Duration': 'Dauer',
  'Started': 'Gestartet',
  'Notes': 'Notizen',
  'All Clients': 'Alle Kunden',
  'All Projects': 'Alle Projekte',
  'All Apps': 'Alle Apps',
  'Select a client…': 'Kunde auswählen…',
  'Select client…': 'Kunde auswählen…',
  'Select project…': 'Projekt auswählen…',
  'Project Name': 'Projektname',
  'Active (visible on device)': 'Aktiv (auf dem Gerät sichtbar)',
  'Done': 'Fertig',
  'Completed': 'Abgeschlossen',
  'No data.': 'Keine Daten.',
  '(optional)': '(optional)',
  'completed': 'abgeschlossen',
  'pending': 'ausstehend',
  'synced': 'synchronisiert',

  // overview
  'Time Tracking Dashboard': 'Zeiterfassungs-Dashboard',
  'New Client': 'Neuer Kunde',
  'New Project': 'Neues Projekt',
  'This week': 'Diese Woche',
  'This month': 'Dieser Monat',
  '{n} hours tracked': '{n} Stunden erfasst',
  'Recent Time Logs': 'Letzte Zeiteinträge',
  'View all →': 'Alle anzeigen →',
  'No time logs yet': 'Noch keine Zeiteinträge',
  'Add Client': 'Kunde hinzufügen',
  'Select existing': 'Vorhandenen wählen',
  '+ Create new': '+ Neu anlegen',
  'New client name': 'Name des neuen Kunden',
  'Client colour': 'Kundenfarbe',
  'Create Project': 'Projekt anlegen',
  'Client name is required': 'Kundenname ist erforderlich',
  'Select or create a client': 'Kunde auswählen oder anlegen',
  'e.g. Acme Corp': 'z. B. Muster GmbH',
  'e.g. Website Redesign': 'z. B. Website-Relaunch',

  // live sessions
  'Live Sessions': 'Live-Sitzungen',
  '({n} active)': '({n} aktiv)',
  'RUNNING': 'LÄUFT',
  'PAUSED': 'PAUSIERT',
  'SELECTING': 'AUSWAHL',
  'CONFIRMING': 'BESTÄTIGUNG',
  'UNKNOWN': 'UNBEKANNT',
  'client:': 'Kunde:',
  'project:': 'Projekt:',
  'app:': 'App:',

  // clients
  'Edit Client': 'Kunde bearbeiten',
  'Delete Client': 'Kunde löschen',
  'Loading projects…': 'Projekte werden geladen…',
  'No projects for this client.': 'Keine Projekte für diesen Kunden.',
  'View all projects →': 'Alle Projekte anzeigen →',
  'No clients yet. Add one to get started.': 'Noch keine Kunden. Lege einen an, um zu starten.',
  'Delete "{name}"? All associated projects and time logs will also be deleted.':
    '„{name}“ löschen? Alle zugehörigen Projekte und Zeiteinträge werden ebenfalls gelöscht.',

  // projects
  'Add Project': 'Projekt hinzufügen',
  'Edit Project': 'Projekt bearbeiten',
  'Delete Project': 'Projekt löschen',
  'No projects found.': 'Keine Projekte gefunden.',
  'View billing': 'Abrechnung anzeigen',
  'Reopen project': 'Projekt wieder öffnen',
  'Reopen': 'Wieder öffnen',
  'Mark as completed': 'Als abgeschlossen markieren',
  'Mark as Completed': 'Als abgeschlossen markieren',
  'Billing — {name}': 'Abrechnung — {name}',
  'Complete Project — {name}': 'Projekt abschließen — {name}',
  'Calculating…': 'Wird berechnet…',
  'Failed to load billing data.': 'Abrechnungsdaten konnten nicht geladen werden.',
  'No time logs recorded for this project yet.': 'Für dieses Projekt wurden noch keine Zeiten erfasst.',
  'Hours': 'Stunden',
  'Rate': 'Satz',
  'Earned': 'Verdient',
  'Total time tracked': 'Erfasste Gesamtzeit',
  'Total earnings': 'Gesamtverdienst',
  'Delete "{name}"? All associated time logs will also be deleted.':
    '„{name}“ löschen? Alle zugehörigen Zeiteinträge werden ebenfalls gelöscht.',

  // apps / pricing
  '{a} active · {t} total · {c} custom': '{a} aktiv · {t} gesamt · {c} eigene',
  'Add Custom App': 'Eigene App hinzufügen',
  'Edit Custom App': 'Eigene App bearbeiten',
  'Edit Rate — {name}': 'Stundensatz bearbeiten — {name}',
  'Search apps…': 'Apps suchen…',
  'No apps match your filter.': 'Keine Apps entsprechen dem Filter.',
  'no rate set': 'kein Satz festgelegt',
  'no rate': 'kein Satz',
  'Built-in': 'Integriert',
  'App Name': 'App-Name',
  'Category': 'Kategorie',
  'Icon': 'Symbol',
  '(paste a single emoji)': '(ein einzelnes Emoji einfügen)',
  'Hourly Rate': 'Stundensatz',
  '(optional, for billing)': '(optional, für die Abrechnung)',
  'Logo / picture (overrides emoji)': 'Logo / Bild (ersetzt das Emoji)',
  'Add App': 'App hinzufügen',
  'Delete App': 'App löschen',
  'Cannot delete': 'Löschen nicht möglich',
  'e.g. My Tool': 'z. B. Mein Tool',
  'e.g. Design': 'z. B. Design',
  'Delete "{name}"? Time logs that used this app will keep the reference.':
    '„{name}“ löschen? Zeiteinträge mit dieser App behalten den Verweis.',
  'All': 'Alle',
  'Design': 'Design',
  '3D / Video': '3D / Video',
  'Office': 'Büro',
  'Development': 'Entwicklung',
  'Communication': 'Kommunikation',
  'Productivity': 'Produktivität',
  'Other': 'Sonstiges',

  // time logs
  'Add Entry': 'Eintrag hinzufügen',
  'Clear': 'Zurücksetzen',
  'From date': 'Von Datum',
  'To date': 'Bis Datum',
  'No time logs found.': 'Keine Zeiteinträge gefunden.',
  'Edit Time Log': 'Zeiteintrag bearbeiten',
  'Add Time Log': 'Zeiteintrag hinzufügen',
  'Delete Time Log': 'Zeiteintrag löschen',
  'Delete this time log entry? This cannot be undone.':
    'Diesen Zeiteintrag löschen? Das kann nicht rückgängig gemacht werden.',
  'Application': 'Anwendung',
  '— none —': '— keine —',
  'Time': 'Zeit',
  'Start + End time': 'Start + Ende',
  'Start + Duration': 'Start + Dauer',
  'Start time': 'Startzeit',
  'End time': 'Endzeit',
  '→ ends {t}': '→ endet {t}',
  'What was worked on…': 'Woran wurde gearbeitet…',
  'End time is required': 'Endzeit ist erforderlich',
  'End time must be after start time': 'Endzeit muss nach der Startzeit liegen',
  'Duration must be in HH:MM:SS format (e.g. 01:30:00)': 'Dauer muss im Format HH:MM:SS sein (z. B. 01:30:00)',
  'Duration must be greater than zero': 'Dauer muss größer als null sein',

  // devices
  'Devices register automatically on first time log submission':
    'Geräte registrieren sich automatisch beim ersten gesendeten Zeiteintrag',
  'Hardware ID': 'Hardware-ID',
  'Label': 'Bezeichnung',
  'Last Seen': 'Zuletzt gesehen',
  'Last seen: {t}': 'Zuletzt gesehen: {t}',
  'No devices yet. Devices appear here after the ESP32 sends its first time log.':
    'Noch keine Geräte. Geräte erscheinen hier, sobald der ESP32 seinen ersten Zeiteintrag sendet.',
  'No devices yet.': 'Noch keine Geräte.',
  'no label': 'keine Bezeichnung',
  'Online': 'Online',
  'Online (seen < 5 min ago)': 'Online (vor < 5 Min. gesehen)',
  'Touch display brightness percent': 'Helligkeit des Touch-Displays in Prozent',
  'Offline': 'Offline',
  'Remote control (mirror the display)': 'Fernsteuerung (Display spiegeln)',
  'Matrix colour & brightness': 'Matrixfarbe & Helligkeit',
  'Edit label': 'Bezeichnung bearbeiten',
  'Edit Device Label': 'Gerätebezeichnung bearbeiten',
  'e.g. Room 3 – Station A': 'z. B. Raum 3 – Platz A',
  'Save Label': 'Bezeichnung speichern',
  'Delete Device': 'Gerät löschen',
  'Remove device "{id}"? Time logs from this device are kept.':
    'Gerät „{id}“ entfernen? Zeiteinträge dieses Geräts bleiben erhalten.',
  'Matrix Settings': 'Matrix-Einstellungen',
  'Clock colour': 'Uhrfarbe',
  'Use same colour for the blinking dots': 'Gleiche Farbe für die blinkenden Punkte',
  'Colon dot colour': 'Farbe der Doppelpunkte',
  'LED matrix brightness': 'Helligkeit der LED-Matrix',
  'Low': 'Niedrig',
  'Med': 'Mittel',
  'High': 'Hoch',
  'Max': 'Max',
  'Current: {v} / 255': 'Aktuell: {v} / 255',
  'Touch display brightness': 'Helligkeit des Touch-Displays',
  'display off': 'Display aus',
  'Auto-sleep': 'Auto-Ruhezustand',
  'seconds idle before the screen shows just an icon': 'Sekunden ohne Eingabe, bis nur noch ein Symbol angezeigt wird',
  '0 disables auto-sleep. While running: stopwatch icon. While paused: coffee cup.':
    '0 deaktiviert den Ruhezustand. Laufend: Stoppuhr-Symbol. Pausiert: Kaffeetasse.',
  'Also sleep from the idle / home screen (shows the coffee cup)':
    'Auch vom Start-/Ruhebildschirm aus schlafen (zeigt die Kaffeetasse)',
  'Touch display language': 'Sprache des Touch-Displays',
  'Applies to the on-device Nextion screen only. The dashboard language is set under Settings.':
    'Gilt nur für das Nextion-Display am Gerät. Die Dashboard-Sprache wird unter Einstellungen festgelegt.',
  'Sent to device.': 'An das Gerät gesendet.',
  'Saved — device is offline, will apply on next connect.':
    'Gespeichert — Gerät ist offline, wird beim nächsten Verbinden übernommen.',
  'Failed to save': 'Speichern fehlgeschlagen',
  'Saving…': 'Speichert…',
  'Apply': 'Übernehmen',
  'Remote — {name}': 'Fernsteuerung — {name}',

  // remote display chrome
  'Device is offline.': 'Gerät ist offline.',
  'Failed to send touch': 'Berührung konnte nicht gesendet werden',
  '● live': '● live',
  '○ offline': '○ offline',
  'Screen:': 'Bildschirm:',
  'sending…': 'sendet…',
  'Reconnect the device to control it.': 'Gerät neu verbinden, um es zu steuern.',
  'Click anywhere on the screen above to send a touch to the device. The mirror re-renders within a tick after the device confirms the new screen.':
    'Irgendwo auf den Bildschirm oben klicken, um eine Berührung an das Gerät zu senden. Die Spiegelung aktualisiert sich, sobald das Gerät den neuen Bildschirm bestätigt.',

  // reports
  'Today': 'Heute',
  'Last 30d': 'Letzte 30 T.',
  'Last 90d': 'Letzte 90 T.',
  'tracked': 'erfasst',
  'earned': 'verdient',
  'Daily trend': 'Tagesverlauf',
  'No data for this period.': 'Keine Daten für diesen Zeitraum.',
  'By client — time': 'Nach Kunde — Zeit',
  'By application': 'Nach Anwendung',
  'Earnings by project (€)': 'Verdienst nach Projekt (€)',
  'Green bars = completed projects. Only projects with at least one app hourly rate set are shown.':
    'Grüne Balken = abgeschlossene Projekte. Es werden nur Projekte mit mindestens einem App-Stundensatz angezeigt.',
  'By project': 'Nach Projekt',

  // image upload / colour picker
  'Logo / picture': 'Logo / Bild',
  'Click or drag an image here': 'Klicken oder Bild hierher ziehen',
  'Upload': 'Hochladen',
  'Choose image…': 'Bild auswählen…',
  'Resized to 256 × 256': 'Wird auf 256 × 256 verkleinert',
  'Remove': 'Entfernen',
  'Custom colour': 'Eigene Farbe',
  'Custom': 'Eigene',
  'Lixie orange': 'Lixie-Orange',
  'Red-orange': 'Rotorange',
  'Red': 'Rot',
  'Gold': 'Gold',
  'Yellow': 'Gelb',
  'Lime': 'Limette',
  'Green': 'Grün',
  'Spring green': 'Frühlingsgrün',
  'Cyan': 'Cyan',
  'Sky blue': 'Himmelblau',
  'Blue': 'Blau',
  'Purple': 'Lila',
  'Magenta': 'Magenta',
  'Hot pink': 'Pink',
  'White': 'Weiß',

  // settings page
  'Dashboard preferences are stored in this browser.': 'Dashboard-Einstellungen werden in diesem Browser gespeichert.',
  'Dashboard language': 'Dashboard-Sprache',
  'The touch-display language of each device is set per device under Devices → Matrix settings.':
    'Die Sprache des Touch-Displays wird pro Gerät unter Geräte → Matrix-Einstellungen festgelegt.',
  'Start page': 'Startseite beim Öffnen',
  'Page shown when the dashboard is opened.': 'Seite, die beim Öffnen des Dashboards angezeigt wird.',
  'Show live sessions on the homepage': 'Live-Sitzungen auf der Startseite anzeigen',
};

// Strings added with login, themes, budgets, exports, backup and firmware.
const DE_MORE = {
  // login
  'Enter the dashboard password to continue.': 'Gib das Dashboard-Passwort ein, um fortzufahren.',
  'Password': 'Passwort',
  'Log in': 'Anmelden',
  'Log out': 'Abmelden',
  'Wrong password. Try again.': 'Falsches Passwort. Versuch es noch einmal.',

  // overview
  'Tracked this week': 'Diese Woche erfasst',
  '{d} this month': '{d} in diesem Monat',
  'Budgets running out': 'Budgets fast aufgebraucht',
  'Last 7 days': 'Letzte 7 Tage',
  'All projects': 'Alle Projekte',
  'Sections': 'Bereiche',
  'View all': 'Alle anzeigen',

  // live sessions
  'Focus: {t} left': 'Fokus: noch {t}',
  'Break: {t} left': 'Pause: noch {t}',
  'Break over, waiting to continue': 'Pause vorbei, wartet auf Weiter',

  // projects / budgets / statement
  'Budget': 'Budget',
  'Budget (hours)': 'Budget (Stunden)',
  'Budget used': 'Verbrauchtes Budget',
  '{used} of {budget} h ({pct} %)': '{used} von {budget} h ({pct} %)',
  'The homepage warns when a project has used 80 % of its budget.':
    'Die Startseite warnt, sobald ein Projekt 80 % seines Budgets verbraucht hat.',
  'Billing statement': 'Abrechnungsübersicht',
  'Print or save as PDF': 'Drucken oder als PDF speichern',
  'Issued {d}': 'Erstellt am {d}',
  'Work period {a} – {b}': 'Leistungszeitraum {a} – {b}',
  'Amount': 'Betrag',
  'Total': 'Summe',
  'Hours are tracked with the Lixie StopWatch and rounded to two decimals. Rows without an hourly rate are not charged.':
    'Die Stunden wurden mit der Lixie StopWatch erfasst und auf zwei Nachkommastellen gerundet. Positionen ohne Stundensatz werden nicht berechnet.',

  // reports / time logs
  'Earnings by project': 'Verdienst nach Projekt',
  'Export CSV': 'CSV exportieren',
  'Date': 'Datum',

  // devices
  'Device settings': 'Geräteeinstellungen',
  'Firmware': 'Firmware',
  '{n} waiting to sync': '{n} warten auf Sync',
  'Sessions saved on the device while the server was unreachable':
    'Sitzungen, die das Gerät gespeichert hat, während der Server nicht erreichbar war',
  'update waiting': 'Update wartet',
  'update failed': 'Update fehlgeschlagen',
  'Install uploaded firmware': 'Hochgeladene Firmware installieren',
  'Upload firmware under Settings first': 'Lade zuerst unter Einstellungen eine Firmware hoch',
  'Install firmware': 'Firmware installieren',
  'Install': 'Installieren',
  'Install "{file}" on {name}? The device waits until no session is running, then restarts with the new firmware.':
    '„{file}“ auf {name} installieren? Das Gerät wartet, bis keine Sitzung läuft, und startet dann mit der neuen Firmware neu.',
  'Update sent to {name}. It installs as soon as no session is running, then the device restarts.':
    'Update an {name} gesendet. Es wird installiert, sobald keine Sitzung läuft; danach startet das Gerät neu.',
  '{name} is offline. Try again when it is connected.': '{name} ist offline. Versuch es erneut, wenn das Gerät verbunden ist.',
  'Pomodoro timer': 'Pomodoro-Timer',
  'Focus minutes': 'Fokusminuten',
  'Break minutes': 'Pausenminuten',
  'min focus, then': 'Min. Fokus, dann',
  'min break': 'Min. Pause',
  'The LEDs count down each focus block. The session pauses for the break, and the digits blink when the break is over.':
    'Die LEDs zählen jeden Fokusblock herunter. Für die Pause wird die Sitzung angehalten, und die Ziffern blinken, wenn die Pause vorbei ist.',
  'Remind me to start the timer': 'An den Timer-Start erinnern',
  'after': 'nach',
  'Reminder minutes': 'Minuten bis zur Erinnerung',
  'minutes on the home screen without a touch': 'Minuten ohne Berührung auf dem Startbildschirm',
  'Dim the LEDs at night': 'LEDs nachts dimmen',
  'From': 'Von',
  'to': 'bis',
  'Night starts': 'Nacht beginnt',
  'Night ends': 'Nacht endet',
  'LEDs off': 'LEDs aus',
  'Very dim': 'Sehr dunkel',
  'Dim': 'Gedimmt',
  'Full brightness returns while a session is running.': 'Während einer laufenden Sitzung leuchten die LEDs wieder normal.',

  // settings
  'Appearance': 'Darstellung',
  'Stored in this browser only.': 'Nur in diesem Browser gespeichert.',
  'Theme': 'Design',
  'Match system': 'Wie System',
  'Dark': 'Dunkel',
  'Light': 'Hell',
  'Billing': 'Abrechnung',
  'Shared by everyone using this server.': 'Gilt für alle, die diesen Server nutzen.',
  'Currency': 'Währung',
  'Used for hourly rates, earnings and invoices. Amounts are not converted.':
    'Für Stundensätze, Verdienst und Abrechnungen. Beträge werden nicht umgerechnet.',
  'Dashboard password': 'Dashboard-Passwort',
  'The dashboard asks for this password. Devices keep working without it.':
    'Das Dashboard fragt nach diesem Passwort. Geräte funktionieren weiterhin ohne.',
  'Anyone on the network can open the dashboard. Set a password to lock it; devices keep working without it.':
    'Jeder im Netzwerk kann das Dashboard öffnen. Mit einem Passwort sperrst du es; Geräte funktionieren weiterhin ohne.',
  'Current password': 'Aktuelles Passwort',
  'New password': 'Neues Passwort',
  'Repeat new password': 'Neues Passwort wiederholen',
  'Set password': 'Passwort festlegen',
  'Change password': 'Passwort ändern',
  'Remove password': 'Passwort entfernen',
  'The new passwords do not match.': 'Die neuen Passwörter stimmen nicht überein.',
  'Password saved.': 'Passwort gespeichert.',
  'Password removed. The dashboard is open to everyone on the network.':
    'Passwort entfernt. Das Dashboard ist für alle im Netzwerk offen.',
  'Backup': 'Sicherung',
  'One file with all clients, projects, time logs and settings.':
    'Eine Datei mit allen Kunden, Projekten, Zeiteinträgen und Einstellungen.',
  'Download backup': 'Sicherung herunterladen',
  'Restore from file…': 'Aus Datei wiederherstellen…',
  'Restore backup': 'Sicherung wiederherstellen',
  'Restore': 'Wiederherstellen',
  'Replace all clients, projects, time logs and settings with the contents of "{name}"? Download a backup of the current data first if you might need it.':
    'Alle Kunden, Projekte, Zeiteinträge und Einstellungen durch den Inhalt von „{name}“ ersetzen? Lade vorher eine Sicherung der aktuellen Daten herunter, falls du sie noch brauchst.',
  'Backup restored. Reloading…': 'Sicherung wiederhergestellt. Wird neu geladen…',
  'Device firmware': 'Geräte-Firmware',
  'Upload a compiled .bin, then install it on a device from the Devices page. Devices update once no session is running.':
    'Lade eine kompilierte .bin hoch und installiere sie dann auf der Seite Geräte. Geräte aktualisieren sich, sobald keine Sitzung läuft.',
  'No firmware uploaded yet.': 'Noch keine Firmware hochgeladen.',
  'Upload firmware (.bin)…': 'Firmware (.bin) hochladen…',
  'Uploading…': 'Wird hochgeladen…',
  'Firmware uploaded. Install it from the Devices page.': 'Firmware hochgeladen. Installiere sie auf der Seite Geräte.',
  'File': 'Datei',
  'Size': 'Größe',
  'Uploaded': 'Hochgeladen',
};

const TABLES = { de: { ...DE, ...DE_MORE } };

function read(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: keep in memory only */ }
}

let prefs = {
  lang: read('dash.lang', (navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en'),
  startPage: read('dash.startPage', '/overview'),
  showLive: read('dash.showLive', '1') === '1',
  theme: read('dash.theme', 'system'),            // 'system' | 'dark' | 'light'
  currency: read('dash.currency', 'EUR'),         // cached copy of the server setting
};
const listeners = new Set();

// ── theme ─────────────────────────────────────────────────────────────────
const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

function resolvedTheme() {
  if (prefs.theme === 'light' || prefs.theme === 'dark') return prefs.theme;
  return darkQuery && !darkQuery.matches ? 'light' : 'dark';
}

function applyDocument() {
  const theme = resolvedTheme();
  document.documentElement.classList.toggle('light', theme === 'light');
  document.documentElement.lang = prefs.lang;
  prefs = { ...prefs, resolvedTheme: theme };
}
applyDocument();

// Paper is white: print with the light palette, then restore.
window.addEventListener('beforeprint', () => document.documentElement.classList.add('light'));
window.addEventListener('afterprint', applyDocument);

darkQuery?.addEventListener?.('change', () => {
  if (prefs.theme !== 'system') return;
  applyDocument();
  listeners.forEach(l => l());
});

export function setPref(key, value) {
  prefs = { ...prefs, [key]: value };
  write(`dash.${key}`, typeof value === 'boolean' ? (value ? '1' : '0') : value);
  applyDocument();
  listeners.forEach(l => l());
}

export function usePrefs() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => prefs,
  );
}

export function t(s, vars) {
  let out = TABLES[prefs.lang]?.[s] ?? s;
  if (vars) for (const k in vars) out = out.replaceAll(`{${k}}`, vars[k]);
  return out;
}

// Locale for dates and numbers follows the dashboard language.
export function locale() {
  return prefs.lang === 'de' ? 'de-DE' : 'en-GB';
}

export function fmtMoney(value) {
  try {
    return new Intl.NumberFormat(locale(), { style: 'currency', currency: prefs.currency })
      .format(value || 0);
  } catch {
    return `${(value || 0).toFixed(2)} ${prefs.currency}`;
  }
}

// Resolved theme colour for places that can't use CSS classes (chart SVG
// attributes). Charts remount on theme change, so reading once is enough.
export function cssColor(name, alpha = 1) {
  const rgb = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return rgb ? `rgb(${rgb.split(' ').join(', ')}, ${alpha})` : '#888';
}
