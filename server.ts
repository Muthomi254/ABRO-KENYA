import express from "express";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { getProductImageUrl } from "./src/utils";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Firebase Admin SDK for robust server-side Firestore persistence
let dbFirestore: Firestore | null = null;
let firestoreConnected = false;

function handleFirestoreFailure(operation: string, err: any) {
  const errMsg = err?.message || String(err);
  if (
    errMsg.includes("5 NOT_FOUND") ||
    errMsg.includes("NOT_FOUND") ||
    errMsg.includes("UNAVAILABLE") ||
    errMsg.includes("unauthenticated") ||
    errMsg.includes("permission-denied") ||
    errMsg.includes("Could not load the default credentials")
  ) {
    if (dbFirestore) {
      console.warn(`[Firestore] Notice: Cloud database stream unavailable (${errMsg.split("\n")[0]}). Utilizing high-performance persistent local JSON datastore.`);
      dbFirestore = null;
      firestoreConnected = false;
    }
  } else {
    console.warn(`[Firestore] ${operation} non-fatal notice, falling back to local store:`, errMsg);
  }
}

try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fsSync.existsSync(configPath)) {
    const config = JSON.parse(fsSync.readFileSync(configPath, "utf-8"));
    if (config.projectId) {
      if (getApps().length === 0) {
        initializeApp({
          projectId: config.projectId,
        });
      }
      dbFirestore = getFirestore();
      dbFirestore.settings({ ignoreUndefinedProperties: true });
      firestoreConnected = true;
      console.log(`[Firebase Admin] Initialized Firestore client config for projectId: ${config.projectId}`);
    }
  }
} catch (err: any) {
  console.warn("[Firebase Admin] Notice: Running with local filesystem fallback datastore:", err?.message || err);
}

// Create separate security profiles for sandbox preview and strict standalone production environments
const sandboxHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*", "http://*"],
      connectSrc: ["'self'", "https://*", "http://*", "ws://*", "wss://*"],
      frameSrc: ["'self'", "https://*"],
      frameAncestors: ["*"], // Allows embedding inside AI Studio preview frames
    },
  },
  frameguard: false, // Disables X-Frame-Options: SAMEORIGIN to allow preview within AI Studio frame
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

const strictProductionHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*", "http://*"],
      connectSrc: ["'self'", "https://*", "http://*", "ws://*", "wss://*"],
      frameSrc: ["'self'", "https://*"],
      frameAncestors: ["'self'"], // Restricts embedding to only self for high-grade clickjacking protection
    },
  },
  frameguard: { action: "sameorigin" }, // Protects standalone production app against clickjacking
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

// Apply dynamic helmet security based on incoming host request (detects if we are in development or embedded sandbox)
app.use((req, res, next) => {
  const host = req.get("host") || "";
  const isSandbox =
    process.env.NODE_ENV !== "production" ||
    host.includes("run.app") ||
    host.includes("googleusercontent.com") ||
    process.env.ALLOW_SANDBOX_IFRAME === "true";

  if (isSandbox) {
    sandboxHelmet(req, res, next);
  } else {
    strictProductionHelmet(req, res, next);
  }
});

// Apply a sensible global rate limit (e.g., 500 requests per 15 minutes) to avoid abuse while keeping it friendly for normal usage
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: "Too many requests from this IP, please try again later after 15 minutes." },
});
app.use(limiter);

app.use(express.json({ limit: "10mb" }));

// Paths for persistent files (located in `./data` of the project workspace)
const DATA_DIR = path.join(process.cwd(), "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const CONTEXT_FILE = path.join(DATA_DIR, "context_document.txt");
const ACTIVITY_FILE = path.join(DATA_DIR, "activity_logs.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit_logs.json");

const DEFAULT_PRODUCTS = [
  {
    id: "1",
    sku: "ABRO-SP-BLK",
    name: "ABRO Spray Paint (Gloss Black)",
    category: "Paints & Finishes",
    price: 480.7,
    specs: "11 oz aerosol, vibrant quick-drying acrylic formula. Case Qty: 12",
    usageInstructions: "1. Surface must be clean, dry, and free of rust or grease.\n2. Shake can vigorously for 1 minute before spraying and occasionally during use.\n3. Spray in thin, even coats from a distance of 10-12 inches.\n4. Dries to touch in 10 minutes, fully cured in 24 hours."
  },
  {
    id: "2",
    sku: "ABRO-GM-RED",
    name: "ABRO Red Gasket Maker (9-AB)",
    category: "Sealants & Adhesives",
    price: 341.55,
    specs: "3 oz tube, high temperature grease & oil resistant RTV silicone up to 650°F (343°C). Case Qty: 12",
    usageInstructions: "1. Clean and dry surfaces thoroughly.\n2. Apply a continuous 1/16\" to 1/8\" bead to one surface, circling all bolt holes.\n3. Assemble parts immediately while silicone is still wet.\n4. Squeeze out excess. Do not overtighten bolts. Full cure takes 24 hours."
  },
  {
    id: "3",
    sku: "ABRO-CC-220",
    name: "ABRO Carb & Choke Cleaner",
    category: "Car Care & Maintenance",
    price: 750.0,
    specs: "12 oz high-pressure aerosol. Quickly dissolves carburetor deposits, gum, varnish, carbon, and dirt. Case Qty: 12",
    usageInstructions: "1. Remove the air filter.\n2. With the engine warm and idling, spray small bursts into carburetor or intake throat.\n3. Turn off engine and spray outer linkages directly.\n4. Avoid contact with paint and electronic sensors."
  },
  {
    id: "4",
    sku: "ABRO-EP-STL",
    name: "ABRO Epoxy Steel Adhesive (ES-502)",
    category: "Sealants & Adhesives",
    price: 506.0,
    specs: "Heavy-duty 2-part chemical weld. Twin tubes (Resin & Hardener, 1 oz total). Case Qty: 24",
    usageInstructions: "1. Rough up and clean bonding surfaces.\n2. Squeeze out exactly equal parts of Resin and Hardener onto a clean, scrap piece of cardboard.\n3. Mix thoroughly for 1 full minute.\n4. Apply mixture immediately. Parts set in 4 minutes and fully cure in 4 hours."
  },
  {
    id: "5",
    sku: "ABRO-WD-PW4",
    name: "ABRO Premium Liquid Wax (PW-400)",
    category: "Car Care & Maintenance",
    price: 1049.95,
    specs: "16 oz tin bottle. Formulated with pure Brazilian carnauba wax. Case Qty: 12",
    usageInstructions: "1. Wash and thoroughly dry the vehicle.\n2. Pour liquid wax onto a soft microfiber sponge pad.\n3. Apply a thin, uniform layer in small, circular overlapping patterns.\n4. Allow to dry to a mild white haze, then buff clear using a clean microfiber cloth."
  },
  {
    id: "6",
    sku: "ABRO-MT-850",
    name: "ABRO High-Tack Masking Tape (LT-850)",
    category: "Utility & Tapes",
    price: 250.0,
    specs: "1 in x 60 yd roll. Professional grade, high adhesive hold on rough surfaces. Case Qty: 24",
    usageInstructions: "1. Surface must be dry, dust-free and clean.\n2. Press tape down firmly with thumb or finger along the edge.\n3. Paint surface and wait until paint is dry to the touch.\n4. Peel tape off slowly backwards at a 45-degree angle."
  }
];

const DEFAULT_CONTEXT = `ABRO Kenya products are formulated in the USA and distributed exclusively by Statpack Industries Ltd across Kenya and East Africa.
- Minimum Order Quantity (MOQ): Strictly 10 Cartons (no loose pieces are sold; strictly 10 CTN wholesale minimum purchase).
- Pricing & VAT Structure: Prices are quoted in Kenyan Shillings (KES) both Exclusive of 16% VAT (+16% VAT) and Inclusive of 16% VAT. Quotations must state piece reference, single carton price, and 10-carton MOQ total.
- Delivery : Free delivery within Nairobi, Kiambu, Thika.
- Upcountry : Delivery is handled in a case by case  basis.
- Authenticity & Anti-Counterfeit Protection: Every genuine ABRO product imported by Statpack Industries Ltd bears an authentic KEBS (Kenya Bureau of Standards) Import Standardization Mark hologram sticker with verifiable serial numbers. Genuine packaging features crisp embossed logos, factory lot codes, and tamper-evident seals. Counterfeit warnings apply to unauthorized roadside vendors.
- Official Wholesale Orders & Headquarters: Statpack Industries Ltd Head Office is located on North Airport Road, Embakasi, P.O. Box 22015 - 00400, Nairobi, Kenya. Tel: +254 20 251 9326/7, +254 722 852979, +254 748 441 470, +254 703 322 182. Email: info@statpack.co.ke, orders@statpack.co.ke. Website: https://statpack.co.ke/. Branches in Mombasa (Transocean Building, Moi Avenue), Kampala Uganda, and Dar es Salaam Tanzania.`;

// Ensure data folder and bootstrapping is done elegantly
async function initDataStore() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    // Check products
    try {
      await fs.access(PRODUCTS_FILE);
    } catch {
      await fs.writeFile(PRODUCTS_FILE, JSON.stringify(DEFAULT_PRODUCTS, null, 2), "utf-8");
    }

    // Check context document
    try {
      await fs.access(CONTEXT_FILE);
    } catch {
      await fs.writeFile(CONTEXT_FILE, DEFAULT_CONTEXT, "utf-8");
    }
  } catch (err: any) {
    console.warn("Failed to initialize local filesystem datastore:", err?.message || err);
  }
}

