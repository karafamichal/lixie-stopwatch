// Time drawn like the clock itself: each digit sits on a faint engraved "8"
// (the unlit acrylic layers) and glows orange on top. Styles in index.css.
export default function LixieDigits({ value, className = '', dim = false }) {
  return (
    <span className={`lixie ${dim ? 'lixie-dim' : ''} ${className}`}>
      <span className="sr-only">{value}</span>
      {[...String(value)].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="lixie-cell" aria-hidden="true">
            <span className="lixie-lit">{ch}</span>
          </span>
        ) : (
          <span key={i} className="lixie-sep" aria-hidden="true">{ch}</span>
        )
      )}
    </span>
  );
}

// Seconds → "HH:MM" (or "HH:MM:SS" with seconds=true) for LixieDigits.
export function clockText(totalSec, seconds = false) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const p = n => String(n).padStart(2, '0');
  const hm = `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}`;
  return seconds ? `${hm}:${p(s % 60)}` : hm;
}
