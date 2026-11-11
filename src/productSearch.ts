export interface SearchableProduct {
  name?: string;
  sku?: string;
  category?: string;
  specs?: string;
  description?: string;
  usageInstructions?: string;
  unitSize?: string;
}

export interface RankedProduct<T extends SearchableProduct> {
  product: T;
  score: number;
}

const QUERY_ALIASES: Array<[RegExp, string]> = [
  [/\b(?:gasket ya grey|silicone ya 999|gasket ya kijivu|grey 999|gray 999)\b/g, "grey 999 gasket maker"],
  [/\b(?:dawa ya carb|dawa ya kusafisha kabureta|kabureta cleaner)\b/g, "carb choke cleaner"],
  [/\b(?:dawa ya kutu|spray ya kufungua nati|mafuta ya spray)\b/g, "ab 80 penetrating lubricant rust"],
  [/\b(?:tape ya masking|tape ya rangi|tape ya body work)\b/g, "masking tape"],
  [/\b(?:wax ya gari|polish ya kupaka gari|kung'arisha rangi)\b/g, "car wax polish"],
  [/\b(?:rangi ya spray|spray paint ya)\b/g, "spray paint"],
  [/\b(?:ab[\s-]?80)\b/g, "ab 80 lubricant"],
  [/\b(?:wd[\s-]?40)\b/g, "wd 40 lubricant penetrating rust"],
  [/\b(?:epoxi)\b/g, "epoxy"],
  [/\b(?:gaskit)\b/g, "gasket"],
  [/\b(?:silicon)\b/g, "silicone"],
  [/\b(?:carwash)\b/g, "car wash"],
  [/\b(?:polsh|detaling|dtailing)\b/g, "polish detailing"],
];

const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "best", "by", "can", "catalog",
  "do", "for", "from", "get", "give", "good", "have", "help", "i", "in", "is", "it",
  "me", "more", "my", "of", "on", "or", "please", "product", "products", "recommend",
  "show", "some", "suitable", "tell", "that", "the", "their", "there", "this", "to",
  "use", "used", "using", "want", "what", "which", "with", "work", "works", "you",
  "your", "price", "pricing", "cost", "much", "how", "for", "abro", "kenya",
]);

