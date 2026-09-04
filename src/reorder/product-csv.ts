import { ReorderValidationError } from "./amazon-url.js";

export interface ReorderProductCsvRow {
  rowNumber: number;
  productName: string;
  sku: string;
  variantSize: string;
  marketplaceCode: string;
  sellerId: string;
  asin: string;
  amazonSellerPdpUrl: string;
  imageUrl: string;
}

// TODO(ATTRIB-URL): Do not collect "Attribution-tagged Seller PDP URL" from Brand.
// After the Amazon Attribution / FC tagging API is confirmed, compose it from the Seller PDP.
const HEADER_ALIASES: Record<string, string> = {
  marketplace: "marketplace",
  "seller id": "seller id",
  "selling account": "seller id",
  "seller sku": "seller sku",
  sku: "seller sku",
  asin: "asin",
  "product title": "product title",
  "product name": "product title",
  "variant / size": "variant / size",
  "variant/size": "variant / size",
  "seller-specific amazon url": "seller-specific amazon url",
  "amazon-generated seller pdp url": "seller-specific amazon url",
  "product image url": "product image url",
  "product image": "product image url",
};

const REQUIRED_HEADERS = [
  "marketplace",
  "seller id",
  "seller sku",
  "asin",
  "product title",
  "variant / size",
  "seller-specific amazon url",
] as const;

function parseCells(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }

  if (quoted) throw new ReorderValidationError("CSV contains an unclosed quoted value");
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseReorderProductCsv(csv: unknown): ReorderProductCsvRow[] {
  if (typeof csv !== "string" || !csv.trim()) {
    throw new ReorderValidationError("Choose a non-empty CSV file");
  }
  const rows = parseCells(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2) {
    throw new ReorderValidationError("CSV must include a header and at least one product");
  }

  const headers = rows[0].map((header) => HEADER_ALIASES[header.trim().toLowerCase()] || header.trim().toLowerCase());
  const indexes = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter((header) => !indexes.has(header));
  if (missing.length) {
    throw new ReorderValidationError(`CSV is missing: ${missing.join(", ")}`);
  }
  if (rows.length > 501) {
    throw new ReorderValidationError("CSV import is limited to 500 products at a time");
  }

  const get = (cells: string[], header: string) => cells[indexes.get(header) ?? -1] || "";
  return rows.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    productName: get(cells, "product title"),
    sku: get(cells, "seller sku"),
    variantSize: get(cells, "variant / size"),
    marketplaceCode: get(cells, "marketplace").toUpperCase(),
    sellerId: get(cells, "seller id"),
    asin: get(cells, "asin"),
    amazonSellerPdpUrl: get(cells, "seller-specific amazon url"),
    imageUrl: get(cells, "product image url"),
  }));
}
