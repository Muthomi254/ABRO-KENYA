export function isCloudinaryAccountImage(imageUrl: string, cloudName: string): boolean {
  try {
    const url = new URL(imageUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    return url.hostname === "res.cloudinary.com"
      && url.protocol === "https:"
      && !url.username
      && !url.password
      && segments[0] === cloudName
      && segments[1] === "image"
      && segments[2] === "upload";
  } catch {
    return false;
  }
}

export function getManagedCloudinaryPublicId(imageUrl: string, cloudName: string): string | null {
  try {
    const url = new URL(imageUrl);
    if (!isCloudinaryAccountImage(imageUrl, cloudName)) {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const uploadIndex = segments.findIndex((segment, index) =>
      segment === "upload" && segments[index - 1] === "image"
    );
    if (uploadIndex === -1) {
      return null;
    }

    const assetIndex = segments.findIndex((segment, index) =>
      index > uploadIndex && /^abro_[^/]+$/i.test(segment.replace(/\.[^.]+$/, ""))
    );
    if (assetIndex === -1) {
      return null;
    }

    const versionIndex = segments.findIndex((segment, index) =>
      index > uploadIndex && /^v\d+$/.test(segment)
    );
    const folderIndex = assetIndex > uploadIndex + 1
      && !/^[a-z]{1,3}_[^/]+(?:,[a-z]{1,3}_[^/]+)*$/i.test(segments[assetIndex - 1])
      ? assetIndex - 1
      : assetIndex;
    const assetSegments = segments.slice(versionIndex >= 0 ? versionIndex + 1 : folderIndex);
    const fileNameIndex = assetSegments.findIndex((segment) => /^abro_[^/]+$/i.test(segment.replace(/\.[^.]+$/, "")));
    if (fileNameIndex === -1) {
      return null;
    }

    assetSegments[fileNameIndex] = assetSegments[fileNameIndex].replace(/\.[^.]+$/, "");
    return assetSegments.join("/");
  } catch {
    return null;
  }
}

export function getProductImagePublicId(sku: string): string {
  const normalizedSku = String(sku || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  return `abro_${normalizedSku || "product"}`;
}

export function normalizeImageUrl(url?: string | null): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("/")) {
    return raw;
  }

  let normalized = raw;
  if (/^http:\/\/res\.cloudinary\.com\//i.test(normalized)) {
    normalized = normalized.replace(/^http:\/\//i, "https://");
  }
  return normalized.replace(/ /g, "%20");
}

export function getCloudinarySkuFallbackUrls(sku?: string | null, cloudName = "muthomi254"): string[] {
  const rawSku = String(sku || "").trim();
  if (!rawSku) return [];

  const publicId = getProductImagePublicId(rawSku);
  const compactSku = rawSku.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const candidates = new Set<string>([
    `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/AbroKenya/${publicId}`,
    `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/Abro%20Kenya/${publicId}`,
  ]);

  if (compactSku && `abro_${compactSku}` !== publicId) {
    candidates.add(`https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/AbroKenya/abro_${compactSku}`);
    candidates.add(`https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/Abro%20Kenya/abro_${compactSku}`);
  }

  return [...candidates];
}

export function isCloudinaryDeliveryUrl(url?: string | null): boolean {
  return /res\.cloudinary\.com\//i.test(String(url || ""));
}

export function getCloudinaryThumbnailUrl(url?: string | null, width = 600): string {
  const normalized = normalizeImageUrl(url);
  if (!normalized || !isCloudinaryDeliveryUrl(normalized)) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    const marker = "/image/upload/";
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return normalized;

    const afterUpload = parsed.pathname.slice(idx + marker.length);
    const firstSegment = afterUpload.split("/")[0] || "";
    const alreadyTransformed =
      /^[a-z]{1,3}_[^/]+(?:,[a-z]{1,3}_[^/]+)*$/i.test(firstSegment) &&
      ! /^v\d+$/.test(firstSegment);

    if (alreadyTransformed) {
      if (/(^|,)w_\d+/.test(firstSegment)) {
        return normalized;
      }
      const prefix = parsed.pathname.slice(0, idx + marker.length);
      const rest = afterUpload.slice(firstSegment.length);
      parsed.pathname = `${prefix}${firstSegment},w_${width},c_limit${rest}`;
      return parsed.toString();
    }

    const prefix = parsed.pathname.slice(0, idx + marker.length);
    parsed.pathname = `${prefix}w_${width},c_limit,f_auto,q_auto/${afterUpload}`;
    return parsed.toString();
  } catch {
    return normalized;
  }
}

export function getProductImageCandidates(options: {
  id?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  cloudName?: string;
}): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const add = (candidate?: string | null) => {
    const normalized = normalizeImageUrl(candidate);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      candidates.push(normalized);
    }
  };

  const primary = normalizeImageUrl(options.imageUrl);
  if (primary) {
    add(primary);
  }

  for (const cloudinaryUrl of getCloudinarySkuFallbackUrls(options.sku, options.cloudName)) {
    add(cloudinaryUrl);
  }

  if (!primary && options.id) {
    add(`/api/products/${options.id}/image`);
  }

  return candidates;
}


