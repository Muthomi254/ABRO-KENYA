import React, { useState, useEffect, useRef } from "react";
import { ZoomIn, ZoomOut, Edit, X, Save, Copy, Check, RotateCcw, Image, ExternalLink, Cloud, CheckCircle2, AlertCircle, Loader2, Camera, FolderOpen, Upload, ShieldCheck, Truck, Package, Info } from "lucide-react";
import { compressAndResizeImage, formatKES, calculatePricing } from "../utils";
import { saveProductImageOverride } from "../productImageStore";
import { uploadToCloudinary, isCloudinaryUrl } from "../cloudinaryUpload";
import CameraCaptureModal from "./CameraCaptureModal";
import abroLogo from "../assets/images/abro_logo_1780759135632.png";

const globalBrokenImages = new Set<string>();

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
  productName?: string;
  productSku?: string;
  category?: string;
  price?: number;
  specs?: string;
  usageInstructions?: string;
  onSaveUrl?: (newUrl: string) => Promise<void>;
  theme?: "light" | "dark";
}

export default function ZoomableImage({
  src,
  alt,
  className = "w-full h-full object-cover",
  productName,
  productSku,
  category,
  price,
  specs,
  usageInstructions,
  onSaveUrl,
  theme = "dark"
}: ZoomableImageProps) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [scale, setScale] = useState(1);
  const [editUrl, setEditUrl] = useState(src);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [imgError, setImgError] = useState(() => globalBrokenImages.has(src));
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [autoMatchError, setAutoMatchError] = useState("");
  const [autoMatchSuccess, setAutoMatchSuccess] = useState(false);
  const [matchDetails, setMatchDetails] = useState<{ method: string; slug: string } | null>(null);
  const [isUploadingCloudinary, setIsUploadingCloudinary] = useState(false);
  const [cloudinaryNotice, setCloudinaryNotice] = useState<string | null>(null);
  const [cloudinaryUploaded, setCloudinaryUploaded] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [filePickerKey, setFilePickerKey] = useState(0);
  const [copiedSku, setCopiedSku] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialX: panOffset.x,
        initialY: panOffset.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging && dragStartRef.current && scale > 1) {
      const deltaX = e.clientX - dragStartRef.current.startX;
      const deltaY = e.clientY - dragStartRef.current.startY;
      setPanOffset({
        x: dragStartRef.current.initialX + deltaX,
        y: dragStartRef.current.initialY + deltaY,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setScale(2.2);
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Common upload handler for both file selection and camera captures
  const processAndUploadFile = async (file: File) => {
    setIsUploadingCloudinary(true);
    setCloudinaryNotice(null);
    setCloudinaryUploaded(false);

    try {
      // Step 1: Upload directly to Cloudinary under folder "Abro Kenya"
      const res = await uploadToCloudinary(file, {
        productSku,
        folder: "Abro Kenya"
      });

      if (res.success && res.url) {
        setEditUrl(res.url);
        setCloudinaryUploaded(true);
        setImgError(false);
        if (productSku) {
          await saveProductImageOverride(productSku, res.url);
        }
        if (productName) {
          await saveProductImageOverride(productName, res.url);
        }
        if (onSaveUrl) {
          try {
            await onSaveUrl(res.url);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
          } catch (autoErr) {
            console.warn("[ZoomableImage] Auto-save product update warning:", autoErr);
          }
        }
      } else {
        // Fallback to local compressed base64 if Cloudinary needs credential review
        setCloudinaryNotice(res.error || "Cloudinary upload notice");
        const compressed = await compressAndResizeImage(file, 800, 800, 0.82);
        if (compressed) {
          setEditUrl(compressed);
        }
      }
    } catch (err: any) {
      setCloudinaryNotice(err?.message || "Upload failed");
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingCloudinary(false);
    }
  };

  // Sync state when props change
  useEffect(() => {
    setEditUrl(src);
    setImgError(globalBrokenImages.has(src));
  }, [src]);

  // Handle ESC key to close lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsZoomed(false);
      }
    };
    if (isZoomed) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isZoomed]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveUrl) return;
    setIsSaving(true);
    try {
      if (productSku) {
        await saveProductImageOverride(productSku, editUrl);
      }
      if (productName) {
        await saveProductImageOverride(productName, editUrl);
      }
      await onSaveUrl(editUrl);
      setSaveSuccess(true);
      setImgError(false);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setCloudinaryNotice(err?.message || "Failed to save image URL");
    } finally {
      setIsSaving(false);
    }
  };

  // Helper method to suggest official abro.com images based on names and skus
  const getSuggestion = () => {
    const skuLower = (productSku || "").toLowerCase();
    const nameLower = (productName || "").toLowerCase();

    if (skuLower.includes("sp-") || nameLower.includes("paint") || nameLower.includes("coating")) {
      return "https://abro.com/wp-content/uploads/2020/07/SP-General.jpg"; // Spray paint template
    }
    if (skuLower.includes("gm-") || skuLower.includes("9-ab") || nameLower.includes("gasket") || nameLower.includes("rtv")) {
      return "https://abro.com/wp-content/uploads/2020/07/999-AB.jpg"; // Gasket Maker template
    }
    if (skuLower.includes("cc-") || nameLower.includes("carb") || nameLower.includes("choke") || nameLower.includes("cleaner")) {
      return "https://abro.com/wp-content/uploads/2020/07/CC-220.jpg"; // Carb cleaner template
    }
    if (skuLower.includes("ep-") || skuLower.includes("es-") || nameLower.includes("epoxy") || nameLower.includes("adhesive")) {
      return "https://abro.com/wp-content/uploads/2020/07/ES-506.jpg"; // Epoxy Steel template
    }
    if (skuLower.includes("pw-") || skuLower.includes("wd-") || nameLower.includes("wax") || nameLower.includes("polish")) {
      return "https://abro.com/wp-content/uploads/2020/07/LW-811.jpg"; // Liquid Wax template
    }
    if (skuLower.includes("mt-") || skuLower.includes("lt-") || nameLower.includes("tape") || nameLower.includes("wrap")) {
      return "https://abro.com/wp-content/uploads/2020/07/FT-240.jpg"; // Tape template
    }
    return "";
  };

  const suggestion = getSuggestion();

  return (
    <>
      {/* Thumbnail Trigger Div */}
      <div 
        onClick={() => {
          setIsZoomed(true);
          setScale(1);
        }}
        className={`relative group/thumb cursor-pointer w-full h-full overflow-hidden rounded-lg transition-colors border ${
          theme === "dark" 
            ? "bg-slate-900 border-white/5 hover:border-indigo-500/40" 
            : "bg-slate-100 border-slate-200 hover:border-[#0081c6]/40"
        }`}
      >
        <img
          src={imgError ? abroLogo : src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`${className} transform-gpu will-change-transform transition-transform duration-200 ease-out group-hover/thumb:scale-105`}
          referrerPolicy="no-referrer"
          onError={(e) => { 
            const target = e.currentTarget as HTMLImageElement;
            target.onerror = null; 
            target.src = abroLogo; 
            globalBrokenImages.add(src);
            setImgError(true);
          }}
        />
        {/* Interactive Magnifying Glass Indicator on hover */}
        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-150 flex items-center justify-center pointer-events-none">
          <div className={`p-2 rounded-full shadow-lg scale-90 group-hover/thumb:scale-100 transition-transform duration-150 border pointer-events-none ${
            theme === "dark" ? "bg-slate-900/90 border-white/25 text-indigo-400" : "bg-white border-slate-200 text-[#00609C]"
          }`}>
            <ZoomIn className="w-4 h-4 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Lightbox Screen Portal */}
      {isZoomed && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-955/80 backdrop-blur-md animate-in fade-in duration-200"
          id="photo-zoom-lightbox"
        >
          {/* Transparent Backdrop Click to Close */}
          <div className="absolute inset-0 cursor-default" onClick={() => setIsZoomed(false)} />

          {/* Lightbox Body Container */}
          <div className={`relative border rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto md:overflow-hidden flex flex-col md:flex-row z-10 animate-in zoom-in-95 duration-200 ${
            theme === "dark" 
              ? "bg-slate-900 border-white/10" 
              : "bg-white border-slate-200 text-slate-800 shadow-xl shadow-emerald-950/5"
          }`}>
            
            {/* Close Circle Button */}
            <button 
              onClick={() => setIsZoomed(false)}
              className={`absolute top-4 right-4 border p-2 rounded-full transition-all z-20 ${
                theme === "dark"
                  ? "bg-white/5 hover:bg-white/15 border-white/10 hover:border-white/20 text-white"
                  : "bg-slate-100 hover:bg-slate-205 border-slate-200 text-slate-700"
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left Column: Huge Scaled Visual Card with High Contrast */}
            <div className={`flex-1 flex flex-col p-4 sm:p-6 items-center justify-between min-h-[380px] md:min-h-[520px] relative group border-r select-none overflow-hidden ${
              theme === "dark" ? "bg-[#060e18] border-white/5" : "bg-slate-50/80 border-slate-100"
            }`}>
              {/* Floating Top Badges */}
              <div className="w-full flex items-center justify-between mb-3 z-20">
                <div className="flex items-center gap-2">
                  <div className={`backdrop-blur px-3 py-1.5 rounded-xl border text-xs font-mono font-bold tracking-wide flex items-center gap-1.5 shadow-sm ${
                    theme === "dark" 
                      ? "bg-slate-900/80 border-white/10 text-emerald-400" 
                      : "bg-white/90 border-slate-200 text-[#00609C] shadow-slate-200/50"
                  }`}>
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>{Math.round(scale * 100)}%</span>
                  </div>
                  {scale > 1 && (
                    <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Double-tap to reset
                    </span>
                  )}
                </div>

                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                  theme === "dark" ? "bg-white/5 text-slate-300 border border-white/10" : "bg-white text-slate-700 border border-slate-200"
                }`}>
                  Inspection Stage
                </span>
              </div>

              {/* Main Image Stage with Radial Pedestal Glow & Pan-on-Zoom */}
              <div 
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDoubleClick={handleDoubleClick}
                className={`w-full flex-1 flex items-center justify-center p-4 select-none relative transition-colors overflow-hidden ${
                  scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
                }`}
                title={scale > 1 ? "Drag to pan • Double-click to reset" : "Double-click to toggle 2.2x zoom"}
              >
                {/* Radial Glow Pedestal */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className={`w-4/5 h-4/5 rounded-full blur-3xl opacity-30 transition-opacity ${
                    theme === "dark" ? "bg-emerald-500/15" : "bg-[#00609C]/10"
                  }`} />
                </div>

                <img
                  src={imgError ? abroLogo : src}
                  alt={alt}
                  style={{ 
                    transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${scale})`,
                    touchAction: scale > 1 ? "none" : "auto"
                  }}
                  className="max-w-full max-h-[360px] md:max-h-[460px] object-contain transition-transform duration-150 ease-out flex-shrink-0 filter drop-shadow-xl select-none pointer-events-none"
                  referrerPolicy="no-referrer"
                  onError={(e) => { 
                    const target = e.currentTarget as HTMLImageElement;
                    target.onerror = null; 
                    target.src = abroLogo; 
                    globalBrokenImages.add(src);
                    setImgError(true);
                  }}
                />
              </div>

              {/* Vertical Zoom Toggle Dock - Floating on the right edge */}
              <div className={`absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5 p-1.5 sm:p-2 rounded-2xl backdrop-blur-md border shadow-2xl ${
                theme === "dark" 
                  ? "bg-slate-900/90 border-white/15 text-white shadow-black/60" 
                  : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-300/40"
              }`}>
                {/* Zoom In Button */}
                <button
                  type="button"
                  onClick={() => setScale(prev => Math.min(3.5, Number((prev + 0.25).toFixed(2))))}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                    theme === "dark" 
                      ? "text-emerald-400 bg-white/5 border-white/10 hover:bg-white/15 active:scale-95" 
                      : "text-emerald-700 bg-slate-100 hover:bg-emerald-50 border-slate-200 active:scale-95"
                  }`}
                  title="Zoom In (+)"
                  aria-label="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                {/* Vertical Slider Track */}
                <div className="h-28 flex items-center justify-center my-1 relative">
                  <input
                    type="range"
                    min="0.5"
                    max="3.5"
                    step="0.1"
                    value={scale}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setScale(val);
                      if (val === 1) setPanOffset({ x: 0, y: 0 });
                    }}
                    className={`h-24 sm:h-28 w-2 cursor-pointer rounded-full ${
                      theme === "dark" ? "accent-emerald-500" : "accent-[#00A859]"
                    }`}
                    style={{
                      writingMode: "vertical-lr",
                      direction: "rtl",
                      WebkitAppearance: "slider-vertical",
                      height: "100px",
                      width: "18px"
                    }}
                    title="Vertical Zoom Slider"
                    aria-label="Vertical zoom level"
                  />
                </div>

                {/* Quick Presets */}
                <div className="flex flex-col gap-1 w-full">
                  {[2.5, 1.5, 1.0].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setScale(preset);
                        if (preset === 1.0) setPanOffset({ x: 0, y: 0 });
                      }}
                      className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded-md transition-all cursor-pointer text-center ${
                        Math.abs(scale - preset) < 0.1
                          ? theme === "dark"
                            ? "bg-emerald-500 text-slate-950 font-black shadow-xs"
                            : "bg-[#00A859] text-white font-black shadow-xs"
                          : theme === "dark"
                            ? "text-slate-400 hover:text-white hover:bg-white/10"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                      title={`Set zoom to ${preset * 100}%`}
                    >
                      {preset === 1.0 ? "1x" : `${preset}x`}
                    </button>
                  ))}
                </div>

                {/* Zoom Out Button */}
                <button
                  type="button"
                  onClick={() => setScale(prev => {
                    const next = Math.max(0.5, Number((prev - 0.25).toFixed(2)));
                    if (next === 1) setPanOffset({ x: 0, y: 0 });
                    return next;
                  })}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                    theme === "dark" 
                      ? "text-slate-300 bg-white/5 border-white/10 hover:bg-white/15 active:scale-95" 
                      : "text-slate-700 bg-slate-100 border-slate-200 hover:bg-slate-200 active:scale-95"
                  }`}
                  title="Zoom Out (-)"
                  aria-label="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                {/* Reset to 1x Button */}
                <button
                  type="button"
                  onClick={() => {
                    setScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                    theme === "dark" 
                      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 active:scale-95" 
                      : "text-[#00609C] bg-[#00609C]/10 border-[#00609C]/20 hover:bg-[#00609C]/20 active:scale-95"
                  }`}
                  title="Reset to 100% (1x)"
                  aria-label="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                {/* Zoom Badge */}
                <div className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black text-center tracking-tight border ${
                  theme === "dark" ? "bg-black/40 border-white/10 text-emerald-400" : "bg-slate-50 border-slate-200 text-slate-700"
                }`}>
                  {Math.round(scale * 100)}%
                </div>
              </div>

              {/* Bottom Helpful Interaction Banner */}
              <div className={`w-full py-2 px-3.5 rounded-xl border flex items-center justify-between text-[11px] font-medium z-10 ${
                theme === "dark" ? "bg-white/[0.03] border-white/10 text-slate-400" : "bg-white border-slate-200 text-slate-600 shadow-xs"
              }`}>
                <span className="text-[10px] sm:text-xs">Double-tap to zoom • Drag to pan • Vertical toggle on right</span>
                <span className="hidden sm:inline font-mono text-[10px] font-bold text-emerald-500">
                  {scale > 1 ? "Zoom Active" : "100% View"}
                </span>
              </div>
            </div>

            {/* Right Column: Information, Metadata & Edit Section Form */}
            <div className={`w-full md:w-[400px] p-6 flex flex-col justify-between md:overflow-y-auto md:max-h-[90vh] ${
              theme === "dark" ? "text-slate-200" : "text-slate-705 bg-white border-l border-slate-105"
            }`}>
              <div className="space-y-4">
                {/* Heading details & Authenticity */}
                <div className={`shrink-0 border-b pb-4 ${theme === "dark" ? "border-white/10" : "border-slate-150"}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        theme === "dark" ? "bg-[#00609C] text-white" : "bg-[#00A859] text-white"
                      }`}>
                        {category || "Genuine ABRO"}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-600 text-white">
                        10 CTNS MOQ
                      </span>
                    </div>

                    {productSku && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(productSku);
                          setCopiedSku(true);
                          setTimeout(() => setCopiedSku(false), 2000);
                        }}
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 border transition-colors cursor-pointer ${
                          copiedSku
                            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                            : theme === "dark"
                              ? "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300"
                              : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                        }`}
                        title="Copy SKU Part Number"
                      >
                        {copiedSku ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSku ? "Copied!" : productSku}</span>
                      </button>
                    )}
                  </div>

                  <h3 className={`text-lg font-black tracking-tight leading-snug ${theme === "dark" ? "text-white" : "text-slate-900"}`}>
                    {productName || alt}
                  </h3>

                  {/* Authenticity guarantee */}
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Genuine ABRO USA • Distributed by Statpack Industries Ltd</span>
                  </div>
                </div>

                {/* Delivery Policy Card */}
                <div className={`p-3.5 rounded-2xl border space-y-2 text-xs ${
                  theme === "dark" ? "bg-white/[0.03] border-white/10" : "bg-sky-50/70 border-sky-200"
                }`}>
                  <div className="flex items-center gap-1.5 font-bold text-sky-500 text-xs uppercase tracking-wider">
                    <Truck className="w-3.5 h-3.5" />
                    <span>Official Delivery Policy</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className={`leading-relaxed ${theme === "dark" ? "text-slate-300" : "text-slate-700"}`}>
                      <strong className="text-slate-900 dark:text-white">Delivery:</strong> Free delivery within Nairobi, Kiambu, Thika.
                    </p>
                    <p className={`leading-relaxed ${theme === "dark" ? "text-slate-300" : "text-slate-700"}`}>
                      <strong className="text-slate-900 dark:text-white">Upcountry:</strong> Delivery is handled in a case by case basis.
                    </p>
                    <p className={`text-[10px] font-mono pt-1 border-t border-current/10 opacity-75 ${theme === "dark" ? "text-slate-400" : "text-slate-600"}`}>
                      Dispatched from Embakasi Central Depot, Nairobi
                    </p>
                  </div>
                </div>

                {/* Specifications & Packaging if available */}
                {specs && (
                  <div className={`p-3 rounded-2xl border space-y-1.5 ${
                    theme === "dark" ? "bg-white/[0.03] border-white/10" : "bg-slate-50 border-slate-200"
                  }`}>
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <Package className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Specifications & Packaging</span>
                    </div>
                    <p className={`text-xs leading-relaxed font-semibold ${
                      theme === "dark" ? "text-slate-300" : "text-slate-700"
                    }`}>
                      {specs}
                    </p>
                  </div>
                )}

                {/* Wholesale Pricing if available */}
                {price && price > 0 && (() => {
                  const pricing = calculatePricing(price, specs || "");
                  const mOQCartons = 10;
                  const mOQTotalIncVat = pricing.ctnIncVat * mOQCartons;
                  const mOQTotalExVat = pricing.ctnExVat * mOQCartons;
                  const mOQTotalUnits = pricing.packing * mOQCartons;

                  return (
                    <div className={`p-3.5 rounded-2xl border space-y-2.5 ${
                      theme === "dark" 
                        ? "bg-emerald-950/20 border-emerald-500/25 text-emerald-300" 
                        : "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                    }`}>
                      <div className="flex items-center justify-between text-xs border-b border-current/10 pb-1.5">
                        <span className="font-bold">Piece (Inc 16% VAT):</span>
                        <span className="font-black font-mono text-sm">{formatKES(price)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] opacity-90">
                        <div>
                          <span className="block text-[10px] opacity-75">Piece (Ex VAT):</span>
                          <span className="font-mono font-bold">{formatKES(pricing.pcExVat)}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] opacity-75">Carton (Inc VAT):</span>
                          <span className="font-mono font-bold">{formatKES(pricing.ctnIncVat)}</span>
                        </div>
                      </div>

                      {/* 10 CTNS Wholesale Order Total */}
                      <div className={`p-2.5 rounded-xl border flex flex-col gap-1 ${
                        theme === "dark"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                          : "bg-white border-emerald-300 text-emerald-900 shadow-xs"
                      }`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-black tracking-wide flex items-center gap-1">
                            <Package className="w-3.5 h-3.5 text-emerald-500" />
                            <span>10 Cartons Wholesale Order (MOQ):</span>
                          </span>
                          <span className="font-black font-mono text-sm text-emerald-600 dark:text-emerald-300">
                            {formatKES(mOQTotalIncVat)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] opacity-80 pt-1 border-t border-current/10">
                          <span>Ex VAT: {formatKES(mOQTotalExVat)}</span>
                          <span className="font-mono font-semibold">{mOQTotalUnits} total units ({pricing.packing} pcs/ctn)</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Usage Instructions if available */}
                {usageInstructions && (
                  <div className={`p-3 rounded-2xl border space-y-1 text-xs ${
                    theme === "dark" ? "bg-white/[0.02] border-white/10 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                      Application Summary
                    </span>
                    <p className="line-clamp-3 leading-relaxed opacity-90 text-[11px]">
                      {usageInstructions}
                    </p>
                  </div>
                )}

                {/* Edit Form */}
                {onSaveUrl && (
                  <form onSubmit={handleSave} className="space-y-4">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                          theme === "dark" ? "text-slate-355" : "text-slate-600"
                        }`}>
                          <Edit className={`w-3.5 h-3.5 ${theme === "dark" ? "text-indigo-400" : "text-[#00609C]"}`} />
                          <span>Product Photo URL</span>
                        </label>
                        <input
                          type="text"
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          className={`w-full rounded-xl px-3 py-1.5 text-xs font-mono focus:outline-none border ${
                            theme === "dark" 
                              ? "bg-slate-950 border-white/10 text-slate-200 focus:border-indigo-500" 
                              : "bg-slate-50 border-slate-205 text-slate-800 focus:border-[#0081c6]"
                          }`}
                          placeholder="Paste web address or upload below"
                          required
                        />
                      </div>

                      {/* Sparkle Automated Asset Match Button */}
                      <div className="py-0.5">
                        <button
                          type="button"
                          disabled={isAutoMatching}
                          onClick={async () => {
                            setIsAutoMatching(true);
                            setAutoMatchError("");
                            setAutoMatchSuccess(false);
                            setMatchDetails(null);
                            try {
                              const response = await fetch("/api/asset-match", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ name: productName, sku: productSku })
                              });
                              if (!response.ok) throw new Error("Match connection error");
                              const data = await response.json();
                              const finalUrl = data.verified_image_url || data.product_image_url;
                              if (finalUrl) {
                                setEditUrl(finalUrl);
                                setMatchDetails({
                                  method: data.retrieval_method || "Predicted CDN",
                                  slug: data.generated_slug || "N/A"
                                });
                                setAutoMatchSuccess(true);
                                setImgError(false);
                                setTimeout(() => setAutoMatchSuccess(false), 8000);
                              } else {
                                throw new Error("Could not find matching image asset");
                              }
                            } catch (err: any) {
                              setAutoMatchError(err.message || "Failed auto-matching");
                              setTimeout(() => setAutoMatchError(""), 4050);
                            } finally {
                              setIsAutoMatching(false);
                            }
                          }}
                          className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold font-sans flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                            theme === "dark"
                              ? "bg-indigo-500/10 border-indigo-400/20 text-indigo-305 hover:bg-indigo-500/20 active:bg-indigo-500/30"
                              : "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 hover:bg-emerald-500/20 active:bg-emerald-500/30"
                          }`}
                        >
                          {isAutoMatching ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-1 h-3.5 w-3.5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>Running 5-Step Matcher...</span>
                            </>
                          ) : autoMatchSuccess ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500 animate-bounce" />
                              <span className="text-emerald-500 font-extrabold">Matched & Sourced!</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l3.414-3.414m1.772-1.773L21 9.813A3 3 0 1414.187 3L4.937 12.25a3 3 0 00-.783 1.396l-.837 3.351a.5.5 0 00.613.613l3.351-.837a3 3 0 001.396-.783L14.28 12.28" />
                              </svg>
                              <span>Auto-Detect Sourced Image</span>
                            </>
                          )}
                        </button>
                        
                        {autoMatchSuccess && (
                          <div className="mt-1.5 p-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-left space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                            <p className="text-[10px] text-emerald-600 font-bold block">
                              ✓ Verified Asset Sourced Successfully!
                            </p>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-mono text-slate-500">
                              <div>Slug: <span className="font-semibold text-slate-700 dark:text-slate-300">{matchDetails?.slug}</span></div>
                              <div>Method: <span className="font-semibold text-slate-700 dark:text-slate-300">{matchDetails?.method}</span></div>
                            </div>
                            <p className="text-[9px] text-slate-400 font-sans italic">
                              Click "Apply Photo" to save this asset to the catalog.
                            </p>
                          </div>
                        )}
                        {autoMatchError && (
                          <p className="text-[10px] text-rose-500 mt-1.5 text-center font-medium bg-rose-500/5 py-1 px-2 border border-rose-500/10 rounded-lg animate-fade-in animate-out duration-150">
                            ⚠ {autoMatchError} (using general preset fallbacks)
                          </p>
                        )}
                      </div>

                      {/* Cloudinary Storage / Local File upload zone */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${
                            theme === "dark" ? "text-slate-400" : "text-slate-600"
                          }`}>
                            <Cloud className={`w-3.5 h-3.5 ${theme === "dark" ? "text-sky-400" : "text-[#0081c6]"}`} />
                            <span>Upload to Cloudinary (Abro Kenya)</span>
                          </label>
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                            theme === "dark" ? "bg-sky-500/10 text-sky-400" : "bg-sky-50 text-sky-700 border border-sky-200"
                          }`}>
                            muthomi254
                          </span>
                        </div>

                        {/* Status feedback */}
                        {isCloudinaryUrl(editUrl) && (
                          <div className={`p-2 rounded-lg text-[10px] font-mono flex items-center justify-between gap-2 border ${
                            theme === "dark"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                              : "bg-emerald-50 border-emerald-200 text-emerald-800"
                          }`}>
                            <div className="flex items-center gap-1.5 truncate">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span className="truncate">Active on Cloudinary CDN (Folder: Abro Kenya)</span>
                            </div>
                            <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/20 text-[9px] font-bold uppercase tracking-wider">
                              CDN
                            </span>
                          </div>
                        )}

                        {isUploadingCloudinary && (
                          <div className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 border animate-pulse ${
                            theme === "dark"
                              ? "bg-sky-500/15 border-sky-400/30 text-sky-300"
                              : "bg-sky-50 border-sky-200 text-sky-800"
                          }`}>
                            <Loader2 className="w-4 h-4 animate-spin text-sky-500 shrink-0" />
                            <span>Uploading to Cloudinary CDN (Folder: Abro Kenya)...</span>
                          </div>
                        )}

                        {cloudinaryNotice && (
                          <div className={`p-2 rounded-lg text-[10px] flex items-start gap-1.5 border ${
                            theme === "dark"
                              ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                              : "bg-amber-50 border-amber-200 text-amber-800"
                          }`}>
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <p className="font-semibold">Cloudinary Note: {cloudinaryNotice}</p>
                              <p className="text-[9px] opacity-80">Local optimized image applied to preview.</p>
                            </div>
                          </div>
                        )}

                        {/* Hidden native inputs with guaranteed reset on click, cancel, and change */}
                        <input
                          key={`file-input-${filePickerKey}`}
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onClick={(e) => {
                            (e.target as HTMLInputElement).value = "";
                          }}
                          onCancel={() => {
                            setFilePickerKey((k) => k + 1);
                          }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            setFilePickerKey((k) => k + 1);
                            if (file) {
                              processAndUploadFile(file);
                            }
                          }}
                        />

                        <input
                          key={`camera-input-${filePickerKey}`}
                          ref={cameraInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onClick={(e) => {
                            (e.target as HTMLInputElement).value = "";
                          }}
                          onCancel={() => {
                            setFilePickerKey((k) => k + 1);
                          }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            setFilePickerKey((k) => k + 1);
                            if (file) {
                              processAndUploadFile(file);
                            }
                          }}
                        />

                        {/* Dual Action Buttons: Take Photo & Browse Folders */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            {/* Option 1: Take Photo directly with Camera */}
                            <button
                              type="button"
                              disabled={isUploadingCloudinary}
                              onClick={() => {
                                // Clear input value and trigger camera
                                if (cameraInputRef.current) {
                                  cameraInputRef.current.value = "";
                                  cameraInputRef.current.click();
                                }
                              }}
                              className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border shadow-sm ${
                                theme === "dark"
                                  ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40 hover:border-emerald-400"
                                  : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 hover:border-emerald-400"
                              }`}
                              title="Take photo directly using camera"
                            >
                              <Camera className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>Take Photo</span>
                            </button>

                            {/* Option 2: Browse Folders / Gallery */}
                            <button
                              type="button"
                              disabled={isUploadingCloudinary}
                              onClick={() => {
                                // Clear input value and trigger folder picker
                                if (fileInputRef.current) {
                                  fileInputRef.current.value = "";
                                  fileInputRef.current.click();
                                }
                              }}
                              className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border shadow-sm ${
                                theme === "dark"
                                  ? "bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/40 hover:border-sky-400"
                                  : "bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300 hover:border-sky-400"
                              }`}
                              title="Browse folders or gallery"
                            >
                              <FolderOpen className="w-4 h-4 text-sky-500 shrink-0" />
                              <span>Browse Folders</span>
                            </button>
                          </div>

                          {/* Interactive Dropzone & Live Camera Link */}
                          <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const file = e.dataTransfer.files?.[0];
                              if (file && file.type.startsWith("image/")) {
                                processAndUploadFile(file);
                              }
                            }}
                            className={`border-2 border-dashed rounded-xl p-3 text-center transition-all ${
                              theme === "dark"
                                ? "border-slate-700 bg-slate-950/30 hover:border-sky-500/40"
                                : "border-slate-250 bg-slate-50/50 hover:border-sky-400"
                            }`}
                          >
                            <div className="flex items-center justify-center gap-3">
                              <button
                                type="button"
                                onClick={() => setShowCameraModal(true)}
                                className={`text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                  theme === "dark"
                                    ? "bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-white/10"
                                    : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                              >
                                <Camera className="w-3 h-3 text-emerald-500" />
                                <span>Open Live Viewfinder</span>
                              </button>

                              <span className="text-[10px] text-slate-400">or drag & drop here</span>
                            </div>
                            <p className="text-[9px] text-slate-400 font-mono mt-1.5">
                              Destination: Cloudinary folder <strong>Abro Kenya</strong>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className={`flex-1 font-bold text-xs py-2 px-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 border ${
                          theme === "dark"
                            ? "bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white shadow-indigo-500/10 border-indigo-450/20"
                            : "bg-[#00a859] hover:bg-[#00924d] text-white shadow-emerald-500/5 border-[#00a859]/25"
                        }`}
                      >
                        {isSaving ? (
                          <span className="animate-spin text-xs">...</span>
                        ) : saveSuccess ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-450 animate-bounce" />
                            <span className="text-[#00A859]">Saved!</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Apply Photo</span>
                          </>
                        )}
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => {
                          setEditUrl(`https://abro.com/wp-content/uploads/2020/07/${(productSku || "").replace(/^ABRO-/, "").trim().toUpperCase()}.jpg`);
                        }}
                        className={`px-3 py-2 border rounded-xl text-xs font-semibold transition-colors ${
                          theme === "dark" 
                            ? "bg-slate-950 border-white/10 text-slate-300 hover:text-white hover:bg-slate-900" 
                            : "bg-slate-50 border-slate-205 text-slate-650 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                        title="Reset to default official layout format SKU"
                      >
                        Official SKU Form
                      </button>
                    </div>
                  </form>
                )}

                {/* Intelligent Preset Helper list from abro.com and unsplash */}
                {onSaveUrl && (
                  <div className={`space-y-2 pt-4 border-t ${theme === "dark" ? "border-white/5" : "border-slate-150"}`}>
                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                      theme === "dark" ? "text-slate-400" : "text-slate-550"
                    }`}>Official ABRO Presets catalog:</span>
                    <div className="space-y-1.5 max-h-[170px] overflow-y-auto pr-1 text-slate-300 scrollbar-thin">
                      {suggestion && (
                        <button
                          type="button"
                          onClick={() => setEditUrl(suggestion)}
                          className={`w-full text-left p-2 rounded-xl border text-[10px] font-semibold transition-all flex items-center justify-between group cursor-pointer ${
                            theme === "dark" 
                              ? "bg-[#002f52] border-[#00609C]/30 text-slate-300 hover:text-white hover:bg-[#002f52]/50" 
                              : "bg-[#00609C]/5 border-[#00609C]/15 text-[#00609C]"
                          }`}
                        >
                          <span className="truncate">Auto-match Official ABRO Link</span>
                          <Image className="w-3.5 h-3.5 shrink-0 select-none ml-2" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditUrl("https://abro.com/wp-content/uploads/2020/07/SP-General.jpg")}
                        className={`w-full text-left p-1 text-[9px] font-mono truncate block rounded px-2 ${
                          theme === "dark" ? "text-slate-400 hover:text-indigo-400 hover:bg-white/5" : "text-slate-550 hover:text-[#00609C] hover:bg-slate-100"
                        }`}
                      >
                        • Cover: Gloss Black SP-General
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditUrl("https://abro.com/wp-content/uploads/2020/07/999-AB.jpg")}
                        className={`w-full text-left p-1 text-[9px] font-mono truncate block rounded px-2 ${
                          theme === "dark" ? "text-slate-400 hover:text-indigo-400 hover:bg-white/5" : "text-slate-550 hover:text-[#00609C] hover:bg-slate-100"
                        }`}
                      >
                        • Sealant: Grey Gasket Maker 999-AB
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditUrl("https://abro.com/wp-content/uploads/2020/07/CC-220.jpg")}
                        className={`w-full text-left p-1 text-[9px] font-mono truncate block rounded px-2 ${
                          theme === "dark" ? "text-slate-400 hover:text-indigo-400 hover:bg-white/5" : "text-slate-550 hover:text-[#00609C] hover:bg-slate-100"
                        }`}
                      >
                        • Cleaner: Carb CC-220
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditUrl("https://abro.com/wp-content/uploads/2020/07/ES-506.jpg")}
                        className={`w-full text-left p-1 text-[9px] font-mono truncate block rounded px-2 ${
                          theme === "dark" ? "text-slate-400 hover:text-indigo-400 hover:bg-white/5" : "text-slate-550 hover:text-[#00609C] hover:bg-slate-100"
                        }`}
                      >
                        • Epoxy Steel: ES-506
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditUrl("https://abro.com/wp-content/uploads/2020/07/LW-811.jpg")}
                        className={`w-full text-left p-1 text-[9px] font-mono truncate block rounded px-2 ${
                          theme === "dark" ? "text-slate-400 hover:text-indigo-400 hover:bg-white/5" : "text-slate-550 hover:text-[#00609C] hover:bg-slate-100"
                        }`}
                      >
                        • Care: Siliconised Wax LW-811
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditUrl("https://abro.com/wp-content/uploads/2020/07/FT-240.jpg")}
                        className={`w-full text-left p-1 text-[9px] font-mono truncate block rounded px-2 ${
                          theme === "dark" ? "text-slate-400 hover:text-indigo-400 hover:bg-white/5" : "text-slate-550 hover:text-[#00609C] hover:bg-slate-100"
                        }`}
                      >
                        • Tape: Alum Foil Tape FT-240
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action indicators */}
              <div className={`mt-6 pt-4 border-t shrink-0 text-[10px] flex items-center justify-between ${
                theme === "dark" ? "border-white/10 text-slate-500" : "border-slate-150 text-slate-500"
              }`}>
                <span>Press ESC or click out to close</span>
                <a 
                  href="https://abro.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={`flex items-center gap-0.5 font-bold hover:underline ${
                    theme === "dark" ? "text-indigo-400" : "text-[#00609C]"
                  }`}
                >
                  <span>Visit abro.com</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

          </div>
        </div>
      )}
      {/* Dedicated In-App Camera Viewfinder Modal */}
      {showCameraModal && (
        <CameraCaptureModal
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onCapture={(file) => {
            processAndUploadFile(file);
          }}
          theme={theme}
          title={`Take Photo: ${productName || productSku || "ABRO Product"}`}
        />
      )}
    </>
  );
}
