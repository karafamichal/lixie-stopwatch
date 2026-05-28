import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Music2, Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Wifi, WifiOff,
} from 'lucide-react';
import * as api from '../api';

function fmtElapsed(s) {
  if (!s) return '0:00';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const VOL_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export default function MP3Player() {
  const [status, setStatus]   = useState(null);
  const [busy, setBusy]       = useState(false);
  const [cmdError, setCmdError] = useState('');
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.mp3.status();
      setStatus(s);
    } catch {
      // Flask not reachable — keep last known state
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => clearInterval(pollRef.current);
  }, [fetchStatus]);

  const sendCmd = async (cmd) => {
    if (busy) return;
    setBusy(true);
    setCmdError('');
    try {
      await api.mp3.command(cmd);
      // fetch immediately so UI reflects change without waiting for next poll
      setTimeout(fetchStatus, 350);
    } catch (err) {
      const msg = err.response?.data?.error || 'Command failed';
      setCmdError(msg);
    } finally {
      setBusy(false);
    }
  };

  const connected = status?.connected ?? false;
  const playing   = status?.playing   ?? false;
  const volume    = status?.volume    ?? 0;
  const disabled  = !connected || busy;

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">MP3 Player</h1>

      <div className="card p-8 flex flex-col items-center gap-7">

        {/* connection badge */}
        <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full border ${
          connected
            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
            : 'text-slate-500 bg-slate-800 border-slate-700'
        }`}>
          {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {connected ? 'Arduino connected' : 'Arduino not connected'}
        </div>

        {/* album art placeholder + track info */}
        <div className="text-center w-full">
          <div className="w-24 h-24 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
            <Music2 className={`w-10 h-10 ${connected ? 'text-amber-400' : 'text-slate-600'}`} />
          </div>

          <p className="text-base font-semibold text-slate-100 truncate px-2">
            {status?.title || 'N/A'}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {status ? `Track ${status.track} / ${status.max_track}` : '— / —'}
          </p>
          <p className="text-xs font-mono text-amber-400 mt-2 tabular-nums">
            {fmtElapsed(status?.elapsed)}
          </p>
        </div>

        {/* playback controls */}
        <div className="flex items-center gap-5">
          <button
            onClick={() => sendCmd('prev')}
            disabled={disabled}
            className="p-2.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <SkipBack className="w-6 h-6" />
          </button>

          <button
            onClick={() => sendCmd(playing ? 'pause' : 'play')}
            disabled={disabled}
            className="w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-900 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/30"
          >
            {playing
              ? <Pause className="w-7 h-7" />
              : <Play  className="w-7 h-7 translate-x-0.5" />}
          </button>

          <button
            onClick={() => sendCmd('next')}
            disabled={disabled}
            className="p-2.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <SkipForward className="w-6 h-6" />
          </button>
        </div>

        {/* volume bar */}
        <div className="flex items-center gap-3 w-full">
          <button
            onClick={() => sendCmd('vol_down')}
            disabled={disabled || volume <= 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <VolumeX className="w-5 h-5" />
          </button>

          <div className="flex gap-1 flex-1 justify-center">
            {VOL_STEPS.map(v => (
              <div
                key={v}
                className={`flex-1 h-5 rounded-sm transition-colors ${
                  volume >= v ? 'bg-amber-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => sendCmd('vol_up')}
            disabled={disabled || volume >= 100}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 -mt-4">
          Volume: {status?.volume ?? '–'}%
        </p>

        {cmdError && (
          <p className="text-xs text-red-400 text-center">{cmdError}</p>
        )}
      </div>

      <p className="text-xs text-slate-600 text-center mt-4">
        Arduino connects automatically to this server via WebSocket.
        Polls every 2 s.
      </p>
    </div>
  );
}
