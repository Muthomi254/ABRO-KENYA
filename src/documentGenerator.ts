import type * as DocxModule from "docx";
import { Product } from "./types";
import { calculatePricing } from "./utils";

/**
 * Native browser download utility for Blobs without external file-saver dependency
 */
function saveAs(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 150);
}

/**
 * Exports full or filtered ABRO stock catalog to a multi-sheet Excel (.xlsx) file.
 */
export async function generateCatalogExcel(products: Product[], fileName = "ABRO_Kenya_Official_Price_List") {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Master Price List ---
  const header = [
    "ITEM #",
    "SKU",
    "PRODUCT NAME",
    "CATEGORY",
    "PACKING (PCS/CTN)",
    "PIECE REFERENCE (+16% VAT) KES",
    "PIECE REFERENCE (INCL. 16% VAT) KES",
    "CARTON (+16% VAT) KES",
    "CARTON (INCL. 16% VAT) KES",
    "10 CTN ORDER TOTAL (+16% VAT) KES",
    "10 CTN ORDER TOTAL (INCL. 16% VAT) KES",
    "SPECIFICATIONS"
  ];

  const rows = products.map((p, idx) => {
    const pricing = calculatePricing(p.price, p.specs);
    const packing = pricing.packing || 12;
    const moq10ExVat = pricing.ctnExVat * 10;
    const moq10IncVat = pricing.ctnIncVat * 10;

    return [
      idx + 1,
      p.sku || "N/A",
      p.name || "N/A",
      p.category || "General",
      packing,
      Number(pricing.pcExVat.toFixed(2)),
      Number(pricing.pcIncVat.toFixed(2)),
      Number(pricing.ctnExVat.toFixed(2)),
      Number(pricing.ctnIncVat.toFixed(2)),
      Number(moq10ExVat.toFixed(2)),
      Number(moq10IncVat.toFixed(2)),
      p.specs || ""
    ];
  });

  const wsData = [
    ["STATPACK INDUSTRIES LTD - ABRO KENYA & EAST AFRICA"],
    ["OFFICIAL MASTER PRODUCT & WHOLESALE PRICE LIST (JUNE 2026)"],
    [`Generated on: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} | Currency: Kenyan Shillings (KES)`],
    [], // Blank separator
    header,
    ...rows
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws["!cols"] = [
    { wch: 8 },  // Item #
    { wch: 18 }, // SKU
    { wch: 42 }, // Name
    { wch: 24 }, // Category
    { wch: 18 }, // Packing
    { wch: 22 }, // Piece +VAT
    { wch: 24 }, // Piece Incl VAT
    { wch: 24 }, // Carton +VAT
    { wch: 26 }, // Carton Incl VAT
    { wch: 30 }, // 10 CTN +VAT
    { wch: 32 }, // 10 CTN Incl VAT
    { wch: 55 }  // Specs
  ];

  XLSX.utils.book_append_sheet(wb, ws, "ABRO Master Price List");

  // --- Sheet 2: Terms & Ordering Conditions ---
  const termsData = [
    ["ABRO KENYA / STATPACK COMMERCIAL TERMS & CONDITIONS"],
    [],
    ["Key Policy", "Details"],
    ["Sole Authorized Distributor", "Statpack Industries Ltd is the sole authorized importer and distributor of genuine ABRO USA products in Kenya & East Africa."],
    ["Minimum Order Quantity (MOQ)", "1 full carton per product. No loose pieces or partial cartons are sold."],
    ["Currency & Tax", "All wholesale prices are listed in Kenyan Shillings (KES). Kenya VAT rate is 16%."],
    ["Delivery", "Free delivery within Nairobi, Kiambu, and Thika for orders of at least 10 cartons; orders below 10 cartons are not eligible for free delivery."],
    ["Upcountry", "Delivery is handled in a case by case basis."],
    ["Authenticity & Anti-Counterfeit Notice", "Source exclusively from Statpack Industries Ltd or verified authorized dealers. Use the AI Assistant photo checker or contact Statpack directly for confirmation and ACA/KEBS reporting."],
    ["Direct Order Hotline", "Tel: +254 748 441 470 / +254 732 322 182 | Email: orders@statpack.co.ke | Website: https://statpack.co.ke/"],
    ["Head Office Location", "Statpack Industries Ltd, North Airport Road, Embakasi, P.O. Box 22015 - 00400, Nairobi, Kenya"]
  ];

  const wsTerms = XLSX.utils.aoa_to_sheet(termsData);
  wsTerms["!cols"] = [{ wch: 32 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsTerms, "Terms & Ordering Policy");

  // Generate Excel buffer and save
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `${fileName}_${Date.now().toString(36).toUpperCase()}.xlsx`);
}

/**
 * Exports full or filtered ABRO stock catalog to an official Word (.docx) document.
 */
export async function generateCatalogWord(products: Product[], documentTitle = "ABRO Kenya Price List & Specifications") {
  const docx = await import("docx");
  const { Document, Paragraph, TextRun, Table, TableRow, HeadingLevel, AlignmentType, WidthType, Packer } = docx;

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        createTableCell(docx, "No.", { isHeader: true, width: 800 }),
        createTableCell(docx, "SKU", { isHeader: true, width: 1600 }),
        createTableCell(docx, "Product Name & Specs", { isHeader: true, width: 3800 }),
        createTableCell(docx, "Packing", { isHeader: true, width: 1100 }),
        createTableCell(docx, "Piece Ref. (+VAT)", { isHeader: true, width: 1400 }),
        createTableCell(docx, "Piece Ref. (Incl. VAT)", { isHeader: true, width: 1500 }),
        createTableCell(docx, "Carton (Incl. VAT)", { isHeader: true, width: 1600 })
      ]
    }),
    ...products.map((p, idx) => {
      const pricing = calculatePricing(p.price, p.specs);
      const isEven = idx % 2 === 0;

      return new TableRow({
        children: [
          createTableCell(docx, String(idx + 1), { isEven, width: 800 }),
          createTableCell(docx, p.sku || "—", { isEven, width: 1600, bold: true }),
          createTableCell(docx, `${p.name}\n${p.specs ? `Specs: ${p.specs}` : ""}`, { isEven, width: 3800 }),
          createTableCell(docx, `${pricing.packing || 12} pcs`, { isEven, width: 1100 }),
          createTableCell(docx, `KES ${pricing.pcExVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { isEven, width: 1400 }),
          createTableCell(docx, `KES ${pricing.pcIncVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { isEven, width: 1500, bold: true }),
          createTableCell(docx, `KES ${pricing.ctnIncVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { isEven, width: 1600, bold: true })
        ]
      });
    })
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Corporate Title Header
          new Paragraph({
            text: "STATPACK INDUSTRIES LIMITED",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "SOLE AUTHORIZED DISTRIBUTOR OF GENUINE ABRO® USA IN KENYA & EAST AFRICA",
                bold: true,
                size: 20,
                color: "016838"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `${documentTitle.toUpperCase()}`,
                bold: true,
                size: 24,
                color: "00609C"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 150 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Date of Publication: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} | Currency: KES (Kenyan Shillings)`,
                italics: true,
                size: 18,
                color: "666666"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }),

          // Commercial Policies Highlight Box
          new Paragraph({
            text: "IMPORTANT COMMERCIAL & ORDERING GUIDELINES",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Minimum Order Quantity (MOQ): ", bold: true }),
              new TextRun("Minimum 1 full carton per product. No loose pieces or single units are sold.")
            ],
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Value Added Tax (VAT): ", bold: true }),
              new TextRun("All items are quoted in both +16% VAT and 16% VAT Inclusive prices.")
            ],
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Free Delivery: ", bold: true }),
              new TextRun("Available within Nairobi, Kiambu, and Thika for orders of at least 10 cartons.")
            ],
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• Delivery Terms: ", bold: true }),
              new TextRun("Free delivery within Nairobi, Kiambu, and Thika applies to orders of at least 10 cartons. Upcountry delivery is handled case by case.")
            ],
            spacing: { after: 300 }
          }),

          // Product Directory Table
          new Paragraph({
            text: "OFFICIAL WHOLESALE PRODUCT CATALOGUE",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 150 }
          }),
          new Table({
            rows: tableRows,
            width: {
              size: 100,
              type: WidthType.PERCENTAGE
            }
          }),

          // Authenticity & Anti-Counterfeit Notice
          new Paragraph({
            text: "OFFICIAL SOURCING & ANTI-COUNTERFEIT NOTICE",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 150 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Authorized Distribution: ", bold: true }),
              new TextRun("Statpack Industries Ltd is the sole authorized importer and distributor of genuine ABRO USA products in Kenya and East Africa. Source stock exclusively from Statpack Industries Ltd or verified authorized distributors.")
            ],
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Risks of Counterfeit Sealants: ", bold: true }),
              new TextRun("Using counterfeit ABRO Grey 999 gasket maker can cause severe engine and gasket failure, coolant or oil leaks, overheating, oxygen (O2) sensor and catalytic converter damage, costly repeat repairs, and zero warranty protection.")
            ],
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Verification & Reporting: ", bold: true }),
              new TextRun("Use our AI Assistant with clear front and back package photos for a preliminary check, or contact Statpack Industries Ltd directly for official confirmation and counterfeit reporting (ACA / KEBS Toll-Free 1545).")
            ],
            spacing: { after: 300 }
          }),

          // Corporate Contact Footer
          new Paragraph({
            text: "ORDER PLACEMENT & INQUIRIES",
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 300, after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Statpack Industries Ltd, North Airport Road, Embakasi, P.O. Box 22015 - 00400, Nairobi, Kenya\n", bold: true }),
              new TextRun("Telephone: +254 748 441 470 / +254 732 322 182 | Email: orders@statpack.co.ke | Website: https://statpack.co.ke/")
            ],
            spacing: { after: 200 }
          })
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `ABRO_Kenya_Price_List_${Date.now().toString(36).toUpperCase()}.docx`);
}