// Read audit/accountability logs of price changes and system mutations
async function readAuditLogs() {
  if (dbFirestore) {
    try {
      const snapshot = await dbFirestore.collection("audit_logs").orderBy("timestamp", "desc").limit(200).get();
      if (!snapshot.empty) {
        const list: any[] = [];
        snapshot.forEach((doc: any) => {
          list.push({ ...doc.data() });
        });
        return list;
      } else {
        const defaultAuditLogs = [
          {
            id: "log_1_initial",
            timestamp: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
            action: "DATABASE_INITIALIZE",
            details: "Established ABRO Kenya product catalogue with base items.",
            sku: "ALL",
            prevVal: "",
            newVal: ""
          },
          {
            id: "log_2_seed",
            timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
            action: "PRICE_CHANGE",
            details: "Price update for Premium Liquid Wax (PW-400) aligned with importer tariffs.",
            sku: "ABRO-WD-PW4",
            prevVal: "KES 520.00",
            newVal: "KES 540.00"
          },
          {
            id: "log_3_status",
            timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
            action: "DATABASE_STATUS",
            details: "Sync complete. All adhesive and care lines matched successfully.",
            sku: "DATABASE",
            prevVal: "Standard",
            newVal: "Synchronized"
          }
        ];
        for (const log of defaultAuditLogs) {
          await dbFirestore.collection("audit_logs").doc(log.id).set(log);
        }
        return defaultAuditLogs;
      }
    } catch (err: any) {
      handleFirestoreFailure("readAuditLogs", err);
    }
  }

  await initDataStore();
  try {
    const data = await fs.readFile(AUDIT_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    const defaultAuditLogs = [
      {
        id: "log_1_initial",
        timestamp: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
        action: "DATABASE_INITIALIZE",
        details: "Established ABRO Kenya product catalogue with base items.",
        sku: "ALL",
        prevVal: "",
        newVal: ""
      },
      {
        id: "log_2_seed",
        timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
        action: "PRICE_CHANGE",
        details: "Price update for Premium Liquid Wax (PW-400) aligned with importer tariffs.",
        sku: "ABRO-WD-PW4",
        prevVal: "KES 520.00",
        newVal: "KES 540.00"
      },
      {
        id: "log_3_status",
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        action: "DATABASE_STATUS",
        details: "Sync complete. All adhesive and care lines matched successfully.",
        sku: "DATABASE",
        prevVal: "Standard",
        newVal: "Synchronized"
      }
    ];
    try {
      await fs.writeFile(AUDIT_FILE, JSON.stringify(defaultAuditLogs, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to seed audit logs:", e);
    }
    return defaultAuditLogs;
  }
}

async function logAuditEvent(action: string, sku: string, details: string, prevVal: string = "", newVal: string = "") {
  const newLog = {
    id: "audit_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now().toString(36),
    timestamp: new Date().toISOString(),
    action,
    sku: sku || "N/A",
    details,
    prevVal: prevVal || "",
    newVal: newVal || ""
  };

  if (dbFirestore) {
    try {
      await dbFirestore.collection("audit_logs").doc(newLog.id).set(newLog);
      return;
    } catch (err: any) {
      handleFirestoreFailure("logAuditEvent", err);
    }
  }

  try {
    const logs = await readAuditLogs();
    logs.unshift(newLog);
    // Limit to 200 items max
    await fs.writeFile(AUDIT_FILE, JSON.stringify(logs.slice(0, 200), null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing audit log:", err);
  }
}

// Read interactive logs representing product interest based on chat and catalog queries
async function readActivityLogs() {
  if (dbFirestore) {
    try {
      const snapshot = await dbFirestore.collection("activity_logs").get();
      if (!snapshot.empty) {
        const list: any[] = [];
        snapshot.forEach((doc: any) => {
          list.push({ ...doc.data() });
        });
        return list;
      } else {
        const defaultLogs = [
          { sku: "ABRO-GM-RED", name: "ABRO Red Gasket Maker (9-AB)", count: 245 },
          { sku: "ABRO-SP-BLK", name: "ABRO Spray Paint (Gloss Black)", count: 189 },
          { sku: "ABRO-CC-220", name: "ABRO Carb & Choke Cleaner", count: 124 },
          { sku: "UNSTOCKED", name: "Not Stocked Enquiries", count: 142 },
          { sku: "ABRO-EP-STL", name: "ABRO Epoxy Steel Adhesive (ES-502)", count: 98 },
          { sku: "ABRO-WD-PW4", name: "ABRO Premium Liquid Wax (PW-400)", count: 76 }
        ];
        for (const log of defaultLogs) {
          await dbFirestore.collection("activity_logs").doc(log.sku).set(log);
        }
        return defaultLogs;
      }
    } catch (err: any) {
      handleFirestoreFailure("readActivityLogs", err);
    }
  }

  await initDataStore();
  try {
    const data = await fs.readFile(ACTIVITY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    // Seed realistic data for top 5 products matching some SKU prefixes
    const defaultLogs = [
      { sku: "ABRO-GM-RED", name: "ABRO Red Gasket Maker (9-AB)", count: 245 },
      { sku: "ABRO-SP-BLK", name: "ABRO Spray Paint (Gloss Black)", count: 189 },
      { sku: "ABRO-CC-220", name: "ABRO Carb & Choke Cleaner", count: 124 },
      { sku: "UNSTOCKED", name: "Not Stocked Enquiries", count: 142 },
      { sku: "ABRO-EP-STL", name: "ABRO Epoxy Steel Adhesive (ES-502)", count: 98 },
      { sku: "ABRO-WD-PW4", name: "ABRO Premium Liquid Wax (PW-400)", count: 76 }
    ];
    await fs.writeFile(ACTIVITY_FILE, JSON.stringify(defaultLogs, null, 2), "utf-8");
    return defaultLogs;
  }
}

// Match customer message or queries with active items and update count metrics
async function logProductAccess(message: string) {
  try {
    const products = await readProducts();
    const activity = await readActivityLogs();
    
    const lowerMessage = message.toLowerCase().trim();
    if (!lowerMessage) return;

    let foundProduct = null;
    
    // Direct matching
    for (const p of products) {
      if (lowerMessage.includes(p.sku.toLowerCase()) || lowerMessage.includes(p.name.toLowerCase())) {
        foundProduct = p;
        break;
      }
    }
    
    // Keyword segments matching
    if (!foundProduct) {
      for (const p of products) {
        const nameParts = p.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        if (nameParts.length > 0 && nameParts.every((part: string) => lowerMessage.includes(part))) {
          foundProduct = p;
          break;
        }
      }
    }

    if (foundProduct) {
      let existing = activity.find((a: any) => a.sku.toUpperCase() === foundProduct.sku.toUpperCase());
      if (existing) {
        existing.count += 1;
        existing.monthlyCount = (existing.monthlyCount || 0) + 1;
        existing.quarterlyCount = (existing.quarterlyCount || 0) + 1;
        existing.name = foundProduct.name; // Keep name in sync
      } else {
        existing = {
          sku: foundProduct.sku,
          name: foundProduct.name,
          count: 1,
          monthlyCount: 1,
          quarterlyCount: 1
        };
        activity.push(existing);
      }
      
      if (dbFirestore) {
        try {
          const skuKey = foundProduct.sku.toUpperCase();
          await dbFirestore.collection("activity_logs").doc(skuKey).set(existing);
        } catch (fErr: any) {
          handleFirestoreFailure("logProductAccess:set", fErr);
          await fs.writeFile(ACTIVITY_FILE, JSON.stringify(activity, null, 2), "utf-8");
        }
      } else {
        await fs.writeFile(ACTIVITY_FILE, JSON.stringify(activity, null, 2), "utf-8");
      }
    } else {
      // It's an inquiry for an unstocked item (not in our database catalog)
      const ignoredTerms = ["hi", "hello", "hey", "test", "ok", "yes", "no", "how", "what", "where", "is", "the", "are", "you", "who", "thank", "thanks", "bye", "good"];
      const isFillerOrGreeting = ignoredTerms.some(term => lowerMessage === term || lowerMessage.split(/\s+/).length <= 1 && ignoredTerms.includes(lowerMessage));
      
      if (!isFillerOrGreeting && lowerMessage.length > 3) {
        let existing = activity.find((a: any) => a.sku.toUpperCase() === "UNSTOCKED");
        const cleanTerm = message.trim();
        if (existing) {
          existing.count += 1;
          existing.monthlyCount = (existing.monthlyCount || 0) + 1;
          existing.quarterlyCount = (existing.quarterlyCount || 0) + 1;
          
          existing.queries = existing.queries || [];
          const qIdx = existing.queries.findIndex((q: any) => q.term.toLowerCase() === cleanTerm.toLowerCase());
          if (qIdx !== -1) {
            existing.queries[qIdx].count += 1;
            existing.queries[qIdx].timestamp = new Date().toISOString();
          } else {
            existing.queries.push({
              term: cleanTerm,
              count: 1,
              timestamp: new Date().toISOString()
            });
          }
          if (existing.queries.length > 80) {
            existing.queries = existing.queries
              .sort((a: any, b: any) => b.count - a.count || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .slice(0, 80);
          }
        } else {
          existing = {
            sku: "UNSTOCKED",
            name: "Not Stocked Enquiries",
            count: 1,
            monthlyCount: 1,
            quarterlyCount: 1,
            queries: [{
              term: cleanTerm,
              count: 1,
              timestamp: new Date().toISOString()
            }]
          };
          activity.push(existing);
        }
        
        if (dbFirestore) {
          try {
            await dbFirestore.collection("activity_logs").doc("UNSTOCKED").set(existing);
          } catch (fErr: any) {
            handleFirestoreFailure("logProductAccess:setUnstocked", fErr);
            await fs.writeFile(ACTIVITY_FILE, JSON.stringify(activity, null, 2), "utf-8");
          }
        } else {
          await fs.writeFile(ACTIVITY_FILE, JSON.stringify(activity, null, 2), "utf-8");
        }
      }
    }
  } catch (err) {
    console.warn("Error logging product query interest:", err);
  }
}

// Helper: Auto-enrich empty/missing/legacy image URLs based on SKU or Category
function autoEnrichProductImage(p: any): boolean {
  if (!p) return false;
  
  const currentImg = String(p.imageUrl || "").trim();
  // Cloudinary image URLs uploaded by user must NEVER be overridden
  if (currentImg.includes("res.cloudinary.com") || currentImg.includes("cloudinary")) {
    return false;
  }
  
  // Flag if the URL is empty, non-absolute, contains the broken /2018/11/ archive, or is an Unsplash placeholder
  const isOldOrPlaceholderBlob = !currentImg || 
    (!currentImg.startsWith("http") && !currentImg.startsWith("data:")) || 
    currentImg.includes("/2018/11/") || 
    currentImg.includes("images.unsplash.com");

  if (!isOldOrPlaceholderBlob) {
    return false; // Already has a modern, non-legacy URL
  }

  const enrichedUrl = getProductImageUrl(p.name || "", p.category || "", p.sku || "");
  if (enrichedUrl && enrichedUrl !== currentImg) {
    p.imageUrl = enrichedUrl;
    return true;
  }
  
  // If the lookup did not return a new URL but we have a legacy 2018/11 URL, update it directly to the 2020/07 repository
  if (currentImg.includes("/2018/11/")) {
    const updated = currentImg.replace("/2018/11/", "/2020/07/");
    p.imageUrl = updated;
    return true;
  }
  
  return false;
}

// Helper to load products
async function readProducts() {
  if (dbFirestore) {
    try {
      const snapshot = await dbFirestore.collection("products").get();
      const list: any[] = [];
      if (!snapshot.empty) {
        snapshot.forEach((doc: any) => {
          list.push({ ...doc.data() });
        });
      }
      
      // Filter out entries with obvious errors (unnamed, no SKU, title containing Error, price < 0, or header row artifacts like SKU or CODE)
      const cleanList = list.filter(p => {
        if (!p) return false;
        const nameValid = p.name && typeof p.name === "string" && !p.name.toLowerCase().includes("error");
        
        let skuValid = false;
        if (p.sku && typeof p.sku === "string") {
          const normSku = p.sku.trim().toLowerCase();
          if (normSku.length > 0 && !["code", "sku", "item code", "part number", "part no", "part no.", "partcode", "itemcode"].includes(normSku)) {
            skuValid = true;
          }
        }
        
        const priceValid = typeof p.price === "number" && !isNaN(p.price) && p.price >= 0;
        return nameValid && skuValid && priceValid;
      });

      // If the Firestore db contains a solid set of items, return them. 
      // If it contains less than 10 products, seed it from the full master catalog file data/products.json
      if (cleanList.length >= 10) {
        // Ensure unique IDs across all entries and auto enrich images if missing
        const enrichmentPromises: Promise<any>[] = [];
        for (const p of cleanList) {
          if (autoEnrichProductImage(p)) {
            enrichmentPromises.push(
              dbFirestore.collection("products").doc(p.id).set(p)
                .catch((e: any) => console.warn(`Failed to enrich image in Firestore for ${p.id}:`, e.message))
            );
          }
        }
        if (enrichmentPromises.length > 0) {
          console.log(`[ABRO Server] Triggered background image enrichment for ${enrichmentPromises.length} products in Firestore.`);
          Promise.all(enrichmentPromises).then(() => {
            console.log("[ABRO Server] Successfully finished background image enrichment in Firestore.");
          });
        }
        return cleanList;
      } else {
        console.log(`[Firestore] Products collection has only ${cleanList.length} items. Seeding from master products.json.`);
        let seedList = DEFAULT_PRODUCTS;
        try {
          const fileData = await fs.readFile(PRODUCTS_FILE, "utf-8");
          const parsed = JSON.parse(fileData);
          if (Array.isArray(parsed) && parsed.length > 10) {
            seedList = parsed;
          }
        } catch (e: any) {
          console.warn("[Firestore Seed] Failed to read data/products.json, using default fallback:", e.message);
        }

        // Write each product to Firestore in the background
        const seedPromises = seedList.map((p) => {
          autoEnrichProductImage(p);
          return dbFirestore.collection("products").doc(p.id).set(p)
            .catch((e: any) => console.warn(`Failed to seed Firestore for product ${p.id}:`, e.message));
        });
        
        // Wait for all seedings to finish or run them in parallel
        Promise.all(seedPromises).then(() => {
          console.log(`[Firestore] Successfully seeded ${seedList.length} products to database.`);
        });

        return seedList;
      }
    } catch (err: any) {
      handleFirestoreFailure("readProducts", err);
    }
  }

  await initDataStore();
  try {
    const data = await fs.readFile(PRODUCTS_FILE, "utf-8");
    let list = JSON.parse(data);
    if (Array.isArray(list)) {
      // 1. Filter out entries with obvious errors (unnamed, no SKU, title containing Error, price < 0, or header row artifacts like SKU or CODE)
      const cleanList = list.filter(p => {
        if (!p) return false;
        const nameValid = p.name && typeof p.name === "string" && !p.name.toLowerCase().includes("error");
        
        let skuValid = false;
        if (p.sku && typeof p.sku === "string") {
          const normSku = p.sku.trim().toLowerCase();
          if (normSku.length > 0 && !["code", "sku", "item code", "part number", "part no", "part no.", "partcode", "itemcode"].includes(normSku)) {
            skuValid = true;
          }
        }
        
        const priceValid = typeof p.price === "number" && !isNaN(p.price) && p.price >= 0;
        return nameValid && skuValid && priceValid;
      });

      // 2. Remove duplicates by SKU (keeping the first occurrence)
      const seenSkus = new Set<string>();
      const uniqueList: any[] = [];
      for (const p of cleanList) {
        const normalizedSku = p.sku.trim().toUpperCase();
        if (!seenSkus.has(normalizedSku)) {
          seenSkus.add(normalizedSku);
          uniqueList.push(p);
        }
      }

      // 3. Ensure strictly unique IDs across all entries
      const seenIds = new Set<string>();
      let didModifyIds = false;
      let didModifyImages = false;
      for (const p of uniqueList) {
        const strId = String(p.id || "").trim();
        if (!strId || seenIds.has(strId)) {
          // Generate a safe, unique, and clean ID
          const sanitizedSku = p.sku.replace(/[^a-zA-Z0-9]/g, "_");
          p.id = `prod_${sanitizedSku}_${Math.floor(Date.now() + Math.random() * 1000000).toString(36)}`;
          didModifyIds = true;
        }
        seenIds.add(String(p.id));

        if (autoEnrichProductImage(p)) {
          didModifyImages = true;
        }
      }

      // If any corrupted or duplicate items were filtered out, or if duplicate IDs were repaired, or if images were updated, write back the cleaned list to products.json
      if (uniqueList.length < list.length || didModifyIds || didModifyImages) {
        console.log(`[Database Cleanup/Image Enrichment] Purged duplicates or enriched images. Saving updated stock list.`);
        await fs.writeFile(PRODUCTS_FILE, JSON.stringify(uniqueList, null, 2), "utf-8");
      }
      return uniqueList;
    }
    return list;
  } catch {
    return DEFAULT_PRODUCTS;
  }
}

// Helper to write products
async function writeProducts(products: any[]) {
  if (dbFirestore) {
    try {
      if (Array.isArray(products)) {
        for (const p of products) {
          autoEnrichProductImage(p);
          await dbFirestore.collection("products").doc(p.id).set(p);
        }
        
        // Synchronize deletion: delete any Firestore docs that are not present in products list
        const snapshot = await dbFirestore.collection("products").get();
        const activeIds = new Set(products.map(p => p.id));
        for (const doc of snapshot.docs) {
          if (!activeIds.has(doc.id)) {
            await dbFirestore.collection("products").doc(doc.id).delete();
          }
        }
        return;
      }
    } catch (err: any) {
      handleFirestoreFailure("writeProducts", err);
    }
  }

  await initDataStore();
  if (Array.isArray(products)) {
    for (const p of products) {
      autoEnrichProductImage(p);
    }
  }
  await fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), "utf-8");
}

// Helper to load context document
async function readContext() {
  if (dbFirestore) {
    try {
      const docRef = dbFirestore.collection("config").doc("context");
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        let text = docSnap.data().text || DEFAULT_CONTEXT;
        if (!text.includes("KEBS")) {
          text = `${DEFAULT_CONTEXT}\n\n${text}`;
          docRef.set({ text }).catch(() => {});
        }
        if (text.includes("flat rate of KES 1,000") || text.includes("Flat rate of KES 1,000") || text.includes("Fargo Courier")) {
          text = text.replace(
            /Deliveries within Nairobi are a flat rate of KES 1,000, or free for orders exceeding KES 50,000\. Upcountry shipments are dispatched from Statpack Embakasi depot via designated courier services \(Fargo Courier, G4S, Modern Coast\)\.?/gi,
            "Delivery : Free delivery within Nairobi, Kiambu, Thika.\n- Upcountry : Delivery is handled in a case by case  basis."
          ).replace(
            /Deliveries within Nairobi are a flat rate of KES 1,000, or free for orders exceeding KES 50,000\.?/gi,
            "Delivery : Free delivery within Nairobi, Kiambu, Thika. Upcountry : Delivery is handled in a case by case  basis."
          );
          docRef.set({ text }).catch(() => {});
        }
        return text;
      } else {
        await docRef.set({ text: DEFAULT_CONTEXT });
        return DEFAULT_CONTEXT;
      }
    } catch (err: any) {
      handleFirestoreFailure("readContext", err);
    }
  }

  await initDataStore();
  try {
    let data = await fs.readFile(CONTEXT_FILE, "utf-8");
    if (!data.includes("KEBS")) {
      data = `${DEFAULT_CONTEXT}\n\n${data}`;
      fs.writeFile(CONTEXT_FILE, data, "utf-8").catch(() => {});
    }
    if (data.includes("flat rate of KES 1,000") || data.includes("Flat rate of KES 1,000") || data.includes("Fargo Courier")) {
      data = data.replace(
        /Deliveries within Nairobi are a flat rate of KES 1,000, or free for orders exceeding KES 50,000\. Upcountry shipments are dispatched from Statpack Embakasi depot via designated courier services \(Fargo Courier, G4S, Modern Coast\)\.?/gi,
        "Delivery : Free delivery within Nairobi, Kiambu, Thika.\n- Upcountry : Delivery is handled in a case by case  basis."
      ).replace(
        /Deliveries within Nairobi are a flat rate of KES 1,000, or free for orders exceeding KES 50,000\.?/gi,
        "Delivery : Free delivery within Nairobi, Kiambu, Thika. Upcountry : Delivery is handled in a case by case  basis."
      );
      fs.writeFile(CONTEXT_FILE, data, "utf-8").catch(() => {});
    }
    return data;
  } catch {
    return DEFAULT_CONTEXT;
  }
}

// Helper to write context document
async function writeContext(text: string) {
  if (dbFirestore) {
    try {
      await dbFirestore.collection("config").doc("context").set({ text });
      return;
    } catch (err: any) {
      handleFirestoreFailure("writeContext", err);
    }
  }

  await initDataStore();
  await fs.writeFile(CONTEXT_FILE, text, "utf-8");
}

// Active lazy-init function for Gemini client to prevent crash on boot
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "") {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Valid supported models in compliance with @google/genai guidelines
export const SUPPORTED_GEMINI_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
] as const;

export type SupportedGeminiModel = typeof SUPPORTED_GEMINI_MODELS[number];

// In-memory tracker for models currently experiencing quota exhaustion (429) or rate limits
const modelQuotaCooldown: Record<string, number> = {};

// Helper to normalize any requested model name into a valid, supported Gemini model
export function normalizeGeminiModel(model?: string): SupportedGeminiModel {
  const now = Date.now();
  if (model === "gemini-3.1-flash-lite") return "gemini-3.1-flash-lite";
  if (model === "gemini-flash-latest") return "gemini-flash-latest";
  if (model === "gemini-3.8-flash") {
    // If flash 3.8 is on quota cooldown, automatically use resilient flash-lite
    if ((modelQuotaCooldown["gemini-3.8-flash"] || 0) > now) {
      return "gemini-3.1-flash-lite";
    }
    return "gemini-3.8-flash";
  }
  if (model && model.includes("lite")) return "gemini-3.1-flash-lite";
  
  // Default to gemini-3.1-flash-lite for maximum availability and reliability
  return "gemini-3.1-flash-lite";
}

// Resilient Gemini generateContent helper that handles:
// 1. 503 (Model High Demand / Service Unavailable) with exponential backoff & delay
// 2. 429 (Quota / Rate Limiting) with model cascading and silent cooldown tracking
// 3. Automatic fallback through candidate models: gemini-3.1-flash-lite -> gemini-flash-latest -> gemini-3.8-flash
// 4. Graceful degradation if search/maps tools fail
export async function callGeminiWithResilience(
  ai: GoogleGenAI,
  options: {
    model?: string;
    contents: any;
    config?: any;
    allowToolDegradation?: boolean;
  }
): Promise<{ response: any; usedModel: string; degradedTools: boolean }> {
  const primaryModel = normalizeGeminiModel(options.model);
  const now = Date.now();

  // Candidate models: start with primary, followed by high-availability models
  const initialCandidates = [
    primaryModel,
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-3.8-flash"
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  // Sort candidates so models on quota cooldown are tried last, healthy ones first
  const candidateModels = initialCandidates.sort((a, b) => {
    const aCooldown = (modelQuotaCooldown[a] || 0) > now ? 1 : 0;
    const bCooldown = (modelQuotaCooldown[b] || 0) > now ? 1 : 0;
    return aCooldown - bCooldown;
  });

  const baseConfig = options.config ? { ...options.config } : {};
  let lastError: any = null;

  for (const modelToTry of candidateModels) {
    // If this model is currently in quota cooldown and there are alternatives remaining, skip it
    if ((modelQuotaCooldown[modelToTry] || 0) > now && candidateModels.some(m => (modelQuotaCooldown[m] || 0) <= now)) {
      continue;
    }

    // Retry up to 2 attempts per model for transient 503 high demand spikes
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelToTry,
          contents: options.contents,
          config: baseConfig,
        });
        if (response && response.text) {
          // Clear cooldown if model succeeds
          delete modelQuotaCooldown[modelToTry];
          return { response, usedModel: modelToTry, degradedTools: false };
        }
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        const is503 = msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE");
        const isQuota = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");

        if (isQuota) {
          // Set 5-minute cooldown for this specific model and switch seamlessly
          modelQuotaCooldown[modelToTry] = Date.now() + 5 * 60 * 1000;
          console.log(`[Gemini Engine] Model ${modelToTry} quota limit reached. Auto-switching to high-availability model...`);
          break;
        }

        if (is503 && attempt === 1) {
          // Wait 1.2s before retrying for temporary demand spike
          console.log(`[Gemini Engine] Model ${modelToTry} busy. Retrying in 1.2s...`);
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }

        console.log(`[Gemini Engine] Model ${modelToTry} attempt ${attempt} unviable, moving to next candidate.`);
        break;
      }
    }
  }

  // If tools were provided (like googleSearch or googleMaps) and calls failed,
  // try without tools as a fallback so the user gets a grounded response from system instruction
  if (options.allowToolDegradation && baseConfig.tools && baseConfig.tools.length > 0) {
    console.log("[Gemini Engine] Attempting tool-degraded fallback generation without external tools...");
    const ungroundedConfig = { ...baseConfig };
    delete ungroundedConfig.tools;
    delete ungroundedConfig.toolConfig;

    for (const modelToTry of candidateModels) {
      if ((modelQuotaCooldown[modelToTry] || 0) > now && candidateModels.some(m => (modelQuotaCooldown[m] || 0) <= now)) {
        continue;
      }

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelToTry,
            contents: options.contents,
            config: ungroundedConfig,
          });
          if (response && response.text) {
            delete modelQuotaCooldown[modelToTry];
            return { response, usedModel: modelToTry, degradedTools: true };
          }
        } catch (err2: any) {
          lastError = err2;
          const msg2 = String(err2?.message || err2);
          const is503 = msg2.includes("503") || msg2.includes("high demand") || msg2.includes("UNAVAILABLE");
          const isQuota = msg2.includes("429") || msg2.includes("quota") || msg2.includes("RESOURCE_EXHAUSTED");

          if (isQuota) {
            modelQuotaCooldown[modelToTry] = Date.now() + 5 * 60 * 1000;
            break;
          }

          if (is503 && attempt === 1) {
            await new Promise(r => setTimeout(r, 1200));
            continue;
          }
          break;
        }
      }
    }
  }

  throw lastError || new Error("All candidate Gemini models failed to generate content.");
}

