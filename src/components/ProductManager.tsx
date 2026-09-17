import React, { useState, useEffect, useRef } from "react";
import { Plus, Edit2, Trash2, Search, Coins, Package, Shuffle, Tag, Trash, Sparkles, Activity, TrendingUp, RefreshCw, Download, BarChart3, X, Cloud, CheckCircle2, AlertCircle, Loader2, Camera, FolderOpen, ExternalLink, Eye, Image as ImageIcon, Check } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { Product } from "../types";
import { calculatePricing, formatKES, getProductImageUrl, getProductDisplayName, compressAndResizeImage } from "../utils";
import { saveProductImageOverride } from "../productImageStore";
import { uploadToCloudinary, isCloudinaryUrl } from "../cloudinaryUpload";
import ZoomableImage from "./ZoomableImage";
import DashboardOverview from "./DashboardOverview";
import CameraCaptureModal from "./CameraCaptureModal";

interface ProductManagerProps {
  products: Product[];
  onAddProduct: (product: Omit<Product, "id">) => Promise<void>;
  onUpdateProduct: (id: string, updatedFields: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onResetCatalogue: () => Promise<void>;
  onRefreshProducts?: () => Promise<void>;
  isLoading: boolean;
  theme?: "light" | "dark";
  adminToken?: string | null;
}

const CustomTooltip = ({ active, payload, theme }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className={`p-3 rounded-lg border shadow-xl backdrop-blur-md text-xs leading-normal ${
        theme === "dark" 
          ? "bg-[#091b2c] border-white/10 text-white" 
          : "bg-white border-[#00A859]/15 text-slate-850 shadow-sm"
      }`}>
        <p className="font-extrabold text-[#00609C] dark:text-[#818CF8] truncate max-w-[220px]">{data.name}</p>
        <p className="font-mono text-slate-450 dark:text-slate-400 mt-1">{data.sku}</p>
        <p className="font-bold text-emerald-500 mt-1 uppercase text-[10px]">
          📊 {data.count} Queries
        </p>
      </div>
    );
  }
  return null;
};

