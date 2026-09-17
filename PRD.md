# Product Requirements Document (PRD)
## Project: ABRO Kenya Customer AI & Product Dashboard
**Author: AI Studio Build Specialist**  
**Version:** 1.0.0  
**Status:** Under Review  

---

### Executive Summary & Context
**ABRO Kenya** is the official regional portal for genuine, premium-grade automotive and industrial care products formulated in the USA (imported and distributed exclusively by **Statpack Industries Ltd** in East Africa). 

The B2B/B2C marketplace faces three major structural bottlenecks:
1. **Unstructured Data Ingestion (The Spreadsheet Problem):** Price sheets, warehouse inventory databases, and product leaflets are distributed in chaotic, unformatted Excel sheets or plain-text catalogs. Matching SKUs, unit sizes, and multiple tax-adjusted prices manually is slow and error-prone.
2. **Technical Content Gap:** Basic sales sheets lack crucial specs, directions for use, and standardized category tags needed to educate trade customers (mechanics, merchants, buyers).
3. **Counterfeiting Risks:** The East African market is saturated with counterfeit gaskets, sealants, and premium sprays (specifically **ABRO Grey 999 Gasket Maker**). Customers struggle to verify genuine products.

This product solves these pain points by combining:
* At-source **Excel spreadsheet ingestion & unstructured text parsing** (mapping headers dynamically and cleaning prices).
* **Gemini LLM-driven Schema Enrichment** to automatically generate specifications, usage manuals, and standard category classifications.
* **Grounded Conversational Commerce Chat** with a built-in "Verification Inspector" enforcing wholesale constraints (carton-only units, dual +16% VAT invoicing, delivery limits) and checking uploaded photos for genuine holograms, bubble side-prints, and batch numbers.

---

### Part 1: Open Source & Third-Party System Research

Below is an exhaustive review of the existing APIs, Model Context Protocol (MCP) servers, TypeScript libraries, CLI utilities, and open-source projects that cover features similar to this dashboard.