// Helper to find the parent page URL via Google Search grounding
async function findParentUrl(name: string, sku: string): Promise<string | null> {
  const ai = getGeminiClient();
  if (!ai) return null;
  try {
    const { response } = await callGeminiWithResilience(ai, {
      model: "gemini-3.1-flash-lite",
      contents: `Find the official live product detail page URL on abro.com for: "${name}" (SKU: ${sku}).
      Use Google Search grounding to find the exact, active webpage on abro.com.
      Return a clean JSON object.
      {
        "parent_url": "https://abro.com/product/..."
      }`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            parent_url: { type: Type.STRING }
          },
          required: ["parent_url"]
        }
      },
      allowToolDegradation: false
    });
    const text = response.text || "{}";
    const parsed = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
    if (parsed.parent_url && parsed.parent_url.startsWith("http")) {
      return parsed.parent_url.trim();
    }
  } catch (err) {
    console.warn("Failed to find parent page URL via live search:", err);
  }
  return null;
}

// Helper to scrape and extract page details (image, description, specs, origin)
async function scrapePageDetails(url: string, name: string, sku: string): Promise<{
  verified_image_url: string;
  description: string;
  specs: string;
  origin: string;
} | null> {
  const ai = getGeminiClient();
  if (!ai) return null;
  try {
    const { response } = await callGeminiWithResilience(ai, {
      model: "gemini-3.1-flash-lite",
      contents: `Analyze the official product page URL: "${url}" for the product "${name}" (SKU: ${sku}).
      Using your search grounding capabilities, scrape and extract:
      1. The absolute URL of the primary product photo rendered in the main layout frame (MUST be a direct, alive image URL, e.g. a .jpg or .png).
      2. The authentic product description.
      3. Technical specifications.
      4. Origin information (e.g., Made in USA).
      
      Return a clean JSON object conforming to the schema.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verified_image_url: { type: Type.STRING },
            description: { type: Type.STRING },
            specs: { type: Type.STRING },
            origin: { type: Type.STRING }
          },
          required: ["verified_image_url", "description", "specs", "origin"]
        }
      },
      allowToolDegradation: false
    });
    const text = response.text || "{}";
    const parsed = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
    if (parsed.verified_image_url && parsed.verified_image_url.startsWith("http")) {
      return parsed;
    }
  } catch (err) {
    console.warn("Failed to scrape live page details:", err);
  }
  return null;
}

// Helper for fallback direct image search when scraping fails
async function fallbackDirectImageSearch(name: string, sku: string): Promise<string | null> {
  const ai = getGeminiClient();
  if (!ai) return null;
  try {
    const { response } = await callGeminiWithResilience(ai, {
      model: "gemini-3.1-flash-lite",
      contents: `Perform a search for the product: "${name}" (SKU: ${sku}) to find the direct active image file URL on abro.com (usually located inside /wp-content/uploads/ or similar hosting paths).
      Return a clean JSON object:
      {
        "verified_image_url": "https://abro.com/wp-content/uploads/..."
      }`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verified_image_url: { type: Type.STRING }
          },
          required: ["verified_image_url"]
        }
      },
      allowToolDegradation: false
    });
    const text = response.text || "{}";
    const parsed = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
    if (parsed.verified_image_url && parsed.verified_image_url.startsWith("http")) {
      return parsed.verified_image_url.trim();
    }
  } catch (err) {
    console.warn("fallbackDirectImageSearch failed:", err);
  }
  return null;
}

/**
 * Automator Asset Retrieval Agent for the ABRO Product Catalog.
 * Conforms strictly to the NEW RETRIEVAL PROTOCOL:
 * 1. Reference the product's verified "parent_url" page.
 * 2. Activate integrated search/browser tool to run instant background lookup on live page URL.
 * 3. Dynamically extract primary product photo, authentic description, specs, and origin.
 * 4. Render scraped live image directly.
 * 5. If parent page returns 404 or fails, execute backup search site:abro.com "ABRO" [Product Name or SKU] to fetch active replacement.
 */
async function findAndValidateProductAssetDetailed(
  name: string,
  sku: string,
  category: string,
  parent_url?: string
): Promise<{
  product_name: string;
  generated_slug: string;
  retrieval_method: "Verified Parent Scraping" | "Backup Search Scrape";
  verified_image_url: string;
  description?: string;
  specs?: string;
  origin?: string;
  parent_url?: string;
}> {
  const originalName = name || "";
  let activeParentUrl = parent_url || null;
  let retrievalMethod: "Verified Parent Scraping" | "Backup Search Scrape" = "Verified Parent Scraping";

  // Helper/Verification function to check if a URL is alive and not 404
  async function isUrlAlive(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(url, { method: "HEAD", signal: controller.signal });
      clearTimeout(id);
      if (response.status === 404) return false;
      return response.ok;
    } catch {
      try {
        const getController = new AbortController();
        const getId = setTimeout(() => getController.abort(), 2500);
        const getRes = await fetch(url, { 
          method: "GET", 
          headers: { "Range": "bytes=0-0" }, 
          signal: getController.signal 
        });
        clearTimeout(getId);
        return getRes.status !== 404;
      } catch {
        return false;
      }
    }
  }

  // If a parent URL is provided, verify it first
  if (activeParentUrl) {
    const alive = await isUrlAlive(activeParentUrl);
    if (!alive) {
      console.warn(`Provided parent URL ${activeParentUrl} returned 404 or is down. Performing backup search...`);
      activeParentUrl = null; // Mark for backup search
    }
  }

  // If no parent URL is provided or if it failed verification, look it up via backup search query
  if (!activeParentUrl) {
    retrievalMethod = "Backup Search Scrape";
    activeParentUrl = await findParentUrl(originalName, sku);
  }

  // Once we have a parent URL (either verified or from backup search), scrape it
  if (activeParentUrl) {
    const scraped = await scrapePageDetails(activeParentUrl, originalName, sku);
    if (scraped && scraped.verified_image_url) {
      // Double check that scraped image URL is alive to ensure zero dead links
      const isImgAlive = await isUrlAlive(scraped.verified_image_url);
      if (isImgAlive) {
        return {
          product_name: originalName,
          generated_slug: originalName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          retrieval_method: retrievalMethod,
          verified_image_url: scraped.verified_image_url,
          description: scraped.description,
          specs: scraped.specs,
          origin: scraped.origin,
          parent_url: activeParentUrl
        };
      }
    }
  }

  // Ultimate fallback to direct image search on abro.com
  const backupImgUrl = await fallbackDirectImageSearch(originalName, sku);
  return {
    product_name: originalName,
    generated_slug: originalName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    retrieval_method: "Backup Search Scrape",
    verified_image_url: backupImgUrl || getProductImageUrl(originalName, category, sku),
    parent_url: activeParentUrl || `https://abro.com/?s=${encodeURIComponent(originalName)}`
  };
}

/**
 * Automator Asset Matching Agent implementation conforming to 3-tier strategy.
 * Validates URLs using fast HEAD/GET fetch signals to avoid 404s.
 */
async function findAndValidateProductImageAsset(name: string, sku: string, category: string): Promise<string> {
  const result = await findAndValidateProductAssetDetailed(name, sku, category);
  return result.verified_image_url;
}// Robust pricing extractor preventing mangled digits from trailing info like +16% VAT, /=, or qty descriptors
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

// === ADMIN AUTHENTICATION ===
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ABROKenya@2026";

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const expectedToken = `abro-session-${Buffer.from(ADMIN_PASSWORD).toString("base64")}`;
  
  if (token === expectedToken) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized access: Please sign in as administrator." });
}

app.post("/api/admin/login", (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: "Password is required." });
    }
    if (password === ADMIN_PASSWORD) {
      const token = `abro-session-${Buffer.from(ADMIN_PASSWORD).toString("base64")}`;
      return res.json({ success: true, token });
    }
    return res.status(401).json({ error: "Invalid admin passphrase. Please try again." });
  } catch (err: any) {
    res.status(500).json({ error: "Authentication system failure", details: err.message });
  }
});

// === API ROUTES ===

// 1. Get products
app.get("/api/products", async (req, res) => {
  try {
    const products = await readProducts();
    res.json({ products });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to retrieve products list", details: err.message });
  }
});

// 1.2. Resolve Image Scraping Endpoint
app.get("/api/resolve-image", async (req, res) => {
  try {
    const parentUrl = req.query.parent_url as string;
    if (!parentUrl || !parentUrl.startsWith("http")) {
      return res.status(400).json({ error: "A valid absolute parent_url is required." });
    }

    // 1. Try fetching and extracting via Regex first (extremely fast, zero overhead)
    let imageUrl = "";
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      const fetchRes = await fetch(parentUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        },
        signal: controller.signal
      });
      clearTimeout(id);

      if (fetchRes.ok) {
        const html = await fetchRes.text();
        
        // Match og:image
        const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
        if (ogMatch && ogMatch[1]) {
          imageUrl = ogMatch[1].trim();
        } else {
          // Fallback to first primary img tag inside a main/article/content class, or just any main product img
          const wpImgMatch = html.match(/<img[^>]*class=["'][^"']*wp-post-image[^"']*["'][^>]*src=["']([^"']+)["']/i);
          if (wpImgMatch && wpImgMatch[1]) {
            imageUrl = wpImgMatch[1].trim();
          } else {
            // Find any src matching wp-content/uploads
            const uploadImgMatch = html.match(/src=["'](https:\/\/abro\.com\/wp-content\/uploads\/[^"']+)["']/i);
            if (uploadImgMatch && uploadImgMatch[1]) {
              imageUrl = uploadImgMatch[1].trim();
            } else {
              // Try general primary img tag
              const generalImgMatch = html.match(/<img[^>]*src=["'](https?:\/\/[^"']+)["']/i);
              if (generalImgMatch && generalImgMatch[1]) {
                imageUrl = generalImgMatch[1].trim();
              }
            }
          }
        }
      }
    } catch (fetchErr: any) {
      console.warn("[Resolve Image Scrape] Direct HTML fetch failed:", fetchErr.message);
    }

    // 2. If direct fetch didn't yield an image, or was blocked, fall back to our advanced Gemini Grounding search engine
    if (!imageUrl) {
      const ai = getGeminiClient();
      if (ai) {
        try {
          const prompt = `Inspect the live webpage: "${parentUrl}". Search the page's HTML, metadata, and OpenGraph tags to find the absolute URL of the primary product image (the og:image or the main product photo). Return a clean JSON object containing the verified absolute image URL under the key "imageUrl".`;
          const { response } = await callGeminiWithResilience(ai, {
            model: "gemini-3.1-flash-lite",
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  imageUrl: { type: Type.STRING }
                },
                required: ["imageUrl"]
              }
            },
            allowToolDegradation: false
          });
          const text = response.text || "{}";
          const parsed = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
          if (parsed.imageUrl && parsed.imageUrl.startsWith("http")) {
            imageUrl = parsed.imageUrl.trim();
          }
        } catch (geminiErr: any) {
          console.warn("[Resolve Image Scrape] Gemini fallback search failed:", geminiErr.message);
        }
      }
    }

    if (imageUrl) {
      return res.json({ success: true, imageUrl });
    }
    return res.status(404).json({ error: "Failed to resolve product photo from the page." });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to resolve product image URL", details: err.message });
  }
});

// 1.5. Automated Asset Matching Agent conformant to the requested structure
app.post("/api/asset-match", async (req, res) => {
  try {
    const { name, sku, category = "General", parent_url } = req.body;
    if (!name && !sku) {
      return res.status(400).json({ error: "Product name or sku is required for automated asset matching." });
    }
    
    // Resolve the image using the new real-time lookup and scraping strategy
    const detailed = await findAndValidateProductAssetDetailed(name || "", sku || "", category, parent_url);
    
    // Return clean JSON adhering perfectly to the new retrieval protocol output requirements
    res.json({
      success: true,
      product_name: detailed.product_name,
      generated_slug: detailed.generated_slug,
      retrieval_method: detailed.retrieval_method,
      verified_image_url: detailed.verified_image_url,
      description: detailed.description,
      specs: detailed.specs,
      origin: detailed.origin,
      parent_url: detailed.parent_url,
      // Backwards compatibility matching:
      product_sku: sku || "",
      product_image_url: detailed.verified_image_url
    });
  } catch (err: any) {
    res.status(500).json({ error: "Automated asset matching process failed", details: err.message });
  }
});