/**
 * Converts any custom text or AI response into a formal corporate Word Document (.docx).
 */
export async function generateCustomWordReport(title: string, content: string, userQuery?: string) {
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = await import("docx");
  const paragraphs = content.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return new Paragraph({ spacing: { after: 100 } });
    }
    if (trimmed.startsWith("###")) {
      return new Paragraph({
        text: trimmed.replace(/^###\s*/, ""),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 180, after: 80 }
      });
    }
    if (trimmed.startsWith("##")) {
      return new Paragraph({
        text: trimmed.replace(/^##\s*/, ""),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 100 }
      });
    }
    if (trimmed.startsWith("#")) {
      return new Paragraph({
        text: trimmed.replace(/^#\s*/, ""),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 150 }
      });
    }

    const isBullet = trimmed.startsWith("* ") || trimmed.startsWith("- ");
    const cleanText = isBullet ? trimmed.substring(2) : trimmed;

    // Handle basic bold markup
    const parts = cleanText.split(/\*\*([^*]+)\*\*/g);
    const textRuns = parts.map((part, idx) => {
      return new TextRun({
        text: part,
        bold: idx % 2 === 1,
        size: 21
      });
    });

    return new Paragraph({
      children: textRuns,
      bullet: isBullet ? { level: 0 } : undefined,
      spacing: { after: 80 }
    });
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "STATPACK INDUSTRIES LTD - ABRO KENYA",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "OFFICIAL TECHNICAL & SALES REPORT",
                bold: true,
                size: 20,
                color: "016838"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: title.toUpperCase(),
                bold: true,
                size: 24,
                color: "00609C"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated on: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
                italics: true,
                size: 18,
                color: "777777"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
          }),
          ...(userQuery ? [
            new Paragraph({
              children: [
                new TextRun({ text: "Client Inquiry / Request: ", bold: true, color: "00609C" }),
                new TextRun({ text: userQuery, italics: true })
              ],
              spacing: { after: 200 }
            })
          ] : []),
          ...paragraphs,
          new Paragraph({
            text: "— End of Report —\nStatpack Industries Ltd • Sole Authorized Importer & Distributor for ABRO in Kenya & East Africa",
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 100 }
          })
        ]
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const cleanFileName = title.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40);
  saveAs(blob, `${cleanFileName || "ABRO_Report"}_${Date.now().toString(36).toUpperCase()}.docx`);
}

