import * as XLSX from "xlsx";
import { 
  Document, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  HeadingLevel, 
  AlignmentType, 
  WidthType, 
  BorderStyle, 
  Packer,
  ShadingType
} from "docx";
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
export function generateCatalogExcel(products: Product[], fileName = "ABRO_Kenya_Official_Price_List") {
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Master Price List ---
  const header = [
    "ITEM #",
    "SKU",
    "PRODUCT NAME",
    "CATEGORY",
    "PACKING (PCS/CTN)",
    "PIECE (+16% VAT) KES",
    "PIECE (INCL. 16% VAT) KES",
    "CARTON (+16% VAT) KES",
    "CARTON (INCL. 16% VAT) KES",
    "10 CTN MOQ TOTAL (+16% VAT) KES",
    "10 CTN MOQ TOTAL (INCL. 16% VAT) KES",
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
    ["Minimum Order Quantity (MOQ)", "Strictly 10 Cartons minimum. No loose pieces or partial cartons are sold."],
    ["Currency & Tax", "All wholesale prices are listed in Kenyan Shillings (KES). Kenya VAT rate is 16%."],
    ["Delivery", "Free delivery within Nairobi, Kiambu, Thika."],
    ["Upcountry", "Delivery is handled in a case by case basis."],
    ["Counterfeit Protection (Grey 999)", "1. KEBS verification hologram on top right. 2. 'GENUINE GASKET MAKER 999 STATPACK' side weld text. 3. 'ABRO BRAND USA - STATPACK' rear card print."],
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
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        createTableCell("No.", { isHeader: true, width: 800 }),
        createTableCell("SKU", { isHeader: true, width: 1600 }),
        createTableCell("Product Name & Specs", { isHeader: true, width: 3800 }),
        createTableCell("Packing", { isHeader: true, width: 1100 }),
        createTableCell("Piece (+VAT)", { isHeader: true, width: 1400 }),
        createTableCell("Piece (Incl. VAT)", { isHeader: true, width: 1500 }),
        createTableCell("Carton (Incl. VAT)", { isHeader: true, width: 1600 })
      ]
    }),
    ...products.map((p, idx) => {
      const pricing = calculatePricing(p.price, p.specs);
      const isEven = idx % 2 === 0;

      return new TableRow({
        children: [
          createTableCell(String(idx + 1), { isEven, width: 800 }),
          createTableCell(p.sku || "—", { isEven, width: 1600, bold: true }),
          createTableCell(`${p.name}\n${p.specs ? `Specs: ${p.specs}` : ""}`, { isEven, width: 3800 }),
          createTableCell(`${pricing.packing || 12} pcs`, { isEven, width: 1100 }),
          createTableCell(`KES ${pricing.pcExVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { isEven, width: 1400 }),
          createTableCell(`KES ${pricing.pcIncVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { isEven, width: 1500, bold: true }),
          createTableCell(`KES ${pricing.ctnIncVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { isEven, width: 1600, bold: true })
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
              new TextRun("Strictly 10 Cartons minimum. No loose pieces or single units are sold.")
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
              new TextRun({ text: "• Delivery Terms: ", bold: true }),
              new TextRun("Delivery : Free delivery within Nairobi, Kiambu, Thika. Upcountry : Delivery is handled in a case by case basis.")
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

          // Authenticity Guidelines
          new Paragraph({
            text: "HOW TO IDENTIFY 100% GENUINE ABRO PRODUCTS",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 150 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "1. KEBS Verification Hologram: ", bold: true }),
              new TextRun("Located on the top-right corner of genuine blister packs with a unique alphanumeric code.")
            ],
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "2. Side Blister Bubble Ink Stamp: ", bold: true }),
              new TextRun("Features printed text along the clear bubble edge: 'GENUINE GASKET MAKER 999 STATPACK'.")
            ],
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "3. Rear Cardboard Base: ", bold: true }),
              new TextRun("Printed with 'GENUINE GREY 999 GASKET MAKER - ABRO BRAND USA - STATPACK'.")
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
export function generateCustomExcelFromText(title: string, text: string, fallbackProducts: Product[] = []) {
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
function createTableCell(text: string, options: { isHeader?: boolean; isEven?: boolean; width?: number; bold?: boolean } = {}) {
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
