import React, { useState } from "react";
import * as XLSX from "xlsx";
import { FileText, Sparkles, Check, ClipboardCopy, Send, Save, AlertCircle, RefreshCw, Sliders } from "lucide-react";
import { Product } from "../types";
import { getProductDisplayName } from "../utils";

// Robust pricing extractor preventing mangled digits from trailing info like +16% VAT, /=, or qty descriptors
function parseCleanPrice(raw: any): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  if (typeof raw === "number") return Math.abs(raw);
  
  // Normalize non-breaking spaces and translate to lowercase
  let str = String(raw).toLowerCase().replace(/\u00a0/g, " ").trim();

  // If the cell contains a classic SKU pattern (e.g. letters followed by numbers, like WD-473, AB-12, ABRO-12, WD473)
  // or a classic unit size (e.g., 300ml, 10oz, 5kg), block it from being treated as a price
  const isSkuPattern = /^[a-z]{1,5}-?\d+([a-z])?$/i.test(str);
  const isSizePattern = /^\d+\s*(ml|g|oz|kg|ltr|litres?|gms|lbs|pcs?|ctns?|box|ounces?|inch|mm|cm)$/i.test(str);
  if (isSkuPattern || isSizePattern) {
    return 0;
  }

  // Strip all standard billing suffixes/prefixes/abbreviations first.
  // We place kshs, shs, ksh, etc. in descending order of length so they are matched comprehensively.
  const allowedPatterns = [
    /shillings/gi, /shilling/gi,
    /kshs\.?/gi, /shs\.?/gi, /ksh\.?/gi, /kes\.?/gi, /sh\.?/gi, /usd\.?/gi, /vat/gi,
    /incl\.?/gi, /excl\.?/gi, /plus/gi, /with/gi, /per/gi, /each/gi,
    /pcs?/gi, /unit/gi, /ctn/gi, /carton/gi, /box/gi, /qty/gi, /=/gi
  ];

  let checkStr = str;
  for (const pattern of allowedPatterns) {
    checkStr = checkStr.replace(pattern, "");
  }

  // Split at separators matching common suffixes or additions
  const separators = [/\+/, /incl/i, /plus/i, /vat/i, /with/i, /\/=/, /\//];
  for (const sep of separators) {
    const parts = str.split(sep);
    if (parts.length > 1) {
      str = parts[0].trim();
    }
  }

  // Strip currency prefixes/suffixes comprehensively
  str = str.replace(/(kshs|shs|kes|ksh|sh|usd|\$)\.?/gi, "").trim();

  // Extract the first contiguous float-like string matching digits & optional decimals
  const match = str.match(/[\d,]+(?:\.\d+)?/);
  if (match) {
    const numberStr = match[0].replace(/,/g, ""); 
    const parsed = parseFloat(numberStr);
    return isNaN(parsed) ? 0 : Math.abs(parsed);
  }
  
  const fallback = str.replace(/[^0-9.]/g, "");
  const val = parseFloat(fallback);
  return isNaN(val) ? 0 : Math.abs(val);
}

interface ContextDocManagerProps {
  contextDocument: string;
  onSaveContext: (text: string) => Promise<void>;
  onBulkAddProducts: (newProducts: Omit<Product, "id">[]) => Promise<void>;
  isLoading: boolean;
  theme?: "light" | "dark";
  adminToken?: string | null;
  products?: Product[];
}

