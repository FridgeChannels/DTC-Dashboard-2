export const AMAZON_CATALOG_ITEM = "Amazon Catalog Item";
export const AMAZON_CATALOG_ITEMS = "Amazon Catalog Items";

export function catalogItemCopy(message: string): string {
  return message
    .replaceAll("Product Version", "Amazon Catalog Item Version")
    .replaceAll("Product Allocation", "Amazon Catalog Item Allocation")
    .replaceAll("Products", "Amazon Catalog Items")
    .replaceAll("a Product", "an Amazon Catalog Item")
    .replaceAll("A Product", "An Amazon Catalog Item")
    .replaceAll("Product", "Amazon Catalog Item");
}
