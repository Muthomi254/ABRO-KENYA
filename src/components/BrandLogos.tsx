import React from "react";
import statpackLogo from "../assets/images/Statpack logo.png";
import abroLogo from "../assets/images/abro_logo_1780759135632.png";
import abroKenyaIcon from "../assets/images/abro_kenya_icon_custom_1782232481339.png";

export function AbroKenyaCompanionIcon({ className = "h-8" }: { className?: string }) {
  return (
    <div 
      className={`relative overflow-hidden shrink-0 select-none ${className} rounded-lg border border-[#016838]/20 shadow-sm transition-transform duration-300 hover:scale-105`} 
      id="abro-kenya-companion-icon-container"
      style={{ aspectRatio: "1/1" }}
    >
      <img
        src={abroKenyaIcon}
        alt="ABRO Kenya Companion Icon"
        className="h-full w-full object-cover"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

export function StatpackLogo({ className = "h-8", theme = "light" }: { className?: string; theme?: "light" | "dark" }) {
  return (
    <a
      href="https://statpack.co.ke/"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center shrink-0 select-none transition-transform duration-200 hover:scale-105 active:scale-95 ${className}`}
      id="statpack-logo-container"
      title="Visit Statpack Industries Ltd Official Website (statpack.co.ke)"
      style={{
        aspectRatio: "2.8 / 1",
      }}
    >
      <img
        src={statpackLogo}
        alt="Statpack Industries Ltd"
        className={`h-full w-auto max-w-[140px] sm:max-w-[160px] object-contain shrink-0 transition-all ${
          theme === "dark" 
            ? "brightness-105 contrast-110 drop-shadow-[0_1px_3px_rgba(255,255,255,0.15)]" 
            : "mix-blend-multiply"
        }`}
        referrerPolicy="no-referrer"
      />
    </a>
  );
}

export function AbroLogo({ className = "h-9", theme = "light" }: { className?: string; theme?: "light" | "dark" }) {
  return (
    <div 
      className={`inline-flex items-center justify-center shrink-0 select-none overflow-hidden rounded-md ${className}`}
      id="abro-logo-container"
      style={{
        aspectRatio: "1.85 / 1",
      }}
    >
      <img
        src={abroLogo}
        alt="ABRO Logo"
        className={`h-full w-auto max-w-[130px] sm:max-w-[150px] object-contain shrink-0 transition-all ${
          theme === "light" ? "mix-blend-multiply" : ""
        }`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

export function CombinedLogo({ className = "h-8 sm:h-9", theme = "light" }: { className?: string; theme?: "light" | "dark" }) {
  return (
    <div className="inline-flex flex-row flex-nowrap items-center gap-2 select-none shrink-0" id="combined-corporate-logos">
      {/* ABRO Brand Emblem (Logo 2) */}
      <AbroLogo className={`${className} justify-center shrink-0`} theme={theme} />
      
      {/* Distribution Separator */}
      <span className={`text-[11px] sm:text-xs font-serif italic font-bold px-1 select-none whitespace-nowrap transition-colors ${
        theme === "dark" ? "text-slate-400" : "text-slate-500"
      }`}>
        By
      </span>

      {/* Statpack Brand Emblem (Logo 3) */}
      <div className="py-0.5 inline-flex items-center shrink-0">
        <StatpackLogo className={className} theme={theme} />
      </div>
    </div>
  );
}

/**
 * Clean, organized header brand section featuring the ABRO Kenya Emblem and title
 */
export function CorporateHeaderLogos({ theme = "light" }: { theme?: "light" | "dark" }) {
  return (
    <div className="flex items-center gap-2.5 sm:gap-4 select-none" id="corporate-header-all-logos">
      {/* ABRO Kenya Emblem & Branding */}
      <div className="flex items-center gap-2">
        <AbroKenyaCompanionIcon className="h-9 sm:h-11 shadow-sm" />
        <div className="flex flex-col">
          <span className={`text-sm sm:text-base font-black tracking-tight leading-none ${
            theme === "dark" ? "text-white" : "text-[#016838]"
          }`}>
            ABRO Kenya
          </span>
          <span className={`text-[9px] sm:text-[10px] font-semibold tracking-wider uppercase mt-0.5 ${
            theme === "dark" ? "text-slate-400" : "text-slate-500"
          }`}>
            Official Gateway
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Clean, organized footer brand section featuring:
 * 1. ABRO Brand Logo
 * 2. Statpack Industries Ltd Logo
 * Always strictly on the same single horizontal line with equal height and vertical centering.
 */
export function CorporateFooterLogos({ theme = "light" }: { theme?: "light" | "dark" }) {
  return (
    <div
      className="inline-flex flex-row flex-nowrap items-center justify-center gap-2.5 sm:gap-3.5 select-none shrink-0 whitespace-nowrap"
      id="corporate-footer-all-logos"
    >
      {/* ABRO Brand Logo */}
      <div className="inline-flex items-center justify-center shrink-0">
        <AbroLogo className="h-6 sm:h-7" theme={theme} />
      </div>

      {/* Distributor separator */}
      <span
        className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider whitespace-nowrap select-none shrink-0 self-center leading-none ${
          theme === "dark" ? "text-slate-400" : "text-slate-500"
        }`}
      >
        Distributed by
      </span>

      {/* Statpack Logo */}
      <div className="inline-flex items-center justify-center shrink-0">
        <StatpackLogo className="h-6 sm:h-7" theme={theme} />
      </div>
    </div>
  );
}


