import { useCallback, useRef, useState } from "react";

import { useI18n } from "../i18n";

export const SCENES = ["02", "29", "41", "07", "31"];

// Two screenshots of the same place, without and with Lumenveil: the line between them follows the mouse while held
export function CompareSlider({ scene, height = 360 }: { scene: string; height?: number }) {
  const { t } = useI18n();
  const [split, setSplit] = useState(0.5);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = useCallback((clientX: number) => {
    const r = box.current?.getBoundingClientRect();

    if (r) setSplit(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  }, []);

  return (
    <div
      ref={box}
      className="relative w-full cursor-ew-resize overflow-hidden rounded-2xl border border-white/10 bg-black"
      role="slider"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(split * 100)}
      style={{ height }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setSplit((s) => Math.max(0, s - 0.05));
        if (e.key === "ArrowRight") setSplit((s) => Math.min(1, s + 0.05));
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && move(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
    >
      <img alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} src={`/compare/${scene}-after.webp`} />
      <img
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
        src={`/compare/${scene}-before.webp`}
        style={{ clipPath: `inset(0 ${100 - split * 100}% 0 0)` }}
      />
      <div className="absolute inset-y-0 w-0.5 bg-wow-gold-light shadow-[0_0_12px_rgba(224,190,110,0.8)]" style={{ left: `${split * 100}%` }}>
        <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-wow-gold-light bg-black/70 text-xs text-wow-gold-light">
          ⇆
        </div>
      </div>
      <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white/80">{t("graphics.before")}</span>
      <span className="absolute right-3 top-3 rounded-md bg-wow-gold/80 px-2 py-1 text-xs font-medium text-black">{t("graphics.after")}</span>
    </div>
  );
}
