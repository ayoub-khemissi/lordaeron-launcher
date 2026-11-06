import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useI18n } from "../i18n";

// before/after pairs of docs/screenshots (Lumenveil), converted to public/compare
export const SCENES = ["02", "41", "29", "07", "31", "33", "27", "03", "42", "15"];

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
      aria-label={t("graphics.compareHint")}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(split * 100)}
      className="relative w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-2xl border border-white/10 bg-black"
      role="slider"
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
        <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-wow-gold-light bg-black/70 text-wow-gold-light">
          <ChevronLeft className="-mr-1" size={13} />
          <ChevronRight className="-ml-1" size={13} />
        </div>
      </div>
      <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs text-white/85">{t("graphics.before")}</span>
      <span className="absolute right-3 top-3 rounded-md bg-wow-gold/90 px-2 py-1 text-xs font-medium text-black">{t("graphics.after")}</span>
    </div>
  );
}

// The comparison with its scenes: arrows on the sides, dots under it (and thumbnails where there is room)
export function CompareGallery({ height, thumbnails = false }: { height: number; thumbnails?: boolean }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const go = (step: number) => setIndex((i) => (i + step + SCENES.length) % SCENES.length);
  const arrow =
    "absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/85 backdrop-blur transition hover:border-wow-gold/60 hover:text-wow-gold-light";

  return (
    <div>
      <div className="relative">
        <CompareSlider height={height} scene={SCENES[index]} />
        <button aria-label={t("graphics.previous")} className={`${arrow} left-3`} onClick={() => go(-1)}>
          <ChevronLeft size={18} />
        </button>
        <button aria-label={t("graphics.next")} className={`${arrow} right-3`} onClick={() => go(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      {thumbnails ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 thin-scroll">
          {SCENES.map((s, i) => (
            <button
              key={s}
              aria-label={`${i + 1} / ${SCENES.length}`}
              className={`h-12 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                i === index ? "border-wow-gold" : "border-transparent opacity-55 hover:opacity-100"
              }`}
              onClick={() => setIndex(i)}
            >
              <img alt="" className="h-full w-full object-cover" src={`/compare/${s}-after.webp`} />
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {SCENES.map((s, i) => (
            <button
              key={s}
              aria-label={`${i + 1} / ${SCENES.length}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-wow-gold" : "w-1.5 bg-white/25 hover:bg-white/50"}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
