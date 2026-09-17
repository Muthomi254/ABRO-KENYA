import React, { useState, useRef, useEffect } from "react";
import { 
  MessageSquare, Send, Sparkles, User, ShieldAlert, CornerDownLeft, 
  RefreshCw, Mic, Image, Paperclip, X, Volume2, Plus, Trash2, LogOut, History,
  FileSpreadsheet, FileText, Copy, Check, Download, LogIn, Maximize2, Minimize2,
  SlidersHorizontal, MapPin, LayoutGrid, ArrowDown
} from "lucide-react";
import { ChatMessage, Product } from "../types";
import ZoomableImage from "./ZoomableImage";
import abroKenyaIcon from "../assets/images/abro_kenya_icon_custom_1782232481339.png";
import { 
  generateCatalogExcel, 
  generateCatalogWord, 
  generateCustomWordReport, 
  generateCustomExcelFromText 
} from "../documentGenerator";
import { 
  auth, db, googleProvider, signInWithPopup, signOut, 
  handleFirestoreError, OperationType 
} from "../firebase";
import { 
  collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, serverTimestamp, updateDoc 
} from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";

interface ChatProps {
  products: Product[];
  onQuickSearch: (query: string) => void;
  theme?: "light" | "dark";
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
  externalTriggerQuery?: string;
  onClearExternalTrigger?: () => void;
  onUpdateProductImageUrl?: (id: string, newUrl: string) => void;
  onCollapseNavbar?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onClose?: () => void;
}

interface FAQItem {
  id: string;
  text: string;
  category: "gasket" | "paint" | "sealant" | "b2b" | "location" | "other";
  tags: string[];
  priority: number;
}

const FAQ_POOL: FAQItem[] = [
  {
    id: "gasket-red",
    text: "How do I apply ABRO Red Gasket Maker?",
    category: "gasket",
    tags: ["gasket", "maker", "red", "apply", "temperature", "silicone"],
    priority: 10
  },
  {
    id: "paint-aluminum",
    text: "What is the carton price for Spray Paint - aluminum?",
    category: "paint",
    tags: ["paint", "spray", "aluminum", "carton", "price"],
    priority: 9
  },
  {
    id: "min-order",
    text: "What is our minimum order requirement?",
    category: "b2b",
    tags: ["order", "minimum", "b2b", "requirement", "shipping", "limit", "carton"],
    priority: 8
  },
  {
    id: "silicone-clear",
    text: "Tell me about Silicon Sealant 310ml - Clear packaging & prices as +vat and inclusive 16%",
    category: "sealant",
    tags: ["silicon", "sealant", "clear", "310ml", "price", "vat", "inclusive"],
    priority: 7
  },
  {
    id: "gasket-grey",
    text: "Is ABRO Grey Gasket Maker suitable for high-torque applications?",
    category: "gasket",
    tags: ["grey", "gasket", "torque", "999", "heavy-duty", "gray"],
    priority: 5
  },
  {
    id: "spray-colors",
    text: "Are there other ABRO spray paint colors in stock?",
    category: "paint",
    tags: ["color", "spray", "paint", "stock", "palette"],
    priority: 4
  },
  {
    id: "stockist-kenya",
    text: "Where is the nearest authorized dealer in Mombasa or Nairobi?",
    category: "location",
    tags: ["mombasa", "nairobi", "dealer", "stockist", "location", "outlet", "where"],
    priority: 4
  },
  {
    id: "delivery-lead",
    text: "What are the standard B2B delivery times within Kenya?",
    category: "b2b",
    tags: ["delivery", "time", "lead", "transit", "freight", "nairobi", "ship"],
    priority: 3
  },
  {
    id: "vat-calculation",
    text: "How is the 16% VAT calculated on bulk discount purchases?",
    category: "b2b",
    tags: ["vat", "calculation", "tax", "bulk", "discount", "price", "16%"],
    priority: 3
  },
  {
    id: "original-check",
    text: "How can I verify if my ABRO product is 100% genuine?",
    category: "other",
    tags: ["genuine", "verify", "original", "counterfeit", "fake", "check", "real"],
    priority: 2
  },
  {
    id: "super-glue",
    text: "What is the safety curing time for ABRO Super Glue?",
    category: "other",
    tags: ["glue", "super", "cure", "time", "adhesive"],
    priority: 1
  },
  {
    id: "price-list-excel",
    text: "Can I get the wholesale price list in Excel (.xlsx)?",
    category: "b2b",
    tags: ["excel", "price", "list", "xlsx", "quotation", "wholesale", "spreadsheet", "rates", "catalog"],
    priority: 11
  },
  {
    id: "epoxy-steel",
    text: "How strong is the ABRO Steel Epoxy adhesive?",
    category: "other",
    tags: ["epoxy", "steel", "strong", "mix", "weld"],
    priority: 1
  },
  {
    id: "statpack-location",
    text: "Where is Statpack Industries Ltd located and how can I contact them?",
    category: "location",
    tags: ["statpack", "location", "address", "embakasi", "contact", "phone", "office", "airport road"],
    priority: 10
  },
  {
    id: "chat-navigation",
    text: "How do I exit, minimize, or end expand this chat AI?",
    category: "other",
    tags: ["exit", "minimize", "close", "expand", "end expand", "chat"],
    priority: 9
  }
];

// Helper to determine if a message specifically requests or provides a price list, quotation, or spreadsheet
function isPriceOrDocRequested(msgText: string, priorUserText?: string): boolean {
  const combined = `${msgText} ${priorUserText || ""}`.toLowerCase();

  const hasDocKeywords =
    combined.includes("excel") ||
    combined.includes("spreadsheet") ||
    combined.includes(".xlsx") ||
    combined.includes(".docx") ||
    combined.includes("price list") ||
    combined.includes("pricelist") ||
    combined.includes("quotation") ||
    combined.includes("formal quote") ||
    combined.includes("master catalog") ||
    combined.includes("download price") ||
    combined.includes("download catalog") ||
    combined.includes("wholesale quote");

  const hasPricingTableOrFigures =
    (combined.includes("kes") || combined.includes("ksh")) &&
    (combined.includes("carton") || combined.includes("moq") || combined.includes("16% vat") || combined.includes("+16%"));

  return hasDocKeywords || hasPricingTableOrFigures;
}

// Elegant abstract Quad-Color Emblem from the generated ABRO Kenya Companion professional icon
function QuadColorEmblem({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <img
      src={abroKenyaIcon}
      alt="ABRO Kenya Logo"
      className={`${className} shrink-0 rounded-lg object-cover border border-[#016838]/20 shadow-sm transition-transform duration-300 hover:scale-105`}
      referrerPolicy="no-referrer"
    />
  );
}

const getModelBadgeStyles = (model: string) => {
  switch (model) {
    case "gemini-3.8-flash":
      return {
        textColor: "text-[#00609C] dark:text-[#52a6ff]",
        bgColor: "bg-[#00609C]/5 dark:bg-[#00609C]/10 hover:bg-[#00609C]/10 dark:hover:bg-[#00609C]/20",
        borderColor: "border-[#00609C]/20 dark:border-[#00609C]/30",
        label: "🧠 Flash 3.8 (High Intelligence)",
      };
    case "gemini-flash-latest":
      return {
        textColor: "text-emerald-600 dark:text-emerald-400",
        bgColor: "bg-emerald-500/5 dark:bg-emerald-500/10 hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20 dark:border-emerald-550/30",
        label: "🚀 Flash Latest",
      };
    case "gemini-3.1-flash-lite":
    default:
      return {
        textColor: "text-amber-600 dark:text-amber-400",
        bgColor: "bg-amber-500/5 dark:bg-amber-500/10 hover:bg-amber-500/10 dark:hover:bg-amber-500/20",
        borderColor: "border-amber-500/20 dark:border-amber-550/30",
        label: "⚡ Flash 3.1 Lite (Recommended - Resilient)",
      };
  }
};

// Helper to remove heavy base64 strings from messages saved to local fallback cache
const pruneMessagesForLocal = (list: ChatMessage[]): ChatMessage[] => {
  return list.map((msg) => {
    const pruned = { ...msg };
    if (pruned.image && pruned.image.startsWith("data:")) {
      pruned.image = "[Image Omitted]";
    }
    if (pruned.images) {
      pruned.images = pruned.images.map((img) =>
        img.startsWith("data:") ? "[Image Omitted]" : img
      );
    }
    return pruned;
  });
};

// Safe wrapper for localStorage.setItem to avoid any storage quota/driver exceptions from disrupting app flow
const safeSetLocalStorage = (key: string, value: any, pruneMessages: boolean = false) => {
  try {
    let dataToStore = value;
    if (pruneMessages && Array.isArray(value)) {
      dataToStore = pruneMessagesForLocal(value);
    }
    localStorage.setItem(key, JSON.stringify(dataToStore));
  } catch (err) {
    console.warn(`Local persistence storage quota exceeded or disabled for key "${key}":`, err);
  }
};

// Helper to downscale and compress images client-side to prevent network failures or storage issues
const compressAndResizeImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.75): Promise<string> => {
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
};