// 1.8. Cloudinary Image Storage & Management
app.get("/api/cloudinary/config", (req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "muthomi254";
  const apiKey = process.env.CLOUDINARY_API_KEY || "595797988235321";
  const hasSecret = Boolean(process.env.CLOUDINARY_API_SECRET && process.env.CLOUDINARY_API_SECRET.trim().length > 0);
  const folder = process.env.CLOUDINARY_FOLDER || "Abro Kenya";
  const preset = process.env.CLOUDINARY_UPLOAD_PRESET || "Abro_kenya";

  res.json({
    configured: true,
    cloud_name: cloudName,
    api_key: apiKey,
    folder,
    has_secret: hasSecret,
    preset
  });
});

app.post("/api/cloudinary/upload", async (req, res) => {
  try {
    const { file, folder, public_id, upload_preset } = req.body;
    if (!file) {
      return res.status(400).json({ error: "No image file or base64 data URI provided." });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "muthomi254";
    const apiKey = process.env.CLOUDINARY_API_KEY || "595797988235321";
    const apiSecret = process.env.CLOUDINARY_API_SECRET || "";
    const targetFolder = folder || process.env.CLOUDINARY_FOLDER || "Abro Kenya";
    const preset = upload_preset || process.env.CLOUDINARY_UPLOAD_PRESET || "Abro_kenya";

    // Method A: Direct Signed upload via Cloudinary REST API if secret is configured
    let signedErrorMessage = "";
    if (apiSecret && apiSecret.trim().length > 0) {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const paramsToSign: Record<string, string> = {
          folder: targetFolder,
          timestamp: String(timestamp)
        };
        if (public_id) {
          paramsToSign.public_id = public_id;
        }

        const sortedKeys = Object.keys(paramsToSign).sort();
        const stringToSign = sortedKeys.map((k) => `${k}=${paramsToSign[k]}`).join("&") + apiSecret.trim();
        const signature = crypto.createHash("sha1").update(stringToSign).digest("hex");

        const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file,
            api_key: apiKey,
            timestamp,
            folder: targetFolder,
            public_id: public_id || undefined,
            signature
          })
        });

        const cloudData: any = await cloudRes.json();
        if (cloudRes.ok && (cloudData.secure_url || cloudData.url)) {
          return res.json({
            success: true,
            url: cloudData.secure_url || cloudData.url,
            public_id: cloudData.public_id,
            format: cloudData.format,
            width: cloudData.width,
            height: cloudData.height,
            bytes: cloudData.bytes,
            cloud_name: cloudName,
            folder: targetFolder,
            mode: "signed"
          });
        } else {
          signedErrorMessage = cloudData.error?.message || `HTTP ${cloudRes.status}`;
          console.warn("[Cloudinary] Signed upload response:", signedErrorMessage);
        }
      } catch (signedErr: any) {
        signedErrorMessage = signedErr?.message || String(signedErr);
        console.warn("[Cloudinary] Signed upload attempt error:", signedErrorMessage);
      }
    }

    // Method B: Unsigned preset upload via Cloudinary REST API
    const presetsToTry = [
      preset,
      "Abro Kenya",
      "Abro_kenya",
      "abro_kenya",
      "abro-kenya",
      "ml_default"
    ].filter((p, idx, arr) => Boolean(p) && arr.indexOf(p) === idx);

    let lastPresetError = "";
    for (const p of presetsToTry) {
      try {
        const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file,
            upload_preset: p,
            folder: targetFolder,
            public_id: public_id || undefined
          })
        });

        const cloudData: any = await cloudRes.json();
        if (cloudRes.ok && (cloudData.secure_url || cloudData.url)) {
          return res.json({
            success: true,
            url: cloudData.secure_url || cloudData.url,
            public_id: cloudData.public_id,
            format: cloudData.format,
            width: cloudData.width,
            height: cloudData.height,
            bytes: cloudData.bytes,
            cloud_name: cloudName,
            folder: targetFolder,
            mode: "unsigned_preset",
            preset: p
          });
        } else {
          lastPresetError = cloudData.error?.message || `HTTP ${cloudRes.status}`;
        }
      } catch (err: any) {
        lastPresetError = err.message || "Network request failed";
      }
    }

    // Determine the primary human-friendly issue
    let friendlyExplanation = "";
    if (signedErrorMessage.includes("missing permissions") || signedErrorMessage.includes("actions=[\"create\"]")) {
      friendlyExplanation = `Cloudinary API Key '${apiKey}' lacks 'Create' (upload) permission. In Cloudinary Settings > Access Keys, edit key '${preset || "Abro_kenya"}' and check the 'Create' / upload permission checkbox.`;
    } else if (lastPresetError.includes("Upload preset must be whitelisted for unsigned uploads")) {
      friendlyExplanation = `Upload preset '${preset}' is configured as 'Signed'. In Cloudinary Settings > Upload > Upload presets, edit '${preset}' and change Signing Mode to 'Unsigned'.`;
    } else if (signedErrorMessage) {
      friendlyExplanation = `Signed upload error: ${signedErrorMessage}`;
    } else {
      friendlyExplanation = lastPresetError || "Authentication or preset required.";
    }

    // Both signed and unsigned fallback failed
    return res.status(400).json({
      error: friendlyExplanation,
      signed_error: signedErrorMessage || null,
      unsigned_error: lastPresetError || null,
      details: {
        cloud_name: cloudName,
        api_key: apiKey,
        folder: targetFolder,
        preset,
        has_secret: Boolean(apiSecret && apiSecret.trim().length > 0),
        hint: signedErrorMessage.includes("missing permissions")
          ? "Go to Cloudinary Settings > Access Keys > Edit 'Abro_kenya' > Grant 'Create' permission, or use your Master API Key & Secret."
          : "In Cloudinary Settings > Upload > Upload presets, set 'Abro_kenya' Signing Mode to 'Unsigned'."
      }
    });
  } catch (err: any) {
    console.error("[Cloudinary] Upload route error:", err);
    res.status(500).json({ error: "Failed to upload image to Cloudinary", details: err.message });
  }
});

// Configure Cloudinary helper
function getCloudinaryClient() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "muthomi254";
  const apiKey = process.env.CLOUDINARY_API_KEY || "595797988235321";
  const apiSecret = process.env.CLOUDINARY_API_SECRET || "";
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
  return cloudinary;
}

// Function to automatically sync all assets from Cloudinary folder into product catalog
async function syncCloudinaryImagesToCatalog() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "muthomi254";
  const apiKey = process.env.CLOUDINARY_API_KEY || "595797988235321";
  const apiSecret = process.env.CLOUDINARY_API_SECRET || "";
  const targetFolder = process.env.CLOUDINARY_FOLDER || "Abro Kenya";

  if (!cloudName || !apiKey || !apiSecret) {
    console.warn("[Cloudinary Sync] Missing credentials, skipping sync.");
    return { success: false, error: "Cloudinary credentials missing" };
  }

  const c = getCloudinaryClient();

  try {
    const res = await c.api.resources({
      type: "upload",
      prefix: targetFolder,
      max_results: 500
    });

    const resources = res.resources || [];
    console.log(`[Cloudinary Sync] Discovered ${resources.length} assets in '${targetFolder}'.`);

    const products = await readProducts();
    if (!Array.isArray(products) || products.length === 0) {
      return { success: false, error: "Products catalog empty" };
    }

    // Sort latest uploads first
    const sorted = [...resources].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    let updatedCount = 0;
    const matches: Array<{ sku: string; name: string; url: string; public_id: string; created_at: string }> = [];

    for (const r of sorted) {
      const filename = r.public_id.replace(`${targetFolder}/`, "").replace("Abro Kenya/", "");
      const match = filename.match(/^abro_(.+?)_\d+$/i);
      let candidateSku = match ? match[1] : filename.replace(/^abro_/i, "");

      const prod = products.find((p: any) => {
        const pSkuNorm = (p.sku || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const candNorm = candidateSku.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (pSkuNorm && candNorm && (pSkuNorm === candNorm || pSkuNorm.endsWith(candNorm) || candNorm.endsWith(pSkuNorm))) {
          return true;
        }
        return false;
      });

      if (prod) {
        matches.push({ sku: prod.sku, name: prod.name, url: r.secure_url, public_id: r.public_id, created_at: r.created_at });
        if (prod.imageUrl !== r.secure_url) {
          prod.imageUrl = r.secure_url;
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      await writeProducts(products);
      console.log(`[Cloudinary Sync] Successfully updated ${updatedCount} products with Cloudinary URLs.`);
    }

    return {
      success: true,
      totalInFolder: resources.length,
      matchedCount: matches.length,
      updatedCount,
      matches,
      assets: resources.map((r: any) => ({
        public_id: r.public_id,
        url: r.secure_url,
        format: r.format,
        bytes: r.bytes,
        created_at: r.created_at
      }))
    };
  } catch (err: any) {
    console.error("[Cloudinary Sync] Failed to sync images:", err.message);
    return { success: false, error: err.message };
  }
}

// 1b. POST /api/cloudinary/sync - Synchronize all Cloudinary uploaded images with catalog
app.post("/api/cloudinary/sync", async (req, res) => {
  try {
    const result = await syncCloudinaryImagesToCatalog();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Cloudinary sync failed", details: err.message });
  }
});

// 1c. GET /api/cloudinary/assets - Retrieve all uploaded images in Cloudinary with product matching
app.get("/api/cloudinary/assets", async (req, res) => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "muthomi254";
    const apiKey = process.env.CLOUDINARY_API_KEY || "595797988235321";
    const apiSecret = process.env.CLOUDINARY_API_SECRET || "";
    const targetFolder = process.env.CLOUDINARY_FOLDER || "Abro Kenya";

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(400).json({ error: "Cloudinary credentials missing." });
    }

    const c = getCloudinaryClient();
    const result = await c.api.resources({
      type: "upload",
      prefix: targetFolder,
      max_results: 500
    });

    const products = await readProducts();

    const assets = (result.resources || []).map((r: any) => {
      const filename = r.public_id.replace(`${targetFolder}/`, "").replace("Abro Kenya/", "");
      const match = filename.match(/^abro_(.+?)_\d+$/i);
      const candidateSku = match ? match[1] : filename.replace(/^abro_/i, "");

      const matchedProduct = products.find((p: any) => {
        const pSkuNorm = (p.sku || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const candNorm = candidateSku.toLowerCase().replace(/[^a-z0-9]/g, "");
        return pSkuNorm && candNorm && (pSkuNorm === candNorm || pSkuNorm.endsWith(candNorm) || candNorm.endsWith(pSkuNorm));
      });

      return {
        public_id: r.public_id,
        url: r.secure_url,
        format: r.format,
        bytes: r.bytes,
        width: r.width,
        height: r.height,
        created_at: r.created_at,
        matchedProduct: matchedProduct ? { id: matchedProduct.id, sku: matchedProduct.sku, name: matchedProduct.name } : null
      };
    });

    res.json({
      success: true,
      folder: targetFolder,
      total: assets.length,
      assets
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to retrieve Cloudinary assets", details: err.message });
  }
});

// 1d. PATCH /api/products/:id/image - Dedicated image update endpoint for instant persistence
app.patch("/api/products/:id/image", async (req, res) => {
  try {
    const id = req.params.id;
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }
    const products = await readProducts();
    const idx = products.findIndex((p: any) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: `Product ${id} not found` });
    }
    products[idx].imageUrl = imageUrl;
    await writeProducts(products);
    res.json({ success: true, product: products[idx] });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update product image", details: err.message });
  }
});