export default function ProductManager({
  products,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onResetCatalogue,
  isLoading,
  onRefreshProducts,
  theme = "dark",
  adminToken = null
}: ProductManagerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Analytics State
  const [analyticsData, setAnalyticsData] = useState<{ sku: string; name: string; count: number }[]>([]);
  const [unstockedQueries, setUnstockedQueries] = useState<{ term: string; count: number; timestamp: string }[]>([]);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [showAnalyticsDetails, setShowAnalyticsDetails] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const [activeManagerTab, setActiveManagerTab] = useState<"dashboard" | "catalog" | "unstocked" | "audit">("catalog");
  const [unstockedSearch, setUnstockedSearch] = useState("");
  const [stockedSearch, setStockedSearch] = useState("");
  const [enquirySubTab, setEnquirySubTab] = useState<"unstocked" | "stocked">("unstocked");

  useEffect(() => {
    let active = true;
    const fetchAnalytics = async () => {
      setIsAnalyticsLoading(true);
      try {
        const res = await fetch(`/api/analytics?period=${analyticsPeriod}`);
        if (res.ok && active) {
          const data = await res.json();
          setAnalyticsData(data.analytics || []);
          setUnstockedQueries(data.unstockedQueries || []);
        }
      } catch (err) {
        console.error("Failed to load search analytics:", err);
      } finally {
        if (active) setIsAnalyticsLoading(false);
      }
    };
    fetchAnalytics();
    return () => {
      active = false;
    };
  }, [products, analyticsPeriod]);

  // Audit Logs State for accountability
  const [auditLogs, setAuditLogs] = useState<{ id: string; timestamp: string; action: string; sku: string; details: string; prevVal: string; newVal: string }[]>([]);
  const [isAuditLogsLoading, setIsAuditLogsLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditSearchQuery, setAuditSearchQuery] = useState("");

  const fetchAuditLogs = async () => {
    if (!adminToken) return;
    setIsAuditLogsLoading(true);
    try {
      const res = await fetch("/api/admin/audit-logs", {
        headers: {
          "Authorization": `Bearer ${adminToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setIsAuditLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [adminToken, products]);

  // Edit fields state
  const [editSku, setEditSku] = useState("");
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPrice, setEditPrice] = useState(0);
  const [editSpecs, setEditSpecs] = useState("");
  const [editUsage, setEditUsage] = useState("");

  // Add field state
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newSpecs, setNewSpecs] = useState("");
  const [newUsage, setNewUsage] = useState("");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [isUploadingAddImage, setIsUploadingAddImage] = useState(false);
  const [addImageCloudinaryStatus, setAddImageCloudinaryStatus] = useState<string | null>(null);
  const [addImageCloudinaryError, setAddImageCloudinaryError] = useState<string | null>(null);
  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [addPickerKey, setAddPickerKey] = useState(0);

  const fileInputAddRef = useRef<HTMLInputElement | null>(null);
  const cameraInputAddRef = useRef<HTMLInputElement | null>(null);

  // Common upload handler for Add Product image (camera or folders)
  const processAndUploadAddImage = async (file: File) => {
    setIsUploadingAddImage(true);
    setAddImageCloudinaryError(null);
    setAddImageCloudinaryStatus(null);

    try {
      // Upload to Cloudinary folder "Abro Kenya"
      const res = await uploadToCloudinary(file, {
        productSku: newSku || "new-product",
        folder: "Abro Kenya"
      });

      if (res.success && res.url) {
        setNewImageUrl(res.url);
        setAddImageCloudinaryStatus("Stored on Cloudinary");
      } else {
        setAddImageCloudinaryError(res.error || "Cloudinary upload notice");
        const compressed = await compressAndResizeImage(file, 800, 800, 0.82);
        if (compressed) {
          setNewImageUrl(compressed);
        }
      }
    } catch (err: any) {
      setAddImageCloudinaryError(err?.message || "Upload failed");
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingAddImage(false);
    }
  };
  const [showCloudinaryModal, setShowCloudinaryModal] = useState(false);
  const [isTestingCloudinary, setIsTestingCloudinary] = useState(false);
  const [cloudinaryTestResult, setCloudinaryTestResult] = useState<{
    success: boolean;
    message: string;
    signed_error?: string | null;
    unsigned_error?: string | null;
    hint?: string;
  } | null>(null);

  const [isSyncingCloudinary, setIsSyncingCloudinary] = useState(false);
  const [cloudinarySyncResult, setCloudinarySyncResult] = useState<{
    success: boolean;
    message: string;
    totalInFolder?: number;
    matchedCount?: number;
    updatedCount?: number;
  } | null>(null);

  const [showAssetsViewer, setShowAssetsViewer] = useState(false);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [cloudinaryAssets, setCloudinaryAssets] = useState<Array<{
    public_id: string;
    url: string;
    format: string;
    bytes: number;
    width: number;
    height: number;
    created_at: string;
    matchedProduct: { id: string; sku: string; name: string } | null;
  }>>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const fetchCloudinaryAssets = async () => {
    setIsLoadingAssets(true);
    try {
      const res = await fetch("/api/cloudinary/assets");
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.assets)) {
        setCloudinaryAssets(data.assets);
      }
    } catch (err) {
      console.warn("[ProductManager] Error fetching Cloudinary assets:", err);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  const handleSyncCloudinary = async () => {
    setIsSyncingCloudinary(true);
    setCloudinarySyncResult(null);
    try {
      const res = await fetch("/api/cloudinary/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setCloudinarySyncResult({
          success: true,
          message: `Synchronized successfully! Found ${data.totalInFolder} assets in Cloudinary; matched ${data.matchedCount} products.`,
          totalInFolder: data.totalInFolder,
          matchedCount: data.matchedCount,
          updatedCount: data.updatedCount,
        });
        if (onRefreshProducts) {
          await onRefreshProducts();
        }
      } else {
        setCloudinarySyncResult({
          success: false,
          message: data.error || "Sync failed",
        });
      }
    } catch (err: any) {
      setCloudinarySyncResult({
        success: false,
        message: err?.message || "Network sync failed",
      });
    } finally {
      setIsSyncingCloudinary(false);
    }
  };

  const cloudinaryProductsCount = products.filter(p => p.imageUrl && p.imageUrl.includes("cloudinary")).length;

  const categories = ["all", ...Array.from(new Set(products.map((p) => p.category)))];

  // Sorting state: defaults to name-asc (alphabetical order of product name)
  const [sortOrder, setSortOrder] = useState<"name-asc" | "name-desc" | "category-asc" | "category-desc">("name-asc");

  const filteredProducts = products
    .filter((p) => {
      const matchesSearch =
        (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.specs || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortOrder === "name-asc") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      if (sortOrder === "name-desc") {
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      }
      if (sortOrder === "category-asc") {
        const catCompare = a.category.localeCompare(b.category, undefined, { sensitivity: "base" });
        if (catCompare !== 0) return catCompare;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      if (sortOrder === "category-desc") {
        const catCompare = b.category.localeCompare(a.category, undefined, { sensitivity: "base" });
        if (catCompare !== 0) return catCompare;
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      }
      return 0;
    });

  const handleStartEdit = (p: Product) => {
    setEditingId(p.id);
    setEditSku(p.sku);
    setEditName(getProductDisplayName(p));
    setEditCategory(p.category);
    setEditPrice(p.price);
    setEditSpecs(p.specs);
    setEditUsage(p.usageInstructions);
  };

  const handleSaveEdit = async (id: string) => {
    await onUpdateProduct(id, {
      sku: editSku,
      name: editName,
      category: editCategory,
      price: Number(editPrice) || 0,
      specs: editSpecs,
      usageInstructions: editUsage
    });
    setEditingId(null);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku || !newName || !newCategory) return;
    if (newImageUrl) {
      await saveProductImageOverride(newSku, newImageUrl);
      await saveProductImageOverride(newName, newImageUrl);
    }
    await onAddProduct({
      sku: newSku,
      name: newName,
      category: newCategory,
      price: Number(newPrice) || 0,
      specs: newSpecs,
      usageInstructions: newUsage,
      imageUrl: newImageUrl || undefined
    });
    // Reset values
    setNewSku("");
    setNewName("");
    setNewCategory("");
    setNewPrice("");
    setNewSpecs("");
    setNewUsage("");
    setNewImageUrl("");
    setIsAdding(false);
  };

  const handleExportCSV = () => {
    // Escape helper for clean, RFC-compliant CSV formatting
    const escapeCSV = (val: any) => {
      if (val === undefined || val === null) return "";
      const str = String(val).trim();
      // If the field contains quotes, commas, or line breaks, escape and wrap in quotes
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Use filtered products if a search or category filter is active, otherwise export all products
    const listToExport = filteredProducts.length > 0 ? filteredProducts : products;

    // CSV Headers corresponding to full product inventory schema
    const headers = [
      "ID",
      "SKU",
      "Product Name",
      "Category",
      "Price (KES)",
      "Unit Size",
      "Description",
      "Specifications",
      "Usage Instructions",
      "Origin",
      "Image URL"
    ];
    
    // Rows
    const rows = listToExport.map((p) => [
      escapeCSV(p.id),
      escapeCSV(p.sku),
      escapeCSV(getProductDisplayName(p)),
      escapeCSV(p.category),
      p.price,
      escapeCSV(p.unitSize),
      escapeCSV(p.description),
      escapeCSV(p.specs),
      escapeCSV(p.usageInstructions),
      escapeCSV(p.origin),
      escapeCSV(p.imageUrl)
    ]);

    // Build overall CSV string starting with UTF-8 byte order mark (BOM) to prevent Excel formatting issues
    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map((row) => row.join(","))
    ].join("\n");

    // Create file blob and trigger click download flow
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `abro_product_inventory_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportStockedCSV = () => {
    const escapeCSV = (val: any) => {
      if (val === undefined || val === null) return "";
      const str = String(val).trim();
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ["Rank", "SKU", "Product Name", "Inquiry Count"];
    const rows = analyticsData.map((item, idx) => [
      idx + 1,
      escapeCSV(item.sku),
      escapeCSV(item.name),
      item.count
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map((row) => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `abro_stocked_enquiries_${analyticsPeriod}_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportUnstockedCSV = () => {
    const escapeCSV = (val: any) => {
      if (val === undefined || val === null) return "";
      const str = String(val).trim();
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ["Rank", "Requested Term / Customer Text", "Inquiry Count", "Last Asked"];
    const rows = unstockedQueries.map((q, idx) => [
      idx + 1,
      escapeCSV(q.term),
      q.count,
      escapeCSV(new Date(q.timestamp).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" }))
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map((row) => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `abro_unstocked_enquiries_${analyticsPeriod}_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const averagePriceVal = products.length
    ? products.reduce((acc, curr) => acc + curr.price, 0) / products.length
    : 0;

  const totalQueries = analyticsData.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-6" id="product-manager-card">
      {/* Dynamic Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
        {/* Clickable Active ABRO Lines Card */}
        <button
          onClick={() => setActiveManagerTab("catalog")}
          className={`p-4 rounded-xl border shadow-md flex items-center space-x-4 backdrop-blur-md transition-all text-left w-full hover:scale-[1.02] active:scale-95 cursor-pointer focus:outline-none ${
            activeManagerTab === "catalog"
              ? theme === "dark"
                ? "bg-indigo-500/15 border-indigo-500 text-white shadow-lg shadow-indigo-500/10"
                : "bg-emerald-50 border-[#00A859] text-slate-850 shadow-md shadow-emerald-700/5 font-bold"
              : theme === "dark"
                ? "bg-white/5 border-white/10 text-white hover:border-indigo-500/40"
                : "bg-white border-[#00A859]/15 text-slate-800 shadow-emerald-250/5 hover:border-emerald-500"
          }`}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 transition-all ${
            activeManagerTab === "catalog"
              ? theme === "dark" ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/35" : "bg-emerald-100 text-[#00A859] border-[#00A859]/35"
              : theme === "dark" ? "bg-indigo-500/10 text-indigo-400 border-indigo-550/20" : "bg-[#002f52]/10 text-[#00A859] border-[#00A859]/25"
          }`}>
            <Package className="w-5 h-5 flex-shrink-0" />
          </div>
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-wider ${theme === "dark" ? "text-slate-400" : "text-slate-700 font-semibold"}`}>Active ABRO Lines</div>
            <div className={`text-xl font-black ${theme === "dark" ? "text-white" : "text-[#00A859]"}`}>{products.length} Products</div>
          </div>
        </button>

        {/* Clickable AI Stock Request Analytics Card */}
        <button
          onClick={() => setActiveManagerTab("unstocked")}
          className={`p-4 rounded-xl border shadow-md flex items-center space-x-4 backdrop-blur-md transition-all text-left w-full hover:scale-[1.02] active:scale-95 cursor-pointer focus:outline-none ${
            activeManagerTab === "unstocked"
              ? theme === "dark"
                ? "bg-indigo-500/15 border-indigo-500 text-white shadow-lg shadow-[#00e1ff]/5"
                : "bg-emerald-50 border-[#00A859] text-slate-855 shadow-md shadow-[#00A859]/10 font-bold"
              : theme === "dark"
                ? "bg-white/5 border-white/10 text-white hover:border-indigo-500/40"
                : "bg-white border-[#00A859]/15 text-slate-800 shadow-emerald-250/5 hover:border-emerald-500"
          }`}
          id="summary-ai-analytics-card"
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 transition-all ${
            activeManagerTab === "unstocked"
              ? theme === "dark" ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/35" : "bg-[#00a859]/10 text-[#00A859] border-[#00a859]/35"
              : theme === "dark" ? "bg-indigo-500/10 text-indigo-450 border-indigo-550/20" : "bg-[#002f52]/10 text-emerald-600 border-[#00A859]/25"
          }`}>
            <Activity className={`w-5 h-5 flex-shrink-0 ${activeManagerTab === "unstocked" ? "animate-pulse" : ""}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-[11px] font-bold uppercase tracking-wider truncate ${theme === "dark" ? "text-slate-400" : "text-slate-700 font-semibold"}`}>
              AI Stock Request Analytics
            </div>
            <div className={`text-xl font-black flex items-center justify-between ${theme === "dark" ? "text-white" : "text-[#00A859]"}`}>
              <span className="truncate">
                {totalQueries} {analyticsPeriod === "monthly" ? "Monthly" : analyticsPeriod === "quarterly" ? "Quarterly" : "Annual"}
              </span>
              <span className={`text-[9px] font-extrabold tracking-widest px-1.5 py-0.5 rounded uppercase ml-2 ${
                activeManagerTab === "unstocked"
                  ? "bg-indigo-500/20 text-indigo-300"
                  : theme === "dark" ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-550"
              }`}>
                {activeManagerTab === "unstocked" ? "Active" : "Open"}
              </span>
            </div>
          </div>
        </button>

        <div className={`p-4 rounded-xl border shadow-md flex items-center space-x-4 backdrop-blur-md transition-all ${
          theme === "dark" ? "bg-white/5 border-white/10 text-white" : "bg-white border-[#00A859]/15 text-slate-800 shadow-emerald-250/5"
        }`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
            theme === "dark" ? "bg-indigo-500/10 text-indigo-400 border-indigo-550/20" : "bg-[#002f52]/10 text-[#00609C] border-[#00609C]/25"
          }`}>
            <Coins className="w-5 h-5 flex-shrink-0" />
          </div>
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-wider ${theme === "dark" ? "text-slate-400" : "text-slate-700 font-semibold"}`}>Avg Piece Price (Incl. VAT)</div>
            <div className={`text-xl font-black ${theme === "dark" ? "text-white" : "text-[#00609C]"}`}>{formatKES(averagePriceVal)}</div>
          </div>
        </div>

        <div className={`p-4 rounded-xl border shadow-md flex items-center space-x-4 backdrop-blur-md transition-all ${
          theme === "dark" ? "bg-white/5 border-white/10 text-white" : "bg-white border-[#00A859]/15 text-slate-800 shadow-emerald-250/5"
        }`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
            theme === "dark" ? "bg-indigo-500/10 text-indigo-455 border-indigo-550/20" : "bg-[#002f52]/10 text-amber-550 border-[#00A859]/25"
          }`}>
            <Tag className="w-5 h-5 flex-shrink-0" />
          </div>
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-wider ${theme === "dark" ? "text-slate-400" : "text-slate-700 font-semibold"}`}>Unique Categories</div>
            <div className={`text-xl font-black ${theme === "dark" ? "text-white" : "text-amber-600"}`}>{categories.length - 1} groups</div>
          </div>
        </div>
      </div>

      {/* Dynamic Sub-tab Selector Bar */}
      <div className="flex flex-wrap border-b border-dashed border-slate-500/20 gap-1 sm:gap-2 mb-6 font-sans">
        <button
          onClick={() => setActiveManagerTab("dashboard")}
          className={`pb-3 pt-1 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeManagerTab === "dashboard"
              ? "border-[#00609C] text-[#00609C] dark:border-indigo-400 dark:text-[#a5b4fc] font-black"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-350"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 shrink-0" />
          <span>Dashboard Overview</span>
        </button>
        <button
          onClick={() => setActiveManagerTab("catalog")}
          className={`pb-3 pt-1 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeManagerTab === "catalog"
              ? "border-[#00609C] text-[#00609C] dark:border-indigo-400 dark:text-[#a5b4fc] font-black"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-350"
          }`}
        >
          <Package className="w-3.5 h-3.5 shrink-0" />
          <span>Active Inventory ({products.length})</span>
        </button>
        <button
          onClick={() => setActiveManagerTab("unstocked")}
          className={`pb-3 pt-1 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeManagerTab === "unstocked"
              ? "border-rose-500 text-rose-600 dark:border-indigo-400 dark:text-[#a5b4fc] font-black"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-305"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
          <span>Customer Enquiries & Demand ({unstockedQueries.length + analyticsData.length})</span>
        </button>
        <button
          onClick={() => setActiveManagerTab("audit")}
          className={`pb-3 pt-1 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeManagerTab === "audit"
              ? "border-amber-550 text-amber-600 dark:border-indigo-400 dark:text-[#a5b4fc] font-black"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-305"
          }`}
        >
          <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>System Audit Trail</span>
        </button>
      </div>

      {/* TAB 0: DASHBOARD OVERVIEW */}
      {activeManagerTab === "dashboard" && (
        <div className="animate-in fade-in duration-200">
          <DashboardOverview
            products={products}
            theme={theme}
            onNavigateToProducts={() => setActiveManagerTab("catalog")}
          />
        </div>
      )}

      {/* TAB 2: UNSTOCKED DEMAND & WISH-TO-BRING LIST */}
      {activeManagerTab === "unstocked" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className={`p-6 rounded-2xl border shadow-md backdrop-blur-md transition-all ${
            theme === "dark" ? "bg-[#061d30]/90 border-white/10 text-white" : "bg-white border-[#00A859]/15 text-slate-800 shadow-sm shadow-[#0a522d]/5"
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-dashed border-slate-500/20">
              <div className="space-y-1">
                <h3 className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${theme === "dark" ? "text-indigo-400" : "text-[#00609C]"}`}>
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                  Restocking Demand List (Unmatched Inquiries)
                </h3>
                <p className={`text-xs leading-relaxed ${theme === "dark" ? "text-slate-400" : "text-slate-600"}`}>
                  These are direct product requests captured from sales chat conversations with client where the item inquired was not found in the catalog database. Use this list to plan imports, procurement, and restocking.
                </p>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${theme === "dark" ? "text-slate-400" : "text-slate-550"}`}>Range:</span>
                <div className="flex items-center space-x-0.5 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-705 font-sans">
                  {(["monthly", "quarterly", "annual"] as const).map((period) => (
                    <button
                      key={period}
                      onClick={() => setAnalyticsPeriod(period)}
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        analyticsPeriod === period
                          ? theme === "dark"
                            ? "bg-indigo-500/25 text-indigo-350 border border-indigo-500/25 font-bold shadow-sm"
                            : "bg-[#002f52] text-white border border-[#001729] shadow-sm font-bold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                      }`}
                    >
                      {period.replace("ly", "")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Inquiries quick stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-xs font-mono">
              <div className={`p-3 rounded-xl border ${theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200"}`}>
                <div className="text-[10px] text-slate-455 dark:text-slate-400 font-bold uppercase">Accumulated Buyer Hits</div>
                <div className={`text-base font-black mt-1 ${theme === "dark" ? "text-white" : "text-slate-850"}`}>
                  {unstockedQueries.reduce((acc, curr) => acc + curr.count, 0)} direct queries
                </div>
              </div>
              <div className={`p-3 rounded-xl border ${theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200"}`}>
                <div className="text-[10px] text-slate-455 dark:text-slate-400 font-bold uppercase">Distinct Requested Items</div>
                <div className={`text-base font-black mt-1 ${theme === "dark" ? "text-white" : "text-slate-850"}`}>
                  {unstockedQueries.length} distinct terms
                </div>
              </div>
              <div className={`p-3 rounded-xl border ${theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200"}`}>
                <div className="text-[10px] text-slate-455 dark:text-slate-400 font-bold uppercase">Highest Demand Alert</div>
                <div className="text-base font-black mt-1 text-rose-600 dark:text-rose-400 truncate animate-pulse" title={unstockedQueries[0]?.term || "N/A"}>
                  {unstockedQueries[0] ? `"${unstockedQueries[0].term}"` : "None"}
                </div>
              </div>
            </div>
          </div>

          {/* Sub-tab selection for Stocked vs Unstocked Enquiries */}
          <div className="flex border-b border-dashed border-slate-500/25 p-1 gap-2 font-sans mb-4">
            <button
              onClick={() => setEnquirySubTab("stocked")}
              className={`pb-2 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                enquirySubTab === "stocked"
                  ? "border-[#00609C] text-[#00609C] dark:border-indigo-400 dark:text-[#a5b4fc] font-black"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-350"
              }`}
            >
              <Package className="w-3.5 h-3.5 text-emerald-500" />
              <span>Stocked Catalog Enquiries ({analyticsData.length})</span>
            </button>
            <button
              onClick={() => setEnquirySubTab("unstocked")}
              className={`pb-2 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                enquirySubTab === "unstocked"
                  ? "border-rose-500 text-rose-600 dark:border-indigo-400 dark:text-[#a5b4fc] font-black"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-350"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
              <span>Unstocked Item Enquiries ({unstockedQueries.length})</span>
            </button>
          </div>

          {enquirySubTab === "unstocked" ? (
            /* List Table of unmet demand inquiries */
            <div className={`p-6 rounded-2xl border shadow-md backdrop-blur-md transition-all ${
              theme === "dark" ? "bg-[#061d30]/90 border-white/10 text-white" : "bg-white border-[#00A859]/15 text-slate-800 shadow-sm shadow-[#0a522d]/5"
            }`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div className="space-y-0.5">
                  <h4 className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${theme === "dark" ? "text-indigo-400" : "text-[#00609C]"}`}>
                    Prioritized Buyer Demand List (Unstocked)
                  </h4>
                  <p className={`text-[11px] ${theme === "dark" ? "text-slate-405" : "text-slate-500"}`}>
                    Sorted by inquiry count (demand magnitude). These requests did not match active catalog listings.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search unstocked inquiries..."
                      value={unstockedSearch}
                      onChange={(e) => setUnstockedSearch(e.target.value)}
                      className={`w-full pl-9 pr-4 py-1.5 border rounded-lg text-xs focus:outline-none transition-all ${
                        theme === "dark"
                          ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder:text-slate-455"
                          : "bg-white border-slate-250 focus:border-[#00a859] text-slate-800 placeholder:text-slate-500"
                      }`}
                    />
                  </div>

                  <button
                    onClick={handleExportUnstockedCSV}
                    className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer shadow-md border hover:scale-[1.02] active:scale-[0.98] focus:outline-none ${
                      theme === "dark"
                        ? "bg-slate-850 hover:bg-slate-750 text-slate-100 border-white/10"
                        : "bg-[#002f52] hover:bg-[#001d33] text-white border-[#001729]"
                    }`}
                    title="Export unstocked item inquiries to Excel CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Excel (CSV)</span>
                  </button>
                </div>
              </div>

              {unstockedQueries.length === 0 ? (
                <div className={`p-10 text-center text-xs font-mono rounded-xl border border-dashed ${theme === "dark" ? "bg-white/[0.01] border-white/5 text-slate-500" : "bg-[#00a859]/5 border-[#00a859]/20 text-slate-500"}`}>
                  No unstocked inquiries captured in storage. Unmatched items in client chats will populate here automatically.
                </div>
              ) : (
                (() => {
                  const filtered = unstockedQueries.filter((q) =>
                    q.term.toLowerCase().includes(unstockedSearch.toLowerCase())
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="p-8 text-center text-xs text-slate-405 font-mono border border-dashed border-slate-500/10 rounded-xl">
                        No customer enquiries matching "{unstockedSearch}" were found in dynamic logs.
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto rounded-xl border border-slate-500/10">
                      <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                        <thead>
                          <tr className={`${
                            theme === "dark"
                              ? "bg-slate-900/40 text-slate-400 border-b border-white/5"
                              : "bg-slate-50 text-slate-600 border-b border-slate-200"
                          } font-black uppercase text-[9px] tracking-wider`}>
                            <th className="p-3 w-16 text-center">Rank</th>
                            <th className="p-3">Requested Term / Customer Text</th>
                            <th className="p-3 text-center">Inquiry Count</th>
                            <th className="p-3 text-right">Last Asked</th>
                            <th className="p-3 text-center">Catalyst SKU Creator</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-500/10 dark:divide-white/5 font-sans">
                          {filtered.map((q, idx) => (
                            <tr 
                              key={q.term} 
                              className={`hover:bg-slate-500/5 transition-colors ${
                                theme === "dark" ? "text-slate-200" : "text-slate-800"
                              }`}
                            >
                              <td className="p-3 text-center font-mono font-black text-xs text-slate-400 dark:text-slate-500">
                                #{idx + 1}
                              </td>
                              <td className="p-3 font-semibold text-xs text-rose-600 dark:text-rose-400">
                                "{q.term}"
                              </td>
                              <td className="p-3 text-center font-mono font-black text-xs">
                                <span className={`px-2 py-0.5 rounded font-black text-[11px] ${
                                  q.count >= 30 
                                    ? "bg-rose-500/10 text-rose-500" 
                                    : q.count >= 15 
                                      ? "bg-amber-500/10 text-amber-550" 
                                      : "bg-slate-500/10 text-slate-600 dark:text-slate-350"
                                }`}>
                                  {q.count} hits
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono text-[10px] text-slate-455 dark:text-slate-400">
                                {new Date(q.timestamp).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  onClick={() => {
                                    setIsAdding(true);
                                    setEditingId(null);
                                    setNewName(q.term);
                                    setActiveManagerTab("catalog");
                                    setTimeout(() => {
                                      const container = document.getElementById("add-product-form");
                                      if (container) {
                                        container.scrollIntoView({ behavior: "smooth" });
                                      }
                                      const skuInput = document.getElementById("prod-sku-input") as HTMLInputElement;
                                      if (skuInput) skuInput.focus();
                                    }, 150);
                                  }}
                                  className={`px-2.5 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer inline-flex items-center gap-1 hover:scale-105 active:scale-95 ${
                                    theme === "dark" 
                                      ? "bg-indigo-505/10 hover:bg-indigo-500/20 text-indigo-350 border border-indigo-500/20" 
                                      : "bg-[#002f52]/5 hover:bg-[#00A859] hover:text-white text-[#00609C] border border-[#00609C]/15"
                                  }`}
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Create SKU</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()
              )}
            </div>
          ) : (
            /* List Table of STOCKED catalog inquiries */
            <div className={`p-6 rounded-2xl border shadow-md backdrop-blur-md transition-all ${
              theme === "dark" ? "bg-[#061d30]/90 border-white/10 text-white" : "bg-white border-[#00A859]/15 text-slate-800 shadow-sm shadow-[#0a522d]/5"
            }`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div className="space-y-0.5">
                  <h4 className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${theme === "dark" ? "text-indigo-400" : "text-[#00609C]"}`}>
                    Catalog Item Enquiries (Stocked)
                  </h4>
                  <p className={`text-[11px] ${theme === "dark" ? "text-slate-405" : "text-slate-500"}`}>
                    Sorted by search frequency. These requests successfully matched products inside the active inventory.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search stocked inquiries..."
                      value={stockedSearch}
                      onChange={(e) => setStockedSearch(e.target.value)}
                      className={`w-full pl-9 pr-4 py-1.5 border rounded-lg text-xs focus:outline-none transition-all ${
                        theme === "dark"
                          ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder:text-slate-455"
                          : "bg-white border-slate-250 focus:border-[#00a859] text-slate-800 placeholder:text-slate-500"
                      }`}
                    />
                  </div>

                  <button
                    onClick={handleExportStockedCSV}
                    className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer shadow-md border hover:scale-[1.02] active:scale-[0.98] focus:outline-none ${
                      theme === "dark"
                        ? "bg-slate-850 hover:bg-slate-750 text-slate-100 border-white/10"
                        : "bg-[#002f52] hover:bg-[#001d33] text-white border-[#001729]"
                    }`}
                    title="Export stocked item enquiries to Excel CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Excel (CSV)</span>
                  </button>
                </div>
              </div>

              {analyticsData.length === 0 ? (
                <div className={`p-10 text-center text-xs font-mono rounded-xl border border-dashed ${theme === "dark" ? "bg-white/[0.01] border-white/5 text-slate-500" : "bg-[#00a859]/5 border-[#00a859]/20 text-slate-500"}`}>
                  No activities registered in logs. Start querying the AI agent to populate analytics.
                </div>
              ) : (
                (() => {
                  const filteredStocked = analyticsData.filter((item) =>
                    item.name.toLowerCase().includes(stockedSearch.toLowerCase()) ||
                    item.sku.toLowerCase().includes(stockedSearch.toLowerCase())
                  );

                  if (filteredStocked.length === 0) {
                    return (
                      <div className="p-8 text-center text-xs text-slate-405 font-mono border border-dashed border-slate-500/10 rounded-xl">
                        No stocked item enquiries matching "{stockedSearch}" were found in dynamic logs.
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto rounded-xl border border-slate-500/10">
                      <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                        <thead>
                          <tr className={`${
                            theme === "dark"
                              ? "bg-slate-900/40 text-slate-400 border-b border-white/5"
                              : "bg-slate-50 text-slate-600 border-b border-slate-200"
                          } font-black uppercase text-[9px] tracking-wider`}>
                            <th className="p-3 w-16 text-center">Rank</th>
                            <th className="p-3">SKU</th>
                            <th className="p-3">Product Name</th>
                            <th className="p-3">Category</th>
                            <th className="p-3 text-center">Inquiry Count</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-500/10 dark:divide-white/5 font-sans">
                          {filteredStocked.map((item, idx) => {
                            const prod = products.find(p => p.sku === item.sku);
                            return (
                              <tr 
                                key={item.sku} 
                                className={`hover:bg-slate-500/5 transition-colors ${
                                  theme === "dark" ? "text-slate-200" : "text-slate-800"
                                }`}
                              >
                                <td className="p-3 text-center font-mono font-black text-xs text-slate-400 dark:text-slate-500">
                                  #{idx + 1}
                                </td>
                                <td className="p-3 font-mono font-bold text-xs text-emerald-600 dark:text-indigo-400">
                                  {item.sku}
                                </td>
                                <td className="p-3 font-semibold text-xs text-slate-900 dark:text-slate-100">
                                  {item.name}
                                </td>
                                <td className="p-3 text-xs text-slate-500 dark:text-slate-400">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    theme === "dark" ? "bg-slate-800/60 text-slate-350 border border-white/5" : "bg-slate-100 text-slate-700 border border-slate-200"
                                  }`}>
                                    {prod?.category || "Uncategorized"}
                                  </span>
                                </td>
                                <td className="p-3 text-center font-mono font-black text-xs">
                                  <span className={`px-2 py-0.5 rounded font-black text-[11px] ${
                                    item.count >= 30 
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                                      : item.count >= 15 
                                        ? "bg-amber-500/10 text-amber-550" 
                                        : "bg-slate-500/10 text-slate-600 dark:text-slate-350"
                                  }`}>
                                    {item.count} hits
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* Catalog Search Frequency Chart (Matched Items) */}
          <div className={`p-6 rounded-2xl border shadow-md backdrop-blur-md transition-all ${
            theme === "dark" ? "bg-[#061d30]/90 border-white/10 text-white" : "bg-white border-[#00A859]/15 text-slate-800 shadow-sm shadow-[#0a522d]/5"
          }`}>
            <h4 className={`text-xs font-black uppercase tracking-wider mb-4 flex items-center gap-1.5 ${theme === "dark" ? "text-indigo-400" : "text-[#00609C]"}`}>
              <TrendingUp className="w-4 h-4" />
              Related Catalog Engagement Frequency (Matched Searches)
            </h4>
            {isAnalyticsLoading ? (
              <div className="h-44 flex flex-col items-center justify-center space-y-2">
                <RefreshCw className="w-5 h-5 text-indigo-450 animate-spin" />
                <p className="text-xs text-slate-400 font-mono animate-pulse">Running analytics render...</p>
              </div>
            ) : analyticsData.length === 0 ? (
              <p className="text-xs font-mono text-slate-400">No matched inquiries data found in specified period range.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="col-span-1 lg:col-span-2 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData} margin={{ top: 10, right: 15, left: -25, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                      <XAxis dataKey="sku" tick={{ fontSize: 9, fill: theme === "dark" ? "#94A3B8" : "#475569" }} stroke={theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} />
                      <YAxis tick={{ fontSize: 9, fill: theme === "dark" ? "#94A3B8" : "#475569" }} stroke={theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} />
                      <Tooltip content={<CustomTooltip theme={theme} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {analyticsData.map((entry, index) => {
                          const colors = ["#818CF8", "#34D399", "#FB7185", "#FBBF24", "#38BDF8"];
                          return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  theme === "dark" ? "bg-slate-900/40 border-white/5" : "bg-slate-50 border-slate-200"
                }`}>
                  <div>
                    <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Top Matched Catalog Searches</h5>
                    <div className="space-y-2 text-[11px] font-mono">
                      {analyticsData.slice(0, 4).map((item, idx) => (
                        <div key={item.sku} className="flex items-center justify-between overflow-hidden">
                          <span className="truncate text-slate-655 dark:text-slate-350 pr-2 max-w-[140px]" title={item.name}>{item.name}</span>
                          <span className="font-extrabold text-slate-900 dark:text-slate-100 shrink-0">{item.count} counts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-[9.5px] text-slate-500 italic mt-3 leading-relaxed">
                    Shows actual database item inquiries that your customers successfully searched for in the sales workspace during this period.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SYSTEM AUDIT Logs Section */}
      {activeManagerTab === "audit" && (
        <div className={`p-6 rounded-2xl border shadow-md backdrop-blur-md transition-all animate-in fade-in duration-200 ${
          theme === "dark" ? "bg-[#061d30]/90 border-white/10 text-white" : "bg-white border-[#00A859]/15 text-slate-800 shadow-sm shadow-[#0a522d]/5"
        }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-dashed border-slate-500/25">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                theme === "dark" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-[#543b00]/10 text-[#a58400] border-amber-600/20"
              }`}>
                <Coins className="w-4 h-4 text-amber-550 animate-pulse" />
              </div>
              <h3 className={`text-sm font-black uppercase tracking-wider ${theme === "dark" ? "text-white" : "text-[#705600]"}`}>
                System Accountability & Price Audit Trail
              </h3>
            </div>
            <p className={`text-xs ${theme === "dark" ? "text-slate-400" : "text-slate-600"}`}>
              Immutable log records of product adjustments, price shifts, and bulk database mutations
            </p>
          </div>

          <button
            onClick={fetchAuditLogs}
            disabled={isAuditLogsLoading}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              theme === "dark"
                ? "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAuditLogsLoading ? "animate-spin text-amber-500" : ""}`} />
            <span>{isAuditLogsLoading ? "Reading..." : "Sync Logs"}</span>
          </button>
        </div>

        {/* Audit Search and Filters */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-405" />
            <input
              type="text"
              placeholder="Filter by SKU or action description..."
              value={auditSearchQuery}
              onChange={(e) => setAuditSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 border rounded-lg text-xs focus:outline-none transition-all ${
                theme === "dark"
                  ? "bg-slate-900/40 border-white/10 focus:border-amber-400 text-white placeholder:text-slate-450"
                  : "bg-white border-slate-250 focus:border-amber-500 text-slate-800 placeholder:text-slate-500"
              }`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 font-sans">
            {[
              { id: "all", label: "All Events" },
              { id: "PRICE_CHANGE", label: "Price Shifts" },
              { id: "DATABASE_STATUS", label: "DB Status" },
              { id: "PRODUCT_MUTATE", label: "Product Changes" }
            ].map((btn) => {
              const isActive = auditActionFilter === btn.id;
              return (
                <button
                  key={btn.id}
                  onClick={() => setAuditActionFilter(btn.id)}
                  className={`px-3 py-1 rounded-full text-[10.5px] font-bold transition-all cursor-pointer ${
                    isActive
                      ? theme === "dark"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-extrabold shadow-sm"
                        : "bg-amber-500 text-white border border-amber-600 shadow-sm"
                      : theme === "dark"
                        ? "bg-white/5 text-slate-405 hover:bg-white/10"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Audit Logs Table / Timeline */}
        {isAuditLogsLoading ? (
          <div className="h-44 flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
            <p className="text-xs text-slate-400 font-mono animate-pulse">Syncing accountability logs...</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-500/10">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`${
                  theme === "dark"
                    ? "bg-slate-900/50 text-slate-400 border-b border-white/5"
                    : "bg-slate-50 text-slate-600 border-b border-slate-200"
                } font-black uppercase text-[10px] tracking-wider`}>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Scope / SKU</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Event Detail</th>
                  <th className="p-3 text-right">Value Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-500/10 font-medium">
                {(() => {
                  const filtered = auditLogs.filter((item) => {
                    const matchesSearch = 
                      (item.sku || "").toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      (item.details || "").toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
                      (item.action || "").toLowerCase().includes(auditSearchQuery.toLowerCase());

                    if (auditActionFilter === "all") return matchesSearch;
                    if (auditActionFilter === "PRODUCT_MUTATE") {
                      return matchesSearch && ["PRODUCT_CREATE", "PRODUCT_UPDATE", "PRODUCT_DELETE"].includes(item.action);
                    }
                    return matchesSearch && item.action === auditActionFilter;
                  });

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-mono">
                          No matching accountability logs found in system storage.
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((item) => {
                    // Action styling helper
                    let badgeClass = "";
                    if (item.action === "PRICE_CHANGE") {
                      badgeClass = "bg-amber-500/15 text-amber-550 border border-amber-500/20";
                    } else if (item.action.startsWith("DATABASE_")) {
                      badgeClass = "bg-blue-500/15 text-blue-500 border border-blue-500/20";
                    } else if (item.action === "PRODUCT_CREATE") {
                      badgeClass = "bg-emerald-500/15 text-emerald-600 border border-emerald-500/20";
                    } else if (item.action === "PRODUCT_DELETE") {
                      badgeClass = "bg-red-500/15 text-red-500 border border-red-500/20";
                    } else {
                      badgeClass = "bg-slate-500/15 text-slate-500 border border-slate-500/20";
                    }

                    const dateStr = (() => {
                      try {
                        const d = new Date(item.timestamp);
                        return d.toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit"
                        });
                      } catch {
                        return item.timestamp;
                      }
                    })();

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors text-[11px] ${
                          theme === "dark" ? "hover:bg-white/[0.02] text-slate-300" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <td className="p-3 whitespace-nowrap font-mono text-[10px] text-slate-450 dark:text-slate-400">
                          {dateStr}
                        </td>
                        <td className="p-3 whitespace-nowrap font-mono">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                            theme === "dark" ? "bg-slate-900 text-slate-300" : "bg-slate-100 text-slate-700"
                          }`}>
                            {item.sku}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-black tracking-wide ${badgeClass}`}>
                            {item.action === "PRICE_CHANGE" ? "Price Shift" : item.action.replace("PRODUCT_", "").replace("DATABASE_", "")}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-wrap leading-relaxed">
                            {item.details}
                          </span>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap font-mono text-[11px]">
                          {item.prevVal && item.newVal ? (
                            <div className="flex items-center justify-end space-x-1">
                              <span className="text-slate-400 dark:text-slate-500 line-through text-[10px]">{item.prevVal}</span>
                              <span className="text-slate-400">→</span>
                              <span className="font-extrabold text-amber-650 dark:text-amber-500">{item.newVal}</span>
                            </div>
                          ) : item.newVal ? (
                            <span className="font-extrabold text-[#00A859]">{item.newVal}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* TAB 1: ACTIVE ABRO catalog experience */}
      {activeManagerTab === "catalog" && (
        <>
          {/* Stock Controls Toolbar */}
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-lg backdrop-blur-md transition-all space-y-3.5 mb-6 ${
            theme === "dark" ? "bg-white/5 border-white/10" : "bg-[#fafcfb] border-[#00A859]/15 shadow-sm shadow-[#00A859]/5"
          }`}>
            {/* LINE 1: Top Dedicated Search Bar (Standalone & Full-Width) */}
            <div className="relative w-full">
              <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                theme === "dark" ? "text-slate-400" : "text-[#00A859]"
              }`} />
              <input
                id="stock-search-input"
                type="text"
                placeholder="Search stock inventory by product name, SKU code, specifications, packaging..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-12 pr-28 py-3.5 border rounded-xl text-sm md:text-base font-medium focus:outline-none transition-all shadow-inner ${
                  theme === "dark"
                    ? "bg-slate-900/60 border-white/15 focus:border-indigo-400 text-white placeholder:text-slate-450 focus:ring-2 focus:ring-indigo-500/20"
                    : "bg-white border-slate-300 focus:border-[#00a859] text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#00a859]/20"
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      theme === "dark" ? "text-slate-400 hover:text-white bg-white/10" : "text-slate-500 hover:text-slate-800 bg-slate-100"
                    }`}
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <span className={`text-[11px] font-mono px-2 py-1 rounded-md border font-bold ${
                  theme === "dark" 
                    ? "bg-white/5 border-white/10 text-slate-400" 
                    : "bg-slate-50 border-slate-200 text-slate-600"
                }`}>
                  {filteredProducts.length} items
                </span>
              </div>
            </div>

            {/* LINE 2: Proper Spacing Row for Filters, Sorting, and Primary Action Buttons */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1 border-t border-dashed border-slate-500/15">
              {/* Left Group: Category & Sorting Filters */}
              <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="sm:w-52">
                  <select
                    id="stock-category-filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-bold focus:outline-none capitalize transition-all cursor-pointer ${
                      theme === "dark"
                        ? "bg-slate-900/50 border-white/10 focus:border-indigo-400 text-slate-200 [&>option]:bg-slate-950 [&>option]:text-white"
                        : "bg-white border-slate-250 focus:border-[#00a859] text-slate-700 [&>option]:bg-white [&>option]:text-slate-800"
                    }`}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat === "all" ? "📁 All Categories" : `📁 ${cat}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:w-60">
                  <select
                    id="stock-sort-order"
                    value={sortOrder}
                    onChange={(e: any) => setSortOrder(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-bold focus:outline-none transition-all cursor-pointer ${
                      theme === "dark"
                        ? "bg-slate-900/50 border-white/10 focus:border-indigo-400 text-slate-200 [&>option]:bg-slate-950 [&>option]:text-white"
                        : "bg-white border-slate-250 focus:border-[#00a859] text-slate-700 [&>option]:bg-white [&>option]:text-slate-800"
                    }`}
                  >
                    <option value="name-asc">🔤 Sort Name (A → Z)</option>
                    <option value="name-desc">🔤 Sort Name (Z → A)</option>
                    <option value="category-asc">📑 Group Category + A-Z</option>
                    <option value="category-desc">📑 Group Category + Z-A</option>
                  </select>
                </div>
              </div>

              {/* Right Group: Action Buttons (CSV Export, Cloudinary Status, Add Product, Danger Zone Delete) */}
              <div className="flex flex-wrap items-center gap-2.5 justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCloudinaryModal(true)}
                  className={`px-3 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer shadow-sm border hover:scale-[1.02] active:scale-[0.98] ${
                    theme === "dark"
                      ? "bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-sky-500/30"
                      : "bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-200"
                  }`}
                  title="Cloudinary Product Storage: muthomi254 (Folder: Abro Kenya)"
                  id="stock-cloudinary-info-btn"
                >
                  <Cloud className="w-4 h-4 text-sky-500" />
                  <span>Cloudinary</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Cloudinary Storage Active" />
                </button>

                <button
                  onClick={handleExportCSV}
                  className={`px-3.5 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center space-x-2 cursor-pointer shadow-sm border hover:scale-[1.02] active:scale-[0.98] focus:outline-none ${
                    theme === "dark"
                      ? "bg-slate-800 hover:bg-slate-700 text-slate-100 border-white/10 shadow-slate-900/30"
                      : "bg-white hover:bg-slate-50 text-slate-700 border-slate-250 shadow-slate-200/50"
                  }`}
                  title="Export all catalogue lines to CSV format"
                  id="stock-export-csv-btn"
                >
                  <Download className="w-4 h-4 text-emerald-500" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={() => setIsAdding(!isAdding)}
                  className={`px-4 py-2.5 text-white font-bold text-xs rounded-xl transition-all flex items-center space-x-2 cursor-pointer shadow-md border hover:scale-[1.02] active:scale-[0.98] ${
                    theme === "dark"
                      ? "bg-indigo-600 hover:bg-indigo-500 border-indigo-400/30 shadow-indigo-500/20"
                      : "bg-[#00a859] hover:bg-[#00924d] border-emerald-500 shadow-emerald-500/15"
                  }`}
                  id="stock-add-product-btn"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add Product</span>
                </button>

                <div className="h-6 w-px bg-slate-300 dark:bg-white/10 hidden sm:block mx-0.5"></div>

                <button
                  onClick={() => setShowConfirmReset(true)}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer border shadow-sm ${
                    theme === "dark"
                      ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30 hover:border-rose-500/50"
                      : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 hover:border-rose-300"
                  }`}
                  title="Reset Stock & Delete All Available Stock from Catalogue"
                  id="stock-reset-all-btn"
                >
                  <Trash className="w-3.5 h-3.5 text-rose-500" />
                  <span className="font-bold">Reset / Delete All Stock</span>
                </button>
              </div>
            </div>
          </div>

      {/* Confirmation Reset modal to delete all available stock */}
      {showConfirmReset && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`rounded-xl shadow-2xl border max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-250 ${
            theme === "dark" ? "bg-slate-900 border-white/15 text-white" : "bg-white border-slate-205 text-slate-800"
          }`}>
            <h3 className={`text-base font-bold mb-2 ${theme === "dark" ? "text-white" : "text-rose-700"}`}>Delete All Available Stock?</h3>
            <p className={`text-xs leading-relaxed mb-6 ${theme === "dark" ? "text-slate-400" : "text-slate-600"}`}>
              This action will reset your database and permanently delete all available stock items from your active catalogue, leaving you with an empty stocklist. This cannot be undone.
            </p>
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowConfirmReset(false)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer border ${
                  theme === "dark"
                    ? "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onResetCatalogue();
                  setShowConfirmReset(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-lg shadow-rose-500/20 text-center"
              >
                Delete All Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cloudinary Integration Info & Status Modal */}
      {showCloudinaryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`rounded-2xl shadow-2xl border max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-250 ${
            theme === "dark" ? "bg-[#081e33] border-white/15 text-white" : "bg-white border-slate-200 text-slate-800"
          }`}>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-500/15">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    Cloudinary Storage Engine
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                      Connected
                    </span>
                  </h3>
                  <p className={`text-[11px] ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
                    Product asset storage configuration & CDN delivery
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCloudinaryModal(false)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  theme === "dark" ? "border-white/10 hover:bg-white/10 text-slate-300" : "border-slate-200 hover:bg-slate-100 text-slate-600"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Cloudinary Catalog Sync Card */}
              <div className={`p-3.5 rounded-xl border space-y-3 ${
                theme === "dark" ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-200" : "bg-emerald-50/70 border-emerald-200 text-emerald-900"
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Cloud className="w-4 h-4 text-emerald-500" />
                      <span>Live Catalog Synchronization</span>
                    </div>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      <strong>{cloudinaryProductsCount}</strong> of <strong>{products.length}</strong> products are currently displaying uploaded Cloudinary photos.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSyncingCloudinary}
                    onClick={handleSyncCloudinary}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm disabled:opacity-50"
                  >
                    {isSyncingCloudinary ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Syncing Assets...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Sync All Cloudinary Images</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAssetsViewer(true);
                      fetchCloudinaryAssets();
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                      theme === "dark"
                        ? "bg-white/10 hover:bg-white/20 text-white border-white/10"
                        : "bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-sm"
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5 text-sky-500" />
                    <span>View Cloudinary Photo Library</span>
                  </button>
                </div>

                {cloudinarySyncResult && (
                  <div className={`p-2.5 rounded-lg text-[11px] font-medium border ${
                    cloudinarySyncResult.success
                      ? theme === "dark" ? "bg-emerald-900/40 border-emerald-500/40 text-emerald-300" : "bg-white border-emerald-300 text-emerald-800"
                      : theme === "dark" ? "bg-rose-900/40 border-rose-500/40 text-rose-300" : "bg-white border-rose-300 text-rose-800"
                  }`}>
                    {cloudinarySyncResult.message}
                  </div>
                )}
              </div>

              {/* Active Cloudinary Environment Settings */}
              <div className={`p-3.5 rounded-xl border space-y-2.5 ${
                theme === "dark" ? "bg-slate-900/60 border-white/10" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                    Active Cloudinary Environment
                  </div>
                  <button
                    type="button"
                    disabled={isTestingCloudinary}
                    onClick={async () => {
                      setIsTestingCloudinary(true);
                      setCloudinaryTestResult(null);
                      try {
                        const res = await fetch("/api/cloudinary/upload", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            file: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                            folder: "Abro Kenya"
                          })
                        });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          setCloudinaryTestResult({
                            success: true,
                            message: "Connection verified! Uploads to 'Abro Kenya' folder are active and working."
                          });
                        } else {
                          setCloudinaryTestResult({
                            success: false,
                            message: data.error || "Upload test failed",
                            signed_error: data.signed_error,
                            unsigned_error: data.unsigned_error,
                            hint: data.details?.hint
                          });
                        }
                      } catch (err: any) {
                        setCloudinaryTestResult({
                          success: false,
                          message: err.message || "Network test failed"
                        });
                      } finally {
                        setIsTestingCloudinary(false);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                      theme === "dark"
                        ? "bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/40"
                        : "bg-sky-100 hover:bg-sky-200 text-sky-800 border-sky-300"
                    }`}
                  >
                    {isTestingCloudinary ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        <span>Test Connection</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    <span className="block text-[10px] uppercase text-slate-400">Cloud Name</span>
                    <strong className="text-slate-700 dark:text-slate-200">muthomi254</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-slate-400">Folder</span>
                    <strong className="text-slate-700 dark:text-slate-200">Abro Kenya</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-slate-400">API Key</span>
                    <strong className="text-slate-700 dark:text-slate-200">595797988235321</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-slate-400">Upload Preset</span>
                    <strong className="text-slate-700 dark:text-slate-200">Abro_kenya</strong>
                  </div>
                </div>
              </div>

              {/* Test Result Box */}
              {cloudinaryTestResult && (
                <div className={`p-3 rounded-xl border text-xs ${
                  cloudinaryTestResult.success
                    ? theme === "dark" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-emerald-50 border-emerald-300 text-emerald-800"
                    : theme === "dark" ? "bg-amber-500/15 border-amber-500/30 text-amber-200" : "bg-amber-50 border-amber-300 text-amber-900"
                }`}>
                  <div className="flex items-start gap-2">
                    {cloudinaryTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="font-bold">{cloudinaryTestResult.message}</p>
                      {cloudinaryTestResult.hint && (
                        <p className="text-[11px] opacity-90">{cloudinaryTestResult.hint}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Permission Fix Instructions */}
              <div className={`p-3 rounded-xl border space-y-2 ${
                theme === "dark" ? "bg-slate-900/40 border-white/5 text-slate-300" : "bg-sky-50/50 border-sky-100 text-slate-700"
              }`}>
                <h4 className="font-bold text-[11px] uppercase tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                  <span>How to Enable Uploads in Cloudinary</span>
                </h4>
                <p className="text-[11px] leading-relaxed">
                  Your API Key <code>595797988235321</code> currently lacks <strong>Create (upload)</strong> permission in Cloudinary. Choose either option below to enable it in 1 minute:
                </p>
                <div className="space-y-2 text-[11px]">
                  <div className={`p-2 rounded-lg border ${theme === "dark" ? "bg-slate-950/40 border-white/10" : "bg-white border-slate-200"}`}>
                    <strong className="text-sky-500 font-bold block mb-0.5">Option 1: Grant "Create" to this Access Key (Recommended)</strong>
                    <ol className="list-decimal pl-4 space-y-0.5 opacity-90">
                      <li>Log into <strong>cloudinary.com</strong> with <code>muthomi254</code>.</li>
                      <li>Click <strong>Settings (Gear icon)</strong> &rarr; <strong>Access Keys</strong>.</li>
                      <li>Find key <code>Abro_kenya</code> (595797988235321) and click <strong>Edit Permissions</strong>.</li>
                      <li>Check the <strong>Create (Upload assets)</strong> box, then click <strong>Save</strong>.</li>
                    </ol>
                  </div>
                  <div className={`p-2 rounded-lg border ${theme === "dark" ? "bg-slate-950/40 border-white/10" : "bg-white border-slate-200"}`}>
                    <strong className="text-sky-500 font-bold block mb-0.5">Option 2: Make the Upload Preset "Unsigned"</strong>
                    <ol className="list-decimal pl-4 space-y-0.5 opacity-90">
                      <li>In Cloudinary, go to <strong>Settings</strong> &rarr; <strong>Upload</strong> &rarr; <strong>Upload presets</strong>.</li>
                      <li>Click edit on preset <code>Abro_kenya</code> (or Add upload preset).</li>
                      <li>Change <strong>Signing Mode</strong> from <strong>Signed</strong> to <strong>Unsigned</strong>.</li>
                      <li>Set Folder to <code>Abro Kenya</code> and click <strong>Save</strong>.</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-500/15 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCloudinaryModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  theme === "dark"
                    ? "bg-white/10 hover:bg-white/20 text-white"
                    : "bg-slate-800 hover:bg-slate-900 text-white"
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cloudinary Asset Photo Library Modal */}
      {showAssetsViewer && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`rounded-2xl shadow-2xl border max-w-4xl w-full p-5 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 ${
            theme === "dark" ? "bg-[#0b1320] border-white/15 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-500/15 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    Cloudinary Photo Library
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 font-bold">
                      {cloudinaryAssets.length} Images in Cloudinary
                    </span>
                  </h3>
                  <p className={`text-[11px] ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
                    All images uploaded to Cloudinary folder <strong className="font-mono text-sky-400">Abro Kenya</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchCloudinaryAssets}
                  disabled={isLoadingAssets}
                  className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                    theme === "dark" ? "border-white/10 hover:bg-white/10 text-slate-300" : "border-slate-200 hover:bg-slate-100 text-slate-600"
                  }`}
                  title="Refresh asset list"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingAssets ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => setShowAssetsViewer(false)}
                  className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                    theme === "dark" ? "border-white/10 hover:bg-white/10 text-slate-300" : "border-slate-200 hover:bg-slate-100 text-slate-600"
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Asset Grid */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {isLoadingAssets ? (
                <div className="py-16 text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-sky-500 mx-auto" />
                  <p className="text-xs text-slate-400">Scanning Cloudinary for uploaded photos...</p>
                </div>
              ) : cloudinaryAssets.length === 0 ? (
                <div className="py-16 text-center space-y-2 text-slate-400">
                  <ImageIcon className="w-10 h-10 mx-auto opacity-40 text-slate-500" />
                  <p className="text-sm font-semibold">No assets returned from Cloudinary</p>
                  <p className="text-xs text-slate-500">Click the Refresh button above to scan again.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  {cloudinaryAssets.map((asset) => (
                    <div
                      key={asset.public_id}
                      className={`p-3 rounded-xl border flex flex-col transition-all ${
                        theme === "dark"
                          ? "bg-slate-900/60 border-white/10 hover:border-sky-500/40"
                          : "bg-slate-50 border-slate-200 hover:border-sky-400"
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="w-full h-36 rounded-lg bg-black/20 overflow-hidden flex items-center justify-center relative group/thumb border border-black/5 dark:border-white/5">
                        <img
                          src={asset.url}
                          alt={asset.public_id}
                          className="w-full h-full object-contain p-2 group-hover/thumb:scale-105 transition-transform duration-200"
                          loading="lazy"
                        />
                        <a
                          href={asset.url}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity hover:bg-black"
                          title="Open full resolution in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      {/* Info */}
                      <div className="mt-2.5 flex-1 flex flex-col justify-between space-y-2">
                        <div>
                          {asset.matchedProduct ? (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-500">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{asset.matchedProduct.sku} - {asset.matchedProduct.name}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 inline-block">
                              Unlinked Asset
                            </span>
                          )}
                          <p className="text-[10px] font-mono text-slate-400 truncate mt-1" title={asset.public_id}>
                            {asset.public_id.replace("Abro Kenya/", "")}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-500/10 text-[10px]">
                          <span className="text-slate-400 font-mono">
                            {asset.format ? asset.format.toUpperCase() : ""} • {Math.round((asset.bytes || 0) / 1024)} KB
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(asset.url);
                              setCopiedUrl(asset.public_id);
                              setTimeout(() => setCopiedUrl(null), 2000);
                            }}
                            className={`px-2 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                              copiedUrl === asset.public_id
                                ? "bg-emerald-500 text-white"
                                : theme === "dark"
                                ? "bg-white/10 hover:bg-white/20 text-slate-200"
                                : "bg-white hover:bg-slate-200 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {copiedUrl === asset.public_id ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <span>Copy URL</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-500/15 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400">
                {cloudinaryAssets.filter((a) => a.matchedProduct).length} of {cloudinaryAssets.length} photos assigned to catalogue products
              </span>
              <button
                type="button"
                onClick={() => setShowAssetsViewer(false)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  theme === "dark"
                    ? "bg-white/10 hover:bg-white/20 text-white"
                    : "bg-slate-800 hover:bg-slate-900 text-white"
                }`}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Single Item Delete Modal (Warning Ahead) */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`rounded-xl shadow-2xl border max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-250 ${
            theme === "dark" ? "bg-slate-900 border-white/15 text-white" : "bg-white border-slate-205 text-slate-800"
          }`}>
            <h3 className={`text-base font-bold mb-2 ${theme === "dark" ? "text-white" : "text-rose-750"}`}>Delete Product Entry?</h3>
            <p className={`text-xs leading-relaxed mb-6 ${theme === "dark" ? "text-slate-400" : "text-slate-600"}`}>
              Are you sure you want to delete <strong className={theme === "dark" ? "text-indigo-300" : "text-[#00609C]"}>{getProductDisplayName(productToDelete)}</strong> ({productToDelete.sku})? 
              This action is permanent and will remove this product from the stock catalogue.
            </p>
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setProductToDelete(null)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer border ${
                  theme === "dark"
                    ? "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onDeleteProduct(productToDelete.id);
                  setProductToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-lg shadow-rose-500/20 text-center"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adding Form Block */}
      {isAdding && (
        <form id="add-product-form" onSubmit={handleAddSubmit} className={`p-6 rounded-xl border shadow-xl backdrop-blur-md animate-in slide-in-from-top-4 duration-300 ${
          theme === "dark" ? "bg-[#061928]/90 border-[#00609C]/25 text-white" : "bg-white border-[#00A859]/20 text-slate-800 shadow-md shadow-emerald-950/5"
        }`}>
          <div className={`flex items-center space-x-1.5 mb-4 px-3 py-1.5 rounded-lg w-max border ${
            theme === "dark" ? "text-indigo-300 bg-indigo-550/10 border-indigo-500/20" : "text-[#016838] bg-[#00a859]/5 border-[#00A859]/15"
          }`}>
            <Sparkles className={`w-4 h-4 ${theme === "dark" ? "text-indigo-455" : "text-[#00A859]"}`} />
            <span className="text-xs font-bold font-mono uppercase tracking-wider">New Product Directory Entry</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-1">
              <label className={`block text-xs font-bold mb-1 uppercase tracking-wider ${theme === "dark" ? "text-slate-350" : "text-slate-600"}`}>SKU identifier *</label>
              <input
                id="prod-sku-input"
                type="text"
                required
                placeholder="e.g. ABRO-SP-RED"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none transition-all ${
                  theme === "dark" ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder-slate-500" : "bg-slate-50 border-slate-250 focus:border-[#00a859] text-slate-800 placeholder-slate-400"
                }`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={`block text-xs font-bold mb-1 uppercase tracking-wider ${theme === "dark" ? "text-slate-350" : "text-slate-600"}`}>Official Product Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. ABRO Premium Red Spray Paint"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none transition-all ${
                  theme === "dark" ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder-slate-500" : "bg-slate-50 border-slate-250 focus:border-[#00a859] text-slate-800 placeholder-slate-400"
                }`}
              />
            </div>
            <div className="sm:col-span-1">
              <label className={`block text-xs font-bold mb-1 uppercase tracking-wider ${theme === "dark" ? "text-slate-350" : "text-slate-600"}`}>Piece Price (KES Incl. VAT) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="880.44"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none transition-all ${
                  theme === "dark" ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder-slate-500" : "bg-slate-50 border-slate-250 focus:border-[#00a859] text-slate-800 placeholder-slate-400"
                }`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={`block text-xs font-bold mb-1 uppercase tracking-wider ${theme === "dark" ? "text-slate-350" : "text-slate-600"}`}>Category Group *</label>
              <input
                type="text"
                required
                placeholder="Paints, Sealants, Utility, etc."
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none capitalize transition-all ${
                  theme === "dark" ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder-slate-500" : "bg-slate-50 border-slate-250 focus:border-[#00a859] text-slate-800 placeholder-slate-400"
                }`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={`block text-xs font-bold mb-1 uppercase tracking-wider ${theme === "dark" ? "text-slate-350" : "text-slate-600"}`}>Packaging & Technical Specs</label>
              <input
                type="text"
                placeholder="e.g. 11 oz aerosol can. Heat and oil resistant formulation."
                value={newSpecs}
                onChange={(e) => setNewSpecs(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none transition-all ${
                  theme === "dark" ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder-slate-500" : "bg-slate-50 border-slate-250 focus:border-[#00a859] text-slate-800 placeholder-slate-400"
                }`}
              />
            </div>

            <div className="sm:col-span-4">
              <label className={`block text-xs font-bold mb-1 uppercase tracking-wider ${theme === "dark" ? "text-slate-350" : "text-slate-600"}`}>Usage Directions (Step-by-Step guides)</label>
              <textarea
                placeholder="1. Ensure area is dust free.&#10;2. Apply the coat evenly in circular motions.&#10;3. Allow 20 minutes to dry."
                value={newUsage}
                onChange={(e) => setNewUsage(e.target.value)}
                rows={3}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none transition-all font-sans ${
                  theme === "dark" ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder-slate-500" : "bg-slate-50 border-slate-250 focus:border-[#00a859] text-slate-800 placeholder-slate-400"
                }`}
              />
            </div>

            {/* Product Image Selection & Cloudinary Upload Area */}
            <div className={`sm:col-span-4 space-y-3 pt-2 border-t ${theme === "dark" ? "border-white/5" : "border-slate-100"}`}>
              {/* Cloudinary status notification if uploaded */}
              {isCloudinaryUrl(newImageUrl) && (
                <div className={`p-2.5 rounded-xl text-xs font-mono flex items-center justify-between gap-2 border ${
                  theme === "dark"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}>
                  <div className="flex items-center gap-2 truncate">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="truncate">Stored on Cloudinary CDN: Folder <strong>Abro Kenya</strong></span>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded bg-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
                    muthomi254
                  </span>
                </div>
              )}

              {isUploadingAddImage && (
                <div className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 border animate-pulse ${
                  theme === "dark"
                    ? "bg-sky-500/15 border-sky-400/30 text-sky-300"
                    : "bg-sky-50 border-sky-200 text-sky-800"
                }`}>
                  <Loader2 className="w-4 h-4 animate-spin text-sky-500 shrink-0" />
                  <span>Uploading to Cloudinary CDN (Folder: Abro Kenya)...</span>
                </div>
              )}

              {addImageCloudinaryError && (
                <div className={`p-2.5 rounded-xl text-xs flex items-start gap-2 border ${
                  theme === "dark"
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                }`}>
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">{addImageCloudinaryError}</p>
                    <p className="text-[10px] opacity-80">Local optimized image applied to preview.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={`block text-xs font-bold uppercase tracking-wider ${theme === "dark" ? "text-slate-350" : "text-slate-600"}`}>
                    Product Photo URL (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="https://res.cloudinary.com/muthomi254/..."
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none transition-all ${
                      theme === "dark" ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder-slate-500" : "bg-slate-50 border-slate-250 focus:border-[#00a859] text-slate-800 placeholder-slate-400"
                    }`}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className={`block text-xs font-bold uppercase tracking-wider ${theme === "dark" ? "text-slate-400" : "text-slate-605"}`}>
                      Product Image (Cloudinary: Abro Kenya)
                    </label>
                    <span className="text-[9px] font-mono text-sky-600 dark:text-sky-400 font-semibold">
                      muthomi254
                    </span>
                  </div>

                  {/* Hidden native inputs with guaranteed reset on click, cancel, and change */}
                  <input
                    key={`add-file-input-${addPickerKey}`}
                    ref={fileInputAddRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onClick={(e) => {
                      (e.target as HTMLInputElement).value = "";
                    }}
                    onCancel={() => {
                      setAddPickerKey((k) => k + 1);
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      setAddPickerKey((k) => k + 1);
                      if (file) {
                        processAndUploadAddImage(file);
                      }
                    }}
                  />

                  <input
                    key={`add-camera-input-${addPickerKey}`}
                    ref={cameraInputAddRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onClick={(e) => {
                      (e.target as HTMLInputElement).value = "";
                    }}
                    onCancel={() => {
                      setAddPickerKey((k) => k + 1);
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      setAddPickerKey((k) => k + 1);
                      if (file) {
                        processAndUploadAddImage(file);
                      }
                    }}
                  />

                  {/* Dual Action Buttons: Take Photo & Browse Folders */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Option 1: Direct Camera Capture */}
                    <button
                      type="button"
                      disabled={isUploadingAddImage}
                      onClick={() => {
                        if (cameraInputAddRef.current) {
                          cameraInputAddRef.current.value = "";
                          cameraInputAddRef.current.click();
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
                      disabled={isUploadingAddImage}
                      onClick={() => {
                        if (fileInputAddRef.current) {
                          fileInputAddRef.current.value = "";
                          fileInputAddRef.current.click();
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

                  {/* Dropzone & Live Camera Option */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith("image/")) {
                        processAndUploadAddImage(file);
                      }
                    }}
                    className={`border-2 border-dashed rounded-lg p-2.5 text-center transition-all ${
                      theme === "dark"
                        ? "border-slate-700/80 bg-slate-900/30 hover:border-sky-500/40"
                        : "border-slate-250 bg-slate-50/60 hover:border-sky-400"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setShowAddCameraModal(true)}
                        className={`text-[10px] font-semibold flex items-center gap-1 px-2 py-1 rounded-md border transition-all cursor-pointer ${
                          theme === "dark"
                            ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10"
                            : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        <Camera className="w-3 h-3 text-emerald-500" />
                        <span>Live Viewfinder</span>
                      </button>
                      <span className="text-[10px] text-slate-400">or drag image here</span>
                    </div>
                    <p className={`text-[8px] mt-1 ${theme === "dark" ? "text-slate-500" : "text-slate-450"} font-mono`}>
                      Stores in Cloudinary: <strong>Abro Kenya</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`flex justify-end space-x-3 mt-4 pt-4 border-t ${theme === "dark" ? "border-white/10" : "border-slate-100"}`}>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer border transition-all text-center ${
                theme === "dark" ? "bg-transparent border-white/5 hover:bg-white/10 text-slate-300" : "bg-[#fafcfb] border-slate-200 hover:bg-slate-50 text-slate-700"
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all border text-center ${
                theme === "dark" ? "bg-indigo-500 hover:bg-indigo-400 text-white border-indigo-400/20 shadow-lg shadow-indigo-500/20" : "bg-[#00A859] hover:bg-[#00924d] text-white border-emerald-455 shadow-md shadow-emerald-500/10"
              }`}
            >
              Save Product
            </button>
          </div>
        </form>
      )}

      {/* Master Products Table */}
      <div className={`rounded-xl border shadow-lg overflow-hidden transition-all duration-300 ${
        theme === "dark" ? "bg-[#061e33]/90 border-white/10 text-white" : "bg-white border-[#00A859]/15 text-slate-800 shadow-emerald-250/5"
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`border-b text-xs transition-colors ${
                theme === "dark" ? "bg-white/5 border-white/10 text-slate-300" : "bg-slate-100 border-[#00A859]/15 text-slate-700 font-bold"
              }`}>
                <th className="px-6 py-3.5 text-[11px] font-bold tracking-wider uppercase">SKU / Code</th>
                <th className="px-6 py-3.5 text-[11px] font-bold tracking-wider uppercase">Product details</th>
                <th className="px-6 py-3.5 text-[11px] font-bold tracking-wider uppercase">Category</th>
                <th className="px-6 py-3.5 text-[11px] font-bold tracking-wider uppercase">Pack Pricing (KES)</th>
                <th className="px-6 py-3.5 text-[11px] font-bold tracking-wider uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y text-sm transition-colors ${theme === "dark" ? "divide-white/10 text-slate-200" : "divide-slate-100 text-slate-800"}`}>
              {filteredProducts.map((p) => {
                const isEditing = editingId === p.id;

                return (
                  <tr key={p.id} className={`transition-colors ${theme === "dark" ? "hover:bg-white/5" : "hover:bg-slate-50/75"}`}>
                    {/* SKU */}
                    <td 
                      className={`px-6 py-4 font-mono text-xs font-bold ${
                        theme === "dark" ? "text-slate-400" : "text-[#00609C]"
                      } ${!isEditing ? "cursor-pointer hover:underline decoration-dashed" : ""}`}
                      onClick={() => !isEditing && handleStartEdit(p)}
                      title={!isEditing ? "Click to edit product" : undefined}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editSku}
                          onChange={(e) => setEditSku(e.target.value)}
                          className={`px-2 py-1 border rounded focus:outline-none text-xs w-full font-mono ${
                            theme === "dark" ? "bg-slate-900 border-white/10 text-white focus:border-indigo-400" : "bg-white border-slate-300 text-slate-800 focus:border-[#00a859]"
                          }`}
                        />
                      ) : (
                        p.sku
                      )}
                    </td>

                    {/* Name & Technical Specs */}
                    <td 
                      className={`px-6 py-4 max-w-md ${!isEditing ? "cursor-pointer group/cell" : ""}`}
                      onClick={(e) => {
                        if (
                          (e.target as HTMLElement).closest('.zoomable-image-container') ||
                          (e.target as HTMLElement).tagName === 'BUTTON' ||
                          (e.target as HTMLElement).tagName === 'INPUT' ||
                          (e.target as HTMLElement).tagName === 'TEXTAREA'
                        ) {
                          return;
                        }
                        if (!isEditing) handleStartEdit(p);
                      }}
                      title={!isEditing ? "Click to edit product details" : undefined}
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className={`w-full px-2 py-1 border rounded text-sm font-semibold focus:outline-none ${
                              theme === "dark" ? "bg-slate-900 border-white/10 text-white focus:border-indigo-400" : "bg-white border-slate-300 text-slate-800 focus:border-[#00a859]"
                            }`}
                          />
                          <textarea
                            value={editSpecs}
                            onChange={(e) => setEditSpecs(e.target.value)}
                            rows={2}
                            placeholder="Specifications"
                            className={`w-full p-2 border rounded text-xs font-sans focus:outline-none ${
                              theme === "dark" ? "bg-slate-900 border-white/10 text-slate-300 focus:border-indigo-400" : "bg-white border-slate-300 text-slate-700 focus:border-[#00a859]"
                            }`}
                          />
                          <textarea
                            value={editUsage}
                            onChange={(e) => setEditUsage(e.target.value)}
                            rows={3}
                            placeholder="Usage Instructions"
                            className={`w-full p-2 border rounded text-xs font-sans focus:outline-none ${
                              theme === "dark" ? "bg-slate-900 border-white/10 text-slate-300 focus:border-indigo-400" : "bg-white border-slate-300 text-slate-700 focus:border-[#00a859]"
                            }`}
                          />
                        </div>
                      ) : (
                        <div className="flex items-start space-x-3">
                          {/* Image Thumbnail with zoom & live editing */}
                          <div className="w-10 h-10 shrink-0 zoomable-image-container">
                            <ZoomableImage
                              src={p.imageUrl || getProductImageUrl(p.name, p.category, p.sku)}
                              alt={getProductDisplayName(p)}
                              productName={getProductDisplayName(p)}
                              productSku={p.sku}
                              category={p.category}
                              price={p.price}
                              specs={p.specs}
                              usageInstructions={p.usageInstructions}
                              theme={theme}
                              onSaveUrl={async (newUrl) => {
                                await onUpdateProduct(p.id, { imageUrl: newUrl });
                              }}
                            />
                          </div>
                          <div className="space-y-1 min-w-0">
                            <div 
                              className={`font-bold truncate transition-colors ${
                                theme === "dark" 
                                  ? "text-white group-hover/cell:text-indigo-405" 
                                  : "text-[#00609C] group-hover/cell:text-[#00a859] hover:underline"
                              }`} 
                              title={getProductDisplayName(p)}
                            >
                              {getProductDisplayName(p)}
                            </div>
                            <div className={`text-xs line-clamp-2 ${theme === "dark" ? "text-slate-400" : "text-slate-705 font-medium"}`} title={p.specs}>
                              {p.specs}
                            </div>
                            {p.usageInstructions && (
                              <div className={`text-[10px] px-2 py-0.5 rounded font-bold mt-1 w-max border ${
                                theme === "dark" ? "text-indigo-300 bg-indigo-500/10 border-indigo-400/20" : "text-[#00a859] bg-[#00a859]/5 border-[#00a859]/15"
                              }`}>
                                Includes Directions For Use
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td 
                      className={`px-6 py-4 ${!isEditing ? "cursor-pointer" : ""}`}
                      onClick={() => !isEditing && handleStartEdit(p)}
                      title={!isEditing ? "Click to edit product category" : undefined}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className={`px-2 py-1 border rounded focus:outline-none text-xs capitalize w-full ${
                            theme === "dark" ? "bg-slate-900 border-white/10 text-white focus:border-indigo-400" : "bg-white border-slate-300 text-slate-800 focus:border-[#00a859]"
                          }`}
                        />
                      ) : (
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize border ${
                          theme === "dark" ? "bg-white/10 text-slate-200 border-white/5" : "bg-[#00a859]/10 text-[#016838] border-[#00a859]/15"
                        }`}>
                          {p.category}
                        </span>
                      )}
                    </td>

                    {/* Price */}
                    <td className="px-6 py-4 font-mono">
                      {isEditing ? (
                        <div className="space-y-2">
                          <label className={`block text-[10px] font-semibold font-sans ${theme === "dark" ? "text-slate-400" : "text-slate-550"}`}>Piece Price (Incl. VAT) [Per Pc + VAT]:</label>
                          <div className="relative w-36">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-sans font-bold">KES</span>
                            <input
                              type="number"
                              step="0.01"
                              value={editPrice}
                              onChange={(e) => setEditPrice(Number(e.target.value))}
                              className={`w-full pl-10 pr-1.5 py-1 border rounded text-xs font-bold focus:outline-none ${
                                theme === "dark" ? "bg-slate-900 border-white/10 text-white focus:border-indigo-400" : "bg-white border-slate-300 text-slate-850 focus:border-[#00a859]"
                              }`}
                            />
                          </div>
                        </div>
                      ) : (() => {
                        const pricing = calculatePricing(p.price, p.specs);
                        return (
                          <div className={`space-y-2 p-2 rounded-lg border w-[190px] leading-tight transition-all ${
                            theme === "dark" ? "bg-slate-900/40 border-white/5" : "bg-[#00a859]/5 border-[#00A859]/10 text-slate-850 shadow-sm"
                          }`}>
                            <div>
                              <div className={`text-[9px] font-bold uppercase tracking-wide ${theme === "dark" ? "text-slate-400" : "text-slate-705"}`}>Base Piece (Ref)</div>
                              <div className={`font-bold ${theme === "dark" ? "text-slate-300" : "text-slate-900"}`}>{formatKES(pricing.pcExVat)} <span className={`text-[8.5px] font-bold font-sans ${theme === "dark" ? "text-slate-500" : "text-slate-700"}`}>+VAT</span></div>
                              <div className={`text-[10px] font-bold ${theme === "dark" ? "text-slate-500" : "text-slate-800"}`}>{formatKES(pricing.pcIncVat)} <span className={`text-[8.5px] font-bold font-sans ${theme === "dark" ? "text-slate-600" : "text-slate-700"}`}>Incl.</span></div>
                            </div>
                            <div className={`pt-2 border-t ${theme === "dark" ? "border-white/10" : "border-[#00a859]/15"}`}>
                              <div className={`text-[8.5px] uppercase font-black tracking-wider flex items-center gap-0.5 ${
                                theme === "dark" ? "text-amber-500" : "text-[#016838]"
                              }`}>
                                Carton ({pricing.packing} pcs)
                              </div>
                              <div className={`font-bold ${theme === "dark" ? "text-indigo-300" : "text-[#00609C]"}`}>{formatKES(pricing.ctnExVat)} <span className={`text-[8.5px] font-bold font-sans ${theme === "dark" ? "text-slate-450" : "text-slate-700"}`}>+16% VAT</span></div>
                              <div className={`font-black ${theme === "dark" ? "text-emerald-400" : "text-[#00A859]"}`}>{formatKES(pricing.ctnIncVat)} <span className={`text-[8.5px] font-bold font-sans ${theme === "dark" ? "text-emerald-650" : "text-[#00A859]"}`}>Incl.</span></div>
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setEditingId(null)}
                            className={`px-2 py-1 text-xs font-bold cursor-pointer transition-all ${
                              theme === "dark" ? "text-slate-400 hover:text-slate-205" : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(p.id)}
                            className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer border ${
                              theme === "dark" ? "bg-indigo-500 hover:bg-slate-450 text-white border-indigo-400/20" : "bg-[#00A859] hover:bg-[#00924d] text-white border-emerald-455"
                            }`}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleStartEdit(p)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border flex items-center space-x-1.5 shadow-sm ${
                              theme === "dark" 
                                ? "bg-white/5 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-300 border-white/10 hover:border-indigo-500/30" 
                                : "bg-slate-50 hover:bg-[#00609C]/10 text-slate-700 hover:text-[#00609C] border-slate-200 hover:border-[#00609C]/25"
                            }`}
                            title="Amend Product specs / price"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => setProductToDelete(p)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border flex items-center space-x-1.5 shadow-sm ${
                              theme === "dark" 
                                ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border-rose-500/25 hover:border-rose-500/40" 
                                : "bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border-rose-200 hover:border-rose-300"
                            }`}
                            title="Remove Product from inventory"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400 text-xs font-medium">
                    No matching ABRO products found in active catalogue. Try updating your filters or add a new product!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
      {/* Add Product Camera Modal */}
      <CameraCaptureModal
        isOpen={showAddCameraModal}
        onClose={() => setShowAddCameraModal(false)}
        onCapture={(file) => {
          processAndUploadAddImage(file);
        }}
        theme={theme}
        title={newName ? `Take Photo: ${newName}` : "Take Product Photo"}
      />
    </div>
  );
}