export default function AIAgentChat({ 
  products, 
  onQuickSearch, 
  theme = "dark", 
  showSidebar = true, 
  onToggleSidebar,
  externalTriggerQuery,
  onClearExternalTrigger,
  onUpdateProductImageUrl,
  onCollapseNavbar,
  isExpanded = false,
  onToggleExpand,
  onClose,
}: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [showInspiration, setShowInspiration] = useState(true);
  const [isCancelledInspiration, setIsCancelledInspiration] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("abro_selected_model");
      if (saved && (saved === "gemini-3.1-flash-lite" || saved === "gemini-flash-latest" || saved === "gemini-3.8-flash")) {
        return saved;
      }
    } catch {}
    return "gemini-3.1-flash-lite";
  });
  const [useMaps, setUseMaps] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isVirtualKeyboardOpen, setIsVirtualKeyboardOpen] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const modelConfig = getModelBadgeStyles(selectedModel);

  // Keyboard shortcut listener: Press Escape to exit expanded view or close chat window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isExpanded && onToggleExpand) {
          onToggleExpand();
        } else if (onClose) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, onToggleExpand, onClose]);

  // --- Firebase Auth & Firestore Persistence States ---
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSessionSidebarOpen, setIsSessionSidebarOpen] = useState(false); // starts collapsed, user toggles
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const handleExportExcel = async (title?: string, content?: string) => {
    setIsExporting("excel");
    try {
      if (content && content.trim()) {
        generateCustomExcelFromText(title || "ABRO_Price_Quotation", content, products);
      } else {
        generateCatalogExcel(products);
      }
    } catch (err) {
      console.error("Excel generation error:", err);
      alert("Could not generate Excel spreadsheet. Please try again.");
    } finally {
      setTimeout(() => setIsExporting(null), 1000);
    }
  };

  const handleExportWord = async (title?: string, content?: string, query?: string) => {
    setIsExporting("word");
    try {
      if (content && content.trim()) {
        await generateCustomWordReport(title || "ABRO_Technical_Report", content, query);
      } else {
        await generateCatalogWord(products);
      }
    } catch (err) {
      console.error("Word document generation error:", err);
      alert("Could not generate Word document. Please try again.");
    } finally {
      setTimeout(() => setIsExporting(null), 1000);
    }
  };

  const handleCopyMessage = async (messageId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => {
        setCopiedMessageId((prev) => (prev === messageId ? null : prev));
      }, 2000);
    } catch (err) {
      console.warn("Clipboard write failed:", err);
    }
  };

  // Listen to auth state transitions
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u) {
        loadSessions(u.uid);
      } else {
        setSessions([]);
        setCurrentSessionId(null);
      }
    });
    return unsubscribe;
  }, []);

  // Background scraper to resolve primary images from parent_url in real-time
  const resolvedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!products || products.length === 0) return;

    const resolveImages = async () => {
      // Filter products that have parentUrl and aren't already resolved or tried
      const toResolve = products.filter(p => 
        p.parentUrl && 
        p.parentUrl.startsWith("http") && 
        !resolvedRef.current[p.id]
      );

      if (toResolve.length === 0) return;

      // Mark as tried/resolving immediately to prevent duplicate concurrent attempts
      toResolve.forEach(p => {
        resolvedRef.current[p.id] = true;
      });

      const batchSize = 2;
      for (let i = 0; i < toResolve.length; i += batchSize) {
        const batch = toResolve.slice(i, i + batchSize);
        await Promise.all(batch.map(async (p) => {
          try {
            const res = await fetch(`/api/resolve-image?parent_url=${encodeURIComponent(p.parentUrl!)}`);
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.imageUrl) {
                if (onUpdateProductImageUrl) {
                  onUpdateProductImageUrl(p.id, data.imageUrl);
                }
              }
            }
          } catch (err) {
            console.warn(`[Background Image Resolver] Failed for product ${p.sku}:`, err);
          }
        }));
      }
    };

    resolveImages();
  }, [products, onUpdateProductImageUrl]);

  const loadSessions = async (uid: string) => {
    setIsSyncing(true);
    try {
      const q = query(collection(db, "users", uid, "chats"), orderBy("updatedAt", "desc"));
      const snap = await getDocs(q);
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setSessions(list);
      safeSetLocalStorage(`abro_local_sessions_${uid}`, list);
    } catch (err) {
      console.warn("Firestore access issues. Falling back to secure localStorage for chat history.", err);
      try {
        const stored = localStorage.getItem(`abro_local_sessions_${uid}`);
        if (stored) {
          setSessions(JSON.parse(stored));
        } else {
          setSessions([]);
        }
      } catch (parseErr) {
        setSessions([]);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const loadSessionMessages = async (uid: string, sId: string) => {
    setIsLoading(true);
    try {
      const q = query(
        collection(db, "users", uid, "chats", sId, "messages"),
        orderBy("timestamp", "asc")
      );
      const snap = await getDocs(q);
      const list: ChatMessage[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        let formattedTime = "";
        if (data.timestamp) {
          const dt = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
          formattedTime = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } else {
          formattedTime = "Now";
        }
        list.push({
          id: doc.id,
          role: data.role as "user" | "model",
          text: data.text || "",
          images: data.images || [],
          timestamp: formattedTime,
        });
      });
      
      if (list.length === 0) {
        setMessages([
          {
            id: "welcome",
            role: "model",
            text: "Conversation thread synchronized. Dynamic specs knowledge is active. Ask me any inventory query!",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } else {
        setMessages(list);
      }
      setIsHeaderCollapsed(list.length > 1);
      safeSetLocalStorage(`abro_local_messages_${uid}_${sId}`, list, true);
    } catch (err) {
      console.warn("Firestore messages query offline. Accessing local thread backup.", err);
      try {
        const stored = localStorage.getItem(`abro_local_messages_${uid}_${sId}`);
        if (stored) {
          const list = JSON.parse(stored);
          setMessages(list);
          setIsHeaderCollapsed(list.length > 1);
        } else {
          setMessages([
            {
              id: "welcome",
              role: "model",
              text: "Welcome back! Ready for specs analysis and authentications.",
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
          setIsHeaderCollapsed(false);
        }
      } catch (parseErr) {
        setMessages([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const selectSession = (sId: string) => {
    if (!user) return;
    setCurrentSessionId(sId);
    loadSessionMessages(user.uid, sId);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSessionSidebarOpen(false);
    }
  };

  const triggerNewSession = () => {
    setCurrentSessionId(null);
    setMessages([
      {
        id: "welcome",
        role: "model",
        text: "Habari! Welcome to Statpack's official ABRO Kenya & East Africa stock dictionary gateway. Statpack is the sole importer and distributor of genuine ABRO products in Kenya and East Africa. I am your dynamic AI Sales & Spec assistant. Ask me anything about our sealants, gasket makers, aerosol spray paints, or car wash specs. I can provide specs and details for any product. Please keep in mind: our Minimum Order Quantity (MOQ) is strictly 10 Cartons (no loose pieces are sold, 10 CTN minimum limit).",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setIsHeaderCollapsed(false);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSessionSidebarOpen(false);
    }
  };

  const deleteSession = async (sId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    setIsSyncing(true);
    try {
      try {
        await deleteDoc(doc(db, "users", user.uid, "chats", sId));
      } catch (firebaseErr) {
        console.warn("Could not delete from cloud, removing local copy only:", firebaseErr);
      }
      let currentLocalSessList: any[] = [];
      try {
        currentLocalSessList = JSON.parse(localStorage.getItem(`abro_local_sessions_${user.uid}`) || "[]");
      } catch (e) {
        console.warn("Could not read local sessions cache:", e);
      }
      const filteredList = currentLocalSessList.filter((s: any) => s.id !== sId);
      safeSetLocalStorage(`abro_local_sessions_${user.uid}`, filteredList);
      try {
        localStorage.removeItem(`abro_local_messages_${user.uid}_${sId}`);
      } catch (e) {
        console.warn("Could not remove message history cache:", e);
      }

      if (currentSessionId === sId) {
        triggerNewSession();
      }
      await loadSessions(user.uid);
    } catch (err) {
      console.error("Delete operation failure:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Google Sign In Error:", err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Google Sign Out Error:", err);
    }
  };

  // Dynamically track question click frequencies and category interests
  const [faqClicks, setFaqClicks] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("abro_faq_clicks");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [categoryInterests, setCategoryInterests] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("abro_faq_categories");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Dynamically compile adaptive suggestions matching user's frequently asked questions and interest weights
  const currentSuggestions = React.useMemo(() => {
    return [...FAQ_POOL]
      .map((faq) => {
        const clickCount = faqClicks[faq.id] || 0;
        const interestCount = categoryInterests[faq.category] || 0;
        // Priority weight + (clicks * 6) + (category interest * 3.5)
        const score = faq.priority + (clickCount * 6) + (interestCount * 3.5);
        return { ...faq, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((faq) => faq.text);
  }, [faqClicks, categoryInterests]);

  const trackUserQueryInteraction = (queryText: string) => {
    const normalized = queryText.toLowerCase().trim();
    if (!normalized) return;

    // Direct match to any specific FAQ text
    const matchedFaq = FAQ_POOL.find(
      (f) => normalized.includes(f.text.toLowerCase()) || f.text.toLowerCase().includes(normalized)
    );

    const updatedClicks = { ...faqClicks };
    if (matchedFaq) {
      updatedClicks[matchedFaq.id] = (updatedClicks[matchedFaq.id] || 0) + 3; // exact click/selected weight
    }

    const updatedInterests = { ...categoryInterests };
    FAQ_POOL.forEach((faq) => {
      // If query mentions any tag of this FAQ, increase its relevance score
      const matchesTag = faq.tags.some((tag) => normalized.includes(tag.toLowerCase()));
      if (matchesTag) {
        updatedInterests[faq.category] = (updatedInterests[faq.category] || 0) + 1;
        updatedClicks[faq.id] = (updatedClicks[faq.id] || 0) + 1;
      }
    });

    setFaqClicks(updatedClicks);
    setCategoryInterests(updatedInterests);

    safeSetLocalStorage("abro_faq_clicks", updatedClicks);
    safeSetLocalStorage("abro_faq_categories", updatedInterests);
  };

  // Proactively auto-acquire and continuously watch the live geolocation.
  // This automatically keeps maps grounding coordinates updated in real-time as the user moves.
  useEffect(() => {
    if (!navigator.geolocation) return;

    // Check immediately to set location quickly on load
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        // Auto-enable maps grounding on startup once location is granted!
        setUseMaps(true);
      },
      (err) => {
        console.warn("Initial proactive geolocation check warning:", err?.message || err);
      }
    );

    // Watch position continuously so that it stays automatically updated in the background
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        // Auto-maximize user experience: activate maps grounding instantly
        setUseMaps(true);
      },
      (err) => {
        console.warn("Continuous background geolocation watch warning:", err?.message || err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isShiftPressedRef = useRef(false);

  // Watch for external product inquiries from the adjacent catalog
  useEffect(() => {
    if (externalTriggerQuery) {
      handleSendMessage(externalTriggerQuery);
      if (onClearExternalTrigger) {
        onClearExternalTrigger();
      }
    }
  }, [externalTriggerQuery]);

  // Auto-collapse header when chat begins (more than welcome message)
  useEffect(() => {
    if (messages.length > 1) {
      setIsHeaderCollapsed(true);
    }
  }, [messages.length]);

  // Initialize with welcome message on mount
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "model",
        text: "Habari! Welcome to Statpack's official ABRO Kenya & East Africa stock dictionary gateway. Statpack is the sole importer and distributor of genuine ABRO products in Kenya and East Africa. I am your dynamic AI Sales & Spec assistant. Ask me anything about our sealants, gasket makers, aerosol spray paints, or car wash specs. I can provide specs and details for any product. Please keep in mind: our Minimum Order Quantity (MOQ) is strictly 10 Cartons (no loose pieces are sold, 10 CTN minimum limit).",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  }, []);

  // Listen to mobile virtual keyboard popping up via modern visualViewport API
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleViewportChange = () => {
      if (!window.visualViewport) return;
      const isKeyboardActive = window.visualViewport.height < window.innerHeight * 0.85;
      setIsVirtualKeyboardOpen(isKeyboardActive);
      if (isKeyboardActive) {
        setIsHeaderCollapsed(true);
      }
    };

    window.visualViewport.addEventListener("resize", handleViewportChange);
    window.visualViewport.addEventListener("scroll", handleViewportChange);

    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, []);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    // User has scrolled up to read earlier history
    setIsUserScrolledUp(distanceFromBottom > 100);
  };

  const scrollToBottom = (smooth = true, force = false) => {
    // If user has intentionally scrolled up to read history, do not jump unless forced (e.g. user sent a new message)
    if (isUserScrolledUp && !force) return;

    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto"
      });
    }
  };

  useEffect(() => {
    // If conversation is active or generating, scroll down to show latest message
    if (messages.length > 1 || isLoading) {
      scrollToBottom(true, false);
    } else if (messagesContainerRef.current) {
      // On welcome greeting / initial state, keep scrolled to top so emblem, title & suggestions are 100% visible
      messagesContainerRef.current.scrollTop = 0;
    }
  }, [messages.length, isLoading]);

  const handleInputFocus = () => {
    setIsFocused(true);
    setIsVirtualKeyboardOpen(true);
    setIsHeaderCollapsed(true);
    // Keep newest message visible when keyboard opens during an active conversation
    setTimeout(() => {
      if (messages.length > 1) {
        scrollToBottom(true, false);
      }
    }, 150);
  };

  const isMobileViewport = () => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768 || ('ontouchstart' in window && window.innerWidth < 1024);
  };

  const handleSendMessage = async (textToSend: string) => {
    const finalMsgText = textToSend.trim();
    if (!finalMsgText && attachedImages.length === 0) return;
    if (isLoading) return;

    if (!isMobileViewport()) {
      textareaRef.current?.focus();
    }

    // Dynamically update adaptive suggestions based on questions frequently asked
    if (finalMsgText) {
      trackUserQueryInteraction(finalMsgText);
    }

    const userMessageId = String(Date.now());
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      text: finalMsgText || "Analyze Attached Images",
      images: [...attachedImages],
      image: attachedImages[0] || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setApiKeyMissing(false);

    // Save attached images to clear state
    const currentAttachments = [...attachedImages];
    setAttachedImages([]);

    // Always force scroll down to newest message when user sends
    setIsUserScrolledUp(false);
    setTimeout(() => scrollToBottom(true, true), 50);
    setTimeout(() => scrollToBottom(true, true), 250);

    let targetSessionId = currentSessionId;

    try {
      // If user is authenticated, handle session creation and user message persistence
      if (user) {
        if (!targetSessionId) {
          targetSessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
          try {
            await setDoc(doc(db, "users", user.uid, "chats", targetSessionId), {
              userId: user.uid,
              title: finalMsgText.substring(0, 48) || "ABRO Specs Inquiry",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            setCurrentSessionId(targetSessionId);
          } catch (err) {
            console.warn("Could not save session to cloud, using local backup. Error:", err);
          }

          // Always ensure the session is saved in local fallback
          const newSess = {
            id: targetSessionId,
            userId: user.uid,
            title: finalMsgText.substring(0, 48) || "ABRO Specs Inquiry",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          let currentLocalSessList: any[] = [];
          try {
            currentLocalSessList = JSON.parse(localStorage.getItem(`abro_local_sessions_${user.uid}`) || "[]");
          } catch (e) {
            console.warn("Could not read local sessions list:", e);
          }
          if (!currentLocalSessList.some((s: any) => s.id === targetSessionId)) {
            currentLocalSessList.unshift(newSess);
            safeSetLocalStorage(`abro_local_sessions_${user.uid}`, currentLocalSessList);
            setSessions(currentLocalSessList);
          }
          setCurrentSessionId(targetSessionId);
        }

        const userMsgId = "msg_user_" + Date.now();
        const userMsgObj: ChatMessage = {
          id: userMsgId,
          role: "user",
          text: finalMsgText || "Analyze Attached Images",
          images: currentAttachments,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        try {
          await setDoc(doc(db, "users", user.uid, "chats", targetSessionId, "messages", userMsgId), {
            sessionId: targetSessionId,
            userId: user.uid,
            role: "user",
            text: finalMsgText || "Analyze Attached Images",
            images: currentAttachments,
            timestamp: serverTimestamp()
          });
        } catch (err) {
          console.warn("Could not sync message to cloud, using local backup. Error:", err);
        }
        // Always append user message to local backup list for the session
        let currentLocalMsgsList: any[] = [];
        try {
          currentLocalMsgsList = JSON.parse(localStorage.getItem(`abro_local_messages_${user.uid}_${targetSessionId}`) || "[]");
        } catch (e) {
          console.warn("Could not read local messages list:", e);
        }
        currentLocalMsgsList.push(userMsgObj);
        safeSetLocalStorage(`abro_local_messages_${user.uid}_${targetSessionId}`, currentLocalMsgsList, true);
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send previous 10 messages for context
        body: JSON.stringify({
          message: finalMsgText || (currentAttachments.length > 1 ? `Please inspect, analyze, and cross-reference all ${currentAttachments.length} attached images.` : "Compare this product image details with catalog records."),
          images: currentAttachments,
          image: currentAttachments[0] || undefined,
          model: selectedModel,
          useMaps: useMaps,
          latLng: userLocation || undefined,
          history: messages.slice(-10).map((msg) => ({
            role: msg.role,
            text: msg.text
          }))
        })
      });

      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        let errorMsg = "Failed to get response from AI Agent.";
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          if (response.status === 400 && errorData.error?.includes("GEMINI_API_KEY")) {
            setApiKeyMissing(true);
            throw new Error("Gemini API Key is not configured yet.");
          }
          errorMsg = errorData.error || errorMsg;
        } else {
          const errorText = await response.text();
          console.error("Non-JSON Server Error:", errorText);
          errorMsg = `Server Error (${response.status}): The server responded in an unexpected format. Please make sure the dev server is active.`;
        }
        throw new Error(errorMsg);
      }

      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error("Expected JSON but received raw response:", text);
        throw new Error("Received non-JSON content from the server. Check backend logs.");
      }
      const modelMessageId = String(Date.now() + 1);
      const modelMsgObj: ChatMessage = {
        id: modelMessageId,
        role: "model",
        text: data.text,
        groundingChunks: data.groundingChunks || undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [
        ...prev,
        modelMsgObj
      ]);

      // If user is authenticated, save the model response and bump session updatedAt
      if (user && targetSessionId) {
        const modelMsgDocId = "msg_model_" + Date.now();
        try {
          await setDoc(doc(db, "users", user.uid, "chats", targetSessionId, "messages", modelMsgDocId), {
            sessionId: targetSessionId,
            userId: user.uid,
            role: "model",
            text: data.text,
            timestamp: serverTimestamp()
          });

          await updateDoc(doc(db, "users", user.uid, "chats", targetSessionId), {
            updatedAt: serverTimestamp()
          });

          await loadSessions(user.uid);
        } catch (err) {
          console.warn("Could not save model reply to cloud, updating local state backups. Error:", err);
        }

        // Always append model message to local backup list
        let currentLocalMsgsList: any[] = [];
        try {
          currentLocalMsgsList = JSON.parse(localStorage.getItem(`abro_local_messages_${user.uid}_${targetSessionId}`) || "[]");
        } catch (e) {
          console.warn("Could not read local messages backup list:", e);
        }
        currentLocalMsgsList.push(modelMsgObj);
        safeSetLocalStorage(`abro_local_messages_${user.uid}_${targetSessionId}`, currentLocalMsgsList, true);

        // Update local session timestamp and sort
        let currentLocalSessList: any[] = [];
        try {
          currentLocalSessList = JSON.parse(localStorage.getItem(`abro_local_sessions_${user.uid}`) || "[]");
        } catch (e) {
          console.warn("Could not read local sessions backup list:", e);
        }
        const matchIdx = currentLocalSessList.findIndex((s: any) => s.id === targetSessionId);
        if (matchIdx !== -1) {
          currentLocalSessList[matchIdx].updatedAt = new Date().toISOString();
          const [movedItem] = currentLocalSessList.splice(matchIdx, 1);
          currentLocalSessList.unshift(movedItem);
          safeSetLocalStorage(`abro_local_sessions_${user.uid}`, currentLocalSessList);
          setSessions(currentLocalSessList);
        }
      }

    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 2),
          role: "model",
          text: `⚠️ **System Integration Error**\n\n${err.message || "Something went wrong while connecting to the AI system. Please verify network or credentials."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const submitCurrentMessage = (explicitText?: string) => {
    const textToSend = typeof explicitText === "string" ? explicitText : input;
    if (!textToSend.trim() && attachedImages.length === 0) return;

    handleSendMessage(textToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Standard desktop Enter to send, Shift+Enter for new line
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitCurrentMessage(input);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Convert simple markdown and images into beautiful readable elements
  const renderMessageContent = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      let trimmed = line.trim();
      
      if (trimmed.startsWith("###")) {
        return (
          <h4 key={i} className={`text-sm font-bold uppercase tracking-wider mt-3 mb-1.5 ${theme === "dark" ? "text-slate-100" : "text-slate-800"}`}>
            {trimmed.replace(/^###\s*/, "")}
          </h4>
        );
      }
      if (trimmed.startsWith("##")) {
        return (
          <h3 key={i} className={`text-base font-black tracking-wide mt-4 mb-2 border-b pb-1 ${theme === "dark" ? "border-white/10 text-white" : "border-slate-205 text-slate-850"}`}>
            {trimmed.replace(/^##\s*/, "")}
          </h3>
        );
      }

      const isBullet = trimmed.startsWith("* ") || trimmed.startsWith("- ");
      let cleanLine = trimmed;
      if (isBullet) {
        cleanLine = trimmed.substring(2);
      }

      // Check if line contains any markdown image, markdown image link, or standalone image URLs (e.g. .jpg, .png)
      // Extract matches and non-matches sequentially
      const imageRegex = /(!\[.*?\]\(.*?\)|\!?\[.*?\]\(https?:\/\/\S+?\.(?:jpg|jpeg|png|gif|webp|jpeg)\)|https?:\/\/\S+?\.(?:jpg|jpeg|png|gif|webp|jpeg))/gi;
      const subParts = cleanLine.split(imageRegex);

      const renderedPartElements = subParts.map((subPart, subIdx) => {
        if (!subPart) return null;

        // Check if it's a markdown image or standard markdown link enclosing an image url
        const markdownImageMatch = subPart.match(/^!?\[(.*?)\]\((.*?)\)$/);
        if (markdownImageMatch) {
          const alt = markdownImageMatch[1] || "ABRO Product View";
          const url = markdownImageMatch[2];
          return (
            <div key={subIdx} className="block my-3 max-w-[280px] h-48 rounded-xl overflow-hidden shadow-md relative group border border-slate-200 dark:border-white/10" style={{ contentVisibility: "auto" }}>
              <ZoomableImage src={url} alt={alt} theme={theme} productName={alt} />
            </div>
          );
        }

        // Check if it's a standalone image URL
        const rawUrlMatch = subPart.match(/^https?:\/\/\S+?\.(?:jpg|jpeg|png|gif|webp|jpeg)$/i);
        if (rawUrlMatch) {
          const url = subPart;
          return (
            <div key={subIdx} className="block my-3 max-w-[280px] h-48 rounded-xl overflow-hidden shadow-md relative group border border-slate-200 dark:border-white/10" style={{ contentVisibility: "auto" }}>
              <ZoomableImage src={url} alt="Sourced Product View" theme={theme} />
            </div>
          );
        }

        // Otherwise, process normal text (supporting bold **text**)
        const parts = subPart.split(/\*\*([^*]+)\*\*/g);
        return parts.map((part, idx) => {
          if (idx % 2 === 1) {
            return (
              <strong key={idx} className={`font-black tracking-wide ${theme === "dark" ? "text-white" : "text-slate-900 font-extrabold"}`}>
                {part}
              </strong>
            );
          }
          return part;
        });
      });

      if (isBullet) {
        return (
          <li key={i} className={`ml-4 list-disc text-sm md:text-[14px] leading-relaxed py-1.5 ${theme === "dark" ? "text-slate-200" : "text-slate-850 font-medium"}`}>
            {renderedPartElements}
          </li>
        );
      }

      return (
        <div key={i} className={`text-sm md:text-[14px] leading-relaxed py-1.5 min-h-[1.2rem] ${theme === "dark" ? "text-slate-200" : "text-slate-850 font-medium"}`}>
          {renderedPartElements}
        </div>
      );
    });
  };

  const clearChat = () => {
    if (user) {
      triggerNewSession();
    } else {
      setIsHeaderCollapsed(false);
      setMessages([
        {
          id: "welcome",
          role: "model",
          text: "Habari! Welcome to Statpack's official ABRO Kenya & East Africa stock dictionary gateway. Statpack is the sole importer and distributor of genuine ABRO products in Kenya and East Africa. I am your dynamic AI Sales & Spec assistant. Ask me anything about our sealants, gasket makers, aerosol spray paints, or car wash specs. I can provide specs and details for any product. Please keep in mind: our Minimum Order Quantity (MOQ) is strictly 10 Cartons (no loose pieces are sold, 10 CTN minimum limit).",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  };

  // Microphone voice activation
  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice speech services are not supported inside this frame. Please type manually.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => prev + (prev ? " " : "") + transcript);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  };

  // File selection triggering
  const triggerFileSelector = () => {
    fileInputRef.current?.click();
  };

  // Process selected or dropped image files
  const processFiles = async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (validFiles.length === 0) return;

    const spacesLeft = 3 - attachedImages.length;
    if (validFiles.length > spacesLeft) {
      alert("Maximum of 3 images can be attached simultaneously.");
    }

    const filesToProcess = validFiles.slice(0, Math.max(0, spacesLeft));
    if (filesToProcess.length === 0) return;

    try {
      const compressedResults = await Promise.all(
        filesToProcess.map((file) => compressAndResizeImage(file))
      );

      const validNewImages = compressedResults.filter((img): img is string => typeof img === "string" && img.length > 0);
      if (validNewImages.length > 0) {
        setAttachedImages((prev) => {
          const combined = [...prev, ...validNewImages];
          return combined.slice(0, 3);
        });
      }
    } catch (err) {
      console.error("Error compressing attached files:", err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col h-full w-full flex-1 min-h-0 rounded-none sm:rounded-2xl border-0 sm:border shadow-xl overflow-hidden transition-colors duration-300 relative ${
        theme === "dark"
          ? "bg-[#171717] border-white/10 text-white"
          : "bg-white border-slate-200 text-slate-850"
      }`} 
      id="chat-agent-card"
    >
      {/* Absolute fullscreen elegant drag and drop overlay */}
      {isDragging && (
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 backdrop-blur-md border-4 border-dashed border-[#00A859] rounded-2xl select-none m-1.5 cursor-copy"
          id="chat-drag-drop-overlay"
        >
          <div className="w-16 h-16 bg-white/5 border-2 border-dashed border-[#00A859] rounded-2xl flex items-center justify-center mb-4 text-[#00A859] animate-bounce">
            <Image className="w-8 h-8" />
          </div>
          <p className="text-white text-base font-black tracking-tight uppercase">
            Drop your ABRO product pictures here
          </p>
          <p className="text-indigo-300 text-xs mt-1.5 font-extrabold uppercase tracking-wide">
            Attach up to 3 images for specs comparison or authenticity checks
          </p>
        </div>
      )}
      
      {/* Header Panel */}
      <div className={`px-3 sm:px-5 border-b flex items-center justify-between transition-all duration-300 ease-in-out shrink-0 ${
        isHeaderCollapsed ? "py-1.5" : "py-2 sm:py-3"
      } ${
        theme === "dark"
          ? "bg-[#212121] border-white/10"
          : "bg-[#00a859]/5 border-slate-200"
      }`}>
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="relative">
            <div className={`rounded-xl flex items-center justify-center shadow-md border transition-all duration-300 ease-in-out ${
              isHeaderCollapsed ? "w-7 h-7" : "w-8 h-8 sm:w-9 sm:h-9"
            } ${
              theme === "dark" ? "bg-slate-900 border-white/10" : "bg-slate-100 border-slate-250"
            }`}>
              <QuadColorEmblem className={isHeaderCollapsed ? "w-4.5 h-4.5" : "w-5 h-5 sm:w-5.5 sm:h-5.5"} />
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 rounded-full bg-emerald-500 border-2 border-slate-900 transition-all duration-300 ease-in-out ${
              isHeaderCollapsed ? "w-2.5 h-2.5" : "w-2.5 h-2.5 sm:w-3 sm:h-3"
            }`}>
              <span className="w-1 h-1 rounded-full bg-white inline-block animate-ping absolute top-0.5 left-0.5" />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-black uppercase tracking-wider block transition-all duration-300 ${theme === "dark" ? "text-slate-100" : "text-[#016838]"}`}>
                ABRO® Kenya
              </span>
            </div>
            <span className={`font-bold transition-all duration-300 ease-in-out overflow-hidden ${
              isHeaderCollapsed ? "max-h-0 opacity-0 text-[0px] leading-none mt-0" : "max-h-5 opacity-100 text-[9px] leading-none mt-0.5"
            } ${theme === "dark" ? "text-indigo-400" : "text-[#016838]/85"}`}>
              Specs & Counterfeit Guide
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
          {user && (
            <button
              onClick={() => setIsSessionSidebarOpen(!isSessionSidebarOpen)}
              className={`p-1.5 sm:px-2 sm:py-1.5 rounded-lg border transition-all text-[11px] flex items-center space-x-1 cursor-pointer font-bold ${
                isSessionSidebarOpen
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : theme === "dark"
                    ? "bg-white/5 hover:bg-white/10 text-slate-200 border-white/5"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
              }`}
              title="Toggle Saved Chats Sidebar"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Saved Chats</span>
            </button>
          )}

          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className={`px-2 py-1 sm:py-1.5 rounded-lg border transition-all text-[11px] flex items-center space-x-1 cursor-pointer font-bold ${
                theme === "dark"
                  ? "bg-white/5 hover:bg-white/10 text-slate-200 border-white/5"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
              }`}
            >
              <span className="hidden sm:inline">{showSidebar ? "Minimize Specs" : "Maximize Chat"}</span>
              <span className="inline sm:hidden">{showSidebar ? "Specs" : "Chat"}</span>
            </button>
          )}

          <button
            onClick={clearChat}
            className={`p-1.5 sm:px-2 sm:py-1.5 rounded-lg border transition-all text-[11px] flex items-center space-x-1 cursor-pointer font-bold ${
              theme === "dark"
                ? "bg-white/5 hover:bg-white/10 text-slate-200 border-white/5"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
            }`}
            title="Reset active thread conversation"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">Clear</span>
          </button>

          {user ? (
            <div className="flex items-center space-x-1.5 border-l border-slate-250 dark:border-white/10 pl-1.5">
              <img
                src={user.photoURL || ""}
                alt={user.displayName || "User"}
                className="w-5 h-5 rounded-full border border-emerald-500/40 object-cover hidden md:inline"
                referrerPolicy="no-referrer"
              />
              <button
                onClick={handleSignOut}
                className={`py-1 px-1.5 sm:px-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  theme === "dark"
                    ? "bg-red-950/25 hover:bg-red-900/40 text-red-400 border-red-500/10"
                    : "bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                }`}
                title={`Signed in as ${user.displayName || user.email}`}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              className={`px-2.5 py-1 sm:py-1.5 rounded-lg border text-[10.5px] sm:text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 cursor-pointer transition-all ${
                theme === "dark"
                  ? "bg-[#00a859]/15 hover:bg-[#00a859]/25 border-[#00a859]/40 text-emerald-300 hover:text-white"
                  : "bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800"
              }`}
              title="Sign in with your Google account"
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Sign In</span>
            </button>
          )}

          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className={`px-2 sm:px-2.5 py-1.5 rounded-lg border transition-all text-[11px] flex items-center space-x-1.5 cursor-pointer font-bold ${
                isExpanded
                  ? "bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-400/40 shadow-xs"
                  : theme === "dark"
                    ? "bg-white/5 hover:bg-white/10 text-slate-200 border-white/10 hover:border-emerald-500/30"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-250 hover:border-[#00A859]/30"
              }`}
              title={isExpanded ? "Minimize to floating window (Press Esc)" : "Expand to full screen"}
              id="chat-header-toggle-expand-btn"
              aria-label={isExpanded ? "Exit Fullscreen" : "Expand chat"}
            >
              {isExpanded ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="hidden sm:inline">Exit Fullscreen</span>
                  <span className="inline sm:hidden">Exit</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="hidden sm:inline">Expand</span>
                </>
              )}
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className={`px-2 sm:px-2.5 py-1.5 rounded-lg border transition-all text-[11px] flex items-center space-x-1.5 cursor-pointer font-bold ${
                theme === "dark"
                  ? "bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border-rose-500/30 hover:text-white"
                  : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-250"
              }`}
              title="Close AI Assistant (Press Esc)"
              id="chat-header-close-btn"
              aria-label="Close chat"
            >
              <X className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Close</span>
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className={`hidden sm:flex px-4 py-1.5 text-[11px] font-medium border-b items-center justify-between shrink-0 select-none ${
          theme === "dark" ? "bg-sky-950/40 border-sky-500/20 text-sky-200" : "bg-sky-50 border-sky-200 text-sky-900"
        }`}>
          <div className="flex items-center gap-1.5">
            <Minimize2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>
              <strong>Fullscreen View Active:</strong> Click <button type="button" onClick={onToggleExpand} className="underline font-bold hover:text-sky-300">Exit Fullscreen</button> or press <kbd className="px-1.5 py-0.5 rounded bg-black/30 border border-sky-400/40 text-[10px] font-mono">Esc</kbd> to minimize.
            </span>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="text-[11px] font-bold underline hover:opacity-80 cursor-pointer"
              >
                Minimize Window
              </button>
            )}
            {onClose && (
              <>
                <span className="opacity-40">•</span>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[11px] font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer"
                >
                  Close Chat
                </button>
              </>
            )}
          </div>
        </div>
      )}



      {apiKeyMissing && (
        <div className={`border-b px-6 py-3 flex items-start space-x-3 text-xs shrink-0 ${
          theme === "dark" ? "bg-amber-500/10 border-amber-500/20 text-amber-200" : "bg-amber-50 border-amber-500/30 text-amber-800"
        }`}>
          <ShieldAlert className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className={`font-semibold ${theme === "dark" ? "text-white" : "text-amber-900"}`}>Gemini API Key Required</p>
            <p className="leading-relaxed text-[11px] text-slate-600 dark:text-amber-100">
              Please open the **Settings** menu at the top right, navigate to **Secrets**, and define your server-only <code className="px-1 py-0.5 rounded font-mono font-bold">GEMINI_API_KEY</code>.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Backdrop overlay for mobile drawer */}
        {user && isSessionSidebarOpen && (
          <div 
            onClick={() => setIsSessionSidebarOpen(false)}
            className="md:hidden absolute inset-0 bg-black/50 backdrop-blur-xs z-40 transition-opacity duration-300"
            id="sidebar-mobile-backdrop"
          />
        )}

        {/* Collapsible Session History Panel */}
        {user && isSessionSidebarOpen && (
          <div className={`absolute md:static inset-y-0 left-0 z-50 w-64 border-r shrink-0 flex flex-col min-h-0 transition-all duration-300 shadow-2xl md:shadow-none ${
            theme === "dark" ? "bg-[#181818] border-white/5" : "bg-white border-slate-200"
          }`} id="sessions-history-sidebar">
            <div className="p-3 border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0">
              <span className="text-xs font-black uppercase tracking-wider flex items-center space-x-1.5 text-slate-500 dark:text-slate-400">
                <History className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Chat History</span>
              </span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={triggerNewSession}
                  className={`p-1.5 rounded-lg border flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all text-xs font-semibold ${
                    theme === "dark"
                      ? "bg-white/5 hover:bg-white/10 text-slate-200 border-white/5 hover:border-emerald-500/30"
                      : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700 hover:border-emerald-500/30"
                  }`}
                  title="Start a fresh conversation thread"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsSessionSidebarOpen(false)}
                  className={`md:hidden p-1.5 rounded-lg border flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all text-xs font-semibold ${
                    theme === "dark"
                      ? "bg-white/5 hover:bg-white/10 text-slate-200 border-white/5"
                      : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                  }`}
                  title="Close sidebar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
 
             {/* Scrollable list of active session docs */}
             <div className="flex-1 overflow-y-auto p-2 space-y-1">
               {isSyncing && sessions.length === 0 ? (
                 <div className="p-4 text-center text-xs text-slate-400">
                   <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1.5 text-slate-550" />
                   <span>Loading history...</span>
                 </div>
               ) : sessions.length === 0 ? (
                 <div className="p-6 text-center text-xs text-slate-450 italic leading-relaxed">
                   No saved conversations in cloud storage yet.
                 </div>
               ) : (
                 sessions.map((sess) => {
                   const isActive = currentSessionId === sess.id;
                   return (
                     <div
                       key={sess.id}
                       onClick={() => selectSession(sess.id)}
                       className={`group p-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-all border text-xs leading-snug ${
                         isActive
                           ? theme === "dark"
                             ? "bg-[#252525] border-emerald-500/20 text-emerald-400 font-extrabold"
                             : "bg-emerald-50 border-[#00A859]/20 text-[#016838] font-extrabold"
                           : theme === "dark"
                             ? "bg-transparent border-transparent hover:bg-white/5 text-slate-400 hover:text-white"
                             : "bg-transparent border-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                       }`}
                     >
                       <div className="flex items-center space-x-2 truncate pr-1">
                         <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-emerald-500" : "text-slate-400"}`} />
                         <span className="truncate pr-1">{sess.title || "ABRO Specs Inquiry"}</span>
                       </div>
                       <button
                         type="button"
                         onClick={(e) => deleteSession(sess.id, e)}
                         className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 dark:hover:text-rose-450 transition-all cursor-pointer shadow-sm shrink-0"
                         title="Delete conversation from server"
                       >
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                     </div>
                   );
                 })
               )}
             </div>
           </div>
         )}

        {/* Dynamic chat container on the right/center */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-transparent">
          {/* Messages Scroll viewport - styled with clean, proportional mobile spacing and portrait room */}
          <div 
            ref={messagesContainerRef}
            onScroll={handleScroll}
            id="chat-messages-scroll-area"
            className="flex-1 min-h-0 overflow-y-auto px-2.5 sm:px-4 py-2 sm:py-6 space-y-2.5 sm:space-y-4 bg-transparent select-text pb-4 chat-scroll-viewport"
            style={{ 
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              overscrollBehaviorY: "contain"
            }}
          >
        {messages.map((msg, index) => {
          // Streamlined welcome greeting: on empty state (messages.length === 1), show full card; once chatting, show compact top session indicator
          if (msg.id === "welcome") {
            if (messages.length > 1) {
              return (
                <div key={msg.id} className="py-2 text-center select-none opacity-80 hover:opacity-100 transition-opacity shrink-0">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold ${
                    theme === "dark" ? "bg-white/5 border-white/10 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-600"
                  }`}>
                    <QuadColorEmblem className="w-3.5 h-3.5" />
                    <span>Statpack ABRO® Assistant • Conversation Active</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className="max-w-xl mx-auto w-full py-2 sm:py-5 text-center px-2 sm:px-4 animate-in fade-in duration-300 shrink-0 select-none"
              >
                {/* Compact Emblem */}
                <div className={`inline-flex p-2 rounded-xl border shadow-xs mb-1.5 transition-all ${
                  theme === "dark" ? "bg-slate-900/90 border-white/10" : "bg-white border-slate-200"
                }`}>
                  <QuadColorEmblem className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                
                <h1 className={`text-sm sm:text-base font-black tracking-tight mb-1 ${theme === "dark" ? "text-white" : "text-slate-900"}`}>
                  Statpack ABRO® Kenya AI Assistant
                </h1>
                
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-3 leading-relaxed font-medium">
                  Official Sole Importer & Distributor in Kenya • Instant Technical Specs, Formulations & 10 CTN Wholesale Pricing
                </p>

                {/* 3 Quick Horizontal Pill Chips */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 max-w-lg mx-auto">
                  <button
                    type="button"
                    onClick={() => handleSendMessage("Can you provide technical specifications, heat limits, and application instructions for genuine ABRO Red Gasket Maker 999?")}
                    className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold border transition-all cursor-pointer hover:scale-[1.02] active:scale-95 shadow-xs ${
                      theme === "dark"
                        ? "bg-[#182333] hover:bg-[#202e42] text-slate-200 hover:text-white border-white/10 hover:border-emerald-500/40"
                        : "bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200 hover:border-emerald-500/40"
                    }`}
                  >
                    <span>🧪</span>
                    <span>Check Gasket 999 Specs</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendMessage("Please provide genuine wholesale carton pricing in KES for top ABRO products with 10 Carton MOQ.")}
                    className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold border transition-all cursor-pointer hover:scale-[1.02] active:scale-95 shadow-xs ${
                      theme === "dark"
                        ? "bg-[#182333] hover:bg-[#202e42] text-slate-200 hover:text-white border-white/10 hover:border-emerald-500/40"
                        : "bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200 hover:border-emerald-500/40"
                    }`}
                  >
                    <span>💰</span>
                    <span>10 CTN Wholesale Prices</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendMessage("Where are authentic ABRO Statpack distributor warehouses or authorized stockists located in Kenya?")}
                    className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold border transition-all cursor-pointer hover:scale-[1.02] active:scale-95 shadow-xs ${
                      theme === "dark"
                        ? "bg-[#182333] hover:bg-[#202e42] text-slate-200 hover:text-white border-white/10 hover:border-emerald-500/40"
                        : "bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200 hover:border-emerald-500/40"
                    }`}
                  >
                    <span>📍</span>
                    <span>Stockist Near Me</span>
                  </button>
                </div>
              </div>
            );
          }

          if (msg.role === "user") {
            return (
              <div key={msg.id} className="py-1 sm:py-2 max-w-2xl sm:max-w-3xl mx-auto w-full px-2 sm:px-4 flex justify-end">
                <div className="space-y-1 max-w-[92%] sm:max-w-[85%] text-right animate-in fade-in slide-in-from-bottom-2 duration-250">
                  {msg.images && msg.images.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 justify-end mb-1">
                      {msg.images.map((imgSrc, imgIdx) => (
                        <div key={imgIdx} className="p-1 rounded-xl bg-slate-950/20 border border-white/10 shadow-sm max-w-[110px] sm:max-w-[130px] inline-block relative group">
                          <img src={imgSrc} alt={`User Attachment ${imgIdx + 1}`} className="rounded-lg object-contain w-full max-h-20 sm:max-h-24" />
                        </div>
                      ))}
                    </div>
                  ) : msg.image ? (
                    <div className="p-1 rounded-xl bg-slate-950/20 border border-white/10 shadow-sm max-w-[200px] sm:max-w-[240px] inline-block mb-1 w-full scale-in-center">
                      <img src={msg.image} alt="User Attachment" className="rounded-lg object-contain w-full max-h-32 sm:max-h-36" />
                    </div>
                  ) : null}
                  <div
                    className={`px-3.5 py-2 sm:px-4.5 sm:py-2.5 rounded-2xl shadow-xs text-[12.5px] sm:text-[13.5px] border leading-relaxed text-left inline-block ${
                      theme === "dark"
                        ? "bg-[#253246] border-white/10 text-slate-100"
                        : "bg-slate-100 border-slate-200 text-slate-800"
                    }`}
                  >
                    {renderMessageContent(msg.text)}
                  </div>
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 block px-1.5">
                    {msg.timestamp || "Just now"}
                  </span>
                </div>
              </div>
            );
          }

          // Model / Assistant Row Layout with high-contrast card and unified low-noise action footer
          return (
            <div key={msg.id} className="py-2 sm:py-3 max-w-2xl sm:max-w-3xl mx-auto w-full px-2 sm:px-4 flex items-start space-x-2.5 sm:space-x-3.5">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs border transition-colors ${
                theme === "dark" ? "bg-slate-900 border-white/10" : "bg-white border-slate-200"
              }`}>
                <QuadColorEmblem className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </div>

              <div className={`flex-1 min-w-0 rounded-2xl p-3.5 sm:p-4.5 border transition-all ${
                theme === "dark"
                  ? "bg-[#182333]/90 border-white/10 text-slate-100 shadow-xs"
                  : "bg-white border-slate-200/90 text-slate-900 shadow-xs"
              }`}>
                {/* Assistant formatted text content */}
                <div className="text-[13px] sm:text-[14px] leading-relaxed select-text space-y-1">
                  {renderMessageContent(msg.text)}
                </div>

                {/* Grounding Sources (if present) */}
                {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-white/10 space-y-2">
                    <span className="text-[10px] font-extrabold text-[#00609C] dark:text-indigo-400 uppercase tracking-widest block">
                      📍 Verified Location & Grounding Sources
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                      {msg.groundingChunks.map((chunk, idx) => {
                        if (chunk.web) {
                          return (
                            <a
                              key={idx}
                              href={chunk.web.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-2 rounded-xl border text-xs flex items-center space-x-2 transition-all hover:scale-[1.01] ${
                                theme === "dark" 
                                  ? "bg-slate-900/50 border-white/5 hover:bg-slate-900 text-slate-350" 
                                  : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                              }`}
                            >
                              <span className="text-sm sm:text-base shrink-0">🌐</span>
                              <div className="truncate flex-1 min-w-0">
                                <p className="font-semibold truncate text-[11px] sm:text-xs">{chunk.web.title || "Source Link"}</p>
                                <p className="text-[9px] text-slate-400 truncate mt-0.5">{chunk.web.uri}</p>
                              </div>
                            </a>
                          );
                        }
                        if (chunk.maps) {
                          const snippets = chunk.maps.placeAnswerSources?.reviewSnippets;
                          return (
                            <div
                              key={idx}
                              className={`p-2.5 rounded-xl border text-xs space-y-1.5 col-span-1 sm:col-span-2 transition-all ${
                                theme === "dark" 
                                  ? "bg-[#016838]/10 border-[#016838]/20 text-slate-350" 
                                  : "bg-emerald-50/40 border-emerald-200/50 text-slate-705"
                              }`}
                            >
                              <a
                                href={chunk.maps.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold text-[#016838] dark:text-[#00A859] hover:underline flex items-center space-x-1.5 text-[12px] sm:text-[12.5px]"
                              >
                                <span>📍</span>
                                <span>{chunk.maps.title || "View on Google Maps"}</span>
                                <span className="text-[10px] font-normal text-slate-400">(View Location)</span>
                              </a>
                              {snippets && snippets.length > 0 && (
                                <div className="space-y-1 pl-3 sm:pl-4 border-l-2 border-emerald-500/20 text-[10.5px] sm:text-[11px] text-slate-500 dark:text-slate-400 italic">
                                  {snippets.map((snip: any, snipIdx: number) => (
                                    <p key={snipIdx}>"{snip.text || snip}"</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                )}

                {/* Consolidated Clean Action Footer: Timestamp, Quote Export pill, and Copy */}
                {(() => {
                  const priorUserMsg = index > 0 && messages[index - 1]?.role === "user" ? messages[index - 1]?.text : undefined;
                  const isDocRequested = isPriceOrDocRequested(msg.text, priorUserMsg);

                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2.5 border-t border-slate-200/50 dark:border-white/10 text-xs select-none">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                          {msg.timestamp || "Just now"}
                        </span>

                        {isDocRequested && (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10.5px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25">
                            <FileSpreadsheet className="w-3 h-3 shrink-0" />
                            <span className="hidden sm:inline text-[9.5px] uppercase tracking-wider">Quote:</span>
                            <button
                              type="button"
                              onClick={() => handleExportExcel(`ABRO_Quote_${msg.id.substring(0, 6)}`, msg.text)}
                              disabled={isExporting !== null}
                              className="hover:underline cursor-pointer font-black"
                              title="Download Excel Spreadsheet (.xlsx)"
                            >
                              Excel (.xlsx)
                            </button>
                            <span className="opacity-40">|</span>
                            <button
                              type="button"
                              onClick={() => handleExportWord(`ABRO_Report_${msg.id.substring(0, 6)}`, msg.text)}
                              disabled={isExporting !== null}
                              className="hover:underline cursor-pointer font-black"
                              title="Download Word Document (.docx)"
                            >
                              Word (.docx)
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.text)}
                        className={`inline-flex items-center space-x-1 px-2 py-1 rounded-lg text-[10.5px] font-medium transition-all cursor-pointer border ${
                          copiedMessageId === msg.id
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold"
                            : theme === "dark"
                              ? "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border-white/5"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200"
                        }`}
                        title="Copy message to clipboard"
                      >
                        {copiedMessageId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-400" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      {/* Quick Interactive Actions when navigation or exit is mentioned in the answer */}
                      {/exit|minimize|end expand|close/i.test(msg.text) && (onToggleExpand || onClose || onQuickSearch) && (
                        <div className="flex flex-wrap items-center gap-1.5 w-full mt-2 pt-2 border-t border-slate-200/40 dark:border-white/5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">One-Click Actions:</span>
                          {onToggleExpand && isExpanded && (
                            <button
                              type="button"
                              onClick={onToggleExpand}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/40 cursor-pointer shadow-xs transition-transform active:scale-95"
                            >
                              <Minimize2 className="w-3 h-3 text-sky-400" />
                              <span>Exit Fullscreen</span>
                            </button>
                          )}
                          {onClose && (
                            <button
                              type="button"
                              onClick={onClose}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/40 cursor-pointer shadow-xs transition-transform active:scale-95"
                            >
                              <X className="w-3 h-3 text-rose-400" />
                              <span>Close Chat</span>
                            </button>
                          )}
                          {onQuickSearch && (
                            <button
                              type="button"
                              onClick={() => onQuickSearch("")}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 cursor-pointer shadow-xs transition-transform active:scale-95"
                            >
                              <LayoutGrid className="w-3 h-3 text-emerald-400" />
                              <span>Return to Catalog</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="py-2.5 sm:py-4 max-w-2xl sm:max-w-3xl mx-auto w-full px-2 sm:px-4 flex items-start space-x-2 sm:space-x-3.5">
            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 border bg-slate-900 border-white/10`}>
              <QuadColorEmblem className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl border flex items-center space-x-1.5 ${
              theme === "dark" ? "bg-white/5 border-white/10" : "bg-slate-100 border-slate-200"
            }`}>
              <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-[#00A859]" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-[#016838]" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce bg-[#E01A22]" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Quick Return to Bottom Pill (Mobile & Tablet) */}
      {isUserScrolledUp && (
        <button
          type="button"
          onClick={() => {
            setIsUserScrolledUp(false);
            scrollToBottom(true, true);
          }}
          className="absolute bottom-20 right-4 sm:right-6 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-white text-xs font-bold shadow-xl border border-white/20 transition-all active:scale-95 animate-in fade-in slide-in-from-bottom-2 cursor-pointer"
          aria-label="Scroll to newest messages"
        >
          <ArrowDown className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
          <span>Latest Messages</span>
        </button>
      )}

      {/* Persistent, Non-Blocking Bottom Control Bar with High Contrast on Mobile */}
      <div 
        className={`relative z-30 shrink-0 w-full border-t backdrop-blur-xl transition-all duration-200 ${
          theme === "dark" 
            ? "bg-[#121c2b]/98 border-white/15 shadow-[0_-8px_32px_rgba(0,0,0,0.6)]" 
            : "bg-white/98 border-slate-200/90 shadow-[0_-6px_24px_rgba(0,0,0,0.06)]"
        }`}
        id="chat-sticky-bottom-bar"
      >
        <div className={`max-w-2xl sm:max-w-3xl mx-auto w-full px-2 sm:px-4 pt-1.5 sm:pt-2 transition-all duration-150 ${
          isVirtualKeyboardOpen || isFocused ? "pb-1 sm:pb-2" : "pb-[max(0.6rem,env(safe-area-inset-bottom))]"
        }`}>
          
          {/* Attached images preview inline inside the sticky panel */}
          {attachedImages.length > 0 && (
            <div className={`p-2 mb-2 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
              theme === "dark" ? "bg-[#1a2638] border-white/10" : "bg-slate-50 border-slate-250"
            }`} id="image-attachments-container">
              <div className="flex flex-wrap items-center gap-2">
                {attachedImages.map((imgData, imgIdx) => (
                  <div key={imgIdx} className="relative shrink-0 group">
                    <img src={imgData} alt={`Attachment ${imgIdx + 1}`} className="w-11 h-11 object-cover rounded-lg border border-slate-300 dark:border-white/10" />
                    <button
                      type="button"
                      onClick={() => setAttachedImages((prev) => prev.filter((_, idx) => idx !== imgIdx))}
                      className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-rose-700 hover:scale-105 transition-all cursor-pointer shadow-sm border border-white/20"
                      title="Remove this image"
                    >
                      <span className="text-[10px] leading-none font-black">✕</span>
                    </button>
                  </div>
                ))}
                <div className="ml-1.5 flex flex-col">
                  <span className={`text-[10px] uppercase tracking-wider font-black ${theme === "dark" ? "text-emerald-400" : "text-[#00A859]"}`}>
                    {attachedImages.length} of 3 images loaded
                  </span>
                  <span className="text-[9px] text-slate-400 dark:text-slate-400 font-medium">
                    Active for authenticity and product specs mapping
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedImages([])}
                className="text-[10px] text-rose-500 hover:text-rose-400 font-bold tracking-wide uppercase self-end sm:self-center hover:underline cursor-pointer"
              >
                Remove All
              </button>
            </div>
          )}

          {/* Collapsible Secondary Tools Popover (Model & Maps Grounding) */}
          {showToolsMenu && (
            <div className={`mb-2 p-2.5 rounded-2xl border shadow-xl flex flex-wrap items-center justify-between gap-2.5 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150 z-30 ${
              theme === "dark" 
                ? "bg-[#182333] border-white/15 text-slate-200 shadow-slate-950/60" 
                : "bg-white border-slate-200 text-slate-800 shadow-lg"
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wide">Model:</span>
                <select
                  value={selectedModel}
                  onChange={(e) => {
                    const newModel = e.target.value;
                    setSelectedModel(newModel);
                    try { localStorage.setItem("abro_selected_model", newModel); } catch {}
                  }}
                  className={`bg-transparent text-xs font-bold border rounded-lg px-2 py-1 cursor-pointer focus:outline-none ${
                    theme === "dark" ? "bg-slate-900 border-white/10 text-white" : "bg-slate-50 border-slate-250 text-slate-900"
                  }`}
                  title="Select Gemini Engine Mode"
                >
                  <option value="gemini-3.1-flash-lite" className={theme === "dark" ? "bg-slate-900 text-amber-400" : "bg-white text-amber-700"}>⚡ Flash 3.1 Lite (Recommended - High Availability)</option>
                  <option value="gemini-flash-latest" className={theme === "dark" ? "bg-slate-900 text-emerald-400" : "bg-white text-emerald-700"}>🚀 Flash Latest (High Throughput)</option>
                  <option value="gemini-3.8-flash" className={theme === "dark" ? "bg-slate-900 text-sky-400" : "bg-white text-sky-700"}>🧠 Flash 3.8 (High Intelligence)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUseMaps(!useMaps)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    useMaps
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-bold"
                      : theme === "dark"
                        ? "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"
                        : "bg-slate-100 border-slate-250 text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>📍 Maps: {useMaps ? (userLocation ? "Live 🟢" : "Active") : "Off"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowToolsMenu(false)}
                  className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 cursor-pointer"
                  title="Close tools menu"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Quick Suggestions Strip - Always easily accessible on mobile, tablet & desktop */}
          {!isVirtualKeyboardOpen && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 mb-1 select-none text-[11px] touch-pan-x" id="chat-quick-suggestions-bar">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 shrink-0 flex items-center gap-1 pl-0.5">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                <span>Suggestions:</span>
              </span>
              <button
                type="button"
                onClick={() => handleSendMessage("Can you provide technical specifications, heat limits, and application instructions for genuine ABRO Red Gasket Maker 999?")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-all cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0 ${
                  theme === "dark"
                    ? "bg-[#182333] hover:bg-[#202e42] text-slate-200 border-white/10 hover:border-emerald-500/40"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-500/40 shadow-xs"
                }`}
              >
                <span>🧪</span>
                <span>Gasket 999 Specs</span>
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage("Please provide genuine wholesale carton pricing in KES for top ABRO products with 10 Carton MOQ.")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-all cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0 ${
                  theme === "dark"
                    ? "bg-[#182333] hover:bg-[#202e42] text-slate-200 border-white/10 hover:border-emerald-500/40"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-500/40 shadow-xs"
                }`}
              >
                <span>💰</span>
                <span>10 CTN Wholesale Prices</span>
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage("Where are authentic ABRO Statpack distributor warehouses or authorized stockists located in Kenya?")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-all cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0 ${
                  theme === "dark"
                    ? "bg-[#182333] hover:bg-[#202e42] text-slate-200 border-white/10 hover:border-emerald-500/40"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-500/40 shadow-xs"
                }`}
              >
                <span>📍</span>
                <span>Stockist Near Me</span>
              </button>
              <button
                type="button"
                onClick={() => handleSendMessage("How do I verify authentic ABRO products vs counterfeits in Kenya? What security marks should I look for?")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap transition-all cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0 ${
                  theme === "dark"
                    ? "bg-[#182333] hover:bg-[#202e42] text-slate-200 border-white/10 hover:border-emerald-500/40"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-500/40 shadow-xs"
                }`}
              >
                <span>🛡️</span>
                <span>Spot Counterfeits</span>
              </button>
            </div>
          )}

          {/* High-Contrast Input Bar Form */}
          <form
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                textareaRef.current?.focus();
              }
            }}
            onSubmit={(e) => {
              e.preventDefault();
              submitCurrentMessage(input);
            }}
            className={`flex items-end sm:items-center border-2 rounded-2xl p-1 sm:p-1.5 transition-all duration-200 cursor-text ${
            isFocused 
              ? theme === "dark"
                ? "bg-[#111a28] border-emerald-500 ring-2 ring-emerald-500/25 shadow-lg"
                : "bg-white border-[#00A859] ring-2 ring-[#00A859]/20 shadow-md"
              : theme === "dark"
                ? "bg-[#141e2e] border-slate-700 hover:border-slate-600 shadow-md"
                : "bg-white border-slate-300 hover:border-slate-400 shadow-xs"
          }`}>
            {/* File Attachment invisible input */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              multiple
              onChange={(e) => {
                if (e.target.files) {
                  processFiles(e.target.files);
                }
                e.target.value = "";
              }}
            />
            
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                handleInputChange(e);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`;
              }}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              onBlur={() => {
                setIsFocused(false);
                setTimeout(() => {
                  if (document.activeElement !== textareaRef.current) {
                    setIsVirtualKeyboardOpen(false);
                  }
                }, 150);
              }}
              enterKeyHint="send"
              inputMode="text"
              autoCapitalize="sentences"
              autoComplete="off"
              rows={1}
              placeholder={isListening ? "Listening... Speak now" : "Ask about genuine ABRO products, specs, or wholesale quotes..."}
              className={`flex-1 min-w-0 bg-transparent py-1.5 sm:py-2 pl-2 sm:pl-3 pr-1 text-base focus:outline-none transition-all resize-none max-h-24 sm:max-h-28 overflow-y-auto leading-relaxed ${
                theme === "dark" 
                  ? "text-white placeholder:text-slate-400 font-normal" 
                  : "text-slate-900 placeholder:text-slate-500 font-medium"
              }`}
              id="chat-message-input-textarea"
            />
   
            {/* Action triggers with High-Visibility Send Button */}
            <div className="flex items-center space-x-1 sm:space-x-1.5 pr-0.5 sm:pr-1 shrink-0 self-end sm:self-center">
              {/* Instant Clear Button */}
              {input.length > 0 && (
                <button
                  type="button"
                  onClick={() => setInput("")}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full transition-all cursor-pointer flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 ${
                    theme === "dark" 
                      ? "hover:bg-white/10 text-slate-300 hover:text-white" 
                      : "hover:bg-slate-200 text-slate-600 hover:text-slate-900"
                  }`}
                  title="Clear input"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Tools Popover Trigger Button */}
              <button
                type="button"
                onClick={() => setShowToolsMenu(!showToolsMenu)}
                className={`w-8 h-8 sm:w-8 sm:h-8 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 ${
                  showToolsMenu
                    ? "bg-indigo-600 text-white shadow-xs"
                    : theme === "dark"
                      ? "hover:bg-white/10 text-slate-300 hover:text-white"
                      : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                }`}
                title="AI Engine & Grounding Settings"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {/* Image attachment trigger */}
              <button
                type="button"
                onClick={triggerFileSelector}
                className={`w-8 h-8 sm:w-8 sm:h-8 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 ${
                  theme === "dark"
                    ? "hover:bg-white/10 text-slate-300 hover:text-white"
                    : "hover:bg-slate-100 text-slate-700 hover:text-slate-950"
                }`}
                title="Attach Product Photo"
              >
                <Image className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
   
              {/* Audio Speech activation */}
              <button
                type="button"
                onClick={startSpeechRecognition}
                className={`w-8 h-8 sm:w-8 sm:h-8 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 relative hover:scale-105 active:scale-95 ${
                  isListening
                    ? "bg-rose-600 text-white animate-pulse"
                    : theme === "dark"
                      ? "hover:bg-white/10 text-slate-300 hover:text-white"
                      : "hover:bg-slate-100 text-slate-700 hover:text-slate-950"
                }`}
                title={isListening ? "Listening... Speak now" : "Use Audio Dictation"}
              >
                <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {isListening && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                )}
              </button>
              
              {/* Enter hint label (desktop only) */}
              <div className={`hidden md:flex items-center space-x-0.5 text-[9px] font-mono select-none px-1.5 py-0.5 border rounded-md transition-opacity duration-200 ${
                input.trim().length > 0 ? "opacity-100" : "opacity-40"
              } ${
                theme === "dark" ? "text-slate-300 border-white/15 bg-white/5" : "text-slate-600 border-slate-300 bg-slate-50"
              }`}>
                <span>Enter</span>
                <CornerDownLeft className="w-2.5 h-2.5" />
              </div>
   
              {/* High-Visibility, Non-Disappearing Send Button */}
              <button
                type="submit"
                disabled={!input.trim() && attachedImages.length === 0}
                className={`w-9 h-9 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer select-none shrink-0 min-w-[36px] min-h-[36px] ${
                  input.trim() || attachedImages.length > 0
                    ? "bg-[#00A859] hover:bg-[#00924d] active:scale-95 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400/40"
                    : theme === "dark"
                      ? "bg-slate-800 text-slate-500 border border-slate-700/80 cursor-not-allowed opacity-60"
                      : "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60"
                }`}
                title="Send Message"
                id="chat-send-message-btn"
                aria-label="Send message"
              >
                <Send className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${input.trim() || attachedImages.length > 0 ? "text-white stroke-[2.5]" : ""}`} />
              </button>
            </div>
          </form>

          {/* Minimal Sub-Row: Tools Status + Wholesale Policy */}
          <div className={`flex items-center justify-between px-2 pt-1.5 text-[10.5px] text-slate-400 dark:text-slate-500 select-none ${
            isVirtualKeyboardOpen || isFocused ? "hidden" : "flex"
          }`}>
            <button
              type="button"
              onClick={() => setShowToolsMenu(!showToolsMenu)}
              className="inline-flex items-center gap-1.5 hover:text-slate-200 transition-colors cursor-pointer font-medium"
              title="Click to toggle AI Model & Maps Grounding"
            >
              <SlidersHorizontal className="w-3 h-3 text-emerald-500" />
              <span className="font-semibold text-slate-300 dark:text-slate-400">{modelConfig.label}</span>
              <span>•</span>
              <span className={useMaps ? "text-emerald-500 font-bold" : ""}>Grounding: {useMaps ? "On" : "Off"}</span>
            </button>
            <span className="truncate hidden sm:inline">Statpack Sole Importer • 10 CTN Wholesale MOQ</span>
          </div>
        </div>
      </div>

      </div>
      </div>
    </div>
  );
}