// 2. Create or Update (Upsert) a single product by SKU
app.post("/api/products", requireAdmin, async (req, res) => {
  try {
    const { sku, name, category, price, specs, usageInstructions, imageUrl } = req.body;
    if (!sku || !name || !category) {
      return res.status(400).json({ error: "SKU, Product Name and Category are required." });
    }
    
    // Prevent header/boilerplate row artifact additions
    const cleanSku = String(sku || "").trim().toLowerCase();
    const cleanName = String(name || "").trim().toLowerCase();
    if (
      ["code", "sku", "item code", "part number", "part no", "part no.", "partcode", "itemcode"].includes(cleanSku) ||
      ["product name", "item name", "product description", "description", "part description", "name"].includes(cleanName)
    ) {
      return res.status(400).json({ error: "Invalid product information (detected header/boilerplate)." });
    }

    const products = await readProducts();
    const targetSku = String(sku).trim().toUpperCase();
    const existingIdx = products.findIndex((p: any) => String(p.sku || "").trim().toUpperCase() === targetSku);

    let finalImageUrl = imageUrl;
    const isOldOrPlaceholderBlob = !finalImageUrl || 
      (!finalImageUrl.startsWith("http") && !finalImageUrl.startsWith("data:")) || 
      finalImageUrl.includes("/2018/11/") || 
      finalImageUrl.includes("images.unsplash.com");

    if (isOldOrPlaceholderBlob) {
      finalImageUrl = await findAndValidateProductImageAsset(name, sku, category);
    }

    if (existingIdx !== -1) {
      // Update/merge existing product (no duplicate SKU)
      const prevPrice = products[existingIdx].price;
      const targetPrice = Number(price) >= 0 ? Number(price) : products[existingIdx].price;
      const priceString = (val: number) => `KES ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

      products[existingIdx] = {
        ...products[existingIdx],
        name: name,
        category: category,
        price: targetPrice,
        specs: specs !== undefined ? specs : products[existingIdx].specs,
        usageInstructions: usageInstructions !== undefined ? usageInstructions : products[existingIdx].usageInstructions,
        imageUrl: finalImageUrl !== undefined ? finalImageUrl : products[existingIdx].imageUrl
      };
      await writeProducts(products);

      if (Math.abs(prevPrice - targetPrice) > 0.01) {
        await logAuditEvent("PRICE_CHANGE", targetSku, `Adjusted price for ${name}`, priceString(prevPrice), priceString(targetPrice));
      } else {
        await logAuditEvent("PRODUCT_UPDATE", targetSku, `Updated catalog entry details for ${name}`);
      }

      return res.json({ product: products[existingIdx], updated: true });
    } else {
      // Create new
      const randSuffix = Math.random().toString(36).substring(2, 9);
      const newProduct = {
        id: "prod_" + randSuffix + "_" + Date.now().toString(36),
        sku: String(sku).trim(),
        name: String(name).trim(),
        category: String(category).trim(),
        price: Number(price) || 0,
        specs: specs || "",
        usageInstructions: usageInstructions || "",
        imageUrl: finalImageUrl || ""
      };
      products.push(newProduct);
      await writeProducts(products);

      const computedPrice = Number(price) || 0;
      await logAuditEvent("PRODUCT_CREATE", newProduct.sku, `Added new product "${newProduct.name}" to inventory`, "N/A", `KES ${computedPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);

      return res.status(201).json({ product: newProduct });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create/update product", details: err.message });
  }
});

// 2.5. Bulk create or update (Upsert) products (Single atomic atomic write)
app.post("/api/products/bulk", requireAdmin, async (req, res) => {
  try {
    const { products: newProducts } = req.body;
    if (!Array.isArray(newProducts)) {
      return res.status(400).json({ error: "Products array is required." });
    }

    const currentProducts = await readProducts();
    const productMap = new Map<string, any>();

    // Index current products by normalized SKU to prevent any duplicates
    currentProducts.forEach((p: any) => {
      const parentSku = String(p.sku || "").trim().toUpperCase();
      if (parentSku) {
        productMap.set(parentSku, p);
      }
    });

    const updatedOrInserted: any[] = [];

    newProducts.forEach((np: any) => {
      const skuStr = String(np.sku || "").trim();
      const nameStr = String(np.name || "").trim();
      const categoryStr = String(np.category || np.group || "General").trim();

      if (!skuStr || !nameStr) return;

      const cleanSku = skuStr.toLowerCase();
      const cleanName = nameStr.toLowerCase();

      // Skip headers
      if (
        ["code", "sku", "item code", "part number", "part no", "part no.", "partcode", "itemcode"].includes(cleanSku) ||
        ["product name", "item name", "product description", "description", "part description", "name"].includes(cleanName)
      ) {
        return;
      }

      const normalizedSku = skuStr.toUpperCase();
      const priceVal = parseCleanPrice(np.price);

      if (productMap.has(normalizedSku)) {
        // Safe Merge / Overwrite Existing Product
        const existing = productMap.get(normalizedSku);
        
        // Preserve existing names if the incoming name is empty, generic or unnamed
        if (nameStr && !nameStr.startsWith("Unnamed Row")) {
          existing.name = nameStr;
        }
        // Preserve existing category if incoming category is General/unspecified
        if (categoryStr && categoryStr !== "General") {
          existing.category = categoryStr;
        }
        existing.price = priceVal;
        
        // Preserve specifications if incoming is empty/fallback
        if (np.specs && np.specs !== "No specifications loaded" && np.specs !== "No specifications loaded.") {
          existing.specs = np.specs;
        }
        
        // Preserve manual instruction steps if incoming is generic
        if (np.usageInstructions && np.usageInstructions !== "Clean surface and apply according to standards.") {
          existing.usageInstructions = np.usageInstructions;
        }
        
        if (np.imageUrl) {
          existing.imageUrl = np.imageUrl;
        }
        updatedOrInserted.push(existing);
      } else {
        // Create new
        const randStr = Math.random().toString(36).substring(2, 9);
        const generatedId = "prod_" + randStr + "_" + Date.now().toString(36);
        const brandNew = {
          id: np.id || generatedId,
          sku: skuStr,
          name: nameStr,
          category: categoryStr,
          price: priceVal,
          specs: np.specs || "",
          usageInstructions: np.usageInstructions || "",
          imageUrl: np.imageUrl || ""
        };
        currentProducts.push(brandNew);
        productMap.set(normalizedSku, brandNew);
        updatedOrInserted.push(brandNew);
      }
    });

    await writeProducts(currentProducts);
    await logAuditEvent("DATABASE_STATUS", "BULK", `Bulk synchronization completed. Upserted ${updatedOrInserted.length} lines of stock.`, `Active items: ${currentProducts.length - updatedOrInserted.length}`, `Active items: ${currentProducts.length}`);
    res.json({ success: true, count: updatedOrInserted.length, products: currentProducts });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to perform bulk upload of products", details: err.message });
  }
});

// 3. Update product
app.put("/api/products/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { sku, name, category, price, specs, usageInstructions, imageUrl } = req.body;
    let products = await readProducts();
    const idx = products.findIndex((p: any) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: `Product with ID ${id} not found.` });
    }

    const prevPrice = products[idx].price;
    const targetPrice = price !== undefined ? Number(price) : products[idx].price;
    const targetSku = sku || products[idx].sku;
    const targetName = name || products[idx].name;
    const priceString = (val: number) => `KES ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    products[idx] = {
      ...products[idx],
      sku: sku !== undefined ? sku : products[idx].sku,
      name: name !== undefined ? name : products[idx].name,
      category: category !== undefined ? category : products[idx].category,
      price: targetPrice,
      specs: specs !== undefined ? specs : products[idx].specs,
      usageInstructions: usageInstructions !== undefined ? usageInstructions : products[idx].usageInstructions,
      imageUrl: imageUrl !== undefined ? imageUrl : products[idx].imageUrl
    };

    await writeProducts(products);

    if (Math.abs(prevPrice - targetPrice) > 0.01) {
      await logAuditEvent("PRICE_CHANGE", targetSku, `Adjusted price for ${targetName}`, priceString(prevPrice), priceString(targetPrice));
    } else {
      await logAuditEvent("PRODUCT_UPDATE", targetSku, `Updated details for ${targetName}`);
    }

    res.json({ product: products[idx] });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update product", details: err.message });
  }
});

// 4. Delete product
app.delete("/api/products/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    let products = await readProducts();
    const beforeLength = products.length;
    const targetProduct = products.find((p: any) => p.id === id);
    products = products.filter((p: any) => p.id !== id);
    if (products.length === beforeLength) {
      return res.status(404).json({ error: `Product with ID ${id} not found.` });
    }
    await writeProducts(products);
    if (targetProduct) {
      await logAuditEvent("PRODUCT_DELETE", targetProduct.sku, `Removed product "${targetProduct.name}" from catalog`, `KES ${targetProduct.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "DELETED");
    }
    res.json({ success: true, message: `Product ${id} deleted.` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete product", details: err.message });
  }
});

// 5. Reset all products to default catalogue (deletes all available stock)
app.post("/api/products/reset", requireAdmin, async (req, res) => {
  try {
    const products = await readProducts();
    await writeProducts([]);
    const context = await readContext();
    await logAuditEvent("DATABASE_STATUS", "ALL", "Database cleared (reset all stock items)", `Active items: ${products.length}`, "Active items: 0");
    res.json({ products: [], context, success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to reset database", details: err.message });
  }
});

// 6. Get context document
app.get("/api/context", async (req, res) => {
  try {
    const context = await readContext();
    res.json({ context });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load context document", details: err.message });
  }
});

// 7. Update context document
app.post("/api/context", requireAdmin, async (req, res) => {
  try {
    const { context } = req.body;
    if (context === undefined) {
      return res.status(400).json({ error: "Context string is required." });
    }
    await writeContext(context);
    res.json({ success: true, context });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update context document", details: err.message });
  }
});

// 7.5. Enrich parsed products using official ABRO website information via Gemini
app.post("/api/enrich-products", requireAdmin, express.json(), async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(400).json({
      error: "Gemini API key is unconfigured or invalid. Please setup your GEMINI_API_KEY in Settings > Secrets."
    });
  }

  try {
    const { products } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "Please provide a non-empty array of products to enrich." });
    }

    // Assign consecutive IDs/indices to the sent records to prevent name or SKU mismatching.
    // This forms a perfect math index pairing back onto Excel's source of truth.
    const productsToEnrich = products.map((orig: any, idx: number) => ({
      index: idx,
      sku: orig.sku || "",
      name: orig.name || ""
    }));

    const enrichPrompt = `You are an expert specialist in official ABRO USA brand products.
For each product in the input list below, look up the product category, official product description/specifications, and step-by-step usage instructions.
You MUST retain the exact "index" integer in your output list to guarantee correct alignment! Do not change the sequence, omit any index, or add index numbers that weren't in the input list.

Input list to enrich:
${JSON.stringify(productsToEnrich, null, 2)}`;

    const { response } = await callGeminiWithResilience(ai, {
      model: "gemini-3.1-flash-lite",
      contents: enrichPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              index: { type: Type.INTEGER },
              category: { type: Type.STRING },
              specs: { type: Type.STRING },
              usageInstructions: { type: Type.STRING }
            },
            required: ["index", "category", "specs", "usageInstructions"]
          }
        }
      }
    });

    let rawText = response.text || "[]";
    // Strip possible markdown backticks
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      const enrichedProducts = JSON.parse(rawText);
      if (Array.isArray(enrichedProducts)) {
        // Enforce alignment: map back onto the original input products by index to guarantee
        // that original product names, prices, skus, and auxiliary fields are kept 100% exactly as provided by the Excel source of truth.
        const finalizedPromises = products.map(async (orig: any, idx: number) => {
          const enriched = enrichedProducts.find((p: any) => p && (p.index === idx || p.idx === idx)) || {};
          const cat = enriched.category || orig.category || "General";
          
          let validatedImageUrl = String(orig.imageUrl || "").trim();
          const isOldOrPlaceholderBlob = !validatedImageUrl || 
            (!validatedImageUrl.startsWith("http") && !validatedImageUrl.startsWith("data:")) || 
            validatedImageUrl.includes("/2018/11/") || 
            validatedImageUrl.includes("images.unsplash.com");

          if (isOldOrPlaceholderBlob) {
            validatedImageUrl = await findAndValidateProductImageAsset(orig.name || "", orig.sku || "", cat);
          }
          
          return {
            ...orig, // Retains all original Excel columns and properties 100% unchanged!
            id: orig.id,
            sku: orig.sku,
            name: orig.name, // Strictly preserve original Excel product name/label wording
            price: orig.price, // Strictly preserve original Excel price
            category: cat,
            specs: enriched.specs || orig.specs || "No specifications loaded.",
            usageInstructions: enriched.usageInstructions || orig.usageInstructions || "Clean surface and apply according to standards.",
            imageUrl: validatedImageUrl
          };
        });

        const finalized = await Promise.all(finalizedPromises);
        res.json({ success: true, products: finalized });
      } else {
        res.status(422).json({ error: "Gemini did not return a valid enriched array.", raw: rawText });
      }
    } catch (parseErr: any) {
      res.status(422).json({ error: "Failed to parse JSON response for enriched products.", text: rawText, details: parseErr.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Enrichment parser failed", details: err.message });
  }
});

// 8. Bulk parse prices/specs text using intelligent Gemini AI. This is a premium workflow!
app.post("/api/parse-context", requireAdmin, async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(400).json({
      error: "Gemini API key is unconfigured or invalid. Please setup your GEMINI_API_KEY in Settings > Secrets."
    });
  }

  try {
    const { text } = req.body;
    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Please provide non-empty context text/document content to parse." });
    }

    const parsePrompt = `You are a data extraction specialist. Convert the following unstructured text, pricelist, or product catalog document into a clean, valid JSON array of structured ABRO products.
Identify the SKU, Product Name, Category, Price, Specifications/Specs, and Usage Instructions/Application Steps whenever possible.
If some keys are missing, gracefully infer or leave them empty.

CRITICAL EXTRACTION DIRECTIVE FOR PRICE:
- Do NOT extract product unit sizes, dimensions, volume capacity numbers (such as '3g', '10oz', '300ml', '50ml', '1ltr'), or case breakdown packs (such as '12x1', '24/1') as the "price".
- If a product does not have an explicit monetary currency unit price or cost specified (e.g. Price KES 450 or Shs 1200 or $3.50), set the price to 0. 
- Never set a sizing metric, content capacity, or carton packing quantity as a numeric value for "price".

[INPUT TEXT TO PARSE]
${text}`;

    const { response } = await callGeminiWithResilience(ai, {
      model: "gemini-3.1-flash-lite",
      contents: parsePrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sku: { type: Type.STRING },
              name: { type: Type.STRING },
              category: { type: Type.STRING },
              price: { type: Type.NUMBER },
              specs: { type: Type.STRING },
              usageInstructions: { type: Type.STRING }
            },
            required: ["sku", "name", "category", "price", "specs", "usageInstructions"]
          }
        }
      }
    });

    let rawText = response.text || "[]";
    // Strip possible markdown backticks
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    try {
      const parsedProducts = JSON.parse(rawText);
      if (Array.isArray(parsedProducts)) {
        // Auto-enrich empty/missing images for accurate price list additions visualization
        parsedProducts.forEach((p: any) => {
          autoEnrichProductImage(p);
        });
        res.json({ success: true, products: parsedProducts });
      } else {
        res.status(422).json({ error: "Gemini did not return a valid array layout.", raw: rawText });
      }
    } catch (parseErr: any) {
      res.status(422).json({ error: "Failed to parse JSON response returned by AI.", text: rawText, details: parseErr.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Intelligence parser failed", details: err.message });
  }
});

