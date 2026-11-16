import { useEffect, useRef, useState } from "react";

type LoaderPhase = "idle" | "running" | "launching";
type LoaderSize = "inline" | "compact" | "panel";

interface CarLoaderProps {
  active: boolean;
  theme?: "light" | "dark";
  label?: string;
  size?: LoaderSize;
  className?: string;
}

export default function CarLoader({
  active,
  theme = "dark",
  label = "Loading",
  size = "inline",
  className = ""
}: CarLoaderProps) {
  const [phase, setPhase] = useState<LoaderPhase>("idle");
  const phaseRef = useRef<LoaderPhase>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (active) {
      phaseRef.current = "running";
      setPhase("running");
    } else if (phaseRef.current === "running") {
      phaseRef.current = "launching";
      setPhase("launching");
      timeoutRef.current = setTimeout(() => {
        phaseRef.current = "idle";
        setPhase("idle");
        timeoutRef.current = null;
      }, 760);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [active]);

  useEffect(() => () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  if (phase === "idle") {
    return null;
  }

  const colors = theme === "dark"
    ? { body: "#e11d48", accent: "#38bdf8", text: "text-slate-300", track: "bg-white/10", road: "linear-gradient(90deg, #38bdf8, #e11d48)" }
    : { body: "#00a859", accent: "#d4a017", text: "text-slate-600", track: "bg-slate-200", road: "linear-gradient(90deg, #00a859, #d4a017)" };

  const car = (
    <span className={`car-loader-stage car-loader-${phase} car-loader-${size}`} aria-hidden="true">
      {phase === "running" && (
        <span className="car-loader-trail">
          <span />
          <span />
          <span />
        </span>
      )}
      <svg className="car-loader-vehicle" viewBox="0 0 72 40" fill="none">
        <path d="M12 24.5 17 15c1-2 2.5-3 5-3h22c2 0 3.5.8 5 2.5l8 9H62c2 0 3.5 1.5 3.5 3.5v3H7v-4c0-1.5 1.5-3 3-3h2Z" fill={colors.body} />
        <path d="m22 14-4 8h29l-6-8H22Z" fill={colors.accent} opacity=".9" />
        <path d="M10 26h53" stroke="white" strokeOpacity=".8" strokeWidth="1.5" />
        <g className="car-loader-wheel">
          <circle cx="19" cy="31" r="5.5" fill="#111827" />
          <circle cx="19" cy="31" r="2.2" fill="#cbd5e1" />
          <path d="M19 29v4m-2-2h4" stroke="#64748b" strokeWidth="1" />
        </g>
        <g className="car-loader-wheel">
          <circle cx="53" cy="31" r="5.5" fill="#111827" />
          <circle cx="53" cy="31" r="2.2" fill="#cbd5e1" />
          <path d="M53 29v4m-2-2h4" stroke="#64748b" strokeWidth="1" />
        </g>
        <path d="M9 26h4M61 25h3" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );

  if (size === "panel") {
    return (
      <div
        className={`car-loader-panel ${className}`}
        role="status"
        aria-live="polite"
        aria-label={phase === "launching" ? `${label} complete` : label}
      >
        {car}
        <span className={`car-loader-track ${colors.track}`}>
          <span
            className={`car-loader-progress ${phase === "launching" ? "car-loader-progress-finish" : ""}`}
            style={{ background: colors.road }}
          />
        </span>
        <span className={`car-loader-label ${colors.text}`}>{phase === "launching" ? "Done!" : label}</span>
      </div>
    );
  }

  return (
    <span
      className={`car-loader-inline ${className}`}
      role="status"
      aria-live="polite"
      aria-label={phase === "launching" ? `${label} complete` : label}
    >
      {car}
      <span className="sr-only">{phase === "launching" ? "Done" : label}</span>
    </span>
  );
}