/**
 * Extracts data/tables from an AI response text or custom rows into an Excel (.xlsx) file.
 */
export async function generateCustomExcelFromText(title: string, text: string, fallbackProducts: Product[] = []) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  // Check if text has table rows or items
  const lines = text.split("\n");
  const extractedRows: string[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.split("|").map(c => c.trim()).slice(1, -1);
      // Skip markdown divider row |---|---|
      if (!cells.every(c => /^[-:]+$/.test(c))) {
        extractedRows.push(cells);
      }
    }
  }

  if (extractedRows.length >= 2) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["STATPACK INDUSTRIES LTD - ABRO KENYA"],
      [title.toUpperCase()],
      [`Generated on: ${new Date().toLocaleDateString("en-GB")}`],
      [],
      ...extractedRows
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Quotation & Specs");
  } else {
    // If no explicit markdown table found, extract relevant products mentioned in text or export entire catalog
    const matchedProducts = fallbackProducts.filter(p => {
      const name = (p.name || "").toLowerCase();
      const sku = (p.sku || "").toLowerCase();
      return text.toLowerCase().includes(name) || text.toLowerCase().includes(sku);
    });

    const activeList = matchedProducts.length > 0 ? matchedProducts : fallbackProducts;
    return generateCatalogExcel(activeList, title.replace(/[^a-zA-Z0-9_-]/g, "_"));
  }

  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const cleanFileName = title.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40);
  saveAs(blob, `${cleanFileName || "ABRO_Quotation"}_${Date.now().toString(36).toUpperCase()}.xlsx`);
}

// Internal helper for docx table cell creation
function createTableCell(
  docx: typeof DocxModule,
  text: string,
  options: { isHeader?: boolean; isEven?: boolean; width?: number; bold?: boolean } = {}
) {
  const { TableCell, WidthType, ShadingType, BorderStyle, Paragraph, TextRun } = docx;
  const { isHeader = false, isEven = false, width, bold = false } = options;

  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: {
      type: ShadingType.CLEAR,
      color: "auto",
      fill: isHeader ? "016838" : (isEven ? "F9FAFB" : "FFFFFF")
    },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" }
    },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: isHeader || bold,
            color: isHeader ? "FFFFFF" : "1F2937",
            size: isHeader ? 19 : 18
          })
        ],
        spacing: { before: 80, after: 80 }
      })
    ]
  });
}