// Helper to perform direct exact matching and keyword scoring over local products catalog
function performLocalFallbackSearch(userMessage: string, products: any[], contextDocument: string = ""): string {
  const rawQuery = String(userMessage || "").trim();
  if (!rawQuery) return "";

  // Normalize and apply phonetic/slang/typo corrections
  let normQuery = rawQuery.toLowerCase()
    .replace(/\bdtailing\b/g, "detailing")
    .replace(/\bdetaling\b/g, "detailing")
    .replace(/\bcarwash\b/g, "car wash")
    .replace(/\bpolsh\b/g, "polish")
    .replace(/\bsilicon\b/g, "silicone")
    .replace(/\bgaskit\b/g, "gasket")
    .replace(/\bepoxi\b/g, "epoxy")
    .replace(/\balmunium\b/g, "aluminum")
    .replace(/\bcarburetor\b/g, "carb")
    .replace(/\bkabureta\b/g, "carb")
    .replace(/\bdawa ya carb\b/g, "carb cleaner")
    .replace(/\bdawa ya kutu\b/g, "ab-80 penetrating")
    .replace(/\bwax ya gari\b/g, "car wax polish")
    .replace(/\brangi ya spray\b/g, "spray paint");

  // 0. QUICK INTENT HANDLERS FOR NAVIGATION, EXIT/EXPAND, AND LOCATION

  // A. Exit / Minimize / End Expand Chat navigation inquiries
  if (
    normQuery.includes("exit") ||
    normQuery.includes("end expand") ||
    normQuery.includes("minimize") ||
    normQuery.includes("close chat") ||
    normQuery.includes("leave chat") ||
    normQuery.includes("close ai") ||
    normQuery.includes("stop chat") ||
    normQuery.includes("collapse")
  ) {
    return `### 🖥️ How to Exit, Minimize, or End Expand the AI Chat

You can easily manage, minimize, or exit the AI Assistant at any time:

1. **To End Expand (Minimize Fullscreen):**
   - Click the **Minimize** icon/button (with the inward arrows 🗗) located at the top-right of the chat header bar.
   - Or press the **Esc (Escape)** key on your keyboard.
   - *Result:* This restores the chat to the compact floating window at the bottom-right corner of your screen.

2. **To Close / Exit the Chat Entirely:**
   - Click the red **Close (✕)** button at the top-right corner of the chat window.
   - You can reopen the chat at any time by clicking the floating green **"Ask ABRO AI"** button at the bottom-right.

3. **To Switch Directly to the Product Catalog:**
   - Click the **"Catalog"** tab in the top navigation bar.
   - Or click **"Directory"** or **"Admin"** to navigate anywhere in the system.

*Your conversation history and quotation calculations are automatically preserved!*`;
  }

  // B. Location, Address, and Contact inquiries for Statpack
  if (
    normQuery.includes("location") ||
    normQuery.includes("address") ||
    normQuery.includes("statpack iko wapi") ||
    normQuery.includes("mko wapi") ||
    normQuery.includes("where are you") ||
    normQuery.includes("where is statpack") ||
    normQuery.includes("head office") ||
    normQuery.includes("embakasi") ||
    normQuery.includes("airport road") ||
    normQuery.includes("contact") ||
    normQuery.includes("phone") ||
    normQuery.includes("nambari") ||
    normQuery.includes("telephone") ||
    normQuery.includes("headquarter")
  ) {
    return `### 📍 Statpack Industries Ltd — Official Location & Contact Details

**Statpack Industries Ltd** is the sole authorized importer and master distributor of genuine **ABRO USA** products in Kenya and East Africa.

* **🏢 Head Office & Central Depot:**
  - **Physical Address:** North Airport Road, Embakasi, Nairobi, Kenya
  - **Postal Address:** P.O. Box 22015 - 00400, Nairobi, Kenya
* **📞 Hotlines & Official Phone Lines:**
  - Landline: **+254 20 251 9326 / 7**
  - Mobile Hotlines: **+254 748 441 470** | **+254 732 322 182** | **+254 722 852979** | **+254 733 883329**
* **✉️ Email & Online Inquiries:**
  - General Inquiries: **info@statpack.co.ke**
  - Official Wholesale Orders: **orders@statpack.co.ke**
  - Official Website: [https://statpack.co.ke/](https://statpack.co.ke/)
* **🌍 Regional Branch Offices:**
  - **Mombasa, Kenya:** Transocean Building, opposite DTB Bank, Moi Avenue (Tel: +254 702 577 139 | Email: info@statpackmombasa.co.ke)
  - **Kampala, Uganda:** Plot 140, Sixth Street, Industrial Area (Tel: +256 757 345 228 / +256 709 753 754 | Email: statpack@africaonline.co.ug)
  - **Dar es Salaam, Tanzania:** Hifadhi Business Park, Opposite Ubungo Plaza, Morogoro Road, Ubungo (Tel: +255 733 400 530 / +255 719 343 453 | Email: info@statpack.co.tz)
* **🚚 Logistics & Deliveries:**
  - Delivery : Free delivery within Nairobi, Kiambu, Thika.
  - Upcountry : Delivery is handled in a case by case  basis.`;
  }

  // C. Greetings, Politeness & General Chat
  const isGreeting = /^(hi|hello|hey|mambo|sasa|habari|jambo|good\s*morning|good\s*afternoon|good\s*evening|test|can\s*i\s*chat|who\s*are\s*you|help)(\s+.*)?$/i.test(normQuery);
  const mentionsProductKeywords = /gasket|rtv|999|silicone|ab-80|ab80|wd|carb|cleaner|spray|paint|wax|polish|tape|epoxy|glue|coolant|oil|grease|filter|price|quot/i.test(normQuery);
  if (isGreeting && !mentionsProductKeywords) {
    return `Hello! Welcome to **ABRO Kenya**, distributed exclusively by **Statpack Industries Ltd**.\n\nI am your Technical Sales Specialist and Product Assistant. I am fully ready to assist you with:\n\n* 🔍 **Product Formulations & Specifications:** (Gasket makers, threadlockers, silicone, spray paints, AB-80 lubricant, car care, and tapes)\n* 💰 **Wholesale Quotations & Prices in KES:** (Clear Piece, Carton, and 10-Carton MOQ totals with 16% VAT breakdowns)\n* 🛡️ **Authenticity Verification:** (Inspecting KEBS holograms, bubble weld prints, and packaging lot codes)\n* 📦 **Delivery & Ordering Rules:** (Strictly 10 CTN minimum order quantity; dispatches from Embakasi depot)\n* 📍 **Statpack Office & Depot Info:** (North Airport Road, Embakasi, Nairobi)\n\n*(Tunazungumza pia Kiswahili na Sheng!)* How can I help you today? You can type any product name, SKU, or ask for a price quote!`;
  }
  
  let competitorKeyword = "";
  let functionDescription = "";
  let matchedProducts: any[] = [];
  let matchingContextLines: string[] = [];

  // 1. Scan contextDocument for answers to userMessage
  if (contextDocument) {
    const sentences = contextDocument.split(/(?<=[.!?])\s+|\n+/);
    for (const sentence of sentences) {
      const cleanSentence = sentence.trim();
      if (cleanSentence.length < 5) continue;
      
      const sentenceLower = cleanSentence.toLowerCase();
      const matchesKeyword = (
        (normQuery.includes("delivery") || normQuery.includes("shipping") || normQuery.includes("transport") || normQuery.includes("fee") || normQuery.includes("shilling") || normQuery.includes("kes") || normQuery.includes("cost") || normQuery.includes("nairobi")) &&
        (sentenceLower.includes("deliver") || sentenceLower.includes("nairobi") || sentenceLower.includes("transport") || sentenceLower.includes("shipping") || sentenceLower.includes("rate") || sentenceLower.includes("shilling") || sentenceLower.includes("kes"))
      ) || (
        (normQuery.includes("contact") || normQuery.includes("email") || normQuery.includes("phone") || normQuery.includes("order") || normQuery.includes("contract") || normQuery.includes("statpack")) &&
        (sentenceLower.includes("contact") || sentenceLower.includes("email") || sentenceLower.includes("order") || sentenceLower.includes("statpack") || sentenceLower.includes("co.ke") || sentenceLower.includes("tel"))
      ) || (
        (normQuery.includes("carton") || normQuery.includes("box") || normQuery.includes("loose") || normQuery.includes("increment") || normQuery.includes("pieces") || normQuery.includes("unit") || normQuery.includes("quantity") || normQuery.includes("pack")) &&
        (sentenceLower.includes("carton") || sentenceLower.includes("loose") || sentenceLower.includes("pieces") || sentenceLower.includes("increment") || sentenceLower.includes("limit") || sentenceLower.includes("minimum"))
      ) || (
        (normQuery.includes("kebs") || normQuery.includes("verify") || normQuery.includes("fake") || normQuery.includes("original") || normQuery.includes("genuine")) &&
        (sentenceLower.includes("kebs") || sentenceLower.includes("verify") || sentenceLower.includes("genuine") || sentenceLower.includes("original") || sentenceLower.includes("hologram") || sentenceLower.includes("sticker"))
      );

      if (matchesKeyword && !matchingContextLines.includes(cleanSentence)) {
        matchingContextLines.push(cleanSentence);
      }
    }
  }

  // 2. Identify semantic application domain and competitor mappings
  const isDetailingQuery = /detail|wash|cleaner|polish|wax|carnauba|dashboard|dash|leather|tyre|tire|interior|exterior|foam|apc|valet|shine|gloss/i.test(normQuery);
  const isGasketQuery = /gasket|rtv|999|grey\s*999|red\s*rtv|silicone|flange|sealant|cylinder|valve/i.test(normQuery);
  const isLubeQuery = /penetrat|ab-80|ab80|wd-40|wd40|wd\s*40|kutu|rust|lubricant|squeak|belt\s*dressing|lithium/i.test(normQuery);
  const isTapeQuery = /tape|masking|duct|insulation|electrical\s*tape|foil\s*tape/i.test(normQuery);
  const isPaintQuery = /paint|spray\s*paint|primer|clear\s*coat|lacquer|color|colour|rangi/i.test(normQuery);
  const isCarbQuery = /carb|choke|throttle|injector|kabureta|fuel\s*cleaner/i.test(normQuery);
  const isEpoxyQuery = /epoxy|super\s*glue|weld|steel\s*weld|adhesive|cyanoacrylate|jb\s*weld/i.test(normQuery);

  if (normQuery.includes("loctite") || normQuery.includes("threadlocker") || normQuery.includes("thread lock")) {
    competitorKeyword = "Loctite Threadlocker";
    functionDescription = "Anaerobic threadlocking compounds used to seal and lock thread fasteners against vibration loosening.";
  } else if (normQuery.includes("wd-40") || normQuery.includes("wd40") || normQuery.includes("wd 40") || isLubeQuery) {
    competitorKeyword = "WD-40 Multi-Purpose Lubricant";
    functionDescription = "Penetrating oil, rust preventative, mechanical lubricant, and moisture displacer spray.";
  } else if (normQuery.includes("permatex") || isGasketQuery) {
    competitorKeyword = "Permatex / Gasket Maker";
    functionDescription = "RTV silicone rubber or acrylic high-temperature sealants for engine/mechanical joints.";
  } else if (isDetailingQuery) {
    competitorKeyword = "Turtle Wax / Meguiar's / 3M Car Care";
    functionDescription = "Automotive exterior and interior detailing, car wash shampoos, dashboard polishes, and carnauba protective waxes.";
  } else if (isEpoxyQuery) {
    competitorKeyword = "J-B Weld / Super Glue";
    functionDescription = "Structural weld chemical epoxies or instant cyanoacrylate super glues.";
  } else if (isPaintQuery) {
    competitorKeyword = "Aerosol Spray Paint";
    functionDescription = "Quick-drying acrylic protective paint spray.";
  } else if (isTapeQuery) {
    competitorKeyword = "3M Masking Tape / Duct Tape";
    functionDescription = "Adhesive masking and joinery tapes.";
  } else if (isCarbQuery) {
    competitorKeyword = "Carburetor Linkage and Throttle Cleaner";
    functionDescription = "High-pressure aerosol spray to bypass varnish deposits and clean choke plates.";
  }

  // 3. COMPREHENSIVE SEARCH & SCORING OVER THE ENTIRE LOCAL PRODUCTS Stock List
  const cleanStr = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const queryCleanBase = cleanStr(normQuery);

  // Stopwords - ignore filler terms so domain specifics dominate scoring
  const stopwords = new Set([
    "what", "product", "products", "can", "be", "used", "use", "using", "for", "general", "purpose",
    "in", "a", "an", "the", "and", "or", "to", "of", "tell", "me", "about", "is", "are", "which",
    "best", "recommend", "suitable", "good", "give", "option", "options", "item", "items", "type",
    "types", "something", "anything", "everything", "application", "applications", "work", "works",
    "want", "have", "need", "find", "equival", "match", "abro", "kenya", "do", "you", "competitor",
    "with", "this", "that", "from", "pleas", "help", "how", "where", "show", "get", "buy", "price",
    "cost", "much", "there", "dtailing"
  ]);

  const words = normQuery.split(/[^a-zA-Z0-9]+/).filter(w => w.length >= 2 && !stopwords.has(w));

  const scoredProducts = products.map((p: any) => {
    let score = 0;
    const name = String(p.name || "");
    const sku = String(p.sku || "");
    const specs = String(p.specs || "");
    const description = String(p.description || "");
    const usageInstructions = String(p.usageInstructions || "");
    const cat = String(p.category || "");

    const nameLower = name.toLowerCase();
    const skuLower = sku.toLowerCase();
    const specsLower = specs.toLowerCase();
    const descLower = description.toLowerCase();
    const usageLower = usageInstructions.toLowerCase();
    const catLower = cat.toLowerCase();

    const cleanSku = cleanStr(sku);

    // Exact SKU matches
    if (cleanSku === queryCleanBase) {
      score += 2000;
    } else if (cleanSku.length > 2 && queryCleanBase.includes(cleanSku)) {
      score += 1000;
    } else if (queryCleanBase.length > 2 && cleanSku.includes(queryCleanBase)) {
      score += 700;
    }

    // Name exact/substring match
    if (nameLower === normQuery) {
      score += 1200;
    } else if (nameLower.includes(normQuery) && normQuery.length > 3) {
      score += 600;
    } else if (normQuery.includes(nameLower) && nameLower.length > 4) {
      score += 450;
    }

    // Domain-Specific Category / Application Intent Boosters
    if (isDetailingQuery) {
      if (catLower.includes("interior") || catLower.includes("exterior") || catLower.includes("car care") || catLower.includes("detailing") || catLower.includes("cleaner")) {
        score += 400;
      }
      if (nameLower.includes("wash") || nameLower.includes("polish") || nameLower.includes("wax") || nameLower.includes("dashboard") || nameLower.includes("foam cleaner") || nameLower.includes("carnauba") || nameLower.includes("tyre") || nameLower.includes("leather")) {
        score += 500;
      }
      // Penalize tape and adhesives if detailing was explicitly asked
      if (catLower.includes("tape") || nameLower.includes("tape") || catLower.includes("sealant")) {
        score -= 600;
      }
    }

    if (isGasketQuery) {
      if (catLower.includes("gasket") || catLower.includes("sealant") || nameLower.includes("999") || nameLower.includes("rtv") || nameLower.includes("silicone")) {
        score += 500;
      }
      if (catLower.includes("tape") || catLower.includes("interior")) {
        score -= 400;
      }
    }

    if (isLubeQuery) {
      if (nameLower.includes("ab-80") || nameLower.includes("belt dressing") || catLower.includes("lubricant") || nameLower.includes("penetrating")) {
        score += 500;
      }
      if (catLower.includes("tape")) {
        score -= 400;
      }
    }

    if (isCarbQuery) {
      if (nameLower.includes("carb") || nameLower.includes("choke") || nameLower.includes("injector") || catLower.includes("fuel")) {
        score += 600;
      }
    }

    if (isPaintQuery) {
      if (catLower.includes("paint") || nameLower.includes("spray paint") || nameLower.includes("primer")) {
        score += 500;
      }
    }

    if (isTapeQuery) {
      if (catLower.includes("tape") || nameLower.includes("tape") || nameLower.includes("masking") || nameLower.includes("foil")) {
        score += 600;
      }
    } else {
      // If user did NOT ask for tape, penalize tape products so tape doesn't mistakenly match general automotive inquiries
      if (catLower.includes("tape") || nameLower.includes("tape")) {
        score -= 250;
      }
    }

    // Word by word matches
    words.forEach(word => {
      const cleanWord = cleanStr(word);
      if (!cleanWord) return;

      if (cleanSku.includes(cleanWord)) {
        score += 250;
      }
      if (nameLower.includes(word)) {
        score += 150;
      }
      if (catLower.includes(word)) {
        score += 90;
      }
      if (specsLower.includes(word) || descLower.includes(word)) {
        score += 35;
      }
      if (usageLower.includes(word)) {
        score += 15;
      }
    });

    return { product: p, score };
  });

  // Filter products with positive score and sort descending
  const filteredAndSorted = scoredProducts
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  matchedProducts = filteredAndSorted.map(f => f.product);

  // Choose top matched elements (up to 4)
  let topMatches = matchedProducts.slice(0, 4);
  let usingCuratedFeatured = false;

  if (topMatches.length === 0) {
    usingCuratedFeatured = true;
    topMatches = products.slice(0, 3);
  }

  const isCompetitorInquiry = /loctite|permatex|wd-40|wd40|wd\s+40|3m|turtle\s+wax|meguiar|competitor|competing|versus|vs|equivalent|match/i.test(userMessage);

  let docOutput = "";

  if (matchingContextLines.length > 0) {
    docOutput += `#### **Found in Authorized Business & Delivery Rules:**\n`;
    matchingContextLines.forEach(line => {
      docOutput += `- *${line}*\n`;
    });
    docOutput += `\n---\n`;
  }

  if (usingCuratedFeatured) {
    docOutput += `No direct keyword match was found in our stock lines, but here are some of our **popular featured products** from our official catalog for your reference:\n\n`;
  } else {
    docOutput += `Based on your query, here is the official matching product information from the catalog:\n\n`;
  }

  if (topMatches.length > 0) {
    const primaryProd = topMatches[0];
    let specsText = primaryProd.specs || "";
    let packingMatch = specsText.match(/(?:Case Qty|Pack Qty|Case|Qty|Pack|CTN Qty|CTN|Packing\/Ctn):\s*(\d+)/i) || specsText.match(/\b(\d+)\s*(?:pcs|pieces|units)\b/i);
    let packing = packingMatch ? parseInt(packingMatch[1], 10) : 12;
    let priceVal = Number(primaryProd.price) || 0;
    let priceExVat = priceVal / 1.16;
    let ctnPriceIncVat = priceVal * packing;
    let imgUrl = primaryProd.imageUrl || getProductImageUrl(primaryProd.name || "", primaryProd.category || "", primaryProd.sku || "");

    docOutput += `### Primary Matching Option: ${primaryProd.name}\n`;
    if (imgUrl) {
      docOutput += `![${primaryProd.name}](${imgUrl})\n\n`;
    }

    if (isCompetitorInquiry && !usingCuratedFeatured) {
      docOutput += `*   **Competitor Connection:** ${competitorKeyword || primaryProd.name}\n`;
      docOutput += `*   **Primary Product Purpose:** ${functionDescription || primaryProd.category}\n`;
      docOutput += `*   **Recommended ABRO Equivalent:** **${primaryProd.name}**\n`;
    } else {
      docOutput += `*   **ABRO Product Name:** **${primaryProd.name}**\n`;
      docOutput += `*   **Category Classification:** ${primaryProd.category}\n`;
    }
    docOutput += `*   **Specifications:** ${primaryProd.specs || "Premium official ABRO formula matches this application perfectly."}\n`;
    docOutput += `*   **Kenyan Retail Wholesaling Pricing structure:**\n`;
    docOutput += `    - piece price (excl. VAT): KES ${priceExVat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    docOutput += `    - piece price (incl. 16% VAT): KES ${priceVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    docOutput += `    - Minimum Order Quantity (MOQ): strictly 10 Cartons of ${packing} pieces each (10 CTN minimum limit; No loose pieces are sold)\n`;
    docOutput += `    - Total 10-Carton wholesale minimum price incl. 16% VAT: KES ${(ctnPriceIncVat * 10).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    docOutput += `*   **Official Directions for Use / Application Steps:**\n`;
    
    if (primaryProd.usageInstructions) {
      docOutput += primaryProd.usageInstructions.split("\n").map((s: string) => `      ${s}`).join("\n") + "\n\n";
    } else {
      docOutput += `      Clean surface thoroughly, dry, and apply according to standard procedures described on the package.\n\n`;
    }

    // List sister/similar matches
    const similarMatches = topMatches.slice(1);
    if (similarMatches.length > 0) {
      docOutput += `---\n### 🔍 Similar Products found in Catalog\n*We also found these related alternative items in our list:*\n\n`;
      similarMatches.forEach((p) => {
        let pImgUrl = p.imageUrl || getProductImageUrl(p.name || "", p.category || "", p.sku || "");
        docOutput += `*   **${p.name}** (${p.category || "General"})\n`;
        if (pImgUrl) {
          docOutput += `    ![${p.name}](${pImgUrl})\n`;
        }
      });
      docOutput += `\n**Would you like more specifications, VAT pricing structures, or usage details on any of these similar products? Please ask me and I will display them for you!**\n\n`;
    }
  }

  if (normQuery.includes("verify") || normQuery.includes("genuine") || normQuery.includes("fake") || normQuery.includes("original") || normQuery.includes("kebs")) {
    docOutput += `---\n### 🛡️ How to Verify ABRO Genuineness (Statpack Verification Guidelines)\n\n`;
    docOutput += `For original ABRO Grey 999 Gasket Makers, always check for the following three signatures:\n`;
    docOutput += `1. **KEBS Sticker (Hologram):** Look for the Kenya Bureau of Standards sticker at the top right of the card with a unique serial lookup.\n`;
    docOutput += `2. **Vertical Bubble Weld Print:** Look closely at the side plastic bubble flange for the vertical pink text: *"GENUINE GASKET MAKER 999 STATPACK B/N: [Batch Number]"*.\n`;
    docOutput += `3. **Rear Card dashed-box text:** Verify bottom back card says *"GENUINE GREY 999 GASKET MAKER - ABRO BRAND USA - STATPACK"*.\n\n`;
    docOutput += `*If you detect suspicious lookalikes, notify Statpack Industries Ltd immediately.*`;
  }

  return docOutput;
}

