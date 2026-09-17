import { Product } from "./types";

/**
 * Extracts carton packing quantity from specifications text.
 * Defaults to 12 if not set or found.
 */
export function getPacking(specs: string): number {
  if (!specs) return 12;
  const match = specs.match(/(?:Case Qty|Pack Qty|Case|Qty|Pack|CTN Qty|CTN|Packing\/Ctn):\s*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  const match2 = specs.match(/\b(\d+)\s*(?:pcs|pieces|units)\b/i);
  if (match2) {
    return parseInt(match2[1], 10);
  }
  return 12; // standard default
}

/**
 * Formats a number to Kenyan Shillings (KES)
 */
export function formatKES(num: number): string {
  return "KES " + num.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Calculates pricing details for a product (VAT, CTN, etc.)
 */
export interface PricingDetails {
  packing: number;
  pcExVat: number;
  pcIncVat: number;
  ctnExVat: number;
  ctnIncVat: number;
}

export function calculatePricing(price: number, specs: string): PricingDetails {
  const pcIncVat = Number(price) || 0;
  const pcExVat = pcIncVat / 1.16;
  const packing = getPacking(specs);
  const ctnIncVat = pcIncVat * packing;
  const ctnExVat = pcExVat * packing;

  return {
    packing,
    pcExVat,
    pcIncVat,
    ctnExVat,
    ctnIncVat,
  };
}

/**
 * Resolves a beautiful, authentic product image URL from category, name keywords, or official SKUs,
 * referencing the master ABRO product dataset and alternative long-term platforms.
 */
export function getProductImageUrl(name: string, category: string, sku: string): string {
  if (!sku) {
    const normCategory = (category || "").toLowerCase().trim();
    if (normCategory.includes("paint") || normCategory.includes("coating")) {
      return "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&q=80&w=300";
    }
    if (normCategory.includes("gasket") || normCategory.includes("sealant") || normCategory.includes("silicone")) {
      return "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&q=80&w=300";
    }
    return "https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&q=80&w=300";
  }

  // 1. COMPUTE THE FILENAME SLUG
  // Convert 'SKU CODE' to lowercase, strip trailing size variations, and format it as the filename.
  const cleanSku = (sku || "").replace(/^ABRO-/, "").trim().toLowerCase();
  
  // Strip trailing size/color variations (like -blk, -wht, -red, -blu, -gry, -r, -s, -xl)
  const stripped = cleanSku.replace(/-(blk|wht|red|blu|gry|r|s|xl)$/i, "");
  
  let slug = `${stripped}.jpg`;

  // Specific canonical overrides:
  // Example: If SKU is 'AS-600-BLK', the filename slug is 'as-600-1.jpg'
  if (stripped === "as-600") {
    slug = "as-600-1.jpg";
  }

  // 2. USE THE CANONICAL MEDIA CDN STRUCTURE
  return `https://abro.com/wp-content/uploads/2020/07/${slug}`;
}

/**
 * Resolves a friendly display name for products, preserving the exact sheet name.
 */
export function getProductDisplayName(p: { name: string; sku: string; specs?: string }): string {
  if (!p) return "";
  const nameStr = String(p.name || "").trim();
  const skuStr = String(p.sku || "").trim();
  return nameStr || skuStr || "Unnamed Product";
}

/**
 * Helper to downscale and compress images client-side to prevent network failures or storage limits.
 * Produces clean WebP/JPEG under 60-80KB suitable for Firestore and local persistent storage.
 */
export function compressAndResizeImage(file: File, maxWidth = 800, maxHeight = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = typeof window !== "undefined" ? new window.Image() : {} as any;
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(reader.result as string);
            return;
          }

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl);
        } catch (err) {
          console.warn("Client-side image compression failed, using original data URL:", err);
          resolve(reader.result as string);
        }
      };
      img.onerror = () => {
        resolve(reader.result as string);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      resolve("");
    };
    reader.readAsDataURL(file);
  });
}

