import { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';

function resizeToDataUrl(file, maxPx = 256, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) { h = Math.round((h / w) * maxPx); w = maxPx; }
        else        { w = Math.round((w / h) * maxPx); h = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export default function ImageUpload({ value, onChange, size = 72, label = 'Logo / picture' }) {
  const ref = useRef();

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const dataUrl = await resizeToDataUrl(file);
    if (dataUrl) onChange(dataUrl);
  };

  return (
    <div>
      {label && <p className="label">{label} <span className="text-slate-500 font-normal">(optional)</span></p>}
      <div className="flex items-center gap-4">
        <div
          className="relative flex-shrink-0 rounded-xl overflow-hidden bg-slate-700 border-2 border-dashed border-slate-600 cursor-pointer hover:border-amber-500/60 transition-colors group"
          style={{ width: size, height: size }}
          onClick={() => ref.current.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          title="Click or drag an image here"
        >
          {value ? (
            <>
              <img src={value} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ImagePlus className="w-5 h-5 text-white" />
              </div>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-500 group-hover:text-amber-400 transition-colors">
              <ImagePlus className="w-5 h-5" />
              <span className="text-[10px]">Upload</span>
            </div>
          )}
        </div>

        <div className="text-xs space-y-1.5">
          <button
            type="button"
            className="block text-amber-400 hover:text-amber-300 transition-colors"
            onClick={() => ref.current.click()}
          >
            Choose image…
          </button>
          <p className="text-slate-500">PNG, JPG, SVG, WebP</p>
          <p className="text-slate-600">Resized to 256 × 256</p>
          {value && (
            <button
              type="button"
              className="block text-slate-500 hover:text-red-400 transition-colors"
              onClick={() => onChange(null)}
            >
              <X className="w-3 h-3 inline mr-1" />Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }}
      />
    </div>
  );
}
