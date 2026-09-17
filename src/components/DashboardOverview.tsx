import React, { useState, useEffect, useMemo } from "react";
import { 
  BarChart3, 
  PieChart as PieChartIcon, 
  TrendingUp, 
  Package, 
  Search, 
  AlertCircle, 
  RefreshCw, 
  Layers, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  ExternalLink,
  ArrowUpRight,
  ShieldAlert,
  Info
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  CartesianGrid, 
  Legend, 
  PieChart, 
  Pie 
} from "recharts";
import { Product } from "../types";
import { getProductDisplayName } from "../utils";

interface DashboardOverviewProps {
  products: Product[];
  theme?: "light" | "dark";
  onNavigateToCatalog?: (query?: string) => void;
  onNavigateToProducts?: () => void;
}

interface AnalyticsItem {
  sku: string;
  name: string;
  count: number;
}

interface UnstockedQuery {
  term: string;
  count: number;
  timestamp: string;
}

const PIE_COLORS = [
  "#00609C", // ABRO Blue
  "#00A859", // Statpack Green
  "#F59E0B", // Gold / Amber
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#14B8A6", // Teal
  "#F97316"  // Orange
];

export default function DashboardOverview({
  products,
  theme = "dark",
  onNavigateToCatalog,
  onNavigateToProducts
}: DashboardOverviewProps) {
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsItem[]>([]);
  const [unstockedQueries, setUnstockedQueries] = useState<UnstockedQuery[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const fetchDashboardAnalytics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/analytics?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data.analytics || []);
        setUnstockedQueries(data.unstockedQueries || []);
        setLastRefreshed(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      }
    } catch (err) {
      console.error("Failed to fetch dashboard analytics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardAnalytics();
  }, [period, products]);

  // Classification helper for unstocked queries into product categories
  const classifyCategory = (term: string): string => {
    const lower = term.toLowerCase();
    if (lower.includes("paint") || lower.includes("primer") || lower.includes("spray") || lower.includes("coat")) {
      return "Paints & Finishes";
    }
    if (lower.includes("tape") || lower.includes("masking") || lower.includes("utility")) {
      return "Utility & Tapes";
    }
    if (
      lower.includes("silicone") || 
      lower.includes("adhesive") || 
      lower.includes("gasket") || 
      lower.includes("epoxy") || 
      lower.includes("sealant") || 
      lower.includes("glue") || 
      lower.includes("rtv")
    ) {
      return "Sealants & Adhesives";
    }
    if (
      lower.includes("wash") || 
      lower.includes("cleaner") || 
      lower.includes("soap") || 
      lower.includes("wax") || 
      lower.includes("carb") || 
      lower.includes("fluid") || 
      lower.includes("lube") || 
      lower.includes("oil") ||
      lower.includes("hand")
    ) {
      return "Car Care & Maintenance";
    }
    return "Utility & Tapes";
  };

  // 1. Calculate Bar Chart Data: Inventory counts by category of Stocked Products vs Unstocked/Unavailable Products
  const categoryBarData = useMemo(() => {
    const categoryMap: Record<string, { category: string; stocked: number; unstocked: number }> = {};

    // First populate stocked items from current products array
    products.forEach((p) => {
      const cat = p.category || "Uncategorized";
      if (!categoryMap[cat]) {
        categoryMap[cat] = { category: cat, stocked: 0, unstocked: 0 };
      }
      categoryMap[cat].stocked += 1;
    });

    // Populate unstocked & unavailable products count by category
    unstockedQueries.forEach((uq) => {
      const cat = classifyCategory(uq.term);
      if (!categoryMap[cat]) {
        categoryMap[cat] = { category: cat, stocked: 0, unstocked: 0 };
      }
      categoryMap[cat].unstocked += (uq.count || 1);
    });

    return Object.values(categoryMap).map(item => ({
      ...item,
      total: item.stocked + item.unstocked
    }));
  }, [products, unstockedQueries]);

  // 2. Calculate Pie Chart Data: Most frequently searched products
  const pieChartData = useMemo(() => {
    if (!analyticsData || analyticsData.length === 0) return [];

    // Exclude or reformat generic UNSTOCKED item if needed, or include with clear label
    const filtered = analyticsData.map((item) => {
      if (item.sku === "UNSTOCKED") {
        return {
          ...item,
          name: "Unstocked Product Enquiries"
        };
      }
      return item;
    });

    const totalCount = filtered.reduce((sum, item) => sum + (item.count || 0), 0);

    return filtered.map((item) => ({
      name: item.name,
      sku: item.sku,
      count: item.count || 0,
      percentage: totalCount > 0 ? Math.round(((item.count || 0) / totalCount) * 100) : 0
    }));
  }, [analyticsData]);

  // Metric Summary Cards Stats
  const totalStocked = products.length;
  const totalCategories = new Set(products.map((p) => p.category)).size;
  const totalUnstockedEnquiries = unstockedQueries.reduce((sum, q) => sum + (q.count || 0), 0);
  const totalSearchQueriesTracked = analyticsData.reduce((sum, item) => sum + (item.count || 0), 0);

  // Custom Bar Tooltip
  const CustomBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className={`p-3 rounded-xl border shadow-2xl backdrop-blur-md text-xs leading-relaxed ${
          theme === "dark" ? "bg-[#071d30] border-white/15 text-white" : "bg-white border-slate-200 text-slate-800"
        }`}>
          <p className="font-bold text-sm mb-1.5 text-[#00609C] dark:text-sky-400">{data.category}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4 text-emerald-500 font-semibold">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Stocked Inventory:
              </span>
              <span>{data.stocked} SKUs</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-rose-400 font-semibold">
              <span className="flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" /> Unstocked Enquiries:
              </span>
              <span>{data.unstocked} requests</span>
            </div>
            <div className="pt-1.5 mt-1 border-t border-white/10 flex items-center justify-between font-mono font-bold text-slate-300">
              <span>Total Demand:</span>
              <span>{data.total} units/requests</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom Pie Tooltip
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className={`p-3 rounded-xl border shadow-2xl backdrop-blur-md text-xs leading-relaxed ${
          theme === "dark" ? "bg-[#071d30] border-white/15 text-white" : "bg-white border-slate-200 text-slate-800"
        }`}>
          <p className="font-bold text-sm text-[#00A859] dark:text-emerald-400 max-w-[220px] truncate">{data.name}</p>
          <p className="font-mono text-slate-400 text-[11px] mb-1.5">SKU: {data.sku}</p>
          <div className="flex items-center justify-between gap-4 font-semibold text-sky-400">
            <span>Search Volume:</span>
            <span className="font-mono">{data.count} queries ({data.percentage}%)</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className={`p-5 sm:p-6 rounded-2xl border shadow-lg backdrop-blur-md transition-colors ${
        theme === "dark"
          ? "bg-[#061e33]/90 border-white/10 text-white"
          : "bg-white border-[#00A859]/15 text-slate-800 shadow-emerald-950/5"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-[#00A859]/15 text-[#00A859] dark:bg-[#00609C]/30 dark:text-sky-300">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h2 className={`text-lg font-extrabold tracking-tight ${theme === "dark" ? "text-white" : "text-[#016838]"}`}>
                Dashboard Overview & Demand Analytics
              </h2>
            </div>
            <p className={`text-xs leading-relaxed ${theme === "dark" ? "text-slate-400" : "text-slate-600"}`}>
              Real-time visualization of stock inventory distribution by category, unstocked customer demand enquiries, and most frequently searched products.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Period Selector Tabs */}
            <div className={`flex items-center p-1 rounded-xl border text-xs ${
              theme === "dark" ? "bg-black/30 border-white/10" : "bg-slate-100 border-slate-200"
            }`}>
              {(["monthly", "quarterly", "annual"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-lg font-semibold capitalize transition-all cursor-pointer ${
                    period === p
                      ? theme === "dark"
                        ? "bg-[#00609C] text-white shadow"
                        : "bg-[#00A859] text-white shadow"
                      : theme === "dark"
                        ? "text-slate-400 hover:text-white"
                        : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Manual Refresh Button */}
            <button
              onClick={fetchDashboardAnalytics}
              disabled={isLoading}
              className={`p-2 rounded-xl border cursor-pointer transition-all ${
                theme === "dark"
                  ? "bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
                  : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
              }`}
              title="Refresh Analytics Data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-indigo-400" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metric Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Metric 1 */}
        <div className={`p-4 rounded-2xl border transition-all ${
          theme === "dark" ? "bg-[#0a233c]/80 border-white/10" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">In-Stock Catalog</span>
            <Package className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black font-mono text-emerald-500">{totalStocked}</span>
            <span className="text-xs text-slate-400">Active SKUs</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Spread across {totalCategories} categories</p>
        </div>

        {/* Metric 2 */}
        <div className={`p-4 rounded-2xl border transition-all ${
          theme === "dark" ? "bg-[#0a233c]/80 border-white/10" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Categories</span>
            <Layers className="w-4 h-4 text-[#00609C] dark:text-sky-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black font-mono text-[#00609C] dark:text-sky-400">{totalCategories}</span>
            <span className="text-xs text-slate-400">Product Groups</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Active inventory lines</p>
        </div>

        {/* Metric 3 */}
        <div className={`p-4 rounded-2xl border transition-all ${
          theme === "dark" ? "bg-[#0a233c]/80 border-white/10" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Unstocked Enquiries</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black font-mono text-rose-400">{totalUnstockedEnquiries}</span>
            <span className="text-xs text-slate-400">Unmet Demands</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">High acquisition potential</p>
        </div>

        {/* Metric 4 */}
        <div className={`p-4 rounded-2xl border transition-all ${
          theme === "dark" ? "bg-[#0a233c]/80 border-white/10" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Tracked Queries</span>
            <Search className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black font-mono text-amber-500">{totalSearchQueriesTracked}</span>
            <span className="text-xs text-slate-400">Search Events</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Period: {period}</p>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CHART 1: Bar Chart (Product inventory counts by category of unstocked products and unavailable products) */}
        <div className={`lg:col-span-7 p-5 sm:p-6 rounded-2xl border shadow-md flex flex-col justify-between transition-colors ${
          theme === "dark" ? "bg-[#08223a]/90 border-white/10" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="space-y-1 mb-4">
            <div className="flex items-center justify-between">
              <h3 className={`text-base font-bold flex items-center space-x-2 ${theme === "dark" ? "text-white" : "text-slate-800"}`}>
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                <span>Inventory & Unstocked Demand Counts by Category</span>
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20">
                Category Comparison
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Comparison of active in-stock inventory vs. unstocked/unavailable product customer enquiries per product category.
            </p>
          </div>

          <div className="w-full h-72 sm:h-80 my-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryBarData} margin={{ top: 15, right: 15, left: -10, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "#ffffff15" : "#00000010"} />
                <XAxis 
                  dataKey="category" 
                  tick={{ fontSize: 11, fill: theme === "dark" ? "#94a3b8" : "#475569" }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis 
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: theme === "dark" ? "#94a3b8" : "#475569" }}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Legend 
                  wrapperStyle={{ paddingTop: "15px", fontSize: "12px" }}
                />
                <Bar 
                  dataKey="stocked" 
                  name="Stocked Products (In Inventory)" 
                  fill={theme === "dark" ? "#10B981" : "#00A859"} 
                  radius={[4, 4, 0, 0]} 
                />
                <Bar 
                  dataKey="unstocked" 
                  name="Unstocked / Unavailable Requests" 
                  fill="#EF4444" 
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Category Quick Badge Footer */}
          <div className="pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {categoryBarData.map((cat) => (
              <div 
                key={cat.category}
                className={`p-2 rounded-xl border text-center ${
                  theme === "dark" ? "bg-black/20 border-white/5" : "bg-slate-50 border-slate-100"
                }`}
              >
                <div className="font-bold truncate text-slate-300 text-[11px]">{cat.category}</div>
                <div className="flex items-center justify-center gap-2 mt-0.5 text-[10px] font-mono font-bold">
                  <span className="text-emerald-500">{cat.stocked} stock</span>
                  <span className="text-slate-500">|</span>
                  <span className="text-rose-400">{cat.unstocked} unstocked</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CHART 2: Pie Chart (Most Frequently Searched Products) */}
        <div className={`lg:col-span-5 p-5 sm:p-6 rounded-2xl border shadow-md flex flex-col justify-between transition-colors ${
          theme === "dark" ? "bg-[#08223a]/90 border-white/10" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="space-y-1 mb-2">
            <div className="flex items-center justify-between">
              <h3 className={`text-base font-bold flex items-center space-x-2 ${theme === "dark" ? "text-white" : "text-slate-800"}`}>
                <PieChartIcon className="w-4 h-4 text-[#00609C] dark:text-sky-400" />
                <span>Most Frequently Searched Products</span>
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 font-bold border border-sky-500/20">
                Search Trends
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Proportional distribution of customer search interest across top product SKUs.
            </p>
          </div>

          <div className="w-full h-64 sm:h-72 my-1 flex items-center justify-center">
            {pieChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="count"
                    nameKey="name"
                  >
                    {pieChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-400 text-xs py-10">
                <Info className="w-6 h-6 mb-2 text-slate-500" />
                <span>No search activity records logged for this period.</span>
              </div>
            )}
          </div>

          {/* Searched Products Ranking List */}
          <div className="space-y-2 pt-3 border-t border-white/10 max-h-44 overflow-y-auto pr-1">
            {pieChartData.map((item, idx) => (
              <div 
                key={item.sku + idx}
                className={`p-2 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                  theme === "dark" ? "bg-black/20 border-white/5 hover:bg-white/5" : "bg-slate-50 border-slate-100 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                  <div 
                    className="w-3 h-3 rounded-full shrink-0" 
                    style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} 
                  />
                  <div className="min-w-0">
                    <p className="font-bold truncate text-slate-200 dark:text-white text-[11px] leading-tight">
                      {item.name}
                    </p>
                    <p className="font-mono text-[10px] text-slate-400">{item.sku}</p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-mono font-bold text-sky-400">{item.count} searches</span>
                  <span className="text-[10px] text-slate-400 block font-mono">{item.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed Unstocked & Unavailable Products Section */}
      <div className={`p-5 sm:p-6 rounded-2xl border shadow-md transition-colors ${
        theme === "dark" ? "bg-[#08223a]/90 border-white/10" : "bg-white border-slate-200 shadow-sm"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className={`text-base font-bold flex items-center space-x-2 ${theme === "dark" ? "text-white" : "text-slate-800"}`}>
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span>Unstocked & Unavailable Products Requested by Customers</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Items queried by customers through the AI chatbot or catalog search that are not currently stocked in inventory.
            </p>
          </div>

          {onNavigateToProducts && (
            <button
              onClick={onNavigateToProducts}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                theme === "dark"
                  ? "bg-[#00A859]/20 hover:bg-[#00A859]/30 text-emerald-400 border border-[#00A859]/30"
                  : "bg-[#00A859] hover:bg-[#008f4c] text-white shadow-sm"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Items to Stock</span>
            </button>
          )}
        </div>

        {unstockedQueries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unstockedQueries.map((uq, idx) => {
              const cat = classifyCategory(uq.term);
              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-2.5 transition-all ${
                    theme === "dark"
                      ? "bg-black/30 border-white/10 hover:border-rose-500/30"
                      : "bg-slate-50 border-slate-200 hover:border-rose-300"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        {cat}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {uq.timestamp ? new Date(uq.timestamp).toLocaleDateString() : "Recent"}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-200 dark:text-white leading-snug">
                      {uq.term}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                    <span className="text-slate-400">Total Requests:</span>
                    <span className="font-mono font-black text-rose-400">{uq.count} queries</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400 text-xs">
            No unstocked or unavailable product enquiries logged.
          </div>
        )}
      </div>
    </div>
  );
}
