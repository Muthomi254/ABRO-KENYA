/**
 * Persistent Image & Custom Product Store
 * Uses IndexedDB with localStorage fallback to ensure that custom images,
 * uploaded product photos, and catalog edits survive container restarts,
 * page reloads, and network resets.
 */

import { Product } from "./types";

const DB_NAME = "ABRO_CATALOG_STORAGE_V1";
const STORE_NAME = "custom_product_images";
const LOCAL_STORAGE_KEY = "abro_custom_image_overrides_v1";

// Helper to open / initialize IndexedDB
function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = (event: any) => {
        resolve(event.target.result);
      };
      request.onerror = () => {
        console.warn("[Persistent Image Store] IndexedDB open error, falling back to localStorage.");
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

// Get all image overrides from localStorage
function getLocalOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Save all image overrides to localStorage
function saveLocalOverrides(data: Record<string, string>) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("[Persistent Image Store] localStorage quota warning:", err);
  }
}

/**
 * Saves a custom image override for a product by its SKU or ID.
 */
export async function saveProductImageOverride(key: string, imageUrl: string): Promise<void> {
  if (!key || !imageUrl) return;
  const normalizedKey = key.trim().toUpperCase();

  // 1. Save to localStorage
  const currentLocal = getLocalOverrides();
  currentLocal[normalizedKey] = imageUrl;
  saveLocalOverrides(currentLocal);

  // 2. Save to IndexedDB
  const db = await openDB();
  if (db) {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ key: normalizedKey, imageUrl, timestamp: Date.now() });
    } catch (e) {
      console.warn("[Persistent Image Store] Error writing to IndexedDB:", e);
    }
  }
}

/**
 * Retrieves all persistent image overrides.
 */
export async function getAllImageOverrides(): Promise<Record<string, string>> {
  const result: Record<string, string> = { ...getLocalOverrides() };

  const db = await openDB();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          if (Array.isArray(req.result)) {
            for (const item of req.result) {
              if (item.key && item.imageUrl) {
                result[item.key] = item.imageUrl;
              }
            }
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  return result;
}

/**
 * Applies all saved persistent image overrides onto a list of products.
 */
export async function applyPersistentImageOverrides(products: Product[]): Promise<Product[]> {
  if (!Array.isArray(products) || products.length === 0) return products;

  try {
    const overrides = await getAllImageOverrides();
    const hasOverrides = Object.keys(overrides).length > 0;
    if (!hasOverrides) return products;

    return products.map((p) => {
      const skuKey = (p.sku || "").trim().toUpperCase();
      const idKey = (p.id || "").trim().toUpperCase();

      const overrideUrl = overrides[skuKey] || overrides[idKey];
      if (overrideUrl && overrideUrl !== p.imageUrl) {
        return {
          ...p,
          imageUrl: overrideUrl
        };
      }
      return p;
    });
  } catch (err) {
    console.warn("[Persistent Image Store] Error applying image overrides:", err);
    return products;
  }
}