export default function ContextDocManager({
  contextDocument,
  onSaveContext,
  onBulkAddProducts,
  isLoading,
  theme = "dark",
  adminToken = null,
  products = []
}: ContextDocManagerProps) {
  const [contextInput, setContextInput] = useState(contextDocument);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI Import State
  const [rawInvoiceText, setRawInvoiceText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [extractedProducts, setExtractedProducts] = useState<Omit<Product, "id">[]>([]);
  const [importCompletedCount, setImportCompletedCount] = useState<number | null>(null);

  // Excel Import States
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<any[][]>([]);
  const [isExcelLoading, setIsExcelLoading] = useState(false);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    sku: "",
    name: "",
    unitSize: "",
    packing: "",
    category: "",
    price: "",
    specs: "",
    usageInstructions: ""
  });
  const [excelMode, setExcelMode] = useState<"text" | "excel">("text");

  // AI Enrichment States
  const [autoEnrichWithAi, setAutoEnrichWithAi] = useState(true);
  const [isEnriching, setIsEnriching] = useState(false);

  // Pre-filled examples for parsing demonstration
  const exampleText1 = `ABRO Spray Paint (Red) SKU: ABRO-SP-RED, Category: Paints & Finishes, Price $6.50. Perfect for car rims. Apply 2-3 thin coats.
ABRO Super Glue Gel SKU: ABRO-SG-GEL, Category: Sealants & Adhesives, Price $2.99, Works on wood, ceramic, and metal. Hardens in 30 seconds.
ABRO Liquid Brake Cleaner SKU: ABRO-BC-110, Category: Car Care & Maintenance, Price $9.25, Clean oil off disc rotors. Spray generously and let air dry.`;

  const autoDetectMappings = (headers: string[]) => {
    const mapping: Record<string, string> = {
      sku: "",
      name: "",
      unitSize: "",
      packing: "",
      category: "",
      price: "",
      specs: "",
      usageInstructions: ""
    };

    // Prioritized fields: SKU is matched first, then Name, then Price, and only then other attributes.
    // This forms a strict waterfall where essential identifiers are secured first,
    // and cannot be "stolen" by late-mapped properties or fallback rules!
    const fields = ["sku", "name", "unitSize", "price", "packing", "category", "specs", "usageInstructions"];
    const mappedHeaders = new Set<string>();

    fields.forEach((field) => {
      let maxScore = -999;
      let bestHeader = "";

      headers.forEach((h) => {
        if (!h) return;
        if (mappedHeaders.has(h)) return; // Strictly prevent assigning the same Excel column to multiple fields!

        const clean = String(h || "").toLowerCase().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        if (!clean) return;

        let score = 0;

        if (field === "sku") {
          if (["sku code", "sku", "part code", "part no", "part no.", "part number", "item code", "itemcode"].includes(clean)) {
            score += 150;
          } else if (["sku", "code", "part", "itemcode", "partno", "sku#"].some(k => clean.includes(k))) {
            score += 50;
          }
          if (["name", "description", "desc", "price", "ctn", "pack", "category", "group"].some(k => clean.includes(k))) {
            score -= 80;
          }
        }

        if (field === "name") {
          if (["product name", "item name", "brand name", "name", "title", "product description", "description"].includes(clean)) {
            score += 150;
          } else if (["name", "title", "product", "item"].some(k => clean.includes(k))) {
            score += 50;
          }
          if (["sku", "code", "part", "no", "price", "packing", "ctn", "pack", "vat", "category", "group", "type", "class", "box", "ctn", "carton"].some(k => clean.includes(k))) {
            score -= 100;
          }
        }

        if (field === "unitSize") {
          if (["unit/size", "unit size", "size", "volume", "capacity", "weight", "measurement"].includes(clean)) {
            score += 150;
          } else if (["size", "measure", "unit", "vol", "capacity", "wt"].some(k => clean.includes(k))) {
            score += 50;
          }
          if (["price", "sku", "code", "part", "packing", "ctn", "carton", "pack", "vat", "category"].some(k => clean.includes(k))) {
            score -= 100;
          }
        }

        if (field === "packing") {
          if (["packing", "packing/ctn", "unit/ ctn", "unit/ctn", "pack", "ctn", "carton pack", "qty per ctn", "pack qty"].includes(clean)) {
            score += 150;
          } else if (["packing", "pack", "ctn", "carton", "units per box", "qty per case"].some(k => clean.includes(k))) {
            score += 50;
          }
          if (["price", "sku", "code", "name", "category"].some(k => clean.includes(k))) {
            score -= 80;
          }
        }

        if (field === "category") {
          if (["category", "product category", "group", "product group", "type", "class", "dept", "department", "cat"].includes(clean)) {
            score += 150;
          } else if (["category", "group", "type", "class", "dept", "department", "cat", "division"].some(k => clean.includes(k))) {
            score += 50;
          }
          if (["name", "sku", "code", "price", "packing", "ctn", "size"].some(k => clean.includes(k))) {
            score -= 80;
          }
        }

        if (field === "price") {
          const isPerPcInclVat = [
            "vat/incl. per piece", "vat.inc/piece", "vat incl per piece", 
            "unit price vat incl", "unit price (inclusive of vat)", "unit price (incl vat)", 
            "price incl. vat", "vat.inc/per piece", "per piece + vat", "per pc + vat", 
            "pc + vat", "vat/incl per pc", "vat/incl. per pc", "per piece inclusive of vat", 
            "per pc inclusive of vat", "unit price + vat", "price + vat",
            "per pc inclusive", "per piece inclusive", "net inclusive price", "inclusive price", "inc. vat per piece"
          ].some(kw => clean === kw || clean.replace(/\s+/g, "").includes(kw.replace(/\s+/g, "")));

          if (isPerPcInclVat) {
            score += 300; // SUPER MAX priority for per piece inclusive of VAT!
          } else if (["unit price", "unit price per pc", "price", "unit price/cart", "excl. vat", "excl vat", "price excl vat", "price excl. vat", "per piece price"].includes(clean)) {
            score += 150;
          } else if (["price", "kes", "cost", "msrp", "rate", "wholesale", "amount", "piece price", "price/pcs", "vat/incl", "incl. vat", "vat.inc", "vat.incl"].some(k => clean.includes(k))) {
            score += 50;
          }

          // Penalties
          if (["carton", "ctn", "case", "pack", "qty", "total", "box", "part", "sku", "code", "size", "unit/size", "measure", "packing", "manual"].some(k => clean.includes(k))) {
            score -= 150; // Heavy penalty to prevent Carton Price or Part/SKU headers from stealing Unit Price
          }
          // Massive safeguard: if a header denotes a size description, dimensions, volumes, or units but does not mention price/cost, block it completely
          if (clean.includes("size") || clean.includes("unit") || clean.includes("measure") || clean.includes("dimension") || clean.includes("pack") || clean.includes("ctn") || clean.includes("carton") || clean.includes("volume") || clean.includes("weight") || clean.includes("capacity")) {
            if (!clean.includes("price") && !clean.includes("kes") && !clean.includes("cost") && !clean.includes("amount") && !clean.includes("rate") && !clean.includes("vat") && !clean.includes("amount")) {
              score -= 350; // Complete block penalty to ensure it never gets picked as Price
            }
          }
        }

        if (field === "specs") {
          if (["specs", "specifications", "description", "details", "features"].includes(clean)) {
            score += 100;
          } else if (["specs", "specifications", "description", "desc", "details", "features"].some(k => clean.includes(k))) {
            score += 30;
          }
          if (["sku", "code", "price", "name", "category", "packing", "ctn"].some(k => clean.includes(k))) {
            score -= 50;
          }
        }

        if (field === "usageInstructions") {
          if (["usage", "instructions", "directions", "application", "steps", "usage instructions", "directions for use"].includes(clean)) {
            score += 150;
          } else if (["usage", "instructions", "directions", "application", "steps"].some(k => clean.includes(k))) {
            score += 50;
          }
        }

        if (score > maxScore && score > 0) {
          maxScore = score;
          bestHeader = h;
        }
      });

      if (bestHeader) {
        mapping[field] = bestHeader;
        mappedHeaders.add(bestHeader); // Take this header off the market so others can't reuse it
      }
    });

    // Final fallback for name using description/details/specs if still empty
    if (!mapping.name) {
      const descCol = headers.find(h => {
        if (!h || mappedHeaders.has(h)) return false;
        const c = String(h).toLowerCase();
        return c.includes("description") || c.includes("desc") || c.includes("details");
      });
      if (descCol) {
        mapping.name = descCol;
        mappedHeaders.add(descCol);
      }
    }

    return mapping;
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFile(file);
    setIsExcelLoading(true);
    setParseError(null);
    setImportCompletedCount(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true });
        
        if (rawRows.length === 0) {
          throw new Error("The uploaded Excel sheet contains no rows.");
        }

        // Find the actual header row by scanning first 15 rows to find the one with the most matching catalog keywords
        let headerRowIndex = 0;
        let maxKeywordCount = 0;
        const catalogKeywords = ["sku", "code", "part", "item", "name", "desc", "price", "vat", "ctn", "pack", "size", "unit", "incl", "excl", "carton", "qty"];

        for (let i = 0; i < Math.min(15, rawRows.length); i++) {
          const row = rawRows[i];
          if (!row || !Array.isArray(row)) continue;
          let count = 0;
          row.forEach(cell => {
            if (cell !== undefined && cell !== null) {
              const strCell = String(cell).toLowerCase().trim();
              if (catalogKeywords.some(kw => strCell.includes(kw))) {
                count++;
              }
            }
          });
          if (count > maxKeywordCount) {
            maxKeywordCount = count;
            headerRowIndex = i;
          }
        }

        const filteredRows = rawRows.slice(headerRowIndex);
        if (filteredRows.length === 0) {
          throw new Error("No data rows found in the spreadsheet.");
        }

        const headers = filteredRows[0].map((h: any) => String(h || "").trim());
        
        if (headers.filter(Boolean).length === 0) {
          throw new Error("No headers found on the detected header row of the Excel sheet.");
        }

        setExcelHeaders(headers);
        setExcelRows(filteredRows);
        
        const detected = autoDetectMappings(headers);
        setColumnMapping(detected);
      } catch (err: any) {
        setParseError(err.message || "Failed to read Excel file.");
      } finally {
        setIsExcelLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleProcessExcel = async () => {
    if (excelRows.length <= 1) {
      setParseError("Please select a valid Excel file with at least 2 rows (Headers + Data).");
      return;
    }

    const headerIndices: Record<string, number> = {};
    excelHeaders.forEach((h, index) => {
      if (h) {
        headerIndices[h] = index;
      }
    });

    const dataRows = excelRows.slice(1);
    const parsed: Omit<Product, "id">[] = [];
    const seenSkusInSheet = new Set<string>();

    dataRows.forEach((row, rowIdx) => {
      const getVal = (field: string): string => {
        const colName = columnMapping[field];
        if (!colName) return "";
        const idx = headerIndices[colName];
        if (idx === undefined) return "";
        const cell = row[idx];
        return cell !== undefined && cell !== null ? String(cell).trim() : "";
      };

      const sku = getVal("sku");
      const name = getVal("name");
      const unitSize = getVal("unitSize");
      const packing = getVal("packing");
      const category = getVal("category");
      const rawPrice = getVal("price");
      const specs = getVal("specs");
      const usageInstructions = getVal("usageInstructions");

      let priceNum = parseCleanPrice(rawPrice);

      // Super Safeguard: If the mapped price column header is clearly a size/packing column and not a price column, ignore its values to prevent importing unit sizes as prices
      const mappedPriceHdr = columnMapping.price ? columnMapping.price.toLowerCase() : "";
      if (mappedPriceHdr) {
        const isSizeOrPackHdr = ["size", "unit", "pack", "ctn", "carton", "qty", "quantity", "measure", "uom", "dimension", "weight", "volume", "capacity"].some(k => mappedPriceHdr.includes(k));
        const hasPriceKeyword = ["price", "cost", "kes", "ksh", "rate", "amount", "wholesale", "msrp", "val", "excl", "incl", "vat"].some(k => mappedPriceHdr.includes(k));
        if (isSizeOrPackHdr && !hasPriceKeyword) {
          priceNum = 0;
        }
      }

      if (sku || name) {
        const cleanSku = (sku || "").toLowerCase().trim();
        const cleanName = (name || "").toLowerCase().trim();

        // Prevent header rows or boilerplate lines from being parsed as unique products
        if (
          ["code", "sku", "item code", "part number", "part no", "part no.", "partcode", "itemcode"].includes(cleanSku) ||
          ["product name", "item name", "product description", "description", "part description", "name"].includes(cleanName)
        ) {
          return;
        }

        const finalSku = sku || `ABRO-LOCAL-${rowIdx + 1}`;
        const normFinalSku = finalSku.trim().toUpperCase();

        // 🔍 Local Database Cross-Reference Check!
        // Look up this SKU in our existing local stock catalog to confirm the product's official name, category,
        // specifications, and usage instructions if they aren't fully defined in the raw rows of the uploaded sheet.
        const existingLocalProduct = (products || []).find(
          (p) => p.sku && p.sku.trim().toUpperCase() === normFinalSku
        );

        let finalName = name;
        if (!finalName && existingLocalProduct) {
          finalName = existingLocalProduct.name;
        }
        if (!finalName) {
          finalName = `Unnamed Row ${rowIdx + 1}`;
        }

        let finalCategory = category || (existingLocalProduct?.category || "General");
        let baseSpecs = specs || "";
        if (!baseSpecs && existingLocalProduct) {
          baseSpecs = existingLocalProduct.specs || "";
        }
        let finalUsage = usageInstructions || (existingLocalProduct?.usageInstructions || "Clean surface and apply according to standards.");

        // Safe client-side spreadsheet deduplication match check:
        if (seenSkusInSheet.has(normFinalSku)) {
          return;
        }
        seenSkusInSheet.add(normFinalSku);

        // Gather clean detailed specs by appending auxiliary columns in the sheet automatically if available:
        const specArr: string[] = [];
        if (unitSize) {
          specArr.push(`Unit/Size: ${unitSize}`);
        }
        if (packing) {
          specArr.push(`Packing/Ctn: ${packing}`);
        }
        if (baseSpecs) {
          specArr.push(baseSpecs);
        }
        // Include any auxiliary specs columns present in the raw spreadsheet (Unit/size, Unit/ Ctn, Carton pricing)
        excelHeaders.forEach((hdr, hIdx) => {
          if (hdr && !Object.values(columnMapping).filter(Boolean).includes(hdr)) {
            const low = hdr.toLowerCase();
            if (["size", "ctn", "carton", "per", "incl", "vat"].some(k => low.includes(k))) {
              const cellVal = row[hIdx];
              if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== "") {
                specArr.push(`${hdr}: ${String(cellVal).trim()}`);
              }
            }
          }
        });

        const finalSpecs = specArr.length > 0 ? specArr.join(" | ") : "No specifications loaded.";

        parsed.push({
          sku: finalSku,
          name: finalName,
          category: finalCategory,
          price: priceNum,
          specs: finalSpecs,
          usageInstructions: finalUsage
        });
      }
    });

    if (parsed.length === 0) {
      setParseError("No products could be extracted. Please check your column mapping selections.");
      return;
    }

    if (autoEnrichWithAi) {
      setIsEnriching(true);
      setParseError(null);
      try {
        const res = await fetch("/api/enrich-products", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            ...(adminToken ? { "Authorization": `Bearer ${adminToken}` } : {})
          },
          body: JSON.stringify({ products: parsed })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to auto-enrich product details.");
        }
        const data = await res.json();
        if (data.products && Array.isArray(data.products)) {
          setExtractedProducts(data.products);
        } else {
          setExtractedProducts(parsed);
          setParseError("Auto-enrichment returned an unexpected format. Using raw parsed data.");
        }
      } catch (err: any) {
        setExtractedProducts(parsed);
        setParseError(`Spreadsheet parsed, but AI enrichment failed: ${err.message}. Showing raw rows instead.`);
      } finally {
        setIsEnriching(false);
      }
    } else {
      setExtractedProducts(parsed);
      setParseError(null);
    }
  };

  const handleSaveContext = async () => {
    setIsSaving(true);
    try {
      await onSaveContext(contextInput);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      alert("Failed to save context document.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleParseText = async () => {
    if (!rawInvoiceText.trim()) return;
    setIsParsing(true);
    setParseError(null);
    setExtractedProducts([]);
    setImportCompletedCount(null);

    try {
      const response = await fetch("/api/parse-context", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(adminToken ? { "Authorization": `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({ text: rawInvoiceText })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Extraction failed. Ensure your Gemini API Key is configured.");
      }

      const data = await response.json();
      if (data.products && data.products.length > 0) {
        setExtractedProducts(data.products);
      } else {
        setParseError("No products could be extracted. Please make sure the pasted details contain product names and prices.");
      }
    } catch (err: any) {
      setParseError(err.message || "An unexpected issue occurred while parsing the text.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleImportAllExtracted = async () => {
    if (extractedProducts.length === 0) return;
    setIsSaving(true);
    try {
      await onBulkAddProducts(extractedProducts);
      setImportCompletedCount(extractedProducts.length);
      setExtractedProducts([]);
      setRawInvoiceText("");
    } catch (err: any) {
      alert("Failed to import bulk products.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="context-manager-layout">
      
      {/* Box 1: Core Context Document Override */}
      <div className={`p-6 rounded-xl border shadow-lg flex flex-col justify-between backdrop-blur-md transition-all duration-300 ${
        theme === "dark" ? "bg-white/5 border-white/10 text-white" : "bg-white border-[#00A859]/15 text-slate-800 shadow-emerald-250/5"
      }`}>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-lg border ${
              theme === "dark" ? "bg-[#002f52] text-indigo-400 border-indigo-550/20" : "bg-emerald-50 text-[#00609C] border-[#00A859]/25"
            }`}>
              <FileText className="w-5 h-5 flex-shrink-0" />
            </div>
            <div>
              <h3 className={`text-sm font-bold uppercase tracking-wider ${theme === "dark" ? "text-white" : "text-[#00609C]"}`}>Context Text Overrides</h3>
              <p className={`text-[11px] font-medium ${theme === "dark" ? "text-slate-400" : "text-slate-550"}`}>Pasted rules here instantly ground all customer AI responses.</p>
            </div>
          </div>

          <p className={`text-xs leading-relaxed p-3 rounded-lg border ${
            theme === "dark" ? "text-slate-300 bg-white/5 border-white/10" : "text-[#016838] bg-[#00a859]/5 border-[#00a859]/10"
          }`}>
            💡 Provide details about **ABRO shop hours, refund policies, wholesale contracts, custom bulk price models, or warnings** that are not structured in standard product listings.
          </p>

          <textarea
            value={contextInput}
            onChange={(e) => setContextInput(e.target.value)}
            rows={10}
            className={`w-full px-3.5 py-3 text-sm rounded-xl focus:outline-none transition-all font-sans border ${
              theme === "dark"
                ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder-slate-500"
                : "bg-slate-50 border-slate-250 focus:border-[#00a859] text-slate-800 placeholder:text-slate-400"
            }`}
            placeholder="e.g. For wholesales over $200, apply 10% discount... Shipping hours are Monday-Friday 9AM..."
          />
        </div>

        <div className={`flex items-center justify-between border-t mt-4 pt-4 shrink-0 ${theme === "dark" ? "border-white/10" : "border-slate-100"}`}>
          <div className={`text-xs font-mono font-medium ${theme === "dark" ? "text-slate-450" : "text-slate-500"}`}>
            {contextInput.length} characters
          </div>
          <button
            onClick={handleSaveContext}
            disabled={isSaving}
            className={`px-4 py-2 text-white font-bold text-xs rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer shadow-lg border ${
              theme === "dark"
                ? "bg-indigo-500 hover:bg-indigo-400 border-indigo-400/20 shadow-indigo-500/20"
                : "bg-[#00a859] hover:bg-[#00924d] border-emerald-455 shadow-emerald-500/10"
            }`}
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saveSuccess ? "Saved successfully!" : "Save Context Document"}</span>
          </button>
        </div>
      </div>

      {/* Box 2: Intelligent Price List Extractor */}
      <div className={`p-6 rounded-xl border shadow-lg flex flex-col justify-between backdrop-blur-md transition-all duration-300 ${
        theme === "dark" ? "bg-[#061e33]/90 border-white/10 text-white" : "bg-white border-[#00A859]/15 text-slate-800 shadow-emerald-250/5"
      }`}>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <div className={`p-2 rounded-lg border ${
              theme === "dark" ? "bg-[#002f52] text-indigo-400 border-indigo-550/20" : "bg-[#00A859]/5 text-[#00609C] border-[#00A859]/25"
            }`}>
              <Sparkles className="w-5 h-5 flex-shrink-0" />
            </div>
            <div>
              <h3 className={`text-sm font-bold uppercase tracking-wider ${theme === "dark" ? "text-white" : "text-[#00A859]"}`}>AI Price List / Invoice Extractor</h3>
              <p className={`text-[11px] font-medium ${theme === "dark" ? "text-slate-400" : "text-slate-550"}`}>Paste an entire catalog list or upload an excel spreadsheet directly.</p>
            </div>
          </div>

          {/* Toggle Switches */}
          <div className="flex rounded-lg border border-slate-200/50 dark:border-white/10 p-0.5 overflow-hidden w-full backdrop-blur-sm self-start">
            <button
              type="button"
              onClick={() => {
                setExcelMode("text");
                setExtractedProducts([]);
                setExcelFile(null);
                setExcelRows([]);
                setExcelHeaders([]);
              }}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-all uppercase flex items-center justify-center space-x-1 border-0 cursor-pointer ${
                excelMode === "text"
                  ? theme === "dark" ? "bg-indigo-600 text-white" : "bg-[#00A859] text-white"
                  : theme === "dark" ? "bg-transparent text-slate-400 hover:text-white" : "bg-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Text AI Extractor</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setExcelMode("excel");
                setExtractedProducts([]);
                setRawInvoiceText("");
              }}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-bold tracking-wide transition-all uppercase flex items-center justify-center space-x-1 border-0 cursor-pointer ${
                excelMode === "excel"
                  ? theme === "dark" ? "bg-indigo-600 text-white" : "bg-[#00A859] text-white"
                  : theme === "dark" ? "bg-transparent text-slate-400 hover:text-white" : "bg-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Direct Excel Imports</span>
            </button>
          </div>

          {/* Mode 1: Pasting Text Parser */}
          {excelMode === "text" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-bold uppercase tracking-wider ${theme === "dark" ? "text-slate-300" : "text-slate-700"}`}>Paste Invoice or Unstructured Listing Text</label>
                  <button
                    type="button"
                    className={`text-[10px] font-bold bg-transparent border-0 cursor-pointer hover:underline ${
                      theme === "dark" ? "text-indigo-400 hover:text-indigo-300" : "text-[#00609C] hover:text-[#002f52]"
                    }`}
                    onClick={() => setRawInvoiceText(exampleText1)}
                  >
                    Insert Example ABRO Text
                  </button>
                </div>
                <textarea
                  value={rawInvoiceText}
                  onChange={(e) => setRawInvoiceText(e.target.value)}
                  rows={5}
                  className={`w-full px-3.5 py-2.5 text-sm rounded-xl focus:outline-none transition-all font-sans border ${
                    theme === "dark"
                      ? "bg-slate-900/40 border-white/10 focus:border-indigo-400 text-white placeholder-slate-500"
                      : "bg-slate-50 border-slate-300 focus:border-[#00a859] text-slate-800 placeholder:text-slate-400"
                  }`}
                  placeholder="e.g. Paste a list: ABRO Red adhesive SKU-123 price $4.50. Spray adhesive is $11..."
                />
              </div>
            </div>
          )}

          {/* Mode 2: Excel uploader map */}
          {excelMode === "excel" && (
            <div className="space-y-3">
              {!excelFile ? (
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold uppercase tracking-wider block ${
                    theme === "dark" ? "text-slate-400" : "text-slate-600"
                  }`}>
                    Upload Spreadsheet File (.xlsx, .xls, .csv)
                  </label>
                  <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-all relative group cursor-pointer ${
                    theme === "dark"
                      ? "border-white/10 hover:border-indigo-500/50 bg-slate-950/30 hover:bg-slate-950/70"
                      : "border-slate-200 hover:border-[#00a859]/55 bg-slate-50 hover:bg-slate-100"
                  }`}>
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleExcelUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      title="Choose Excel spreadsheet to import properties exactly"
                    />
                    <div className="space-y-2 pointer-events-none">
                      <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        theme === "dark"
                          ? "bg-white/5 text-slate-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/15"
                          : "bg-slate-200 text-slate-600 group-hover:text-[#00609C] group-hover:bg-[#00609C]/5"
                      }`}>
                        <FileText className="w-5 h-5" />
                      </div>
                      <p className="text-xs text-slate-400 font-medium">
                        Drag Excel file here or <span className={`underline font-bold ${
                          theme === "dark" ? "text-indigo-400" : "text-[#00609C]"
                        }`}>browse files</span>
                      </p>
                      <p className={`text-[9px] font-mono leading-normal max-w-sm mx-auto ${theme === "dark" ? "text-slate-500" : "text-slate-500"}`}>
                        Direct parser extracts precise columns with 100% mathematical consistency, matching SKU, Name, and detailed item descriptions directly.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                    theme === "dark" ? "bg-slate-950/60 border-white/10" : "bg-slate-50 border-slate-200"
                  }`}>
                    <div className="space-y-0.5">
                      <span className={`font-bold block ${theme === "dark" ? "text-white" : "text-slate-800"}`}>
                        🟢 Loaded: {excelFile.name}
                      </span>
                      <span className={`text-[10px] block font-medium ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
                        Parsed <strong>{excelRows.length - 1} data lines</strong> from sheet.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setExcelFile(null);
                        setExcelRows([]);
                        setExcelHeaders([]);
                        setExtractedProducts([]);
                        setParseError(null);
                      }}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer border transition-colors ${
                        theme === "dark"
                          ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/15"
                          : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                      }`}
                    >
                      Clear Sheet
                    </button>
                  </div>

                  {/* Config Box */}
                  <div className={`p-4 rounded-xl border space-y-3 ${
                    theme === "dark" ? "bg-slate-950/40 border-white/5" : "bg-emerald-500/5 border-[#00a859]/10"
                  }`}>
                    <div className="flex items-center space-x-1.5 border-b pb-2 border-white/5">
                      <Sliders className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-[11px] font-black uppercase tracking-wider">Excel Columns Mapping Configuration</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {Object.keys(columnMapping).map((field) => {
                        const matchedHeader = columnMapping[field];
                        const labelMapping: Record<string, string> = {
                          sku: "Item SKU Code",
                          name: "Product Name (Title)",
                          unitSize: "Product Size or Vol (e.g. 473ml)",
                          packing: "Packing/Ctn Quantity",
                          category: "Product Category",
                          price: "Unit Price Amount (KES Incl. VAT) [Per Pc + VAT]",
                          specs: "Exact Specifications / Description Column",
                          usageInstructions: "Usage Steps or Instructions"
                        };

                        return (
                          <div key={field} className="space-y-1">
                            <label className={`text-[10px] font-bold uppercase tracking-wider block ${
                              theme === "dark" ? "text-slate-400" : "text-slate-600"
                            }`}>
                              {labelMapping[field]}
                            </label>
                            <select
                              value={matchedHeader}
                              onChange={(e) => setColumnMapping(prev => ({ ...prev, [field]: e.target.value }))}
                              className={`w-full px-2.5 py-1.5 text-xs rounded-lg focus:outline-none border transition-colors ${
                                theme === "dark"
                                  ? "bg-slate-950 border-white/10 text-white focus:border-indigo-550"
                                  : "bg-white border-slate-300 text-slate-800 focus:border-[#00a859]"
                              }`}
                            >
                              <option value="">-- Leave empty / Default --</option>
                              {excelHeaders.map((hdr, hIdx) => {
                                if (!hdr) return null;
                                return <option key={`${hdr}-${hIdx}`} value={hdr}>{hdr}</option>;
                              })}
                            </select>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-2.5 border-t border-white/5 mt-2 space-y-3">
                      <div className="flex items-start space-x-2 text-[11px] select-none">
                        <input
                          type="checkbox"
                          id="auto-enrich-checkbox"
                          checked={autoEnrichWithAi}
                          onChange={(e) => setAutoEnrichWithAi(e.target.checked)}
                          disabled={isExcelLoading || isEnriching}
                          className="mt-0.5 rounded accent-[#00a859] scale-100 cursor-pointer"
                        />
                        <label
                          htmlFor="auto-enrich-checkbox"
                          className={`font-semibold cursor-pointer leading-tight ${
                            theme === "dark" ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-800"
                          }`}
                        >
                          Enrich missing fields (Product Categories, Step-by-Step Usage Instructions, and Size/Carton quantities) automatically from official ABRO website specifications using Gemini AI!
                        </label>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={handleProcessExcel}
                          disabled={isExcelLoading || isEnriching}
                          className={`px-4 py-2.5 text-xs font-bold text-white rounded-lg cursor-pointer flex items-center space-x-1.5 border shadow-md transition-all ${
                            isEnriching ? "opacity-75 cursor-wait" : ""
                          } ${
                            theme === "dark"
                              ? "bg-[#00609C] hover:bg-[#002f52] border-[#00609C]/20 shadow-indigo-501/10"
                              : "bg-[#00a859] hover:bg-[#00924d] border-[#00a859]/20 shadow-emerald-501/10"
                          }`}
                        >
                          {isEnriching ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Enriching with ABRO Specs...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Map Spreadsheet Columns</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {parseError && (
            <div className="p-3 bg-rose-500/10 rounded-lg border border-rose-500/20 text-xs text-rose-600 flex items-start space-x-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-500" />
              <span>{parseError}</span>
            </div>
          )}

          {importCompletedCount !== null && (
            <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-xs text-emerald-700 flex items-center space-x-1.5">
              <Check className="w-4 h-4 shrink-0 text-emerald-600 font-bold" />
              <span>Successfully imported <strong>{importCompletedCount} products</strong> sequentially into the active database!</span>
            </div>
          )}

          {/* Extracted Product Previews */}
          {extractedProducts.length > 0 && (
            <div className={`border rounded-lg p-4 space-y-4 shadow-lg ${
              theme === "dark" ? "border-indigo-550/20 bg-indigo-500/5 col-span-2" : "border-[#00A859]/20 bg-[#00a859]/5 col-span-2"
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-0.5">
                  <span className={`text-xs font-black uppercase tracking-wider block ${theme === "dark" ? "text-indigo-200" : "text-[#016838]"}`}>
                    Review Enriched Stock Dataset ({extractedProducts.length} items)
                  </span>
                  <span className={`text-[10px] block font-medium ${theme === "dark" ? "text-slate-400" : "text-slate-600"}`}>
                    Original Excel rows paired with live-mapped ABRO website descriptions, categories, and manuals.
                  </span>
                </div>
                <span className={`text-[10px] border px-2 py-0.5 rounded font-bold font-mono tracking-wider self-start sm:self-center ${
                  theme === "dark" ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-[#00a859]/10 text-[#016838] border-[#00a859]/20"
                }`}>
                  {excelMode === "excel" ? "SPREADSHEET VERIFIED" : "GEMINI DISCOVERED"}
                </span>
              </div>
              
              <div className={`max-h-72 overflow-y-auto space-y-3 p-3 rounded border ${
                theme === "dark" ? "border-white/10 bg-slate-900/70" : "border-slate-200 bg-slate-50"
              }`}>
                {extractedProducts.map((ep, idx) => (
                  <div key={idx} className={`text-xs border-b border-dashed pb-3.5 last:border-0 last:pb-0 ${
                    theme === "dark" ? "border-white/10 text-slate-200" : "border-slate-200 text-slate-800"
                  }`}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1 w-full">
                        {/* Original spreadsheet title - preserved exactly */}
                        <div className={`font-extrabold text-[13px] ${theme === "dark" ? "text-white" : "text-slate-800"}`}>
                          {getProductDisplayName(ep)}
                        </div>
                        
                        {/* Core original attributes */}
                        <div className="text-[11px] font-mono tracking-wide mt-0.5 text-slate-400 dark:text-slate-400">
                          Original SKU: {ep.sku}|Excel Price: KES {ep.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>

                        {/* Enriched details */}
                        <div className="space-y-3 mt-3">
                          <div>
                            <div className="flex items-center space-x-1 mb-1 font-bold text-[9.5px] uppercase tracking-wider text-amber-500">
                              <span>🌐 Product Description (Specs)</span>
                            </div>
                            <p className="text-[11px] leading-relaxed font-normal text-slate-700 dark:text-slate-300">
                              {ep.specs || "Retrieved empty description"}
                            </p>
                          </div>

                          <div>
                            <div className="flex items-center space-x-1 mb-1 font-bold text-[9.5px] uppercase tracking-wider text-[#00A859]">
                              <span>📖 User Manual / How-To-Use</span>
                            </div>
                            <p className="text-[11px] leading-relaxed font-normal text-slate-700 dark:text-slate-300">
                              {ep.usageInstructions || "Retrieved empty user guidelines"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5 mt-2.5 text-[11px]">
                          <span className="text-slate-400 dark:text-slate-400 font-medium">Mapped Category:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {ep.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 text-[10.5px] leading-relaxed text-amber-600 flex items-start space-x-2">
                <span className="mt-0.5">⚠️</span>
                <span>
                  <strong>Review Notice:</strong> Please verify the auto-matched ABRO specifications and guidelines before uploading. Brand names, prices, and SKUs are locked exactly to your original Excel spreadsheet.
                </span>
              </div>

              <button
                onClick={handleImportAllExtracted}
                className={`w-full py-2.5 text-white font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center space-x-1.5 border shadow-lg ${
                  theme === "dark"
                    ? "bg-indigo-500 hover:bg-indigo-400 border-indigo-500/20 shadow-indigo-500/20"
                    : "bg-[#00a859] hover:bg-[#00924d] border-[#00a859]/20 shadow-emerald-500/10"
                }`}
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Confirm & Inject {extractedProducts.length} Products to DB</span>
              </button>
            </div>
          )}
        </div>

        {excelMode === "text" && (
          <div className={`flex items-center justify-end border-t mt-4 pt-4 shrink-0 ${theme === "dark" ? "border-white/10" : "border-slate-100"}`}>
            <button
              onClick={handleParseText}
              disabled={isParsing || !rawInvoiceText.trim()}
              className={`px-4 py-2 text-white font-bold text-xs rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer shadow-lg border ${
                theme === "dark"
                  ? "bg-[#00609C] hover:bg-[#002f52] border-[#00609C]/20"
                  : "bg-[#00a859] hover:bg-[#00924d] border-[#00a859]/20 shadow-[#00a859]/10"
              }`}
            >
              {isParsing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
              <span>Analyse with Gemini AI</span>
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