const TOKEN_ALIASES: Record<string, string[]> = {
  adhesive: ["glue", "bond"],
  cleaner: ["clean", "degreaser"],
  coolant: ["antifreeze"],
  epoxy: ["resin"],
  gasket: ["seal", "sealant"],
  lubricant: ["lube", "penetrant"],
  paint: ["color", "colour", "rangi"],
  polish: ["wax", "shine"],
  rust: ["corrosion"],
  silicone: ["silicon", "rtv"],
  tape: ["masking"],
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function expandQuery(query: string): string[] {
  let normalized = normalizeText(query);
  for (const [pattern, replacement] of QUERY_ALIASES) {
    normalized = normalized.replace(pattern, replacement);
  }

  const terms = new Set(tokenize(normalized));
  for (const term of [...terms]) {
    for (const alias of TOKEN_ALIASES[term] || []) {
      terms.add(alias);
    }
    if (term.endsWith("ies") && term.length > 5) terms.add(`${term.slice(0, -3)}y`);
    else if (term.endsWith("s") && !term.endsWith("ss") && term.length > 4) terms.add(term.slice(0, -1));
    if (term.endsWith("ing") && term.length > 6) terms.add(term.slice(0, -3));
    if (term.endsWith("er") && term.length > 5) terms.add(term.slice(0, -2));
  }

  return [...terms];
}

function normalizeSku(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function rankProducts<T extends SearchableProduct>(
  products: T[],
  query: string,
  limit = 4,
): RankedProduct<T>[] {
  const queryTerms = expandQuery(query);
  if (queryTerms.length === 0 || products.length === 0) return [];

  const searchableRecords = products.map((product) => {
    const nameTokens = new Set(tokenize(product.name || ""));
    const skuTokens = new Set(tokenize(product.sku || ""));
    const categoryTokens = new Set(tokenize(product.category || ""));
    const detailTokens = new Set(tokenize([
      product.specs,
      product.description,
      product.usageInstructions,
      product.unitSize,
    ].filter(Boolean).join(" ")));
    const allTokens = new Set([...nameTokens, ...skuTokens, ...categoryTokens, ...detailTokens]);
    return { product, nameTokens, skuTokens, categoryTokens, detailTokens, allTokens };
  });

  const documentFrequency = new Map<string, number>();
  for (const record of searchableRecords) {
    for (const token of record.allTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  const normalizedQuery = normalizeText(query);
  const querySku = normalizeSku(query);
  const isSkuQuery = /[0-9]/.test(querySku) && querySku.length >= 3;

  const ranked = searchableRecords.map((record) => {
    let score = 0;
    let matchedTerms = 0;
    let nameMatchedTerms = 0;
    let matchedWeight = 0;
    let totalWeight = 0;

    for (const term of queryTerms) {
      const frequency = documentFrequency.get(term) || 0;
      const idf = Math.min(5, 1 + Math.log((products.length + 1) / (frequency + 1)));
      const termWeight = idf;
      totalWeight += termWeight;

      let fieldWeight = 0;
      if (record.nameTokens.has(term)) {
        fieldWeight = 8;
        nameMatchedTerms++;
      } else if (record.skuTokens.has(term)) {
        fieldWeight = 7;
      } else if (record.categoryTokens.has(term)) {
        fieldWeight = 3;
      } else if (record.detailTokens.has(term)) {
        fieldWeight = 1.5;
      }

      if (fieldWeight > 0) {
        matchedTerms++;
        matchedWeight += termWeight;
        score += fieldWeight * idf;
      }
    }

    const normalizedName = normalizeText(record.product.name || "");
    const normalizedSku = normalizeSku(record.product.sku || "");
    const normalizedQueryWithoutStopWords = tokenize(normalizedQuery).join(" ");

    if (normalizedQueryWithoutStopWords.length > 2 &&
        normalizedName.includes(normalizedQueryWithoutStopWords)) {
      score += 30;
    }
    if (isSkuQuery && normalizedSku === querySku) {
      score += 100;
      matchedTerms = queryTerms.length;
      matchedWeight = totalWeight;
    } else if (isSkuQuery && normalizedSku.includes(querySku)) {
      score += 35;
    }

    const coverage = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    const minimumScore = queryTerms.length === 1 ? 3 : 5;
    const isExactNameQuery = normalizedQueryWithoutStopWords.length > 2 &&
      normalizedName.includes(normalizedQueryWithoutStopWords);
    const isSingleTermNameMatch = queryTerms.length === 1 && nameMatchedTerms > 0;
    const isRelevant = score >= minimumScore &&
      (coverage >= 0.45 || isExactNameQuery || isSingleTermNameMatch ||
        (isSkuQuery && normalizedSku.includes(querySku)));

    return {
      product: record.product,
      score,
      matchedTerms,
      nameMatchedTerms,
      coverage,
      isRelevant,
    };
  }).filter((result) => result.isRelevant)
    .sort((a, b) =>
      b.score - a.score ||
      b.nameMatchedTerms - a.nameMatchedTerms ||
      a.product.name?.localeCompare(b.product.name || "") || 0
    );

  if (ranked.length === 0) return [];

  const exactSkuMatch = ranked.find((result) =>
    normalizeSku(result.product.sku || "") === querySku
  );
  if (isSkuQuery && exactSkuMatch) {
    return [{ product: exactSkuMatch.product, score: exactSkuMatch.score }].slice(0, limit);
  }

  const bestScore = ranked[0].score;
  return ranked
    .filter((result, index) => index === 0 || result.score >= Math.max(5, bestScore * 0.3))
    .slice(0, limit)
    .map(({ product, score }) => ({ product, score }));
}
