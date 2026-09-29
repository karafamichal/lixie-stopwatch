import { t } from '../i18n';

// Edits an LED digit style string (format: backend app.py _LED_STYLE_RE,
// firmware LedDisplay::parseStyle):
//   ''                   plain colour (`plainLabel` explains which one)
//   'd:#c1,...,#c6'      one colour per digit
//   'c:SEC:#c1,#c2,...'  2..8 colours the digits fade through every SEC seconds
const DIGITS = ['H', 'H', 'M', 'M', 'S', 'S'];

function parse(value) {
  if (value?.startsWith('d:')) return { mode: 'digits', colors: value.slice(2).split(','), sec: 10 };
  if (value?.startsWith('c:')) {
    const [, sec, list] = value.split(':');
    return { mode: 'cycle', colors: list.split(','), sec: Number(sec) };
  }
  return { mode: 'solid', colors: [], sec: 10 };
}

const build = ({ mode, colors, sec }) =>
  mode === 'digits' ? `d:${colors.join(',')}`
  : mode === 'cycle' ? `c:${sec}:${colors.join(',')}`
  : '';

export default function LedStyleEditor({ value, onChange, baseColor = '#FF8000', plainLabel }) {
  const s = parse(value);
  const set = patch => onChange(build({ ...s, ...patch }).toUpperCase().replace(/^([DC]):/, m => m.toLowerCase()));
  const setColor = (i, c) => set({ colors: s.colors.map((x, j) => (j === i ? c : x)) });

  const MODES = [
    ['solid',  plainLabel || t('Single colour'), {}],
    ['digits', t('Colour per digit'), { colors: Array(6).fill(baseColor) }],
    ['cycle',  t('Colour cycle'),     { colors: ['#FF0000', '#00FF00', '#0000FF'], sec: 30 }],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {MODES.map(([mode, label, init]) => (
          <button key={mode} type="button" onClick={() => mode !== s.mode && set({ mode, ...init })}
            className={`seg ${s.mode === mode ? 'seg-on' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      {s.mode === 'digits' && (
        <div className="flex items-end gap-2">
          {s.colors.map((c, i) => (
            <label key={i} className={`flex flex-col items-center gap-1 text-xs text-slate-500 ${i % 2 === 0 && i ? 'ml-2' : ''}`}>
              <input type="color" value={c} onChange={e => setColor(i, e.target.value)}
                className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent p-0"
                aria-label={t('Digit {n} colour', { n: i + 1 })} />
              {DIGITS[i]}
            </label>
          ))}
        </div>
      )}

      {s.mode === 'cycle' && (
        <div className="space-y-2">
          <div className="h-3 rounded-full"
            style={{ background: `linear-gradient(to right, ${[...s.colors, s.colors[0]].join(',')})` }} />
          <div className="flex flex-wrap items-center gap-2">
            {s.colors.map((c, i) => (
              <span key={i} className="relative">
                <input type="color" value={c} onChange={e => setColor(i, e.target.value)}
                  className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent p-0"
                  aria-label={t('Colour {n}', { n: i + 1 })} />
                {s.colors.length > 2 && (
                  <button type="button" title={t('Remove')}
                    onClick={() => set({ colors: s.colors.filter((_, j) => j !== i) })}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-600 text-[10px] leading-4 text-white">
                    ×
                  </button>
                )}
              </span>
            ))}
            {s.colors.length < 8 && (
              <button type="button" className="seg" onClick={() => set({ colors: [...s.colors, baseColor] })}>
                + {t('Add colour')}
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            {t('One round every')}
            <input type="number" className="input w-20" min={1} max={3600} value={s.sec}
              onChange={e => set({ sec: Math.min(3600, Math.max(1, parseInt(e.target.value, 10) || 1)) })} />
            {t('seconds')}
          </label>
        </div>
      )}
    </div>
  );
}
