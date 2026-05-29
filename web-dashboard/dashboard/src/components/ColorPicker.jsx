// Preset palette tuned for WS2812B LED visibility
const PRESETS = [
  { hex: '#FF8000', label: 'Lixie orange' },
  { hex: '#FF3000', label: 'Red-orange' },
  { hex: '#FF0000', label: 'Red' },
  { hex: '#FFD700', label: 'Gold' },
  { hex: '#FFFF00', label: 'Yellow' },
  { hex: '#80FF00', label: 'Lime' },
  { hex: '#00FF00', label: 'Green' },
  { hex: '#00FF80', label: 'Spring green' },
  { hex: '#00FFFF', label: 'Cyan' },
  { hex: '#0080FF', label: 'Sky blue' },
  { hex: '#0000FF', label: 'Blue' },
  { hex: '#8000FF', label: 'Purple' },
  { hex: '#FF00FF', label: 'Magenta' },
  { hex: '#FF0080', label: 'Hot pink' },
  { hex: '#FFFFFF', label: 'White' },
];

export default function ColorPicker({ value = '#FF8000', onChange }) {
  const normalized = value.toUpperCase();

  return (
    <div className="space-y-3">
      {/* Preset swatches */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(({ hex, label }) => {
          const active = normalized === hex.toUpperCase();
          return (
            <button
              key={hex}
              type="button"
              title={label}
              onClick={() => onChange(hex)}
              className={`w-7 h-7 rounded-lg transition-all hover:scale-110 ${
                active ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110' : ''
              }`}
              style={{ backgroundColor: hex }}
            />
          );
        })}
      </div>

      {/* Custom colour picker */}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value.toUpperCase())}
          className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0"
          title="Custom colour"
        />
        <span className="text-xs text-slate-500">Custom</span>
      </div>
    </div>
  );
}
