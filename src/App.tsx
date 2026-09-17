import React, { useState, useEffect } from "react";
import { MessageSquare, Settings, Database, Sparkles, Layers, Sliders, RefreshCw, LogIn, HardDrive, Info, Sun, Moon, Compass, ChevronDown, ChevronUp, ArrowUp, Eye, EyeOff, Lock, Unlock, BarChart3, ExternalLink, Minimize2, X } from "lucide-react";
import { Product } from "./types";
import AIAgentChat from "./components/AIAgentChat";
import ProductManager from "./components/ProductManager";
import ContextDocManager from "./components/ContextDocManager";
import AdminLoginGate from "./components/AdminLoginGate";
import ClientCatalog from "./components/ClientCatalog";
import DashboardOverview from "./components/DashboardOverview";
import { calculatePricing, formatKES, getProductImageUrl } from "./utils";
import { applyPersistentImageOverrides, saveProductImageOverride } from "./productImageStore";
import ZoomableImage from "./components/ZoomableImage";
import { CombinedLogo, CorporateHeaderLogos, CorporateFooterLogos, AbroKenyaCompanionIcon } from "./components/BrandLogos";

type ActiveTab = "chat" | "catalog" | "dashboard" | "products" | "context" | "login";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("catalog");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [contextDocument, setContextDocument] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);
  const [isNavbarCollapsed, setIsNavbarCollapsed] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isFooterCollapsed, setIsFooterCollapsed] = useState(true); // Default to collapsed on mobile for maximum chat real-estate
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState<string | undefined>(undefined);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number>(1200); // 20 minutes (1200 seconds)
  const [inactivityMessage, setInactivityMessage] = useState<string | null>(null);
  const lastActivityRef = React.useRef<number>(Date.now());
  const isAdmin = !!adminToken;

  // Dynamic mobile & tablet viewport tracking to anchor chat cleanly above on-screen keyboard
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  const [keyboardInsetBottom, setKeyboardInsetBottom] = useState<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateViewport = () => {
      if (window.visualViewport) {
        const vv = window.visualViewport;
        const kbBottom = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        setKeyboardInsetBottom(kbBottom);
        setVisualViewportHeight(vv.height);
      } else {
        setVisualViewportHeight(window.innerHeight);
        setKeyboardInsetBottom(0);
      }
    };

    updateViewport();
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateViewport);
      window.visualViewport.addEventListener("scroll", updateViewport);
    }
    window.addEventListener("resize", updateViewport);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateViewport);
        window.visualViewport.removeEventListener("scroll", updateViewport);
      }
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  const handleAdminLogin = (token: string) => {
    setAdminToken(token);
    setActiveTab("products");
    setInactivityMessage(null);
  };

  const handleAdminLogout = () => {
    setAdminToken(null);
    setActiveTab("catalog");
  };

  // Monitor idle activity and trigger automatic logout after 20 minutes of inactivity
  useEffect(() => {
    if (!isAdmin) return;

    setIdleSecondsLeft(1200);
    lastActivityRef.current = Date.now();

    const intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, 1200 - elapsed);
      setIdleSecondsLeft(remaining);

      if (remaining <= 0) {
        clearInterval(intervalId);
        handleAdminLogout();
        setInactivityMessage("Administrative session expired due to 20 minutes of inactivity.");
      }
    }, 1000);

    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    const handleUserInteraction = () => {
      const now = Date.now();
      // Throttle state update to once every 2 seconds to boost React performance
      if (now - lastActivityRef.current > 2000) {
        setIdleSecondsLeft(1200);
      }
      lastActivityRef.current = now;
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserInteraction);
    });

    return () => {
      clearInterval(intervalId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserInteraction);
      });
    };
  }, [isAdmin]);

  // Theme support: Light is themed on Statpack Green/Gold/White, Dark is themed on ABRO Red/Blue/Deep Navy
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("theme") as "light" | "dark") || "dark"
  );

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
  };

  // Fetch initial database items on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Track scroll position to dynamically apply 'shadow-md' and show the 'Back to top' button
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      setIsScrolled(scrollY > 10);
      setShowBackToTop(scrollY > 200);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    // Also listen to capture scroll events on any internal scrollable containers (e.g. Catalog scroll area, dashboard)
    const handleCaptureScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && typeof target.scrollTop === "number") {
        const currentScroll = Math.max(window.scrollY || 0, target.scrollTop);
        setIsScrolled(currentScroll > 10);
        setShowBackToTop(currentScroll > 200);
      }
    };

    document.addEventListener("scroll", handleCaptureScroll, { capture: true, passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleCaptureScroll, { capture: true });
    };
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    document.body.scrollTo({ top: 0, behavior: "smooth" });
    const scrollables = document.querySelectorAll(".overflow-y-auto, [id*='scroll'], #catalog-products-scroll-area");
    scrollables.forEach((el) => {
      el.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const fetchData = async () => {
    setIsLoading(true);
    setErrorInfo(null);
    try {
      const [prodRes, ctxRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/context")
      ]);

      if (!prodRes.ok || !ctxRes.ok) {
        throw new Error("Failed to load initial stock lists or context defaults. Launching with backup simulation.");
      }

      const prodData = await prodRes.json();
      const ctxData = await ctxRes.json();

      const rawProducts: Product[] = prodData.products || [];
      const enrichedProducts = await applyPersistentImageOverrides(rawProducts);

      setProducts(enrichedProducts);
      setContextDocument(ctxData.context || "");
    } catch (err: any) {
      setErrorInfo(err.message || "Unable to reach server. Please restart development server.");
    } finally {
      setIsLoading(false);
    }
  };

  // Add a product
  const handleAddProduct = async (newProduct: Omit<Product, "id">) => {
    try {
      if (newProduct.imageUrl) {
        await saveProductImageOverride(newProduct.sku, newProduct.imageUrl);
        await saveProductImageOverride(newProduct.name, newProduct.imageUrl);
      }
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(adminToken ? { "Authorization": `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify(newProduct)
      });
      if (!res.ok) throw new Error("Could not save new product.");
      const data = await res.json();
      const savedProd: Product = data.product;
      if (newProduct.imageUrl) {
        await saveProductImageOverride(savedProd.id, newProduct.imageUrl);
      }
      if (data.updated) {
        setProducts((prev) => prev.map((p) => (p.id === savedProd.id ? savedProd : p)));
      } else {
        setProducts((prev) => [...prev, savedProd]);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Update a product (Amend/Change price/Image)
  const handleUpdateProduct = async (id: string, updatedFields: Partial<Product>) => {
    try {
      const existingProduct = products.find(p => p.id === id);
      if (updatedFields.imageUrl) {
        await saveProductImageOverride(id, updatedFields.imageUrl);
        if (existingProduct?.sku) {
          await saveProductImageOverride(existingProduct.sku, updatedFields.imageUrl);
        }
        if (existingProduct?.name) {
          await saveProductImageOverride(existingProduct.name, updatedFields.imageUrl);
        }
        // Direct server update for image URL
        try {
          await fetch(`/api/products/${id}/image`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: updatedFields.imageUrl })
          });
        } catch (patchErr) {
          console.warn("Direct image patch error:", patchErr);
        }
      }

      // Optimistically update products state right away
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updatedFields } : p)));

      // If full admin PUT update
      if (adminToken) {
        const res = await fetch(`/api/products/${id}`, {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${adminToken}`
          },
          body: JSON.stringify(updatedFields)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.product) {
            setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.product } : p)));
          }
        }
      }
    } catch (err: any) {
      console.error("Update product error:", err?.message || err);
    }
  };

  // Delete product
  const handleDeleteProduct = async (id: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "DELETE",
        headers: {
          ...(adminToken ? { "Authorization": `Bearer ${adminToken}` } : {})
        }
      });
      if (!res.ok) throw new Error("Could not delete item.");
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Bulk add products derived from AI parsing
  const handleBulkAddProducts = async (newProducts: Omit<Product, "id">[]) => {
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(adminToken ? { "Authorization": `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({ products: newProducts })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Could not bulk upload products.");
      }
      const data = await res.json();
      if (data.products) {
        setProducts(data.products);
      }
    } catch (err: any) {
      alert("Failed to insert parsed items: " + err.message);
    }
  };

  // Save additional context text document
  const handleSaveContext = async (text: string) => {
    try {
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(adminToken ? { "Authorization": `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({ context: text })
      });
      if (!res.ok) throw new Error("Failed to save rules text.");
      const data = await res.json();
      setContextDocument(data.context);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Full system reset back to defaults
  const handleResetCatalogue = async (e?: any) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/products/reset", {
        method: "POST",
        headers: {
          ...(adminToken ? { "Authorization": `Bearer ${adminToken}` } : {})
        }
      });
      if (!res.ok) throw new Error("Database reset failed.");
      const data = await res.json();
      setProducts(data.products);
      setContextDocument(data.context);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`flex flex-col font-sans transition-colors duration-300 ${
        activeTab === "chat"
          ? "h-screen h-[100dvh] max-h-[100dvh] overflow-hidden"
          : "min-h-screen"
      } ${
        theme === "dark"
          ? "bg-[#030e1a] bg-gradient-to-br from-[#020d18] via-[#05233c] to-[#010810] text-[#f2f7fa]"
          : "bg-[#fafcfb] bg-gradient-to-br from-white via-[#f3faf5] to-[#f7f9f8] text-[#1e2e28]"
      }`}
      id="abro-root-container"
    >
      
      {/* Top Professional Header - In-flow layout ensures zero overlap with details behind it */}
      <header
        className={`shrink-0 sticky top-0 z-50 transition-all duration-300 ease-in-out border-b ${
          isScrolled
            ? theme === "dark"
              ? "bg-[#061928]/95 border-white/20 text-white backdrop-blur-xl shadow-md shadow-black/40"
              : "bg-white/95 border-[#00A859]/25 text-slate-800 shadow-md shadow-emerald-950/10 backdrop-blur-xl"
            : theme === "dark"
              ? "bg-[#061928]/90 border-transparent text-white backdrop-blur-md shadow-none"
              : "bg-white/90 border-transparent text-slate-800 shadow-none backdrop-blur-md"
        }`}
      >
        {isNavbarCollapsed ? (
          /* Slim Non-Blocking Strip - completely uncrowded, sitting in normal layout flow */
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center">
            <button
              onClick={() => setIsNavbarCollapsed(false)}
              className={`group flex items-center space-x-1.5 px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer border shadow-xs ${
                theme === "dark"
                  ? "bg-[#0c1e30] border-white/10 text-indigo-300 hover:text-white hover:bg-[#00609C]"
                  : "bg-white border-[#00A859]/20 text-[#00A859] hover:bg-[#00A859] hover:text-white shadow-emerald-800/5"
              }`}
              id="expand-navbar-floating-btn"
              title="Show Menu Bar"
            >
              <ChevronDown className="w-3.5 h-3.5 transition-transform group-hover:translate-y-0.5" />
              <span className="text-[11px] font-bold tracking-wide">Show Menu Bar</span>
            </button>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-300">
            {/* Corporate Header (ABRO Kenya) */}
            <div className="flex items-center">
              <CorporateHeaderLogos theme={theme} />
            </div>

            <div className="flex items-center gap-3">
              {/* Mobile Navigation Dropdown */}
              <div className="block sm:hidden relative w-36">
                <select
                  value={isChatExpanded ? "chat-expanded" : isChatOpen ? "chat-widget" : activeTab}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "chat-expanded") {
                      setIsChatOpen(true);
                      setIsChatExpanded(true);
                    } else if (val === "chat-widget" || val === "chat") {
                      setIsChatOpen(true);
                      setIsChatExpanded(false);
                    } else {
                      setIsChatExpanded(false);
                      setActiveTab(val as ActiveTab);
                    }
                  }}
                  className={`w-full appearance-none cursor-pointer pl-8 pr-7 py-1.5 rounded-xl text-xs font-bold tracking-wide border shadow-sm transition-all outline-none ${
                    theme === "dark"
                      ? "bg-[#0c1e30] border-white/10 text-white focus:border-[#00609C]"
                      : "bg-white border-[#00A859]/20 text-slate-800 focus:border-[#00A859]"
                  }`}
                >
                  <option value="catalog">Catalog</option>
                  <option value="chat-widget">AI Chat {isChatOpen ? "(Open)" : ""}</option>
                  {isChatOpen && <option value="chat-expanded">AI Chat (Full)</option>}
                  {isAdmin && <option value="dashboard">Dashboard Overview</option>}
                  {isAdmin && <option value="products">Stock</option>}
                  {isAdmin && <option value="context">Rules</option>}
                  {activeTab === "login" && !isAdmin && <option value="login">Admin 🔒</option>}
                </select>
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  {isChatOpen || activeTab === "chat" ? (
                    <MessageSquare className={`w-3.5 h-3.5 ${theme === "dark" ? "text-indigo-400" : "text-[#00A859]"}`} />
                  ) : activeTab === "catalog" ? (
                    <Compass className={`w-3.5 h-3.5 ${theme === "dark" ? "text-indigo-400" : "text-[#00A859]"}`} />
                  ) : activeTab === "dashboard" ? (
                    <BarChart3 className={`w-3.5 h-3.5 ${theme === "dark" ? "text-indigo-400" : "text-[#00A859]"}`} />
                  ) : activeTab === "products" ? (
                    <Database className={`w-3.5 h-3.5 ${theme === "dark" ? "text-indigo-400" : "text-[#00A859]"}`} />
                  ) : activeTab === "context" ? (
                    <Settings className={`w-3.5 h-3.5 ${theme === "dark" ? "text-indigo-400" : "text-[#00A859]"}`} />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  )}
                </div>
                <div className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
                  <ChevronDown className="w-3 h-3" />
                </div>
              </div>

              {/* Desktop Navigation Control Toggles */}
              <div className={`hidden sm:flex items-center p-1 rounded-xl border backdrop-blur-md transition-colors ${
                theme === "dark"
                  ? "bg-white/5 border-white/10"
                  : "bg-slate-100 border-[#00A859]/10"
              }`}>
                {/* Catalog Tab Button - Default primary view */}
                <button
                  onClick={() => {
                    setActiveTab("catalog");
                    setIsChatExpanded(false);
                  }}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                    activeTab === "catalog" && !isChatExpanded
                      ? theme === "dark"
                        ? "bg-[#00609C] text-white shadow font-bold border border-white/10"
                        : "bg-[#00A859] text-white shadow font-bold border border-[#00A859]/10"
                      : theme === "dark"
                        ? "text-slate-300 hover:text-white"
                        : "text-slate-600 hover:text-[#00a859] hover:bg-[#00a859]/5"
                  }`}
                  id="nav-catalog-tab-btn"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Catalog</span>
                </button>

                {/* AI Chat Tab Button - Initiates or toggles floating assistant / full page */}
                <button
                  onClick={() => {
                    if (!isChatOpen) {
                      setIsChatOpen(true);
                      setIsChatExpanded(false);
                    } else if (!isChatExpanded) {
                      setIsChatExpanded(true);
                    } else {
                      setIsChatExpanded(false);
                    }
                  }}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                    isChatOpen || isChatExpanded
                      ? theme === "dark"
                        ? "bg-gradient-to-r from-[#00609C] to-emerald-600 text-white shadow font-bold border border-white/10"
                        : "bg-gradient-to-r from-[#00A859] to-emerald-700 text-white shadow font-bold border border-[#00A859]/10"
                      : theme === "dark"
                        ? "text-slate-300 hover:text-white"
                        : "text-slate-600 hover:text-[#00a859] hover:bg-[#00a859]/5"
                  }`}
                  title={!isChatOpen ? "Initiate AI Assistant" : isChatExpanded ? "Minimize AI Chat to window" : "Expand AI Chat to full page"}
                  id="nav-aichat-tab-btn"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>AI Chat</span>
                  {isChatOpen && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300"></span>
                    </span>
                  )}
                </button>

                {isAdmin && (
                  <button
                    onClick={() => setActiveTab("dashboard")}
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      activeTab === "dashboard"
                        ? theme === "dark"
                          ? "bg-[#00609C] text-white shadow font-bold border border-white/10"
                          : "bg-[#00A859] text-white shadow font-bold border border-[#00A859]/10"
                        : theme === "dark"
                          ? "text-slate-300 hover:text-white"
                          : "text-slate-600 hover:text-[#00a859] hover:bg-[#00a859]/5"
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Dashboard Overview</span>
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={() => setActiveTab("products")}
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      activeTab === "products"
                        ? theme === "dark"
                          ? "bg-[#00609C] text-white shadow font-bold border border-white/10"
                          : "bg-[#00A859] text-white shadow font-bold border border-[#00A859]/10"
                        : theme === "dark"
                          ? "text-slate-300 hover:text-white"
                          : "text-slate-600 hover:text-[#00a859] hover:bg-[#00a859]/5"
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Stock</span>
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={() => setActiveTab("context")}
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      activeTab === "context"
                        ? theme === "dark"
                          ? "bg-[#00609C] text-white shadow font-bold border border-white/10"
                          : "bg-[#00A859] text-white shadow font-bold border border-[#00A859]/10"
                        : theme === "dark"
                          ? "text-slate-300 hover:text-white"
                          : "text-slate-600 hover:text-[#00a859] hover:bg-[#00a859]/5"
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Rules</span>
                  </button>
                )}
              </div>

              {/* Admin session logout action to lock consoles on demand */}
              {isAdmin && (
                <button
                  onClick={handleAdminLogout}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl border cursor-pointer transition-all duration-200 text-[10px] sm:text-xs font-bold ${
                    theme === "dark"
                      ? "bg-rose-950/20 hover:bg-[#9C0000]/10 text-rose-400 border-[#9C0000]/25"
                      : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                  }`}
                  title="Lock Session (20 min inactivity timeout)"
                  id="admin-logout-trigger-btn"
                >
                  <Unlock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="hidden md:inline">Logout ({Math.floor(idleSecondsLeft / 60)}:{(idleSecondsLeft % 60).toString().padStart(2, "0")})</span>
                  <span className="md:hidden">{Math.floor(idleSecondsLeft / 60)}:{(idleSecondsLeft % 60).toString().padStart(2, "0")}</span>
                </button>
              )}

              {/* Theme Switcher Icon Toggle */}
              <button
                onClick={toggleTheme}
                className={`p-1.5 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 shrink-0 ${
                  theme === "dark"
                    ? "hover:bg-white/5 text-amber-400 hover:text-amber-300"
                    : "hover:bg-slate-100 text-slate-600 hover:text-indigo-600"
                }`}
                title={theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              {/* Header Collapse Toggle - UP ARROW */}
              <button
                onClick={() => setIsNavbarCollapsed(true)}
                className={`p-1.5 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 shrink-0 border ${
                  theme === "dark"
                    ? "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/10"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border-slate-200"
                }`}
                title="Collapse Menu Bar (Up Arrow)"
                aria-label="Collapse Menu Bar"
                id="collapse-header-nav-btn"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Quiet Security/Inactivity Logout Notice Banner */}
      {inactivityMessage && (
        <div className={`border-b py-3 px-6 text-xs flex items-center justify-between shrink-0 backdrop-blur-sm animate-in slide-in-from-top-4 duration-300 ${
          theme === "dark"
            ? "bg-amber-950/40 border-amber-500/20 text-amber-300"
            : "bg-amber-50 border-[#b2a12a]/20 text-amber-805"
        }`}>
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-amber-500 shrink-0" />
            <span><strong>Session Notice:</strong> {inactivityMessage} (All admin sessions expire immediately when refreshed, reloaded or left completely idle).</span>
          </div>
          <button
            onClick={() => setInactivityMessage(null)}
            className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg transition-colors ${
              theme === "dark" ? "text-amber-400 hover:text-white hover:bg-white/5" : "text-amber-800 hover:text-amber-900 hover:bg-black/5"
            }`}
          >
            Acknowledge
          </button>
        </div>
      )}

      {/* Warning State Banner if unable to call local backend */}
      {errorInfo && (
        <div className="bg-rose-950/40 border-b border-rose-500/20 py-3 px-6 text-xs text-rose-300 flex items-center justify-between shrink-0 backdrop-blur-sm">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-rose-450 shrink-0" />
            <span><strong>Database Error:</strong> {errorInfo}. Please check that the server booted correctly on port 3000.</span>
          </div>
          <button
            onClick={fetchData}
            className="p-1.5 hover:bg-white/10 rounded text-rose-300 transition-all font-semibold flex items-center space-x-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry Sync</span>
          </button>
        </div>
      )}

      {/* Loading Block overlay */}
      {isLoading && products.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center space-y-3 bg-slate-950/40 backdrop-blur-md">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs text-slate-450 font-medium font-mono">Synchronizing active stocks and specs...</p>
        </div>
      )}

      {/* Primary Workspace Panels */}
      <main className={`flex-1 w-full mx-auto flex flex-col min-h-0 ${
        activeTab === "chat"
          ? "max-w-7xl px-0 sm:px-4 md:px-6 py-0 h-full overflow-hidden"
          : "max-w-7xl px-3 sm:px-6 lg:px-8 py-3 sm:py-6"
      }`}>
        
        {/* Dynamic renders */}
        {activeTab === "chat" && (
          <div 
            className="w-full h-full flex-1 flex flex-col min-h-0 overflow-hidden relative"
            style={
              keyboardInsetBottom > 0
                ? { paddingBottom: `${keyboardInsetBottom}px` }
                : undefined
            }
          >
            <div className="w-full bg-slate-900 text-white px-3 sm:px-4 py-2 flex items-center justify-between border-b border-white/10 text-xs shrink-0 select-none">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">ABRO Kenya AI Assistant</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("catalog");
                    setIsChatOpen(true);
                    setIsChatExpanded(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center gap-1.5 cursor-pointer text-xs transition-colors shadow-xs"
                  title="Switch to floating chat widget"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Minimize to Widget</span>
                  <span className="inline sm:hidden">Minimize</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("catalog");
                    setIsChatOpen(false);
                    setIsChatExpanded(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1.5 cursor-pointer text-xs border border-white/15 transition-colors"
                  title="Exit to catalog"
                >
                  <X className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">Exit to Catalog</span>
                  <span className="inline sm:hidden">Exit</span>
                </button>
              </div>
            </div>
            {/* AI Assistant Chatbot - Full screen layout */}
            <AIAgentChat
              products={products}
              onQuickSearch={() => setActiveTab("catalog")}
              theme={theme}
              externalTriggerQuery={catalogQuery}
              onClearExternalTrigger={() => setCatalogQuery(undefined)}
              onUpdateProductImageUrl={async (id, newUrl) => {
                const target = products.find(p => p.id === id);
                if (target) {
                  await saveProductImageOverride(id, newUrl);
                  if (target.sku) await saveProductImageOverride(target.sku, newUrl);
                  if (target.name) await saveProductImageOverride(target.name, newUrl);
                }
                setProducts(prev => prev.map(p => p.id === id ? { ...p, imageUrl: newUrl } : p));
                handleUpdateProduct(id, { imageUrl: newUrl });
              }}
              isExpanded={true}
              onToggleExpand={() => {
                setActiveTab("catalog");
                setIsChatOpen(true);
                setIsChatExpanded(false);
              }}
              onClose={() => {
                setActiveTab("catalog");
                setIsChatOpen(false);
                setIsChatExpanded(false);
              }}
            />
          </div>
        )}

        {/* Dedicated Full Page Catalog Screen */}
        {activeTab === "catalog" && (
          <div className="w-full flex-1 flex flex-col animate-in fade-in duration-200">
            <ClientCatalog
              products={products}
              theme={theme}
              onAskAgent={(query) => {
                setCatalogQuery(query);
                setIsChatOpen(true);
              }}
              onOpenChat={() => setIsChatOpen(true)}
            />
          </div>
        )}

        {/* Dashboard Overview Screen (Admin Only) */}
        {activeTab === "dashboard" && (
          !isAdmin ? (
            <AdminLoginGate onLoginSuccess={handleAdminLogin} theme={theme} />
          ) : (
            <div className="w-full flex-1 flex flex-col min-h-0 overflow-y-auto animate-in fade-in duration-200 py-2">
              <DashboardOverview
                products={products}
                theme={theme}
                onNavigateToCatalog={(query) => {
                  setCatalogQuery(query);
                  setActiveTab("catalog");
                }}
                onNavigateToProducts={() => {
                  setActiveTab("products");
                }}
              />
            </div>
          )
        )}

        {/* Dynamic Admin Portal Login Screen */}
        {activeTab === "login" && !isAdmin && (
          <div className="w-full flex-1 flex flex-col min-h-0 overflow-hidden animate-in fade-in duration-200 py-6">
            <AdminLoginGate onLoginSuccess={handleAdminLogin} theme={theme} />
          </div>
        )}

        {activeTab === "products" && (
          !isAdmin ? (
            <AdminLoginGate onLoginSuccess={handleAdminLogin} theme={theme} />
          ) : (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className={`space-y-1 p-6 rounded-2xl border shadow-lg backdrop-blur-md transition-colors ${
                theme === "dark"
                  ? "bg-[#061e33]/90 border-white/10 text-white"
                  : "bg-white border-[#00A859]/15 text-slate-800 shadow-emerald-950/5"
              }`}>
                <div className="flex items-center space-x-2">
                  <Database className={`w-5 h-5 ${theme === "dark" ? "text-indigo-400" : "text-[#00A859]"}`} />
                  <h2 className={`text-base font-bold ${theme === "dark" ? "text-white" : "text-[#016838]"}`}>ABRO Dynamic Catalogue Storage</h2>
                </div>
                <p className={`text-xs leading-relaxed ${theme === "dark" ? "text-slate-405" : "text-slate-650"}`}>
                  Add new products, delete dead stock, modify specifications, or instantly overwrite any product price. The AI agent immediately updates its recommendations following storage edits.
                </p>
              </div>

              <ProductManager
                products={products}
                onAddProduct={handleAddProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                onResetCatalogue={handleResetCatalogue}
                onRefreshProducts={fetchData}
                isLoading={isLoading}
                theme={theme}
                adminToken={adminToken}
              />
            </div>
          )
        )}

        {activeTab === "context" && (
          !isAdmin ? (
            <AdminLoginGate onLoginSuccess={handleAdminLogin} theme={theme} />
          ) : (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className={`space-y-1 p-6 rounded-2xl border shadow-lg backdrop-blur-md transition-colors ${
                theme === "dark"
                  ? "bg-[#061e33]/95 border-white/10 text-white"
                  : "bg-white border-[#00A859]/15 text-slate-800 shadow-emerald-950/5"
              }`}>
                <div className="flex items-center space-x-2">
                  <Settings className={`w-5 h-5 ${theme === "dark" ? "text-indigo-400" : "text-[#00A859]"}`} />
                  <h2 className={`text-base font-bold ${theme === "dark" ? "text-white" : "text-[#016838]"}`}>Custom Documents, Rule Overrides & Imports</h2>
                </div>
                <p className={`text-xs leading-relaxed ${theme === "dark" ? "text-slate-405" : "text-slate-650"}`}>
                  Upload or paste additional context guidelines for special shop rules, shipping fees, or support hours. Use the intelligent AI parser to convert a raw pricing list directly into structured database records.
                </p>
              </div>

              <ContextDocManager
                contextDocument={contextDocument}
                onSaveContext={handleSaveContext}
                onBulkAddProducts={handleBulkAddProducts}
                isLoading={isLoading}
                theme={theme}
                adminToken={adminToken}
                products={products}
              />
            </div>
          )
        )}

      </main>

      {/* Global Application Footer with Logo 2 (ABRO) and Logo 3 (Statpack) - Collapsible on Mobile when in Chat */}
      {activeTab === "chat" ? (
        <div className="shrink-0 z-20 transition-all duration-300" id="chat-mobile-footer-wrapper">
          {/* Mobile Collapse/Expand Control Strip */}
          <div className="sm:hidden flex items-center justify-between px-3 py-1 border-t bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-md text-[10px] select-none">
            <button
              type="button"
              onClick={() => setIsFooterCollapsed(!isFooterCollapsed)}
              className={`flex items-center space-x-1.5 font-bold cursor-pointer transition-all hover:opacity-100 ${
                theme === "dark" ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
              }`}
              title={isFooterCollapsed ? "Show ABRO & Statpack branding footer" : "Hide footer to maximize chat screen"}
              id="toggle-chat-footer-mobile-btn"
            >
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isFooterCollapsed ? "rotate-180" : "rotate-0"}`} />
              <span>{isFooterCollapsed ? "Show ABRO & Statpack Logos" : "Hide Footer Logos"}</span>
            </button>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">
              Statpack Industries Ltd
            </span>
          </div>

          {/* Collapsible Footer Body */}
          <footer
            className={`border-t transition-all duration-300 ${
              isFooterCollapsed
                ? "hidden sm:block py-1.5 px-4 sm:px-6"
                : "block py-2 px-3 sm:px-6"
            } ${
              theme === "dark"
                ? "bg-[#061928]/95 border-white/10 text-slate-400"
                : "bg-white/95 border-[#00A859]/15 text-slate-600 shadow-inner"
            }`}
            id="global-app-footer"
          >
            <div className="max-w-7xl mx-auto flex flex-col md:flex-col lg:flex-row items-center justify-between gap-2.5 sm:gap-3 text-xs">
              {/* Both logos strictly on 1 line and perfectly aligned in tablet/mobile/desktop */}
              <div className="inline-flex items-center justify-center shrink-0">
                <CorporateFooterLogos theme={theme} />
              </div>

              {/* Everything else formatted into 2 neat lines in tablet and mobile mode */}
              <div className="flex flex-col items-center md:items-center lg:items-end text-center lg:text-right gap-0.5 leading-snug">
                <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  Sole Importer & Authorized Distributor in Kenya & East Africa
                </span>
                <div className="flex items-center justify-center lg:justify-end gap-2 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  <a
                    href="https://statpack.co.ke/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors inline-flex items-center gap-1 font-semibold"
                    title="Visit Statpack Industries Ltd Official Website (statpack.co.ke)"
                  >
                    <span>© {new Date().getFullYear()} Statpack Industries Ltd</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </a>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    ABRO Kenya
                  </span>
                </div>
              </div>
            </div>
          </footer>
        </div>
      ) : (
        <footer
          className={`shrink-0 border-t transition-colors z-20 py-3.5 px-4 sm:px-6 lg:px-8 mt-auto ${
            theme === "dark"
              ? "bg-[#061928]/90 border-white/10 text-slate-400"
              : "bg-white/95 border-[#00A859]/15 text-slate-600 shadow-inner"
          }`}
          id="global-app-footer"
        >
          <div className="max-w-7xl mx-auto flex flex-col md:flex-col lg:flex-row items-center justify-between gap-2.5 sm:gap-3 text-xs">
            {/* Both logos strictly on 1 line and perfectly aligned in tablet/mobile/desktop */}
            <div className="inline-flex items-center justify-center shrink-0">
              <CorporateFooterLogos theme={theme} />
            </div>

            {/* Everything else formatted into 2 neat lines in tablet and mobile mode */}
            <div className="flex flex-col items-center md:items-center lg:items-end text-center lg:text-right gap-0.5 leading-snug">
              <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Sole Importer & Authorized Distributor in Kenya & East Africa
              </span>
              <div className="flex items-center justify-center lg:justify-end gap-2 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                <a
                  href="https://statpack.co.ke/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors inline-flex items-center gap-1 font-semibold"
                  title="Visit Statpack Industries Ltd Official Website (statpack.co.ke)"
                >
                  <span>© {new Date().getFullYear()} Statpack Industries Ltd</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
                <span>•</span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  ABRO Kenya
                </span>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* AI Chat Window (Floating Widget or Full-Page Expanded) */}
      {isChatOpen && activeTab !== "chat" && (
        <aside
          className={
            isChatExpanded
              ? "fixed inset-0 z-50 flex flex-col bg-slate-950/85 backdrop-blur-md p-0 sm:p-2 md:p-3 animate-in fade-in duration-200"
              : `fixed z-50 flex flex-col overflow-hidden backdrop-blur-xl animate-in fade-in duration-200 inset-0 sm:inset-x-4 md:inset-x-8 sm:top-3 sm:bottom-3 md:top-4 md:bottom-4 sm:max-w-2xl sm:mx-auto sm:rounded-2xl sm:border lg:inset-auto lg:bottom-4 lg:right-4 lg:w-[560px] xl:w-[620px] lg:h-[min(700px,calc(100vh-2rem))] lg:max-h-[calc(100vh-2rem)] lg:rounded-2xl lg:border ${
                  theme === "dark"
                    ? "border-emerald-500/30 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] bg-[#121b28]/95"
                    : "border-[#00A859]/30 shadow-[0_20px_60px_-15px_rgba(0,168,89,0.35)] bg-white/95"
                }`
          }
          style={
            keyboardInsetBottom > 0
              ? { bottom: `${keyboardInsetBottom}px` }
              : undefined
          }
          id="ai-agent-chat-floating-container"
          aria-label="AI Assistant Window"
        >
          <div className={isChatExpanded ? "w-full h-full flex-1 max-w-7xl mx-auto flex flex-col min-h-0 overflow-hidden rounded-none sm:rounded-2xl border shadow-2xl" : "w-full h-full flex-1 flex flex-col min-h-0 overflow-hidden"}>
            <AIAgentChat
              products={products}
              onQuickSearch={() => {
                setIsChatExpanded(false);
                setActiveTab("catalog");
              }}
              theme={theme}
              externalTriggerQuery={catalogQuery}
              onClearExternalTrigger={() => setCatalogQuery(undefined)}
              onUpdateProductImageUrl={async (id, newUrl) => {
                const target = products.find(p => p.id === id);
                if (target) {
                  await saveProductImageOverride(id, newUrl);
                  if (target.sku) await saveProductImageOverride(target.sku, newUrl);
                  if (target.name) await saveProductImageOverride(target.name, newUrl);
                }
                setProducts(prev => prev.map(p => p.id === id ? { ...p, imageUrl: newUrl } : p));
                handleUpdateProduct(id, { imageUrl: newUrl });
              }}
              isExpanded={isChatExpanded}
              onToggleExpand={() => setIsChatExpanded(!isChatExpanded)}
              onClose={() => {
                setIsChatOpen(false);
                setIsChatExpanded(false);
              }}
            />
          </div>
        </aside>
      )}

      {/* Floating Button to Initiate AI Chat */}
      {!isChatOpen && activeTab !== "chat" && (
        <button
          id="initiate-ai-chat-btn"
          type="button"
          onClick={() => {
            setIsChatOpen(true);
            setIsChatExpanded(false);
          }}
          className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5 rounded-full shadow-2xl border cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 group select-none ${
            theme === "dark"
              ? "bg-gradient-to-r from-[#00609C] via-[#007cc2] to-[#00A859] text-white border-sky-400/40 shadow-[0_10px_35px_rgba(0,96,156,0.55)]"
              : "bg-gradient-to-r from-[#00A859] via-[#00bf65] to-[#00609C] text-white border-emerald-400/40 shadow-[0_10px_35px_rgba(0,168,89,0.4)]"
          }`}
          title="Open ABRO AI Assistant (Catalog & Specs Support)"
          aria-label="Initiate AI Assistant Chat"
        >
          <div className="relative flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-amber-300 animate-pulse group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white/50" />
          </div>
          <div className="flex flex-col items-start text-left leading-none">
            <span className="text-xs sm:text-sm font-black tracking-wide uppercase flex items-center gap-1.5">
              <span>Ask AI Assistant</span>
            </span>
            <span className="text-[10px] opacity-90 font-medium mt-0.5">Product Specs & Pricing</span>
          </div>
        </button>
      )}

      {/* Back to Top Floating Button - Anchored on the bottom-left */}
      {showBackToTop && !isChatOpen && activeTab !== "chat" && (
        <button
          type="button"
          onClick={handleScrollToTop}
          className={`fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-40 flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-full shadow-xl border cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 animate-in fade-in ${
            theme === "dark"
              ? "bg-[#00609C] hover:bg-[#0072b8] text-white border-sky-400/40 shadow-black/60"
              : "bg-[#00A859] hover:bg-[#00924d] text-white border-emerald-400/30 shadow-emerald-950/20"
          }`}
          title="Back to top"
          aria-label="Back to top"
          id="back-to-top-floating-btn"
        >
          <ArrowUp className="w-4 h-4 shrink-0 stroke-[2.5]" />
          <span className="text-xs font-black uppercase tracking-wider hidden sm:inline">Top</span>
        </button>
      )}

      {/* Hidden/Subtle Admin Login Trigger Button - Extremely small and desaturated */}
      {!isAdmin && !isChatOpen && activeTab !== "chat" && (
        <button
          onClick={() => setActiveTab("login")}
          className="fixed bottom-1.5 right-1.5 z-40 p-1 rounded opacity-5 hover:opacity-85 transition-opacity bg-transparent text-slate-500 hover:text-slate-400 cursor-pointer select-none"
          title="Console Node"
          id="inconspicuous-admin-gate"
        >
          <Lock className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}
