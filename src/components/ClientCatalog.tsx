import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, Package, ListFilter, Compass, BookOpen, Sparkles, Download, Printer, Grid, List, HelpCircle, ArrowRight, Check, X, Scale, FileSpreadsheet, FileText, ShoppingCart, MessageSquare, Trash2, CornerDownLeft, ZoomIn, ZoomOut, RotateCcw, Copy, ExternalLink, ShieldCheck, Plus, Truck, Phone, Mail, ShieldAlert, Layers, Info, MapPin } from "lucide-react";
import { Product } from "../types";
import ZoomableImage from "./ZoomableImage";
import { generateCatalogExcel, generateCatalogWord } from "../documentGenerator";
import { calculatePricing, formatKES } from "../utils";
import abroLogo from "../assets/images/abro_logo_1780759135632.png";

const catalogBrokenUrls = new Set<string>();

interface CatalogProductImageProps {
  product: Product;
  theme: "light" | "dark";
  onOpenZoom: (p: Product) => void;
  className?: string;
  imageClassName?: string;
  showZoomBadge?: boolean;
}

function CatalogProductImage({
  product,
  theme,
  onOpenZoom,
  className = "w-full h-full",
  imageClassName = "w-full h-full object-contain",
  showZoomBadge = true,
}: CatalogProductImageProps) {
  const imgSrc = product.imageUrl || `/api/products/${product.id}/image`;
  const [hasError, setHasError] = useState(() => catalogBrokenUrls.has(imgSrc));

  useEffect(() => {
    if (imgSrc.includes("cloudinary")) {
      catalogBrokenUrls.delete(imgSrc);
    }
    setHasError(catalogBrokenUrls.has(imgSrc));
  }, [imgSrc]);

  const handleImageError = () => {
    catalogBrokenUrls.add(imgSrc);
    setHasError(true);
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onOpenZoom(product);
      }}
      className={`relative cursor-pointer w-full h-full flex items-center justify-center overflow-hidden rounded-xl group/img ${className}`}
      title={`Click to view & zoom high-res image of ${product.name}`}
    >
      {!hasError ? (
        <img
          src={imgSrc}
          alt={product.name}
          loading="lazy"
          decoding="async"
          onError={handleImageError}
          className={`${imageClassName} transform-gpu will-change-transform transition-transform duration-200 ease-out group-hover/img:scale-105 select-none`}
          referrerPolicy="no-referrer"
        />
      ) : (
        /* Genuine ABRO Product Emblem Fallback Card - Crisp, Branded & Instant */
        <div className={`w-full h-full flex flex-col items-center justify-center p-3 text-center select-none rounded-xl border transition-colors ${
          theme === "dark" 
            ? "bg-slate-900/60 border-white/5 group-hover/img:border-emerald-500/30" 
            : "bg-slate-50 border-slate-200/80 group-hover/img:border-[#00609C]/30"
        }`}>
          <img
            src={abroLogo}
            alt="ABRO Genuine Brand"
            className="h-8 w-auto object-contain opacity-95 transition-transform duration-200 group-hover/img:scale-105"
          />
          <div className="mt-2 flex flex-col items-center">
            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider ${
              theme === "dark" ? "bg-white/10 text-emerald-300" : "bg-[#00609C]/10 text-[#00609C]"
            }`}>
              {product.category}
            </span>
          </div>
        </div>
      )}

      {/* Instant, smooth zoom trigger indicator with pointer-events-none */}
      {showZoomBadge && (
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity duration-150 flex items-center justify-center pointer-events-none">
          <div className={`px-2.5 py-1 rounded-full shadow-lg border flex items-center gap-1.5 text-[11px] font-bold transform scale-95 group-hover/img:scale-100 transition-transform duration-150 pointer-events-none ${
            theme === "dark"
              ? "bg-slate-900/95 border-white/20 text-emerald-400"
              : "bg-white/95 border-slate-200 text-[#00609C]"
          }`}>
            <ZoomIn className="w-3.5 h-3.5" />
            <span>Click to Zoom</span>
          </div>
        </div>
      )}
    </div>
  );
}

export const POPULAR_AUTOCOMPLETE_QUERIES = [
  "Gasket Maker 999",
  "Grey RTV Silicone",
  "Black Gasket Maker 12-AB",
  "Red High Temp Gasket Maker",
  "AB-80 Penetrating Lubricant",
  "Brake Cleaner Non-Chlorinated",
  "Radiator Coolant Red 4L",
  "Radiator Coolant Green",
  "Radiator Stop Leak",
  "Engine Motor Flush",
  "Fuel Injector Cleaner",
  "Carb & Choke Cleaner CC-220",
  "Threadlocker High Strength",
  "Threadlocker Blue Medium",
  "Abro Steel Epoxy Putty",
  "Super Glue Instant Gel",
  "Spray Paint Gloss Black",
  "Spray Paint Flat Black",
  "Rubbing Compound RC-100",
  "Scratch Remover SR-100",
  "Masking Tape 2 Inch",
  "Synthetic Lithium Grease",
  "Battery Terminal Protector"
];

interface ClientCatalogProps {
  products: Product[];
  theme?: "light" | "dark";
  onAskAgent?: (query: string) => void;
  onOpenChat?: () => void;
}

export default function ClientCatalog({ products, theme = "dark", onAskAgent, onOpenChat }: ClientCatalogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Search Autocomplete & Touch Controls
  const [isAutoCompleteOpen, setIsAutoCompleteOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Dedicated Lightbox State for Instant Zero-Delay Viewing
  const [zoomedProduct, setZoomedProduct] = useState<Product | null>(null);
  const [lightboxZoomScale, setLightboxZoomScale] = useState(1);
  const [copiedSku, setCopiedSku] = useState(false);
  const [copiedQuote, setCopiedQuote] = useState(false);
  const [lightboxBackdrop, setLightboxBackdrop] = useState<"default" | "pure-white" | "dark">("default");
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  const handleOpenZoom = (p: Product) => {
    setZoomedProduct(p);
    setLightboxZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setLightboxBackdrop("default");
  };

  const handlePointerDownImage = (e: React.PointerEvent) => {
    if (lightboxZoomScale > 1) {
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

  const handlePointerMoveImage = (e: React.PointerEvent) => {
    if (isDragging && dragStartRef.current && lightboxZoomScale > 1) {
      const deltaX = e.clientX - dragStartRef.current.startX;
      const deltaY = e.clientY - dragStartRef.current.startY;
      setPanOffset({
        x: dragStartRef.current.initialX + deltaX,
        y: dragStartRef.current.initialY + deltaY,
      });
    }
  };

  const handlePointerUpImage = (e: React.PointerEvent) => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleDoubleClickImage = () => {
    if (lightboxZoomScale > 1) {
      setLightboxZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setLightboxZoomScale(2.2);
    }
  };

  // Close lightbox on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setZoomedProduct(null);
      }
    };
    if (zoomedProduct) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoomedProduct]);

  // Close autocomplete on clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsAutoCompleteOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Inquired Items / Active Cart State
  const [inquiryCart, setInquiryCart] = useState<Product[]>([]);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);

  const handleToggleInquiry = (product: Product) => {
    setInquiryCart((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        return prev.filter((p) => p.id !== product.id);
      } else {
        return [...prev, product];
      }
    });
  };

  const clearInquiryCart = () => {
    setInquiryCart([]);
  };

  const handleInquireViaAI = (customProducts?: Product[]) => {
    const items = customProducts && customProducts.length > 0 ? customProducts : inquiryCart;
    if (items.length > 0) {
      const listStr = items
        .map((p, idx) => `${idx + 1}. ${p.name} (SKU: ${p.sku}) - Category: ${p.category || "General"}`)
        .join("\n");
      const query = `Habari! I am inquiring about wholesale pricing, stock availability, and technical specs for the following ${items.length} ABRO product${items.length > 1 ? "s" : ""}:\n\n${listStr}\n\nPlease provide wholesale carton rates (strictly 10 Carton MOQ), 16% VAT details, carton packaging counts, and application instructions for Kenya.`;
      if (onAskAgent) {
        onAskAgent(query);
      } else if (onOpenChat) {
        onOpenChat();
      }
    } else {
      if (onAskAgent) {
        onAskAgent("Habari! I am browsing the ABRO Kenya catalog and would like help finding the right genuine product, specs, and wholesale carton prices.");
      } else if (onOpenChat) {
        onOpenChat();
      }
    }
  };

  // Comparison States
  const [compareProducts, setCompareProducts] = useState<Product[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const handleToggleCompare = (product: Product) => {
    const exists = compareProducts.some((p) => p.id === product.id);
    if (exists) {
      setCompareProducts(compareProducts.filter((p) => p.id !== product.id));
      setCompareError(null);
    } else {
      if (compareProducts.length >= 3) {
        setCompareError("Maximum of 3 products can be compared side-by-side.");
        setTimeout(() => setCompareError(null), 4000);
        return;
      }
      setCompareProducts([...compareProducts, product]);
      setCompareError(null);
    }
  };

  const clearCompare = () => {
    setCompareProducts([]);
    setCompareError(null);
  };

  // Highlight matching search words
  const highlightText = (text: string, search: string) => {
    if (!text) return <></>;
    const textStr = String(text);
    if (!search || !search.trim()) return <>{textStr}</>;
    try {
      const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const parts = textStr.split(new RegExp(`(${escaped})`, "gi"));
      return (
        <>
          {parts.map((part, index) =>
            part.toLowerCase() === search.toLowerCase() ? (
              <mark
                key={index}
                className="bg-[#FFE375] dark:bg-amber-500/40 text-[#543b00] dark:text-amber-200 px-0.5 py-0.25 rounded font-bold"
              >
                {part}
              </mark>
            ) : (
              part
            )
          )}
        </>
      );
    } catch {
      return <>{textStr}</>;
    }
  };

  // Derive unique categories dynamically
  const categories = useMemo(() => {
    const list = new Set<string>();
    products.forEach((p) => {
      if (p.category) {
        list.add(p.category);
      }
    });
    return ["All", ...Array.from(list)];
  }, [products]);

  // Autocomplete matching query terms and products
  const autoCompleteSuggestions = useMemo(() => {
    if (!searchTerm || !searchTerm.trim()) {
      return { products: [], queries: [] };
    }
    const clean = searchTerm.trim().toLowerCase();

    // 1. Direct matching products (up to 4 products)
    const matchedProducts = products
      .filter((p) => {
        return (
          (p.name || "").toLowerCase().includes(clean) ||
          (p.sku || "").toLowerCase().includes(clean) ||
          (p.category || "").toLowerCase().includes(clean)
        );
      })
      .slice(0, 4);

    // 2. Matching search phrases from popular automotive searches
    const matchedQueries = POPULAR_AUTOCOMPLETE_QUERIES.filter((q) =>
      q.toLowerCase().includes(clean) && q.toLowerCase() !== clean
    ).slice(0, 3);

    return {
      products: matchedProducts,
      queries: matchedQueries,
    };
  }, [products, searchTerm]);

  // Handle instant search reset with one tap
  const handleClearSearch = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSearchTerm("");
    setIsAutoCompleteOpen(false);
    if (window.innerWidth >= 768) {
      searchInputRef.current?.focus();
    }
  };

  // Filter products matching search queries and categories
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.specs || "").toLowerCase().includes(searchTerm.toLowerCase());

      const matchCategory = selectedCategory === "All" || p.category === selectedCategory;

      return matchSearch && matchCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const toggleExpand = (id: string) => {
    setExpandedProductId(expandedProductId === id ? null : id);
  };

  // 📥 Download CSV Catalogue Function (strictly without PRICING)
  const downloadCSV = () => {
    // Generate CSV content with absolutely no pricing
    const headers = ["SKU", "Product Name", "Category", "Specifications", "Minimum Order Quantity (MOQ)", "Application/Directions"];
    const rows = filteredProducts.map((p) => [
      p.sku || "",
      p.name || "",
      p.category || "",
      p.specs ? p.specs.replace(/"/g, '""') : "N/A",
      "Strictly 10 Cartons (Minimum Order Requirement)",
      p.usageInstructions ? p.usageInstructions.replace(/"/g, '""') : "N/A"
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${val}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `ABRO_Official_Wholesale_Catalogue_${selectedCategory.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 🖨️ Native high-fidelity print call for standard system PDF save
  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className={`w-full flex flex-col rounded-2xl border transition-colors duration-300 shadow-sm ${
        theme === "dark"
          ? "bg-[#0b1828]/80 border-white/10 text-white"
          : "bg-white border-slate-200/80 text-slate-800"
      }`}
      id="client-catalog-container"
    >
      {/* Dynamic Native Print Media Styles for clean browser PDF export without navbar widgets */}
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          #abro-root-container header, 
          #abro-root-container footer,
          #expand-navbar-floating-btn,
          .no-print,
          .no-scrollbar,
          input,
          select,
          button {
            display: none !important;
          }
          #client-catalog-container {
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .spec-expanded-view {
            display: block !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* Sleek, Uncrowded Catalog Top Header */}
      <div
        className={`px-4 sm:px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 transition-colors ${
          theme === "dark" ? "bg-[#0e1d2e] border-white/10" : "bg-gradient-to-r from-emerald-50/60 via-white to-slate-50/50 border-slate-200/70"
        }`}
      >
        <div className="flex items-center space-x-3">
          <div
            className={`rounded-xl flex items-center justify-center shadow-sm w-10 h-10 border shrink-0 transition-colors ${
              theme === "dark" ? "bg-slate-900 border-sky-500/30 text-emerald-400" : "bg-white border-emerald-500/20 text-emerald-600"
            }`}
          >
            <Compass className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className={`text-base font-black tracking-tight ${theme === "dark" ? "text-white" : "text-slate-900"}`}>
                ABRO® Official Catalogue
              </h3>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                theme === "dark" ? "bg-white/5 border-white/10 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-700"
              }`}>
                {filteredProducts.length} items
              </span>
            </div>
            <p className={`text-xs ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
              Genuine Kenya Stock Directory • Wholesale MOQ: 10 Cartons
            </p>
          </div>
        </div>

        {/* Action Toolbar: View Switcher, Exports & Inquiry */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap no-print">
          {/* View Toggle */}
          <div className={`p-0.5 rounded-xl flex items-center border ${
            theme === "dark" ? "bg-white/5 border-white/10" : "bg-white border-slate-200"
          }`}>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "grid"
                  ? theme === "dark" ? "bg-[#00609C] text-white" : "bg-[#00A859] text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "list"
                  ? theme === "dark" ? "bg-[#00609C] text-white" : "bg-[#00A859] text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Export Actions */}
          <button
            onClick={() => generateCatalogExcel(filteredProducts, "ABRO_Price_List")}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border shadow-xs transition-all cursor-pointer ${
              theme === "dark"
                ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40"
                : "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
            }`}
            title="Download Wholesale Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Excel</span>
          </button>

          <button
            onClick={() => generateCatalogWord(filteredProducts, "ABRO_Kenya_Catalogue")}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border shadow-xs transition-all cursor-pointer ${
              theme === "dark"
                ? "bg-blue-950/30 border-blue-500/30 text-blue-300 hover:bg-blue-900/40"
                : "bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100"
            }`}
            title="Download Word (.docx)"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Word</span>
          </button>

          <button
            onClick={downloadCSV}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border shadow-xs transition-all cursor-pointer ${
              theme === "dark"
                ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
            }`}
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border shadow-xs transition-all cursor-pointer ${
              theme === "dark"
                ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
            }`}
            title="Export / Print Catalog as PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </button>

          {/* Active Inquiry Cart Trigger */}
          {inquiryCart.length > 0 && (
            <button
              onClick={() => setIsInquiryModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
              title="Open Inquiry List"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{inquiryCart.length} Inquired</span>
            </button>
          )}
        </div>
      </div>

      {/* Unified Search & Category Filter Strip */}
      <div className={`p-4 border-b flex flex-col gap-3 transition-colors no-print ${
        theme === "dark" ? "bg-[#091522]/80 border-white/10" : "bg-slate-50/70 border-slate-200/60"
      }`}>
        {/* Search Input */}
        <div ref={searchContainerRef} className="relative w-full">
          <input
            ref={searchInputRef}
            type="text"
            enterKeyHint="search"
            onFocus={() => {
              if (searchTerm.trim()) setIsAutoCompleteOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.keyCode === 13) {
                setIsAutoCompleteOpen(false);
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                setIsAutoCompleteOpen(false);
              }
            }}
            placeholder="Search by product name, SKU (e.g. 10-AB, GP-201), category, specs..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsAutoCompleteOpen(true);
            }}
            className={`w-full text-sm font-medium py-3 pl-11 pr-20 rounded-xl border outline-none transition-all shadow-xs ${
              theme === "dark"
                ? "bg-[#112236] border-white/15 text-white placeholder:text-slate-400 focus:border-[#00609C] focus:ring-1 focus:ring-[#00609C]"
                : "bg-white border-slate-250 text-slate-900 placeholder:text-slate-400 focus:border-[#00A859] focus:ring-1 focus:ring-[#00A859]"
            }`}
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 pointer-events-none" />

          {/* Right Action: Touchscreen Clear "×" Button & Count */}
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center space-x-1.5">
            {searchTerm.trim().length > 0 && (
              <button
                type="button"
                onClick={handleClearSearch}
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-90 cursor-pointer ${
                  theme === "dark"
                    ? "bg-white/10 hover:bg-white/20 text-slate-200"
                    : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                }`}
                title="Clear search input"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <span className="text-[11px] font-mono text-slate-400 font-bold px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded border border-slate-200 dark:border-white/10 select-none">
              {filteredProducts.length}
            </span>
          </div>

          {/* Search Autocomplete Dropdown */}
          {isAutoCompleteOpen && searchTerm.trim().length > 0 && (
            <div
              className={`absolute top-full left-0 right-0 mt-1.5 rounded-2xl border shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150 ${
                theme === "dark"
                  ? "bg-[#141e2b]/95 border-white/10 text-white shadow-black/60"
                  : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-900/15"
              }`}
              id="catalog-autocomplete-dropdown"
            >
              {/* Keyword Query Suggestions */}
              {autoCompleteSuggestions.queries.length > 0 && (
                <div className="p-2 border-b border-slate-100 dark:border-white/5">
                  <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Suggested Searches
                  </p>
                  <div className="space-y-0.5">
                    {autoCompleteSuggestions.queries.map((q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSearchTerm(q);
                          setIsAutoCompleteOpen(false);
                          searchInputRef.current?.blur();
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left cursor-pointer ${
                          theme === "dark"
                            ? "hover:bg-white/10 text-slate-200"
                            : "hover:bg-slate-100 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{highlightText(q, searchTerm)}</span>
                        </div>
                        <CornerDownLeft className="w-3 h-3 text-slate-400 shrink-0 opacity-60" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Matches */}
              <div className="p-2 max-h-60 overflow-y-auto">
                <p className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center justify-between">
                  <span>Product Matches ({autoCompleteSuggestions.products.length})</span>
                  <span className="text-[9px] lowercase font-normal">tap item to view</span>
                </p>
                {autoCompleteSuggestions.products.length === 0 ? (
                  <div className="px-3 py-3 text-center text-xs text-slate-400">
                    No direct product match for &ldquo;{searchTerm}&rdquo;. Press Enter for full text search.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {autoCompleteSuggestions.products.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSearchTerm(p.name);
                          setIsAutoCompleteOpen(false);
                          setExpandedProductId(p.id);
                        }}
                        className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer ${
                          theme === "dark"
                            ? "hover:bg-white/10 text-slate-200"
                            : "hover:bg-emerald-50/80 text-slate-800"
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-black/10 shrink-0 overflow-hidden border border-black/5 dark:border-white/5 flex items-center justify-center">
                            <img
                              src={p.imageUrl || `/api/products/${p.id}/image`}
                              alt={p.name}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                const target = e.currentTarget as HTMLImageElement;
                                target.onerror = null;
                                target.src = "https://abro.com/wp-content/uploads/2020/07/abro-logo.jpg";
                              }}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">
                              {highlightText(p.name, searchTerm)}
                            </p>
                            <div className="flex items-center space-x-1.5 text-[10px]">
                              <span className="text-slate-400 truncate">{p.category}</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 shrink-0 ml-2">
                          Select →
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div
                className={`px-3 py-1.5 text-[9px] font-mono text-slate-400 flex items-center justify-between border-t ${
                  theme === "dark" ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-100"
                }`}
              >
                <span>Esc to dismiss</span>
                <span>{filteredProducts.length} total matches</span>
              </div>
            </div>
          )}
        </div>

        {/* Categories Horizontal Pills Strip */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5 select-none">
          <ListFilter className="w-3.5 h-3.5 text-slate-400 mr-1 shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer border ${
                selectedCategory === cat
                  ? theme === "dark"
                    ? "bg-[#00609C] text-white border-[#00609C] shadow-xs"
                    : "bg-[#00A859] text-white border-[#00A859] shadow-xs"
                  : theme === "dark"
                    ? "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Catalog Products Section - Natural spacious scroll */}
      <div className="p-4 sm:p-6" id="catalog-products-scroll-area">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center justify-center">
            <Package className="w-16 h-16 text-slate-500/35 mb-3" />
            <p className={`text-base font-bold ${theme === "dark" ? "text-slate-300" : "text-slate-700"}`}>
              No matching products found
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              We couldn&apos;t find items matching your search or filters. Try selecting &ldquo;All&rdquo; or clearing your query.
            </p>
            {(selectedCategory !== "All" || searchTerm.trim().length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("All");
                  setSearchTerm("");
                }}
                className={`mt-4 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border shadow-sm ${
                  theme === "dark"
                    ? "bg-white/10 hover:bg-white/20 text-white border-white/10"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                }`}
              >
                Reset All Filters ({products.length} Products)
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          /* Bento-style High-Visibility Product Card Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.map((p) => {
              const isExpanded = expandedProductId === p.id;
              const isCompared = compareProducts.some((cp) => cp.id === p.id);
              const isInquiryCart = inquiryCart.some((ip) => ip.id === p.id);
              return (
                <div
                  key={p.id}
                  className={`border rounded-2xl flex flex-col justify-between transition-all duration-300 overflow-hidden group hover:shadow-lg ${
                    isExpanded
                      ? theme === "dark"
                        ? "bg-[#0e2034] border-emerald-500/50 shadow-emerald-950/20"
                        : "bg-emerald-50/40 border-emerald-500/40 shadow-emerald-900/10"
                      : theme === "dark"
                        ? "bg-[#0b1828]/90 border-white/10 hover:border-white/20 hover:bg-[#0e2034]"
                        : "bg-white border-slate-200 hover:border-emerald-500/40 hover:shadow-md"
                  }`}
                >
                  <div>
                    {/* Prominent, large product photo showcase */}
                    <div className={`w-full h-48 sm:h-56 p-4 flex items-center justify-center relative overflow-hidden transition-colors border-b ${
                      theme === "dark" ? "bg-[#06121f]/90 border-white/5" : "bg-slate-50/90 border-slate-100"
                    }`}>
                      {/* Floating Category Pill on Top-Left */}
                      <div className="absolute top-3 left-3 z-10 flex items-center">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg shadow-xs ${
                          theme === "dark"
                            ? "bg-[#00609C] text-white"
                            : "bg-[#00A859] text-white"
                        }`}>
                          {p.category}
                        </span>
                      </div>

                      {/* 10 CTNS MOQ badge on Top-Right */}
                      <div className="absolute top-3 right-3 z-10">
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-600 text-white shadow-xs">
                          10 CTNS MOQ
                        </span>
                      </div>

                      {/* Product Image centered and crisp with smooth zero-delay zoom */}
                      <div className="w-full h-full flex items-center justify-center">
                        <CatalogProductImage
                          product={p}
                          theme={theme}
                          onOpenZoom={(product) => {
                            setZoomedProduct(product);
                            setLightboxZoomScale(1);
                          }}
                        />
                      </div>
                    </div>

                    {/* Product Name & Specifications Preview */}
                    <div className="p-4 sm:p-5">
                      <h4 className={`text-base font-bold tracking-tight leading-snug line-clamp-2 ${
                        theme === "dark" ? "text-white group-hover:text-emerald-300" : "text-slate-900 group-hover:text-[#00A859]"
                      } transition-colors`}>
                        {highlightText(p.name, searchTerm)}
                      </h4>
                      <p className={`text-xs mt-2 line-clamp-2 leading-relaxed ${
                        theme === "dark" ? "text-slate-400" : "text-slate-600"
                      }`}>
                        {highlightText(p.specs || "Official genuine ABRO specification & application.", searchTerm)}
                      </p>
                    </div>
                  </div>

                  {/* Operational Control Buttons - Clean and uncrowded */}
                  <div className={`p-3.5 border-t flex items-center justify-between gap-1.5 mt-auto no-print ${
                    theme === "dark" ? "border-white/5 bg-white/[0.02]" : "border-slate-100 bg-slate-50/50"
                  }`}>
                    {/* Left: Secondary actions */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        onClick={() => toggleExpand(p.id)}
                        className={`px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border shrink-0 ${
                          isExpanded
                            ? theme === "dark" ? "bg-slate-700 text-white border-white/20" : "bg-slate-200 text-slate-800 border-slate-300"
                            : theme === "dark" ? "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10" : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                        title={isExpanded ? "Collapse Details" : "View Technical Specifications"}
                      >
                        {isExpanded ? "Hide" : "Specs"}
                      </button>

                      <button
                        onClick={() => handleToggleCompare(p)}
                        className={`inline-flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap leading-none transition-all cursor-pointer border shrink-0 ${
                          isCompared
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-xs"
                            : theme === "dark" 
                              ? "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10 hover:text-indigo-300 hover:border-indigo-500/30" 
                              : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:text-indigo-600 hover:border-indigo-300"
                        }`}
                        title={isCompared ? "Remove from comparison" : "Compare side-by-side"}
                      >
                        {isCompared ? (
                          <>
                            <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                            <span>Compare</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleToggleInquiry(p)}
                        className={`p-1.5 rounded-xl transition-all cursor-pointer border shrink-0 ${
                          isInquiryCart
                            ? "bg-emerald-600 text-white border-emerald-500 shadow-xs"
                            : theme === "dark" ? "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10" : "bg-white hover:bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                        title={isInquiryCart ? "In inquiry list" : "Add to inquiry list"}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Right: Primary Action - Ask AI */}
                    {onAskAgent && (
                      <button
                        onClick={() => onAskAgent(`Can you provide full technical specifications, carton packaging count, wholesale price (10 CTNS MOQ), and application instructions for genuine ${p.name} (SKU: ${p.sku})?`)}
                        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer shadow-xs shrink-0 ${
                          theme === "dark"
                            ? "bg-gradient-to-r from-[#00609C] to-emerald-600 hover:from-[#0070b8] hover:to-emerald-500 text-white"
                            : "bg-gradient-to-r from-[#00A859] to-emerald-700 hover:from-[#00924d] hover:to-emerald-800 text-white"
                        }`}
                        title="Ask AI Assistant about this product"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        <span>Ask AI</span>
                      </button>
                    )}
                  </div>

                  {/* Expanded Technical Details Sheet */}
                  {isExpanded && (
                    <div className={`p-4 sm:p-5 border-t border-dashed space-y-3.5 animate-in slide-in-from-top-2 duration-200 ${
                      theme === "dark" ? "border-white/10 bg-[#071320]/80" : "border-slate-200 bg-emerald-50/40"
                    }`}>
                      {/* Specifications */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                          <ListFilter className="w-3 h-3 text-emerald-400" />
                          <span>Detailed Specifications</span>
                        </span>
                        <p className={`text-xs pl-4 font-semibold leading-relaxed ${theme === "dark" ? "text-slate-300" : "text-slate-700"}`}>
                          {highlightText(p.specs || "No specifications loaded.", searchTerm)}
                        </p>
                      </div>

                      {/* Application Instructions */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                          <BookOpen className="w-3 h-3 text-amber-400" />
                          <span>Application & Use</span>
                        </span>
                        <div className="pl-4 space-y-1">
                          {(p.usageInstructions || "Clean surface thoroughly before professional application.")
                            .split("\n")
                            .map((line, idx) => (
                              <div key={idx} className={`text-xs font-semibold leading-relaxed flex items-start space-x-1.5 ${theme === "dark" ? "text-slate-300" : "text-slate-700"}`}>
                                <span className="text-emerald-500 shrink-0 font-bold">✓</span>
                                <span>{line}</span>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* MOQ Notice */}
                      <div className={`p-2.5 rounded-xl text-[10px] font-black flex items-start space-x-2 border uppercase tracking-wider ${
                        theme === "dark"
                          ? "bg-rose-950/20 border-rose-500/10 text-rose-300"
                          : "bg-rose-50 border-rose-150 text-rose-700"
                      }`}>
                        <Package className="w-4 h-4 shrink-0" />
                        <div>
                          <span>Strict Wholesale Limit: Minimum order quantity is 10 Cartons.</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Spacious, Highly Legible List View */
          <div className="space-y-3">
            {filteredProducts.map((p) => {
              const isExpanded = expandedProductId === p.id;
              const isCompared = compareProducts.some((cp) => cp.id === p.id);
              const isInquiryCart = inquiryCart.some((ip) => ip.id === p.id);
              return (
                <div
                  key={p.id}
                  className={`border rounded-2xl p-4 transition-all duration-200 ${
                    isExpanded
                      ? theme === "dark"
                        ? "bg-[#0e2034] border-emerald-500/40 shadow-xs"
                        : "bg-emerald-50/50 border-emerald-500/30 shadow-xs"
                      : theme === "dark"
                        ? "bg-[#0b1828]/90 border-white/10 hover:border-white/20"
                        : "bg-white border-slate-200 hover:border-slate-300 shadow-xs"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Generous Product Photo Container in List View */}
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 border border-slate-100 dark:border-white/5 shrink-0 p-1 flex items-center justify-center">
                        <CatalogProductImage
                          product={p}
                          theme={theme}
                          onOpenZoom={(product) => {
                            setZoomedProduct(product);
                            setLightboxZoomScale(1);
                          }}
                          showZoomBadge={false}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            theme === "dark" ? "bg-[#00609C] text-white" : "bg-[#00A859] text-white"
                          }`}>
                            {p.category}
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-wider text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-md">
                            10 CTNS MOQ
                          </span>
                        </div>
                        <h4 className={`text-base font-bold tracking-tight ${theme === "dark" ? "text-white" : "text-slate-900"}`}>
                          {highlightText(p.name, searchTerm)}
                        </h4>
                        <p className={`text-xs mt-1 line-clamp-1 ${theme === "dark" ? "text-slate-400" : "text-slate-600"}`}>
                          {highlightText(p.specs || "Official ABRO formulation & specifications.", searchTerm)}
                        </p>
                      </div>
                    </div>

                    {/* Actions in List View - Vertical List Column */}
                    <div className="flex flex-col gap-1.5 shrink-0 w-full sm:w-36 md:w-40 no-print border-t sm:border-t-0 sm:border-l border-slate-200/60 dark:border-white/10 pt-3 sm:pt-0 sm:pl-4 justify-center">
                      {onAskAgent && (
                        <button
                          onClick={() => onAskAgent(`Can you explain features, carton packaging, and wholesale specs for genuine ${p.name}?`)}
                          className={`w-full inline-flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider py-1.5 px-3 rounded-xl border cursor-pointer transition-all shadow-xs shrink-0 ${
                            theme === "dark"
                              ? "bg-gradient-to-r from-[#00609C] to-emerald-600 hover:from-[#0070b8] hover:to-emerald-500 text-white border-transparent"
                              : "bg-gradient-to-r from-[#00A859] to-emerald-700 hover:from-[#00924d] hover:to-emerald-800 text-white border-transparent"
                          }`}
                          title="Ask AI Assistant about this product"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          <span>Ask AI</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleToggleInquiry(p)}
                        className={`w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 px-3 rounded-xl border cursor-pointer transition-all shrink-0 ${
                          isInquiryCart
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-xs"
                            : theme === "dark"
                              ? "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10 hover:text-emerald-400 hover:border-emerald-500/30"
                              : "bg-slate-50 hover:bg-emerald-50 text-slate-700 border-slate-200 hover:text-emerald-700 hover:border-emerald-300"
                        }`}
                        title={isInquiryCart ? "Remove from inquiry list" : "Add to inquiry list"}
                      >
                        <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                        <span>{isInquiryCart ? "✓ Inquired" : "+ Inquire"}</span>
                      </button>

                      <button
                        onClick={() => handleToggleCompare(p)}
                        className={`w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 px-3 rounded-xl border whitespace-nowrap leading-none cursor-pointer transition-all shrink-0 ${
                          isCompared
                            ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-500 shadow-xs"
                            : theme === "dark"
                              ? "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10 hover:text-indigo-400 hover:border-indigo-500/40"
                              : "bg-slate-50 hover:bg-indigo-50 text-slate-700 border-slate-200 hover:text-indigo-700 hover:border-indigo-300"
                        }`}
                        title={isCompared ? "Remove from comparison" : "Add to comparison"}
                      >
                        {isCompared ? (
                          <>
                            <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                            <span>Compare</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => toggleExpand(p.id)}
                        className={`w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 px-3 rounded-xl border transition-all cursor-pointer shrink-0 ${
                          isExpanded
                            ? theme === "dark"
                              ? "bg-slate-800 text-white border-white/20"
                              : "bg-slate-200 text-slate-800 border-slate-300"
                            : theme === "dark"
                              ? "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10 hover:text-white"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900"
                        }`}
                        title={isExpanded ? "Hide technical specifications" : "View technical specifications"}
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span>{isExpanded ? "Hide Specs" : "Specs"}</span>
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-dashed border-slate-200 dark:border-white/10 space-y-3 spec-expanded-view animate-in slide-in-from-top-1.5 duration-200">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Specifications:</span>
                        <p className={`text-xs pl-4 font-semibold mt-0.5 leading-relaxed ${theme === "dark" ? "text-slate-300" : "text-slate-700"}`}>
                          {highlightText(p.specs || "No specifications loaded.", searchTerm)}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Application Instructions:</span>
                        <p className={`text-xs pl-4 font-semibold mt-0.5 leading-relaxed ${theme === "dark" ? "text-slate-300" : "text-slate-700"}`}>
                          {p.usageInstructions || "Clean surface and apply according to instructions."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Clean Inquiry Notification Pill on mobile only when items are in cart */}
      {inquiryCart.length > 0 && (
        <div className="fixed bottom-20 left-4 z-40 md:hidden animate-in slide-in-from-bottom-3 duration-200">
          <button
            onClick={() => setIsInquiryModalOpen(true)}
            className="flex items-center space-x-2 px-3.5 py-2.5 rounded-full bg-emerald-600 text-white font-bold text-xs shadow-xl active:scale-95 cursor-pointer border border-emerald-400/40"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>{inquiryCart.length} Inquired Items</span>
          </button>
        </div>
      )}

      {/* Floating comparison drawer tracker banner */}
      {compareProducts.length > 0 && (
        <div 
          className={`fixed bottom-18 md:bottom-6 left-1/2 -translate-x-1/2 z-40 p-4 rounded-2xl border shadow-2xl flex flex-col md:flex-row items-center gap-4 animate-in slide-in-from-bottom-5 duration-300 max-w-[90vw] md:max-w-xl lg:max-w-2xl backdrop-blur-md ${
            theme === "dark" 
              ? "bg-slate-900/95 border-indigo-500/30 text-white" 
              : "bg-white/95 border-emerald-500/25 text-slate-800 shadow-xl shadow-emerald-500/10"
          }`}
          id="floating-compare-bar"
        >
          <div className="flex items-center space-x-3 w-full md:w-auto">
            <div className={`rounded-lg p-2 flex items-center justify-center shrink-0 ${
              theme === "dark" ? "bg-indigo-500/10 text-indigo-400" : "bg-emerald-50 text-emerald-600"
            }`}>
              <Scale className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-wider">Compare Queue</p>
              <p className={`text-[11px] font-semibold ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
                {compareProducts.length} of 3 models selected
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 justify-start w-full md:w-auto">
            {compareProducts.map((p) => (
              <div 
                key={p.id}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[10px] font-bold tracking-tight border shrink-0 relative group/item ${
                  theme === "dark" ? "bg-slate-800/80 border-white/5" : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="w-5 h-5 rounded overflow-hidden shrink-0 bg-transparent">
                  <img 
                    src={p.imageUrl || `/api/products/${p.id}/image`} 
                    alt={p.name} 
                    className="w-full h-full object-contain" 
                    onError={(e) => { 
                      const target = e.currentTarget as HTMLImageElement;
                      target.onerror = null; 
                      target.src = 'https://abro.com/wp-content/uploads/2020/07/abro-logo.jpg'; 
                    }} 
                  />
                </div>
                <span className="truncate max-w-[80px]">{p.sku}</span>
                <button 
                  onClick={() => handleToggleCompare(p)}
                  className="text-slate-400 hover:text-red-500 transition-colors p-0.5 shrink-0 cursor-pointer"
                  title="Remove from compare"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-2.5 md:pt-0 border-slate-100 dark:border-white/5">
            <button
              onClick={clearCompare}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors ${
                theme === "dark" ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Clear
            </button>
            <button
              onClick={() => setIsCompareModalOpen(true)}
              className={`px-4 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider cursor-pointer shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center space-x-1 ${
                theme === "dark" 
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-550/20" 
                  : "bg-[#016838] hover:bg-[#00A859] text-white shadow-emerald-500/20"
              }`}
            >
              <span>Compare ({compareProducts.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {compareError && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-[10px] uppercase tracking-wider shadow-lg animate-bounce z-50 whitespace-nowrap">
              {compareError}
            </div>
          )}
        </div>
      )}

      {/* Product Specification Comparison Modal Dialog */}
      {isCompareModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/75 backdrop-blur-md" 
            onClick={() => setIsCompareModalOpen(false)}
          />

          {/* Modal Container */}
          <div className={`relative w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden border animate-in zoom-in-95 duration-250 flex flex-col max-h-[85vh] ${
            theme === "dark" ? "bg-[#141414] border-white/10 text-white" : "bg-white border-slate-200 text-slate-800"
          }`}>
            
            {/* Modal Header */}
            <div className={`p-6 border-b flex items-center justify-between ${
              theme === "dark" ? "bg-[#1c1c1c] border-white/5" : "bg-slate-50 border-slate-100"
            }`}>
              <div className="flex items-center space-x-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  theme === "dark" ? "bg-indigo-600/10 text-indigo-400" : "bg-emerald-50 text-emerald-600"
                }`}>
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">Product Spec Comparison</h3>
                  <p className={`text-xs ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
                    Comparing {compareProducts.length} genuine ABRO® Kenya catalogue models side-by-side
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsCompareModalOpen(false)}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  theme === "dark" ? "border-white/5 bg-white/5 text-slate-400 hover:text-white" : "border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Columns */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {compareProducts.map((p) => (
                  <div 
                    key={p.id}
                    className={`rounded-2xl border p-5 flex flex-col justify-between ${
                      theme === "dark" ? "bg-[#1a1a1a]/45 border-white/5" : "bg-slate-50/50 border-slate-200/80"
                    }`}
                  >
                    <div>
                      {/* Column Image & Header */}
                      <div className="flex justify-center mb-4">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-black/5 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-2 flex items-center justify-center relative shadow-sm">
                          <img 
                            src={p.imageUrl || `/api/products/${p.id}/image`} 
                            alt={p.name} 
                            className="max-w-full max-h-full object-contain" 
                            onError={(e) => { 
                              const target = e.currentTarget as HTMLImageElement;
                              target.onerror = null; 
                              target.src = 'https://abro.com/wp-content/uploads/2020/07/abro-logo.jpg'; 
                            }} 
                          />
                        </div>
                      </div>

                      <div className="space-y-1 mb-4 text-center md:text-left">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${theme === "dark" ? "text-indigo-400" : "text-emerald-600"}`}>
                          {p.category}
                        </span>
                        <h4 className="text-sm font-black tracking-tight leading-snug line-clamp-2 min-h-[40px]">{p.name}</h4>
                        <div className="flex items-center justify-center md:justify-start gap-1.5 mt-2 flex-wrap">
                          <span className="text-[10px] font-mono font-black text-slate-400 bg-slate-400/10 dark:bg-white/5 px-2 py-0.5 rounded-lg tracking-wider">
                            SKU: {p.sku}
                          </span>
                          {p.unitSize && (
                            <span className="text-[10px] font-mono font-black text-blue-500 bg-blue-550/10 dark:bg-blue-400/15 px-2 py-0.5 rounded-lg tracking-wider">
                              SIZE: {p.unitSize}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Side by side stats block rows */}
                      <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5 text-left">
                        {/* Specifications Card Section */}
                        <div className="space-y-1.5">
                          <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Specifications</h5>
                          <p className={`text-xs font-semibold leading-relaxed ${theme === "dark" ? "text-slate-350" : "text-slate-705"}`}>
                            {p.specs || "No custom specifications registered."}
                          </p>
                        </div>

                        {/* Directions Section */}
                        <div className="space-y-1.5">
                          <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Usage & Directions</h5>
                          <div className="space-y-1">
                            {(p.usageInstructions || "Apply to clean surface surface areas.")
                              .split("\n")
                              .slice(0, 3) // Cap preview lines in side-by-side to keep compact
                              .map((line, idx) => (
                                <div key={idx} className="text-[11px] font-bold leading-normal flex items-start space-x-1 text-slate-500 dark:text-slate-300">
                                  <span className="text-emerald-500 font-extrabold shrink-0">•</span>
                                  <span className="line-clamp-2">{line}</span>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Order Limit Notice Section */}
                        <div className="space-y-1">
                          <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Order Information</h5>
                          <p className="text-[10px] font-bold text-rose-500 bg-rose-500/10 max-w-max px-2 py-0.5 rounded uppercase">
                            10 CTNS Min. Order Limit
                          </p>
                        </div>

                        {/* Origin Info */}
                        {p.origin && (
                          <div className="space-y-1">
                            <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Origin</h5>
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-350">
                              {p.origin}
                            </p>
                          </div>
                        )}

                        {/* Official Webpage Link */}
                        {p.parentUrl && (
                          <div className="space-y-1 pt-1">
                            <a
                              href={p.parentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-400 dark:text-indigo-300 uppercase tracking-wider hover:underline"
                            >
                              <span>Official Product Page ↗</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleToggleCompare(p)}
                        className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-wider py-1 cursor-pointer"
                      >
                        Remove
                      </button>

                      {onAskAgent && (
                        <button
                          onClick={() => {
                            setIsCompareModalOpen(false);
                            onAskAgent(`Compare genuine ${p.name} (SKU: ${p.sku}) specifications against other line items in ${p.category}.`);
                          }}
                          className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border flex items-center space-x-1 cursor-pointer transition-all ${
                            theme === "dark"
                              ? "bg-indigo-600/15 border-indigo-500/35 text-indigo-300 hover:bg-indigo-600 hover:text-white"
                              : "bg-emerald-50 border-emerald-500/30 text-[#016838] hover:bg-[#016838] hover:text-white"
                          }`}
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          <span>Ask AI</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Placeholder column if comparing fewer than 3 items to show they can select more */}
                {compareProducts.length < 3 && (
                  <div className={`rounded-2xl border border-dashed p-6 flex flex-col items-center justify-center text-center justify-self-stretch ${
                    theme === "dark" ? "border-white/10 text-slate-500" : "border-slate-300 text-slate-400"
                  }`}>
                    <Package className="w-10 h-10 mb-2 opacity-50 text-emerald-500" />
                    <p className="text-xs font-black uppercase tracking-wider">Select more items</p>
                    <p className="text-[10px] mt-1 max-w-[180px] leading-relaxed font-semibold">
                      Add up to {3 - compareProducts.length} more item{3 - compareProducts.length === 1 ? "" : "s"} from the catalog to populate side-by-side technical specs.
                    </p>
                    <button
                      onClick={() => setIsCompareModalOpen(false)}
                      className={`mt-4 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider border cursor-pointer ${
                        theme === "dark" ? "border-slate-700 hover:border-slate-600 text-slate-350" : "border-slate-205 hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      Browse Catalog
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer warning */}
            <div className={`px-6 py-4.5 text-center text-[10px] font-mono tracking-wider uppercase font-black border-t shrink-0 ${
              theme === "dark" ? "bg-[#1a1a1a] border-white/5 text-slate-500" : "bg-slate-50 border-slate-100 text-slate-500"
            }`}>
              🔒 Kenya Wholesale Official Verification Directory • Specifications subject to genuine manufacturer authentication certificates.
            </div>
          </div>
        </div>
      )}

      {/* Inquiry Queue Modal / Bottom Sheet */}
      {isInquiryModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsInquiryModalOpen(false)}
        >
          <div 
            className={`w-full max-w-lg rounded-t-3xl sm:rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-6 duration-300 ${
              theme === "dark" ? "bg-[#111c2a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-850"
            }`}
            onClick={(e) => e.stopPropagation()}
            id="inquiry-queue-modal-panel"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className={`p-2 rounded-xl ${theme === "dark" ? "bg-[#00609C]/20 text-sky-400" : "bg-emerald-50 text-emerald-600"}`}>
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">Inquiry Queue</h3>
                  <p className="text-[11px] text-slate-400">
                    {inquiryCart.length} {inquiryCart.length === 1 ? "product" : "products"} selected for wholesale quote
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsInquiryModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2.5 max-h-72">
              {inquiryCart.length === 0 ? (
                <div className="text-center py-8 text-slate-400 space-y-2">
                  <Package className="w-8 h-8 mx-auto text-slate-500 opacity-60" />
                  <p className="text-xs font-semibold">Your inquiry list is currently empty.</p>
                  <p className="text-[11px] text-slate-500">Tap "+ Inquire" on any product card in the catalog to add items here.</p>
                </div>
              ) : (
                inquiryCart.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                      theme === "dark" ? "bg-[#162334] border-white/5" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-black/10 shrink-0 border border-black/5 dark:border-white/5">
                        <img
                          src={p.imageUrl && !catalogBrokenUrls.has(p.imageUrl) ? p.imageUrl : abroLogo}
                          alt={p.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            target.onerror = null;
                            target.src = abroLogo;
                            if (p.imageUrl) catalogBrokenUrls.add(p.imageUrl);
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{p.name}</p>
                        <p className="text-[10px] font-mono text-slate-400">SKU: {p.sku} • {p.category}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleInquiry(p)}
                      className="p-1.5 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors ml-2 shrink-0 cursor-pointer"
                      title="Remove from inquiry list"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {inquiryCart.length > 0 && (
              <div className="p-4 border-t border-slate-100 dark:border-white/10 flex items-center justify-between gap-3 bg-black/5 dark:bg-white/5">
                <button
                  onClick={clearInquiryCart}
                  className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-wider cursor-pointer"
                >
                  Clear All
                </button>
                <button
                  onClick={() => {
                    setIsInquiryModalOpen(false);
                    handleInquireViaAI();
                  }}
                  className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-lg transition-all cursor-pointer ${
                    theme === "dark" ? "bg-[#00609C] hover:bg-[#0072b8]" : "bg-[#00A859] hover:bg-[#008f4c]"
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Inquire via AI Chat ({inquiryCart.length})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* HIGH-PERFORMANCE UNIFIED PRODUCT IMAGE LIGHTBOX MODAL */}
      {/* ======================================================== */}
      {zoomedProduct && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150"
          id="product-catalog-lightbox-modal"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop Click to Close */}
          <div 
            className="absolute inset-0 cursor-default" 
            onClick={() => setZoomedProduct(null)} 
          />

          {/* Modal Container */}
          <div className={`relative border rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col md:flex-row z-10 animate-in zoom-in-95 duration-150 ${
            theme === "dark" 
              ? "bg-[#0b1726] border-white/10 text-slate-100" 
              : "bg-white border-slate-200 text-slate-800 shadow-xl"
          }`}>
            {/* Close Button */}
            <button
              onClick={() => setZoomedProduct(null)}
              className={`absolute top-4 right-4 z-20 p-2 rounded-full border transition-all cursor-pointer ${
                theme === "dark"
                  ? "bg-white/5 hover:bg-white/15 border-white/10 text-white"
                  : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
              }`}
              title="Close Image Viewer (ESC)"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Left Visual Stage */}
            <div className={`flex-1 flex flex-col p-4 sm:p-6 items-center justify-between min-h-[420px] md:min-h-[580px] relative border-b md:border-b-0 md:border-r transition-colors duration-200 ${
              lightboxBackdrop === "pure-white"
                ? "bg-white text-slate-900 border-slate-200"
                : lightboxBackdrop === "dark"
                  ? "bg-slate-950 text-white border-white/10"
                  : theme === "dark" 
                    ? "bg-[#060e18] border-white/5" 
                    : "bg-slate-50/80 border-slate-100"
            }`}>
              {/* Floating Top Badges */}
              <div className="w-full flex items-center justify-between mb-3 z-10 gap-2">
                <div className="flex items-center flex-wrap gap-2">
                  <span className={`text-[10px] font-mono font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${
                    theme === "dark" 
                      ? "bg-white/5 border-white/10 text-emerald-400" 
                      : "bg-white border-slate-200 text-[#00609C] shadow-xs"
                  }`}>
                    {zoomedProduct.sku}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                    theme === "dark" ? "bg-[#00609C] text-white" : "bg-[#00A859] text-white shadow-xs"
                  }`}>
                    {zoomedProduct.category}
                  </span>
                  <span className={`hidden sm:inline-flex text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${
                    theme === "dark"
                      ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                      : "bg-emerald-50 border-emerald-200 text-emerald-800"
                  }`}>
                    Genuine ABRO USA
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Backdrop Contrast Selector */}
                  <div className={`flex items-center gap-1 border rounded-lg p-0.5 text-[9px] font-bold ${
                    theme === "dark" ? "bg-white/5 border-white/10" : "bg-white border-slate-200 shadow-xs"
                  }`}>
                    <button
                      type="button"
                      onClick={() => setLightboxBackdrop("default")}
                      className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                        lightboxBackdrop === "default"
                          ? "bg-emerald-500 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="Automatic Theme Backdrop"
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setLightboxBackdrop("pure-white")}
                      className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                        lightboxBackdrop === "pure-white"
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="Studio White Backdrop (ideal for dark cans & bottles)"
                    >
                      Light
                    </button>
                    <button
                      type="button"
                      onClick={() => setLightboxBackdrop("dark")}
                      className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                        lightboxBackdrop === "dark"
                          ? "bg-emerald-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                      title="Dark Spotlight Backdrop (ideal for white labels & packaging)"
                    >
                      Dark
                    </button>
                  </div>

                  <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 border ${
                    theme === "dark" ? "bg-white/5 border-white/10 text-slate-300" : "bg-white border-slate-200 text-slate-700 shadow-xs"
                  }`}>
                    <ZoomIn className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{Math.round(lightboxZoomScale * 100)}%</span>
                  </div>
                </div>
              </div>

              {/* Main Image Inspection Stage with High-Contrast Pedestal & Pan-on-Zoom */}
              <div 
                onPointerDown={handlePointerDownImage}
                onPointerMove={handlePointerMoveImage}
                onPointerUp={handlePointerUpImage}
                onPointerCancel={handlePointerUpImage}
                onDoubleClick={handleDoubleClickImage}
                className={`w-full flex-1 flex items-center justify-center overflow-hidden p-4 select-none relative transition-colors ${
                  lightboxZoomScale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
                }`}
                title={lightboxZoomScale > 1 ? "Drag to pan • Double-click to reset" : "Double-click or tap to zoom (2.2x)"}
              >
                {/* Radial glow background pedestal to ensure product text & packaging stand out */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className={`w-4/5 h-4/5 rounded-full blur-3xl opacity-35 transition-opacity ${
                    theme === "dark" ? "bg-emerald-500/15" : "bg-[#00609C]/10"
                  }`} />
                </div>

                {zoomedProduct.imageUrl && !catalogBrokenUrls.has(zoomedProduct.imageUrl) ? (
                  <img
                    src={zoomedProduct.imageUrl}
                    alt={zoomedProduct.name}
                    style={{ 
                      transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${lightboxZoomScale})`,
                      touchAction: lightboxZoomScale > 1 ? "none" : "auto"
                    }}
                    className="max-w-full max-h-[380px] md:max-h-[500px] object-contain transition-transform duration-150 ease-out origin-center select-none filter drop-shadow-xl pointer-events-none"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = abroLogo;
                      catalogBrokenUrls.add(zoomedProduct.imageUrl || "");
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center select-none">
                    <img
                      src={abroLogo}
                      alt="ABRO Genuine Product"
                      style={{ 
                        transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${lightboxZoomScale})`,
                      }}
                      className="max-h-28 md:max-h-36 w-auto object-contain transition-transform duration-150 ease-out select-none drop-shadow-md"
                    />
                    <p className="text-sm font-black mt-4 text-slate-300">Genuine ABRO Kenya Packaging Specification</p>
                    <p className="text-xs font-mono text-emerald-400 mt-1">Direct Statpack Central Warehouse Stock</p>
                  </div>
                )}
              </div>

              {/* Sleek Vertical Floating Zoom Toggle Rail */}
              <div 
                className={`absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5 p-1.5 sm:p-2 rounded-2xl border shadow-2xl backdrop-blur-md select-none transition-all ${
                  theme === "dark" 
                    ? "bg-slate-900/90 border-white/15 text-white shadow-black/60" 
                    : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-300/60"
                }`}
                title="Vertical Zoom Controls"
              >
                {/* Zoom In Button */}
                <button
                  type="button"
                  onClick={() => setLightboxZoomScale((prev) => Math.min(3.5, Number((prev + 0.25).toFixed(2))))}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                    theme === "dark"
                      ? "bg-white/5 hover:bg-white/15 text-emerald-400 border-white/10 active:scale-95"
                      : "bg-slate-100 hover:bg-emerald-50 text-emerald-700 hover:border-emerald-300 border-slate-200 active:scale-95"
                  }`}
                  title="Zoom In (+)"
                  aria-label="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                {/* Vertical Range Slider Track */}
                <div className="py-1 flex flex-col items-center justify-center relative">
                  <input
                    type="range"
                    min="0.5"
                    max="3.5"
                    step="0.1"
                    value={lightboxZoomScale}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setLightboxZoomScale(val);
                      if (val === 1) setPanOffset({ x: 0, y: 0 });
                    }}
                    style={{
                      writingMode: "vertical-lr",
                      direction: "rtl",
                      WebkitAppearance: "slider-vertical",
                      height: "100px",
                      width: "18px"
                    }}
                    className={`cursor-pointer h-24 sm:h-28 w-2 rounded-full ${
                      theme === "dark" ? "accent-emerald-500" : "accent-[#00A859]"
                    }`}
                    aria-label="Vertical zoom level"
                  />
                </div>

                {/* Quick Jump Zoom Presets */}
                <div className="flex flex-col gap-1 w-full">
                  {[2.5, 1.5, 1.0].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setLightboxZoomScale(preset);
                        if (preset === 1.0) setPanOffset({ x: 0, y: 0 });
                      }}
                      className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded-md transition-all cursor-pointer text-center ${
                        Math.abs(lightboxZoomScale - preset) < 0.1
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
                  onClick={() => setLightboxZoomScale((prev) => {
                    const next = Math.max(0.5, Number((prev - 0.25).toFixed(2)));
                    if (next === 1) setPanOffset({ x: 0, y: 0 });
                    return next;
                  })}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                    theme === "dark"
                      ? "bg-white/5 hover:bg-white/15 text-slate-300 border-white/10 active:scale-95"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 active:scale-95"
                  }`}
                  title="Zoom Out (-)"
                  aria-label="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                {/* Reset 100% Button */}
                <button
                  type="button"
                  onClick={() => {
                    setLightboxZoomScale(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                    theme === "dark"
                      ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 active:scale-95"
                      : "bg-[#00609C]/10 hover:bg-[#00609C]/20 text-[#00609C] border-[#00609C]/20 active:scale-95"
                  }`}
                  title="Reset Zoom to 100%"
                  aria-label="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                {/* Current Zoom Level Badge */}
                <div className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black text-center tracking-tight border ${
                  theme === "dark" ? "bg-black/40 border-white/10 text-emerald-400" : "bg-slate-50 border-slate-200 text-slate-700"
                }`}>
                  {Math.round(lightboxZoomScale * 100)}%
                </div>
              </div>

              {/* Bottom Helpful Interaction Banner */}
              <div className={`w-full py-2 px-3.5 rounded-xl border flex items-center justify-between text-[11px] font-medium z-10 ${
                theme === "dark" ? "bg-white/[0.03] border-white/10 text-slate-400" : "bg-white border-slate-200 text-slate-600 shadow-xs"
              }`}>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[10px] sm:text-xs">Double-tap to zoom • Drag to pan • Vertical dock on right</span>
                </div>
                <span className="hidden sm:inline font-mono text-[10px] font-bold text-emerald-500">
                  {lightboxZoomScale > 1 ? "Zoom Active" : "100% View"}
                </span>
              </div>
            </div>

            {/* Right Details Panel: Comprehensive Product Dossier */}
            <div className={`w-full md:w-[420px] p-5 sm:p-6 flex flex-col justify-between overflow-y-auto max-h-[85vh] ${
              theme === "dark" ? "bg-[#0b1726]" : "bg-white"
            }`}>
              <div className="space-y-4">
                {/* Header & Authenticity */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-600 text-white shadow-xs">
                      Strict 10 CTNS MOQ
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(zoomedProduct.sku);
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
                      <span>{copiedSku ? "Copied!" : zoomedProduct.sku}</span>
                    </button>
                  </div>
                  <h3 className={`text-lg sm:text-xl font-black tracking-tight leading-snug ${
                    theme === "dark" ? "text-white" : "text-slate-900"
                  }`}>
                    {zoomedProduct.name}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-medium text-emerald-500">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Official USA Formulation • Sole Distributor: Statpack Industries Ltd</span>
                  </div>
                </div>

                {/* Wholesale Pricing & 10 CTNS MOQ Matrix */}
                {zoomedProduct.price > 0 && (() => {
                  const pricing = calculatePricing(zoomedProduct.price, zoomedProduct.specs || "");
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
                      <div className="flex items-center justify-between text-xs border-b border-current/10 pb-2">
                        <span className="font-bold flex items-center gap-1.5">
                          <span>Piece (Inc 16% VAT):</span>
                        </span>
                        <span className="font-black font-mono text-sm">{formatKES(zoomedProduct.price)}</span>
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

                      {/* Prominent 10 CTNS Wholesale MOQ Total */}
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
                          <span className="font-mono font-semibold">{mOQTotalUnits} total pieces ({pricing.packing} pcs/ctn)</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Official Delivery & Logistics Policy */}
                <div className={`p-3.5 rounded-2xl border space-y-2 ${
                  theme === "dark" ? "bg-white/[0.03] border-white/10 text-slate-200" : "bg-sky-50/70 border-sky-200 text-sky-950"
                }`}>
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-sky-500 dark:text-sky-400">
                    <Truck className="w-4 h-4 shrink-0" />
                    <span>Official Delivery Policy</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-start gap-2">
                      <span className="font-bold shrink-0 text-slate-900 dark:text-white">Delivery:</span>
                      <span className="text-slate-600 dark:text-slate-300">Free delivery within Nairobi, Kiambu, Thika.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold shrink-0 text-slate-900 dark:text-white">Upcountry:</span>
                      <span className="text-slate-600 dark:text-slate-300">Delivery is handled in a case by case basis.</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] opacity-75 pt-1 border-t border-current/10 font-mono">
                      <MapPin className="w-3 h-3 text-sky-500 shrink-0" />
                      <span>Dispatch: Embakasi Central Depot, North Airport Road, Nairobi</span>
                    </div>
                  </div>
                </div>

                {/* Specifications & Packaging */}
                <div className={`p-3 rounded-2xl border space-y-1.5 ${
                  theme === "dark" ? "bg-white/[0.03] border-white/10" : "bg-slate-50 border-slate-200"
                }`}>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <ListFilter className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Specifications & Packaging</span>
                  </span>
                  <p className={`text-xs leading-relaxed font-semibold ${
                    theme === "dark" ? "text-slate-300" : "text-slate-700"
                  }`}>
                    {zoomedProduct.specs || "Official genuine ABRO USA formulation distributed in Kenya by Statpack Industries Ltd."}
                  </p>
                </div>

                {/* Usage Instructions / Application Summary */}
                {zoomedProduct.usageInstructions ? (
                  <div className={`p-3 rounded-2xl border space-y-1 text-xs ${
                    theme === "dark" ? "bg-white/[0.02] border-white/10 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                      Application Guidelines & Usage
                    </span>
                    <p className="leading-relaxed opacity-90 text-[11px]">
                      {zoomedProduct.usageInstructions}
                    </p>
                  </div>
                ) : (
                  <div className={`p-3 rounded-2xl border space-y-1 text-xs ${
                    theme === "dark" ? "bg-white/[0.02] border-white/10 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                      Quality & Safety Assurance
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      Manufactured under ISO-certified quality controls. Shake/stir well prior to application. Apply on clean, dry surfaces in well-ventilated areas.
                    </p>
                  </div>
                )}

                {/* Direct Wholesale Hotline Support */}
                <div className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                  theme === "dark" ? "bg-white/[0.02] border-white/5 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
                }`}>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400">Wholesale Desk</span>
                      <span className="font-mono font-bold text-[11px]">+254 748 441 470 / +254 732 322 182</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] uppercase font-bold text-slate-400">Direct Email</span>
                    <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">orders@statpack.co.ke</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-4 border-t border-current/10 mt-4">
                {/* 1-Click Copy Complete Wholesale Quote & Technical Specs */}
                <button
                  type="button"
                  onClick={() => {
                    const pricing = calculatePricing(zoomedProduct.price, zoomedProduct.specs || "");
                    const quoteText = `*ABRO Kenya Wholesale Product Dossier*\n*Product:* ${zoomedProduct.name}\n*SKU:* ${zoomedProduct.sku}\n*Category:* ${zoomedProduct.category}\n*Piece Price (Inc 16% VAT):* ${formatKES(zoomedProduct.price)}\n*Carton Packing:* ${pricing.packing} units/carton (${formatKES(pricing.ctnIncVat)}/ctn Inc VAT)\n*Minimum Order Quantity (MOQ):* 10 Cartons (${pricing.packing * 10} units) = ${formatKES(pricing.ctnIncVat * 10)} Inc VAT\n*Delivery Terms:* Free delivery within Nairobi, Kiambu, Thika. Upcountry delivery handled in a case by case basis.\n*Distributor:* Statpack Industries Ltd, Embakasi Depot, Nairobi\n*Orders & Inquiries:* +254 748 441 470 / orders@statpack.co.ke`;
                    navigator.clipboard.writeText(quoteText);
                    setCopiedQuote(true);
                    setTimeout(() => setCopiedQuote(false), 2500);
                  }}
                  className={`w-full py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs border ${
                    copiedQuote
                      ? "bg-emerald-600 text-white border-emerald-500"
                      : theme === "dark"
                        ? "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10 hover:text-white"
                        : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  {copiedQuote ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>✓ Copied Wholesale Quote to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Product Specs & Wholesale Quote</span>
                    </>
                  )}
                </button>

                {/* Compare toggle */}
                <button
                  onClick={() => handleToggleCompare(zoomedProduct)}
                  className={`w-full py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs border ${
                    compareProducts.some((cp) => cp.id === zoomedProduct.id)
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-500"
                      : theme === "dark"
                        ? "bg-white/5 hover:bg-white/10 text-slate-200 border-white/10 hover:border-indigo-500/30 hover:text-indigo-300"
                        : "bg-white hover:bg-indigo-50 text-slate-700 border-slate-200 hover:text-indigo-700 hover:border-indigo-200"
                  }`}
                >
                  {compareProducts.some((cp) => cp.id === zoomedProduct.id) ? (
                    <>
                      <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                      <span>✓ In Compare Queue ({compareProducts.length}/3)</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                      <span>Compare Side-by-Side ({compareProducts.length}/3)</span>
                    </>
                  )}
                </button>

                {/* Inquiry toggle */}
                <button
                  onClick={() => handleToggleInquiry(zoomedProduct)}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                    inquiryCart.some((ip) => ip.id === zoomedProduct.id)
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : theme === "dark"
                        ? "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200"
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>
                    {inquiryCart.some((ip) => ip.id === zoomedProduct.id)
                      ? "✓ In Inquiry Queue (Remove)"
                      : "+ Add to Wholesale Inquiry Queue"}
                  </span>
                </button>

                {/* Ask AI Specialist */}
                {onAskAgent && (
                  <button
                    onClick={() => {
                      setZoomedProduct(null);
                      onAskAgent(
                        `Can you provide wholesale specifications, carton pricing, and stock details for genuine ${zoomedProduct.name} (SKU: ${zoomedProduct.sku})?`
                      );
                    }}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer text-white shadow-md ${
                      theme === "dark"
                        ? "bg-gradient-to-r from-[#00609C] to-emerald-600 hover:from-[#0070b8] hover:to-emerald-500"
                        : "bg-gradient-to-r from-[#00A859] to-emerald-700 hover:from-[#00924d] hover:to-emerald-800"
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Ask AI Wholesale Specialist</span>
                  </button>
                )}

                <p className="text-[10px] text-center text-slate-400 font-medium pt-1">
                  Press ESC or click outside to return to catalog
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