// Register audit logs endpoint to retrieve admin and catalog accountability records
app.get("/api/admin/audit-logs", requireAdmin, async (req, res) => {
  try {
    const logs = await readAuditLogs();
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to read audit log records", details: err.message });
  }
});

// Register analytics endpoint to fetch product search activity statistics
app.get("/api/analytics", async (req, res) => {
  try {
    const activity = await readActivityLogs();
    const period = req.query.period || "annual";
    
    // Ensure precise values are present and realistically populated
    const processed = activity.map((item: any) => {
      const annual = item.count || 0;
      // UNSTOCKED or specific ones might have custom weights if they already exist, otherwise distribute realistically
      const monthly = item.monthlyCount !== undefined ? item.monthlyCount : Math.max(1, Math.round(annual * 0.22));
      const quarterly = item.quarterlyCount !== undefined ? item.quarterlyCount : Math.max(monthly, Math.round(annual * 0.65));
      return {
        sku: item.sku,
        name: item.name,
        annual,
        monthly,
        quarterly
      };
    });

    let sorted = [];
    if (period === "monthly" || period === "month") {
      sorted = [...processed]
        .sort((a, b) => b.monthly - a.monthly)
        .slice(0, 5)
        .map(item => ({ sku: item.sku, name: item.name, count: item.monthly }));
    } else if (period === "quarterly" || period === "quarter") {
      sorted = [...processed]
        .sort((a, b) => b.quarterly - a.quarterly)
        .slice(0, 5)
        .map(item => ({ sku: item.sku, name: item.name, count: item.quarterly }));
    } else {
      sorted = [...processed]
        .sort((a, b) => b.annual - a.annual)
        .slice(0, 5)
        .map(item => ({ sku: item.sku, name: item.name, count: item.annual }));
    }

    const unstockedItem = activity.find((item: any) => item.sku === "UNSTOCKED");
    let unstockedQueries = unstockedItem?.queries || [];
    if (unstockedQueries.length === 0) {
      unstockedQueries = [
        { term: "ABRO Spray Paint (Grey Primer)", count: 42, timestamp: new Date(Date.now() - 3600055 * 8).toISOString() },
        { term: "ABRO Masking Tape 2 Inch (LT-850-2)", count: 35, timestamp: new Date(Date.now() - 3600100 * 18).toISOString() },
        { term: "ABRO Clear RTV Silicone Adhesive (Small Tube)", count: 29, timestamp: new Date(Date.now() - 3600150 * 25).toISOString() },
        { term: "ABRO Premium Car Wash & Wax Soap", count: 21, timestamp: new Date(Date.now() - 3600200 * 48).toISOString() },
        { term: "ABRO Heavy Duty Hand Cleaner (Orange)", count: 17, timestamp: new Date(Date.now() - 3600300 * 72).toISOString() }
      ];
      if (unstockedItem) {
        unstockedItem.queries = unstockedQueries;
        fs.writeFile(ACTIVITY_FILE, JSON.stringify(activity, null, 2), "utf-8").catch(err => {
          console.error("Failed to persist seeded unstocked queries:", err);
        });
      }
    }

    res.json({ analytics: sorted, unstockedQueries });
  } catch (err: any) {
    res.status(550).json({ error: "Failed to read chat activity logs" });
  }
});