function normalizeAlnum(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractAssetCandidateStems(asset: {
  public_id?: string;
  display_name?: string;
  original_filename?: string;
  context?: any;
}): string[] {
  const stems = new Set<string>();
  const contextSku = asset?.context?.custom?.sku || asset?.context?.sku;
  if (typeof contextSku === "string" && contextSku.trim()) {
    stems.add(contextSku.trim());
  }

  const rawNames = [
    String(asset.public_id || "").split("/").pop() || "",
    String(asset.display_name || "").split("/").pop() || "",
    String(asset.original_filename || "").split("/").pop() || ""
  ].filter(Boolean);

  for (const rawName of rawNames) {
    const base = rawName.replace(/\.[^.]+$/, "").trim();
    if (!base) continue;

    // 1. Standard app upload format: abro_<sku>_<unix_ms>
    const tsMatch = base.match(/^abro_(.+?)_\d{10,}$/i);
    if (tsMatch?.[1]) stems.add(tsMatch[1]);

    // 2. Unsigned/Cloudinary random 6-char suffix format: abro_<sku>_abc123
    const randomSuffixMatch = base.match(/^abro_(.+?)_[a-z0-9]{6}$/i);
    if (randomSuffixMatch?.[1]) stems.add(randomSuffixMatch[1]);

    // 3. Deterministic app format: abro_<sku>
    const directAbro = base.replace(/^abro_/i, "");
    if (directAbro) stems.add(directAbro);

    // 4. Raw filename or copy suffix stripped: e.g. VS-90-ST (1), VS-90-ST_1
    stems.add(base);
    stems.add(base.replace(/(?:_\d+|\s*\(\d+\)|[-_\s]?copy)$/i, "").replace(/^abro_/i, ""));
  }

  return [...stems].filter(Boolean);
}

export function matchProductToCloudinaryAsset<T extends { id?: string; sku?: string; name?: string }>(
  asset: { public_id?: string; display_name?: string; original_filename?: string; context?: any },
  products: T[]
): T | null {
  if (!Array.isArray(products) || products.length === 0) return null;

  const stems = extractAssetCandidateStems(asset);
  const candNorms = stems.map(normalizeAlnum).filter(Boolean);
  if (candNorms.length === 0) return null;

  // Tier 1: Exact normalized SKU match across all products
  for (const candNorm of candNorms) {
    const exact = products.find((p) => normalizeAlnum(p.sku || "") === candNorm);
    if (exact) return exact;
  }

  // Tier 2: Exact normalized product name match (for files uploaded by product name)
  for (const candNorm of candNorms) {
    if (candNorm.length < 5) continue;
    const byName = products.find((p) => normalizeAlnum(p.name || "") === candNorm);
    if (byName) return byName;
  }

  // Tier 3: Safe suffix/containment match selecting the longest (most specific) SKU
  let bestMatch: T | null = null;
  let bestLen = 0;
  for (const p of products) {
    const pSkuNorm = normalizeAlnum(p.sku || "");
    if (pSkuNorm.length < 4) continue;
    for (const candNorm of candNorms) {
      if (candNorm.length < 4) continue;
      if (pSkuNorm.endsWith(candNorm) || candNorm.endsWith(pSkuNorm)) {
        const matchLen = Math.min(pSkuNorm.length, candNorm.length);
        if (matchLen > bestLen) {
          bestLen = matchLen;
          bestMatch = p;
        }
      }
    }
  }

  return bestMatch;
}

export function resolveChatImageSources<T extends { id?: string; sku?: string; name?: string; imageUrl?: string }>(
  alt: string,
  rawUrl: string,
  products: T[] = [],
  cloudName = "muthomi254"
): { primaryUrl: string; candidateUrls: string[]; matchedProduct: T | null } {
  const cleanedRaw = String(rawUrl || "")
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/[),.;]+$/g, "");
  const normalizedRaw = normalizeImageUrl(cleanedRaw);

  let matchedProduct: T | null = null;
  if (Array.isArray(products) && products.length > 0) {
    if (normalizedRaw) {
      matchedProduct =
        products.find((p) => normalizeImageUrl(p.imageUrl) === normalizedRaw) || null;
    }

    if (!matchedProduct) {
      const cleanAlt = String(alt || "").trim();
      const genericAlt =
        !cleanAlt ||
        /^(abro product view|sourced product view|product image|image)$/i.test(cleanAlt);
      matchedProduct = matchProductToCloudinaryAsset(
        {
          public_id: cleanedRaw,
          display_name: genericAlt ? undefined : cleanAlt,
        },
        products
      );

      if (!matchedProduct && !genericAlt) {
        const altNorm = normalizeAlnum(cleanAlt);
        if (altNorm.length >= 4) {
          matchedProduct =
            products.find((p) => {
              const nameNorm = normalizeAlnum(p.name || "");
              return (
                nameNorm.length >= 4 &&
                (nameNorm === altNorm || nameNorm.includes(altNorm) || altNorm.includes(nameNorm))
              );
            }) || null;
        }
      }
    }
  }

  const candidateUrls: string[] = [];
  const seen = new Set<string>();
  const add = (candidate?: string | null) => {
    const norm = normalizeImageUrl(candidate);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      candidateUrls.push(norm);
    }
  };

  const productUrl = normalizeImageUrl(matchedProduct?.imageUrl);
  if (productUrl && isCloudinaryDeliveryUrl(productUrl)) {
    add(productUrl);
  }
  if (normalizedRaw) {
    add(normalizedRaw);
  }
  if (productUrl) {
    add(productUrl);
  }
  if (matchedProduct?.sku) {
    for (const fallback of getCloudinarySkuFallbackUrls(matchedProduct.sku, cloudName)) {
      add(fallback);
    }
  }
  if (candidateUrls.length === 0 && matchedProduct?.id) {
    add(`/api/products/${matchedProduct.id}/image`);
  }

  return {
    primaryUrl: candidateUrls[0] || normalizedRaw,
    candidateUrls,
    matchedProduct,
  };
}