#### 1. Spreadsheet & Complex Table Extractors
* **SheetJS (`xlsx`):** (Used in the application) The gold standard client-side browser parser. It excels at extracting raw cells but lacks semantic extraction (i.e., it doesn't recognize which column represents a price vs. a size on its own).
* **Unstructured.io:** An open-source PDF/Excel ingestion library that classifies document elements (tables, headers, text).
* **Datasette & `sqlite-utils` (by Simon Willison):** Excellent Python-based CLI utilities for immediately loading messy CSV/Excel sheets into relational SQLite tables, exploring them via a localized web server, and exposing rapid JSON APIs.

#### 2. LLM-Driven Schema Extraction & Structured Output Tech
* **Instructor (TypeScript/Python):** A powerful open-source library that wraps LLM calls with schema validators (like Zod or Pydantic) using JSON-schema or Function Calling. It handles retries automatically if the returned JSON doesn't conform to the exact parameters.
* **Vercel AI SDK (`generateObject`):** A modern TypeScript library providing a unified wrapper for schema extraction. It pairs an LLM with Zod structures, preventing malformed objects.
* **Marvin (by Prefect):** An open-source Python tool that turns unstructured logs, strings, and CSVs into structured, typed data objects with a simple decorator.

#### 3. Model Context Protocol (MCP) Servers
Model Context Protocol, spearheaded by Anthropic, is a standardized protocol enabling LLM agents to safely call databases, search engines, and business tools.
* **`mcp-server-sqlite` or `mcp-server-postgres`:** Standard backend MCP servers allowing LLMs to directly read and execute queries against dynamic inventory schemas.
* **`mcp-server-google-sheets` or `mcp-server-excel`:** Standard micro-servers exposing live sheets as grounded tools to Claude/Gemini.
* **Your App's MCP Potential:** Integrating the `@modelcontextprotocol/sdk` (TypeScript) directly into your Express backend would permit external customer-support agents or developer terminals to connect directly to `/api/mcp` and query your live stock, KES prices, and manuals dynamically.

#### 4. Grounding, RAG & Vector Search Engines
* **LlamaIndex.ts:** A leading TypeScript library designed to build RAG pipelines over static documents. Supports node parsing and vector embeddings.
* **In-Memory Semantic Directory (Our Architecture):** Because our dataset is a lean 100-300 SKU stock list, our application utilizes a **high-precision, zero-latency, in-memory directory compilation** injected as a system instruction string. This performs 10x faster and is much cheaper to run than a vector database (Pinecone/Weaviate), avoiding cold-starts and embedding latency.

#### 5. Barcode & Anti-Counterfeiting Validation Registries
* **Verified by GS1 (GS1 Registry Platform API):** The global standard API to verify physical product details. Companies query a barcode’s GTIN to verify the actual manufacturer, brand name, and global catalog images.
* **GS1 Digital Link (Standardized QR Codes):** Replaces classic barcodes with dynamic QR codes. When a consumer scans the QR code with their phone, it routes them to a secure web page (such as this app’s product detail sheet) indicating authenticity.
* **KEBS SMS Verification API (SMS to 5613):** A Kenyan government-maintained lookup database for import standardization marks.

---

### Part 2: Product Requirements Document (PRD)

#### 1. User Personas
* **Wholesale Sales Manager (B2B Admin):** Needs to instantly upload massive dealer spreadsheets, automatically categorize items, map prices correctly, and update delivery flat rates without typing specifications or manuals manually.
* **Trade Customer (Dealers, Garages, Mechanics):** Regular buyers who want to search the catalog, understand minimum carton limits, look up step-by-step directions for gasket curing times, and calculate prices including VAT.
* **Retail Consumers / Motorists:** Want to ask chat questions about which sealant fits their car radiator and verify whether the "Grey 999 Gasket Maker" they purchased from an independent shop is original or counterfeit.

---

#### 2. Functional Requirements

| Ref # | Feature | Description | Priority | Technical Dependency |
|---|---|---|---|---|
| **FR-1** | **Multi-Format Excel Ingestion** | Drag-and-drop file upload accepting `.xlsx`/`.csv` tables, compiling them into tabular preview matrices with custom visual column selection. | High | `xlsx`, React File API |
| **FR-2** | **Dynamic Column Mapper & Price Extractor** | Interactive mapping of spreadsheet columns (SKU, Name, Price, Category) protecting against raw text, unit sizes ("12oz", "5kg"), or duplicate codes. | High | Custom `parseCleanPrice` regex, React state |
| **FR-3** | **Automated AI Product Enricher** | Single-click enrichment utilizing Gemini to cross-reference ABRO USA data in parallel blocks, returning precise Category, Specifications, and step-by-step Usage instructions without overwriting original Excel prices. | High | `@google/genai` (Gemini 3.5 Flash) |
| **FR-4** | **Double-Invoiced Pricing Grid** | Visual catalog displaying piece-level and carton-level prices. Highlights exact numbers for Exclusive of VAT (+16%) and Inclusive of VAT (1.16x). | High | Tailwind CSS, state engines |
| **FR-5** | **Dynamic Context Rules Document** | Shared notepad editing `context_document.txt` in real time. Sets regional B2B parameters (Nairobi flat KES 1,000 shipping, wholesale minimums, free delivery threshold over KES 50k). | Medium | Express FS, raw text stream |
| **FR-6** | **Grounded AI Dealer Assistant** | Chatbot grounded simultaneously on the product dataset and context rules. Auto-enforces B2B rules (" Strictly Full Cartons Only", no loose quantities, KES currency constraints). | High | Gemini 3.5 Flash chat context |
| **FR-7** | **Visual Counterfeit Investigator** | Support chat accepts image attachments of physical products, executing multi-modal vision analysis matching core markers (KEBS hologram, magenta blister text, rear dashed box). | High | Gemini 3.5 Flash Vision, Base64 |
| **FR-8** | **Catalog CRUD Administration** | Direct database operations (Create, Read, Update, Delete) to modify stock list items manually when small changes occur, avoiding full re-uploads. | Medium | `/api/products/:id` endpoints |

---

#### 3. System Architecture & Data Flux

The full stack operates on a lightweight, secure React (Vite) + Express (Node) architecture running in unified container ports:

```
[ FRONTEND SPA (React + Vite) ]
     │
     ├── (User uploads Excel / Plaintext catalog) ──> Extracted via xlsx
     ├── (Dynamic Column Mapping Selection)
     │
     ├── [ /api/products/bulk ] ─> Merges / Repairs duplicate IDs (SKUs)
     ├── [ /api/enrich-products ] ─> Parallel Gemini call for Specs & Manuals
     ├── [ /api/chat ] ─────────────> Chat with Base64 Images of holograms
     │
[ BACKEND CORES (Express + fs Database) ]
     │
     ├── In-Memory Stock Syncing & Purging Filters
     ├── File System Persistence (data/products.json, data/context_document.txt)
     └── lazy-initialization of @google/genai client (Safeguards boot)
```

---

#### 4. Visual Layout & Theme Choices

The app implements a custom, highly professional **Space Slate & Industrial High-Contrast Theme**:
* **Outer Canvas:** Pure, spacious off-whites or charcoal slate boundaries mimicking clean Swiss manuals.
* **Color Accents:** Vibrant **Amber Gold (🌐 specs)**, **Forest Green (📖 manuals & carton status)**, and **Royal blue/Indigo** accents.
* **Typography Pairings:** Clean **Space Grotesk** headings paired with **JetBrains Mono / Fira Code** monospace values for financial numbers (KES, VAT calculations, SKUs, and indicators).
* **Visual Rhythm:** Balanced grid items, spacious negative margins, hover feedback on interactive rows, and smooth motion animations for transitions.

---

### Part 3: Roadmap & Future Upgrades

To scale this application toward an enterprise global B2B hub, we define three future phases:

#### Phase 1: Structured Interoperability (Next Stack Addition)
* **API Integration:** Migrate local `products.json` storage to a dynamic, indexed collection schema using **Firebase Firestore** or **PostgreSQL with Drizzle ORM**.
* **Model Context Protocol (MCP) Server Endpoint:** Expose a secure endpoint (`post /api/mcp`) running the standard MCP daemon. This allows global trade networks, distribution terminals, or sales representatives to query live ABRO stock, verify prices, and list directions directly inside their favorite developer tooling (e.g. Cursor, Claude Desktop, Gemini Workspace).

#### Phase 2: Barcode & Digital Link Validation
* **Scan-to-Match:** Integrate the standard React HTML5 Barcode/QR camera scanner. Let dealers scan an ABRO case barcode (UPC/EAN) on their phone, automatically pulling up the matching catalog SKU card, KES piece prices, and carton weights.
* **GS1 Digital Link Embedding:** Direct QR printing on packaging that routes consumers directly to this app's authentication module, instantly pre-filling product details for confirmation.

#### Phase 3: High-Precision Hologram Computer Vision
* **Custom Machine Learning Classifier:** Supplement Gemini's general vision capabilities with specific edge-based deep learning models trained exclusively on genuine vs. counterfeit KEBS hologram sticker orientations, micro-prismatic refraction shifts under light, and batch packaging welds to detect advanced digital duplicates.