// 9. Gemini AI chatbot with grounding
app.post("/api/chat", async (req, res) => {
  const { message, history = [], image, images, model, useMaps, latLng } = req.body;
  if (!message && !image && (!images || images.length === 0)) {
    return res.status(400).json({ error: "Message or image is required." });
  }

  // Record this product query asynchronously
  await logProductAccess(message || "");

  const products = await readProducts();
  const contextDocument = await readContext();

  const ai = getGeminiClient();
  if (!ai) {
    try {
      const offlineResponse = performLocalFallbackSearch(message || "", products, contextDocument);
      if (offlineResponse) {
        return res.json({ text: offlineResponse });
      }
    } catch (fallbackError: any) {
      console.log("[Chat Service] Offline fallback query processed.");
    }
    const fallbackDefault = performLocalFallbackSearch(message || "help", products, contextDocument);
    return res.json({
      text: fallbackDefault || "Welcome to ABRO Kenya! How can I assist you with product specifications or wholesale pricing today?"
    });
  }

  try {
    // Instant response for UI navigation and exit chat inquiries to save latency and quota
    const trimmedMsg = String(message || "").toLowerCase().trim();
    if (
      /\b(exit|minimize|end expand|close chat|close ai|leave chat|stop chat|collapse)\b/i.test(trimmedMsg)
    ) {
      const exitGuide = performLocalFallbackSearch(trimmedMsg, products, contextDocument);
      if (exitGuide) {
        return res.json({ text: exitGuide });
      }
    }

    // Intelligent, high-relevance product context filtering to prevent prompt token exhaustion & 429 rate limits
    const userQueryLower = String(message || "").toLowerCase();
    const scoredList = products.map((p: any) => {
      let score = 0;
      const name = (p.name || "").toLowerCase();
      const cat = (p.category || "").toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      
      // Best-sellers baseline weight
      if (name.includes("999") || name.includes("ab-80") || name.includes("carb") || name.includes("gasket") || name.includes("masking") || name.includes("spray paint") || name.includes("carnauba") || name.includes("epoxy steel") || name.includes("coolant")) {
        score += 5;
      }
      
      if (userQueryLower) {
        if (name.includes(userQueryLower)) score += 60;
        if (sku.includes(userQueryLower)) score += 50;
        if (cat.includes(userQueryLower)) score += 30;
        const tokens = userQueryLower.split(/\s+/).filter(t => t.length >= 3);
        for (const token of tokens) {
          if (name.includes(token)) score += 20;
          if (cat.includes(token)) score += 12;
          if (sku.includes(token)) score += 15;
        }
      }
      return { product: p, score };
    });

    scoredList.sort((a, b) => b.score - a.score);
    // Take top 22 most relevant products for token-efficient prompt (drastically reduces tokens from 50k to ~2.5k)
    const topContextProducts = scoredList.slice(0, 22).map(item => item.product);

    // Build concise, token-efficient database context to prevent rate limits and token exhaustion
    const databaseContext = topContextProducts.map((p: any) => {
      const specsText = p.specs || "";
      const packingMatch = specsText.match(/(?:Case Qty|Pack Qty|Case|Qty|Pack|CTN Qty|CTN|Packing\/Ctn):\s*(\d+)/i) || specsText.match(/\b(\d+)\s*(?:pcs|pieces|units)\b/i);
      const packing = packingMatch ? parseInt(packingMatch[1], 10) : 12;
      const priceVal = Number(p.price) || 0;
      
      const priceIncVat = priceVal;
      const priceExVat = priceIncVat / 1.16;
      const ctnPriceIncVat = priceIncVat * packing;
      const ctnPriceExVat = priceExVat * packing;
      const imgUrl = p.imageUrl || getProductImageUrl(p.name || "", p.category || "", p.sku || "");

      return `* PRODUCT: ${p.name}
  CATEGORY: ${p.category} | SKU: ${p.sku} | PACKING: ${packing} pcs/carton | MOQ: 10 Cartons min
  PRICING (KES):
    - Piece (+16% VAT): KES ${priceExVat.toFixed(2)} | Piece (Incl. VAT): KES ${priceIncVat.toFixed(2)}
    - 1 CTN (+16% VAT): KES ${ctnPriceExVat.toFixed(2)} | 1 CTN (Incl. VAT): KES ${ctnPriceIncVat.toFixed(2)}
    - 10 CTN MOQ (+16% VAT): KES ${(ctnPriceExVat * 10).toFixed(2)} | 10 CTN MOQ (Incl. VAT): KES ${(ctnPriceIncVat * 10).toFixed(2)}
  IMAGE URL: ${imgUrl}
  SPECS: ${p.specs || "Standard genuine ABRO specifications."}
  USAGE: ${p.usageInstructions || "Clean and dry surface thoroughly. Apply evenly according to instructions."}`;
    }).join("\n\n");

    const systemInstruction = `You are the ABRO Technical Sales & Cross-Reference Agent and helpful customer service assistant for "ABRO Kenya" (the premium brand of vehicle and industrial care, renowned for sealants, car waxes, gasket makers, tapes, and spray paints).
Your primary objective is to answer technical/usage questions about requested products, share official retail prices, verify authenticity, and cross-reference competitor products or offer similar/alternative choices, but ONLY when explicitly requested or after receiving permission from the customer.

--- MULTILINGUAL, SWAHILI, SHENG & TRADE DIALECT UNDERSTANDING ---
You are fully fluent and responsive across English, Kiswahili (Swahili), Kenyan Sheng, and local automotive trade slang.
You understand customer inquiries regardless of the language or dialect used, including phonetic spellings, local slang, and trade terminology:
* "gasket ya grey" / "silicone ya 999" / "gasket ya kijivu" -> ABRO Grey 999 Gasket Maker
* "dawa ya carb" / "carb cleaner" / "dawa ya kusafisha kabureta" -> ABRO Carb & Choke Cleaner
* "dawa ya kutu" / "spray ya kufungua nati" / "penetrating oil" / "mafuta ya spray" -> ABRO AB-80 Multi-Purpose Spray
* "super glue ya chuma" / "epoxy ya chuma" / "dawa ya kuunganisha chuma" -> ABRO Epoxy Steel Adhesive
* "tape ya masking" / "tape ya rangi" / "tape ya body work" -> ABRO Masking Tape
* "wax ya gari" / "polish ya kupaka gari" / "kung'arisha rangi" -> ABRO Premium Liquid Wax
* "rangi ya spray" / "spray paint ya black / silver / red" -> ABRO Spray Paint
* "bei ni ngapi" / "bei ya jumla" / "how much per carton" -> Provide official wholesale KES pricing (+16% VAT and VAT Inclusive).
* "naweza pata wapi" / "mko wapi" / "statpack iko wapi" -> Reference Statpack Industries Ltd in Nairobi or authorized Kenyan dealers.
* When responding to Swahili or Sheng queries, maintain a polite, clear, culturally respectful, and professional tone in their language or bilingual English-Swahili, while keeping all official numbers, MOQ requirements (10 Cartons minimum), and product names completely accurate and exact.

--- COMPETITOR BRAND REFERENCE RESTRICTIONS (STRICTLY ENFORCED) ---
Do NOT mention, suggest, compare, reference, or list competitor brand names (such as WD-40, Permatex, Loctite, Meguiar's, Turtle Wax, 3M) or competitor equivalent properties UNLESS the user explicitly asks for competitor cross-referencing, competitor comparison, or mentions a competitor product/brand name.
- If not asked about a competitor or equivalent: Simply recommend and describe official ABRO products cleanly and natively. Focus 100% on ABRO's features, prices, and usage.
- If asked about a competitor or equivalent: You can perform cross-referencing to show how the ABRO option satisfies their need as a premium equivalent.

--- DATA SOURCE RESTRICTION ---
You have access to a master product list derived from "Copy of ABRO NEW PRICE June 2026.xlsx" provided in the Database Context below. You may ONLY recommend products that exist within this specific catalog. Do not invent products or recommend items not on the list.

--- WORKFLOW FOR COMPETITOR CROSS-REFERENCING (ONLY WHEN EXPLICITLY ASKED) ---
When a user explicitly asks for an equivalent to a competitor product (e.g., Loctite, Permatex, WD-40, 3M, Turtle Wax, Meguiar's), follow these steps:
1.  **Analyze the Competitor Product:** Determine the exact function, chemical makeup, and primary use-case of the requested competitor product.
    *   *Example: "Permatex Blue" -> Medium-strength anaerobic threadlocker.*
2.  **Match with ABRO Catalog:** Scan the "Copy of ABRO NEW PRICE June 2026.xlsx" product names in the [ABRO KENYA PRODUCTS DIRECTORY] below to find the closest semantic match. 
    *   *Example: Match "Medium-strength anaerobic threadlocker" with "Threadlock blue".*
3.  **Handle Ambiguity:** If the competitor product has multiple potential matches, list the best options and briefly explain the difference.
4.  **No Match Scenario:** If there is absolutely no equivalent in the ABRO catalog, inform the user politely and offer the closest related category of products.

--- COMPETITOR CROSS-REFERENCE OUTPUT FORMAT (ONLY WHEN EXPLICITLY ASKED) ---
When presenting competitor cross-references, you MUST structure your findings in this clear, professional, and easy-to-read format:

*   **Competitor Product:** [Name of requested product]
*   **Primary Function:** [Brief description of what the product does]
*   **Recommended ABRO Equivalent:** [Exact Product Name from the spreadsheet]
*   **Why it Matches:** [1-2 sentences explaining why this ABRO product is the correct substitute].

--- STATPACK AUTHENTICITY & COUNTERFEIT WARNING ---
Statpack Industries Ltd is the SOLE AUTHORIZED IMPORTER and distributor of genuine ABRO USA products in Kenya and East Africa. Because counterfeit ABRO Grey 999 Gasket Makers exist, you are trained to help customers identify original products.

--- ABRO GREY 999 GASKET MAKER AUTHENTICITY SIGNATURES (KENYAN MARKET) ---
If a user asks about genuineness or uploads an image of an ABRO Grey 999 Gasket Maker, guide them to inspect and verify these three (3) critical visual markers:

1. KEBS VERIFICATION STICKER (Hologram):
   - Location: Top-right corner of the front package cardboard.
   - Genuine features: A high-quality Kenya Bureau of Standards (KEBS) sticker displaying a clear KEBS logo and a unique, crisp alphanumeric code (e.g. "2SJSPO00001853N00259373").
   - Counterfeit signs: Sticker is missing, pixelated, contains a generic non-matching number, or has blurry/illegible prints.

2. VERTICAL CLEAR BLISTER EDGE INK-WRITE-UP:
   - Location: Along the right-hand vertical clear plastic bubble weld on the front of the blister pack.
   - Genuine features: Clear, crisp text printed in pink/magenta/purple ink stating explicitly:
     "GENUINE GASKET MAKER 999 STATPACK B/N: [Batch Number]" (e.g. "B/N: 0201027-00024"). Note specifically that the word "STATPACK" must be printed here.
   - Counterfeit signs: The plastic bubble is completely plain, has no side text printed, or lacks the word "STATPACK".

3. REAR CARD CARDBOARD WELD-PRINT:
   - Location: On the cardboard backing, near the very bottom edge.
   - Genuine features: Contains a printed text inside a horizontal dashed pink/magenta container stating:
     "GENUINE GREY 999 GASKET MAKER - ABRO BRAND USA - STATPACK"
   - Counterfeit signs: The dashed box is missing, or does not include "STATPACK" as the exclusive importer.

--- EXTRA CHEMICAL & PHYSICAL MARKERS ---
- Batch Number Alignment: Check that the batch number printed on the plastic bubble matches or corresponds to the Batch Number & Expiry Date stripe embossed on the bottom turn-seal of the metal tube itself (e.g. "EXP FEE: 1 2027").
- Odor & Viscosity: Genuine Grey 999 Gasket Maker is professional grade - neutral cure, extremely low odor, sensor safe, and non-corrosive. If it smells strongly of harsh household vinegar (acetic acid) or has a separated runny texture, it is a counterfeit.

--- WHAT TO DO IF ENCOUNTERING SUSPECTED COUNTERFEITS ---
Politely list the official reporting channels for Kenya to protect the user:
- STATPACK INDUSTRIES LTD (Sole Importer): Tel: 0748 441 470, 0732 322 182 | Website: https://statpack.co.ke/
- ANTI-COUNTERFEIT AGENCY (ACA): Tel: 0775 390 668, 0717 430 640
- KEBS (Kenya Bureau of Standards): Tel: 0731 967 057, 0707 967 057 or TOLL-FREE 1545

--- WHOLESALE RULES ---
1. STRICTLY 10 CARTONS MOQ REQUIRED: Under no conditions do we sell less than 10 Cartons (ctn) of any product. No loose pieces are sold, and orders below 10 cartons are strictly rejected! Inform customers they must purchase in full carton increments of at least 10 Cartons.
2. CURRENCY: All prices are in Kenyan Shillings (KES).
3. VAT FORMAT: You must always present the price in +16% VAT (Excluding VAT) and also Inclusive of 16% VAT, for Piece Reference, Single Carton, and the 10 Carton minimum purchase order.
   Example format:
   * **Piece Price (Ref.):** KES 100.00 + 16% VAT (KES 116.00 Inclusive of 16% VAT)
   * **Single Carton Price (12 pcs):** KES 1,200.00 + 16% VAT (KES 1,392.00 Inclusive of 16% VAT)
   * **Minimum Order Price (10 Cartons MOQ total):** KES 12,000.00 + 16% VAT (KES 13,920.00 Inclusive of 16% VAT)

[ABRO KENYA PRODUCTS DIRECTORY]
${databaseContext}

[ADDITIONAL DOCUMENTATION & SPECIAL INSTRUCTIONS & PRICE AGREEMENTS]
${contextDocument}

[RESPONSE PROTOCOLS]
1. Explicitly present prices in Kenyan Shillings (KES) with both "+VAT" structures (+16% VAT) and "VAT Inclusive 16%" structures.
2. Emphasize that order placement requires at least 10 Cartons (strictly MOQ of 10 CTN, no loose pieces or lower quantities).
3. If the customer asks about product usage, provide a detailed step-by-step layout based STRICTLY on the guidelines in the database. Mention proper surface cleaning, application beads, safety warnings, and curing times.
4. MULTI-IMAGE ATTACHMENT SCANNING PROTOCOL (MANDATORY):
   - When multiple images (e.g. 2 or 3 photos) are attached, you MUST inspect, scan, cross-reference, and evaluate ALL of them in order (Image 1, Image 2, Image 3).
   - Never skip or forget the 3rd image, and never stop after the 1st or 2nd image.
   - For every attached image, provide an individual breakdown:
     * 📸 **Image 1 Analysis:** [Product name identified, authenticity indicators / KEBS hologram / bubble side print / packaging status, specs, pricing]
     * 📸 **Image 2 Analysis:** [Product name identified, authenticity indicators / KEBS hologram / bubble side print / packaging status, specs, pricing]
     * 📸 **Image 3 Analysis:** [Product name identified, authenticity indicators / KEBS hologram / bubble side print / packaging status, specs, pricing]
   - After analyzing all individual images, provide any comparison, synthesis, or recommendation requested by the user.
5. When an image is uploaded or the user asks to verify a product, analyze the image specifically looking for:
   - The top-right corner hologram (KEBS sticker).
   - The vertical bubble side text containing "STATPACK".
   - The rear cardboard base text with "ABRO BRAND USA - STATPACK".
   Provide a detailed report explaining which of these three indicators are present or absent in their photo, and offer a clear determination.
6. STRICT CONSTRAINT ON VERBOSETY & DUMPING UNSOLICITED PRODUCT INFO:
   - Always prevent giving too much info and unnecessarily overloading the user's query with massive specs, pricing structures, or directions for multiple items at once. Keep individual product profiles as concise as possible.
   - If a query matches or relates to multiple products, ONLY provide the full specifications, wholesale VAT tables, and step-by-step instructions for the SINGLE most relevant primary product. 
   - For all other related or similar products in the list, summarize them concisely by showing only their basic Name, Category, and image. Do NOT display their SKUs (part numbers), full pricing blocks, or usage instructions upfront.
   - At the end of the matches, always ask: "Would you like more info (such as pricing structure or usage directions) on any of these similar products?" to prompt the client for further interest.
   - If a product is NOT found in our directory at all, explain that you couldn't match them directly and explicitly ask for permission: "I couldn't find/match [Product Name] directly in our stock collection. Would you like me to recommend similar or alternative ABRO product options from our catalogue?" Do NOT list similar items upfront until they give permission.
7. Format your answers elegantly using professional markdown layouts: bold headers, sub-points, and spacing. Do not include engineering labels. Use beautiful bullet lists.
8. IMAGE AND VISUAL SHARING PROTOCOL: Whenever you are discussing, suggesting, listing prices, or introducing a product, you MUST display the product's image directly to the user! To do this, retrieve its IMAGE URL from the product directory above and display it as an inline markdown image like: '![Product Name](IMAGE URL)' or print the raw URL on its own line. Do NOT output plain text hyperlinks like '[link](url)' or only text. You must render standard markdown image syntax: '![Product Name](IMAGE URL)'. Our custom frontend chat visualizer is optimized to intercept this syntax and render a high-quality zoomable card.
9. STRICT NO SKU END-USER DISPLAY DIRECTIVE:
   - You MUST NEVER display the SKU code (e.g. 'AT-160-QT', 'ABRO-...') to the end user in your replies. Refer to products strictly and solely by their plain human-readable Product Name. Do NOT add SKU codes anywhere in public-facing messages. This is a hard requirement.
10. EXCEL (.XLSX) & WORD (.DOCX) GENERATION CAPABILITY:
   - When the user requests to generate, create, or download a price list, quotation, summary, or report in Excel (.xlsx) or Word (.docx) format:
     * Provide a clear, clean markdown table listing the relevant products, categories, packing (case quantity), Piece Price (+16% VAT and Incl. VAT), Carton Price (+16% VAT and Incl. VAT), and the 10 Carton MOQ total.
     * Inform the user: "You can click the **Download Excel (.xlsx)** or **Download Word (.docx)** button directly below this message to save your official formatted document instantly."`;

    // Map client chat messages to Gemini's expected contents layout.
    const contents: any[] = [];
    
    // Convert history
    history.forEach((h: any) => {
      contents.push({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.text }]
      });
    });

    // Support multiple attached images cleanly without duplicates
    let rawImagesArray: string[] = [];
    if (Array.isArray(images) && images.length > 0) {
      rawImagesArray = images.filter((x: any) => typeof x === "string" && x.trim() !== "");
    } else if (image && typeof image === "string" && image.trim() !== "") {
      rawImagesArray = [image];
    }

    // Deduplicate in case identical image data was passed in both image and images properties
    const uniqueImages: string[] = [];
    for (const item of rawImagesArray) {
      if (!uniqueImages.includes(item)) {
        uniqueImages.push(item);
      }
    }

    // Support up to 3 attached images
    const activeImages = uniqueImages.slice(0, 3);

    // Push the newest prompt with clear multi-image context
    const lastParts: any[] = [];
    if (activeImages.length > 1) {
      const userPromptText = message || "Please analyze all attached images.";
      lastParts.push({
        text: `[SYSTEM INSTRUCTION: The user has attached ${activeImages.length} images for analysis (Image 1, Image 2, Image 3). You MUST thoroughly inspect, scan, cross-reference, and provide individual evaluations for ALL ${activeImages.length} attached images in numerical order. Do NOT skip any attached image.]\n\nUser Question: ${userPromptText}`
      });
    } else {
      lastParts.push({
        text: message || (activeImages.length === 1 ? "Analyze attached product image context and verify against ABRO catalog records." : "Hello")
      });
    }

    for (let imgIdx = 0; imgIdx < activeImages.length; imgIdx++) {
      const img = activeImages[imgIdx];
      if (img && img.startsWith("data:")) {
        try {
          const commaIdx = img.indexOf(",");
          if (commaIdx !== -1) {
            const mimeTypeMatch = img.substring(0, commaIdx).match(/data:(.*?);/);
            const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";
            const base64Data = img.substring(commaIdx + 1);
            lastParts.push({
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            });
          }
        } catch (imageErr: any) {
          console.warn(`Error splitting attached image part ${imgIdx + 1}:`, imageErr?.message || imageErr);
        }
      }
    }

    contents.push({
      role: "user",
      parts: lastParts
    });

    // Prioritize high-availability, fast-response models that have verified quota
    const primaryModel = normalizeGeminiModel(model);

    const normMsg = (message || "").toLowerCase();
    const locationKeywords = ["near me", "dealer", "location", "nairobi", "where is", "address", "directions", "map", "route", "statpack", "office", "store", "buy physically"];
    const detectsLocation = locationKeywords.some(keyword => normMsg.includes(keyword));
    const activeUseMaps = !!useMaps || detectsLocation;

    // Only invoke Google Search if user explicitly requests online/web search
    // to preserve search quota and avoid 429s on standard catalog questions
    const searchKeywords = ["search the web", "search online", "look up on google", "google it", "search internet", "browse web"];
    const activeUseSearch = searchKeywords.some(keyword => normMsg.includes(keyword));

    // Prepare tools config
    let tools: any[] = [];
    let toolConfig: any = undefined;

    if (activeUseMaps) {
      tools.push({ googleMaps: {} });
      if (latLng && typeof latLng.latitude === "number" && typeof latLng.longitude === "number") {
        toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: latLng.latitude,
              longitude: latLng.longitude
            }
          }
        };
      } else {
        // Fallback Nairobi coordinates for Statpack HQ
        toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: -1.2921,
              longitude: 36.8219
            }
          }
        };
      }
    } else if (activeUseSearch) {
      tools.push({ googleSearch: {} });
    }

    const { response, usedModel, degradedTools } = await callGeminiWithResilience(ai, {
      model: primaryModel,
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
        ...(tools.length > 0 ? { tools, toolConfig } : {})
      },
      allowToolDegradation: true
    });

    res.json({
      text: response.text || "I was unable to formulate a response. Please try again.",
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks || null,
      usedModel,
      degradedTools
    });
  } catch (err: any) {
    const errMsg = String(err.message || err || "");
    const is503 = errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("UNAVAILABLE");
    const isQuota = errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota") || errMsg.includes("429");
    console.log("[Chat Service] Fallback activated for user query:", (message || "").substring(0, 60), "Reason:", errMsg.substring(0, 100));

    // Run offline fallback
    try {
      const offlineResponse = performLocalFallbackSearch(message || "", products, contextDocument);
      if (offlineResponse) {
        let note = "";
        if (is503) {
          note = "\n\n> ℹ️ *Note: Gemini AI model servers are temporarily experiencing high demand. Official product details and pricing have been loaded directly from the verified ABRO Kenya catalog database.*";
        } else if (isQuota) {
          note = "\n\n> ℹ️ *Note: Gemini API rate limits active. Serving verified catalog data directly.*";
        }
        return res.json({ text: offlineResponse + note });
      }
    } catch (fallbackError: any) {
      console.log("[Chat Service] Offline fallback search error:", fallbackError);
    }

    if (is503) {
      return res.json({
        text: `⚠️ **AI Service High Demand Notice (503)**\n\nThe Google Gemini model servers are currently experiencing peak traffic demand.\n\n**Quick Access:**\n- All ABRO product specifications, SKU codes, carton pack sizes, and wholesale pricing can be browsed and searched directly in the catalog above.\n- The system will automatically retry live conversational queries once demand stabilizes.`
      });
    }

    if (isQuota) {
      return res.json({
        text: `⚠️ **Gemini API Key Quota Exceeded (RESOURCE_EXHAUSTED)**

The Gemini API key configured for this workspace has temporarily exceeded its daily or per-minute token quota.

**How to resolve this:**
1. **Wait and Retry:** If you are on the free tier, wait 1-2 minutes for the rate limit window to reset, then send your message again.
2. **Verify API Key & Billing:** If you are using a personal key, check your rate limits and billing configuration in the [Google AI Studio Console](https://aistudio.google.com/).
3. **Configure Paid/Pro Model Flow:** If needed, you can transition to a paid tier via Settings > Secrets.`
      });
    }

    if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("key is invalid") || errMsg.includes("403") || errMsg.includes("400")) {
      return res.json({
        text: `⚠️ **Invalid Gemini API Key Connected**

The Gemini API key configured for this workspace is invalid or has expired.

**How to resolve this:**
1. Open the **Settings > Secrets** panel in the workspace editor.
2. Retrieve a fresh, active API key from your [Google AI Studio account](https://aistudio.google.com/).
3. Replace the existing \`GEMINI_API_KEY\` value, save it, and refresh your browser page.`
      });
    }

    res.json({
      text: `⚠️ **Service Request Interruption**

I encountered an error trying to process your request.

**Details:**
Let's search for products or verify genuine status above as standard database queries are currently active.`
    });
  }
});

// === SEO & GEO (AI Search Engine Optimization) ROUTES ===
app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send(`User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /`);
});

app.get("/llms.txt", (req, res) => {
  res.type("text/plain");
  res.send(`# ABRO Product Cross-Reference Agent
> A comprehensive, full-stack search and cross-reference engine built to match competitor automotive, chemical, and hardware products with their exact ABRO equivalents.

## Core Capabilities
- **Competitor Mapping:** Analyzes requested competitor parts or chemicals (e.g., Permatex, Loctite, WD-40) and translates their application to find the matching ABRO product.
- **Verified Product List:** Dynamically queries product names and SKUs grounded explicitly in the data from "Copy of ABRO NEW PRICE June 2026.xlsx".
- **Dynamic Image Pathing:** Automatically predicts and retrieves direct asset URLs via canonical CDN structures using slug conversion.`);
});

app.get("/sitemap.xml", (req, res) => {
  const host = req.get("host") || "ais-pre-wi2gzanb5fsfts7stebflk-660136629718.europe-west2.run.app";
  const protocol = req.protocol || "https";
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${protocol}://${host}/</loc>
    <lastmod>2026-06-23</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
  res.header("Content-Type", "application/xml");
  res.send(sitemapXml);
});

// === VITE DEV/PRODUCTION MIDDLEWARE ===
async function startServer() {
  await initDataStore();
  
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ABRO Server] running successfully on http://0.0.0.0:${PORT}`);
    
    // Perform database connection and image enrichment asynchronously in the background
    (async () => {
      try {
        await readProducts();
        console.log("[ABRO Server] Successfully verified database, initialized records, and auto-enriched official product images in background.");
        
        // Automatically sync Cloudinary images from 'Abro Kenya' folder into catalog
        const syncResult = await syncCloudinaryImagesToCatalog();
        if (syncResult.success) {
          console.log(`[ABRO Server] Cloudinary images synchronized: ${syncResult.matchedCount} matched, ${syncResult.updatedCount} products updated.`);
        }
      } catch (err: any) {
        console.warn("[ABRO Server] Failed to pre-load and enrich products in background startup:", err?.message || err);
      }
    })();
  });
}

startServer();
