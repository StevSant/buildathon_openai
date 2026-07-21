"use client";

import { useEffect, useState, type CSSProperties } from "react";

const SLIDES = [
  {
    eyebrow: "PULSO · 01",
    title: "Una ciudad que\nse mueve contigo.",
    body: "Historias breves para mirar la ciudad con otros ojos: más cerca, más viva, más humana.",
    accent: "#35e0c1",
    visual: "signal",
  },
  {
    eyebrow: "PULSO · 02",
    title: "El ritmo también\nhabla.",
    body: "Cruces, voces, bicicletas y luces. Cada trayecto deja una señal que vale la pena escuchar.",
    accent: "#4fa9ff",
    visual: "waves",
  },
  {
    eyebrow: "PULSO · 03",
    title: "Pequeños gestos.\nGrandes conexiones.",
    body: "Una mirada compartida puede convertir una calle cualquiera en un lugar que sentimos nuestro.",
    accent: "#ff9f45",
    visual: "orbit",
  },
] as const;

export default function PresentationDeck() {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = SLIDES[activeSlide];

  function previous() {
    setActiveSlide((current) => (current - 1 + SLIDES.length) % SLIDES.length);
  }

  function next() {
    setActiveSlide((current) => (current + 1) % SLIDES.length);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        setActiveSlide((current) => (current - 1 + SLIDES.length) % SLIDES.length);
      }
      if (event.key === "ArrowRight" || event.key === " ") {
        event.preventDefault();
        setActiveSlide((current) => (current + 1) % SLIDES.length);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="min-h-dvh overflow-hidden bg-bg px-5 py-5 text-ink sm:px-8 sm:py-8">
      <section
        className="relative mx-auto flex min-h-[calc(100dvh-40px)] max-w-6xl flex-col overflow-hidden rounded-[32px] border border-line bg-panel shadow-[0_30px_100px_-40px_rgba(0,0,0,0.95)] sm:min-h-[calc(100dvh-64px)]"
        style={{ "--slide-accent": slide.accent } as CSSProperties}
      >
        <div className="absolute inset-0 opacity-60" style={{ background: `radial-gradient(circle at 76% 32%, ${slide.accent}28, transparent 31%)` }} />
        <header className="relative z-10 flex items-center justify-between px-6 pt-6 sm:px-10 sm:pt-9">
          <span className="text-xl font-extrabold tracking-[-0.05em]">pul<span className="text-accent">so</span></span>
          <span className="font-mono text-[10px] tracking-[0.22em] text-muted">CIUDAD EN MOVIMIENTO</span>
        </header>

        <div className="relative z-10 flex flex-1 flex-col justify-center px-6 pb-8 pt-10 sm:px-16 sm:pb-12 lg:px-24">
          <p className="mb-5 font-mono text-xs font-bold tracking-[0.18em]" style={{ color: slide.accent }}>{slide.eyebrow}</p>
          <h1 className="max-w-3xl whitespace-pre-line text-5xl font-extrabold leading-[0.94] tracking-[-0.065em] sm:text-7xl lg:text-8xl">{slide.title}</h1>
          <p className="mt-7 max-w-md text-base leading-relaxed text-muted sm:text-lg">{slide.body}</p>

          <div className="relative mt-10 h-44 max-w-3xl overflow-hidden rounded-2xl border border-line bg-[#0c1219] sm:h-52">
            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(rgba(92,107,124,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(92,107,124,.22) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
            <div className={`presentation-visual presentation-visual--${slide.visual}`} />
            <div className="absolute bottom-4 left-5 font-mono text-[10px] tracking-[0.16em] text-faint">SEÑAL / {String(activeSlide + 1).padStart(2, "0")}</div>
          </div>
        </div>

        <footer className="relative z-10 flex items-center justify-between border-t border-line px-6 py-5 sm:px-10">
          <div className="flex gap-2" aria-label="Diapositivas">
            {SLIDES.map((item, index) => (
              <button key={item.eyebrow} type="button" onClick={() => setActiveSlide(index)} aria-label={`Ir a la diapositiva ${index + 1}`} aria-current={index === activeSlide ? "true" : undefined} className="h-1.5 rounded-full transition-all" style={{ width: index === activeSlide ? 28 : 8, background: index === activeSlide ? slide.accent : "var(--line)" }} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={previous} aria-label="Diapositiva anterior" className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel-2 text-lg transition hover:border-accent hover:text-accent">←</button>
            <button type="button" onClick={next} aria-label="Siguiente diapositiva" className="grid h-10 min-w-10 place-items-center rounded-xl px-3 font-mono text-xs font-bold text-accent-ink transition hover:brightness-110" style={{ background: slide.accent }}>→</button>
          </div>
        </footer>
      </section>
    </main>
  );
}
