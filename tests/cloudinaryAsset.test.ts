import assert from "node:assert/strict";
import test from "node:test";
import {
  getCloudinarySkuFallbackUrls,
  getCloudinaryThumbnailUrl,
  getManagedCloudinaryPublicId,
  getProductImageCandidates,
  getProductImagePublicId,
  isCloudinaryAccountImage,
  isCloudinaryDeliveryUrl,
  matchProductToCloudinaryAsset,
  normalizeImageUrl,
  resolveChatImageSources,
} from "../src/cloudinaryAsset";

test("extracts app-managed public ID from a Cloudinary delivery URL", () => {
  const url = "https://res.cloudinary.com/muthomi254/image/upload/c_fill,w_300/v1234567890/AbroKenya/abro_ab-12_123.jpg";
  assert.equal(getManagedCloudinaryPublicId(url, "muthomi254"), "AbroKenya/abro_ab-12_123");
});

test("extracts app-managed public ID regardless of the configured folder name", () => {
  const url = "https://res.cloudinary.com/muthomi254/image/upload/v1234567890/LegacyFolder/abro_sku_1.png";
  assert.equal(getManagedCloudinaryPublicId(url, "muthomi254"), "LegacyFolder/abro_sku_1");
});

test("does not treat external or non-app Cloudinary assets as managed", () => {
  assert.equal(
    getManagedCloudinaryPublicId("https://res.cloudinary.com/other/image/upload/folder/photo.jpg", "muthomi254"),
    null
  );
  assert.equal(
    getManagedCloudinaryPublicId("https://res.cloudinary.com/muthomi254/image/upload/folder/photo.jpg", "muthomi254"),
    null
  );
  assert.equal(
    isCloudinaryAccountImage("https://res.cloudinary.com.evil.example/muthomi254/image/upload/abro_sku.jpg", "muthomi254"),
    false
  );
});

test("generates stable public IDs for product SKUs", () => {
  assert.equal(getProductImagePublicId("AB-12 / X"), "abro_ab-12___x");
});

test("normalizes Cloudinary http URLs and encodes folder spaces", () => {
  assert.equal(
    normalizeImageUrl("http://res.cloudinary.com/muthomi254/image/upload/v123/Abro Kenya/abro_sp-1.jpg"),
    "https://res.cloudinary.com/muthomi254/image/upload/v123/Abro%20Kenya/abro_sp-1.jpg"
  );
  assert.equal(normalizeImageUrl("/api/products/1/image"), "/api/products/1/image");
  assert.equal(isCloudinaryDeliveryUrl("https://res.cloudinary.com/muthomi254/image/upload/a.jpg"), true);
  assert.equal(isCloudinaryDeliveryUrl("https://abro.com/wp-content/uploads/2020/07/a.jpg"), false);
});

test("builds deduplicated image candidate lists with Cloudinary SKU fallbacks", () => {
  const fallbacks = getCloudinarySkuFallbackUrls("CC-220", "muthomi254");
  assert.deepEqual(fallbacks, [
    "https://res.cloudinary.com/muthomi254/image/upload/f_auto,q_auto/AbroKenya/abro_cc-220",
    "https://res.cloudinary.com/muthomi254/image/upload/f_auto,q_auto/Abro%20Kenya/abro_cc-220",
    "https://res.cloudinary.com/muthomi254/image/upload/f_auto,q_auto/AbroKenya/abro_cc220",
    "https://res.cloudinary.com/muthomi254/image/upload/f_auto,q_auto/Abro%20Kenya/abro_cc220",
  ]);

  const withPrimary = getProductImageCandidates({
    id: "p1",
    sku: "CC-220",
    imageUrl: "http://res.cloudinary.com/muthomi254/image/upload/v1/Abro Kenya/abro_cc-220.jpg",
  });
  assert.equal(
    withPrimary[0],
    "https://res.cloudinary.com/muthomi254/image/upload/v1/Abro%20Kenya/abro_cc-220.jpg"
  );
  assert.equal(withPrimary.includes("/api/products/p1/image"), false);

  const withoutPrimary = getProductImageCandidates({
    id: "p2",
    sku: "CC-220",
    imageUrl: "",
  });
  assert.equal(withoutPrimary[0], "https://res.cloudinary.com/muthomi254/image/upload/f_auto,q_auto/AbroKenya/abro_cc-220");
  assert.equal(withoutPrimary[withoutPrimary.length - 1], "/api/products/p2/image");
});

test("matches Cloudinary assets across folder styles, suffixes, and display names without SKU collision", () => {
  const products = [
    { id: "1", sku: "BX-999", name: "ABRO Box Tape 999" },
    { id: "2", sku: "999", name: "ABRO Grey Gasket Maker 999" },
    { id: "3", sku: "VS-90-ST", name: "ABRO Vinyl Polish" },
  ];

  assert.equal(
    matchProductToCloudinaryAsset({ public_id: "Abro Kenya/abro_999_1730000000000" }, products)?.id,
    "2"
  );
  assert.equal(
    matchProductToCloudinaryAsset({ public_id: "AbroKenya/abro_bx-999_x1y2z3" }, products)?.id,
    "1"
  );
  assert.equal(
    matchProductToCloudinaryAsset({ public_id: "random_id_99", display_name: "ABRO Vinyl Polish" }, products)?.id,
    "3"
  );
  assert.equal(
    matchProductToCloudinaryAsset({ public_id: "unrelated_photo", context: { custom: { sku: "VS-90-ST" } } }, products)?.id,
    "3"
  );
});

test("resolves AI chat image URLs to catalog Cloudinary assets and SKU fallbacks", () => {
  const products = [
    {
      id: "p-999",
      sku: "999-AB",
      name: "Grey 999 Gasket Maker",
      imageUrl: "https://res.cloudinary.com/muthomi254/image/upload/v1/Abro%20Kenya/abro_999-ab.jpg",
    },
    {
      id: "p-sp",
      sku: "SP-400",
      name: "Spray Paint Gloss Black",
      imageUrl: "https://abro.com/wp-content/uploads/2020/07/SP-400.jpg",
    },
  ];

  // Replaces stale abro.com URL with catalog's live Cloudinary URL
  const fromStaleUrl = resolveChatImageSources(
    "Grey 999 Gasket Maker",
    "https://abro.com/wp-content/uploads/2020/07/999-AB.jpg",
    products
  );
  assert.equal(fromStaleUrl.matchedProduct?.id, "p-999");
  assert.equal(
    fromStaleUrl.primaryUrl,
    "https://res.cloudinary.com/muthomi254/image/upload/v1/Abro%20Kenya/abro_999-ab.jpg"
  );

  // Includes Cloudinary SKU fallbacks when catalog only has abro.com URL
  const withFallbacks = resolveChatImageSources(
    "Spray Paint Gloss Black",
    "https://abro.com/wp-content/uploads/2020/07/SP-400.jpg",
    products
  );
  assert.equal(withFallbacks.matchedProduct?.id, "p-sp");
  assert.ok(
    withFallbacks.candidateUrls.includes(
      "https://res.cloudinary.com/muthomi254/image/upload/f_auto,q_auto/AbroKenya/abro_sp-400"
    )
  );
});

test("builds width-constrained Cloudinary thumbnail URLs without breaking existing transforms or external URLs", () => {
  assert.equal(
    getCloudinaryThumbnailUrl("https://res.cloudinary.com/muthomi254/image/upload/v1789/Abro%20Kenya/abro_cc-220.jpg", 600),
    "https://res.cloudinary.com/muthomi254/image/upload/w_600,c_limit,f_auto,q_auto/v1789/Abro%20Kenya/abro_cc-220.jpg"
  );
  assert.equal(
    getCloudinaryThumbnailUrl("https://res.cloudinary.com/muthomi254/image/upload/f_auto,q_auto/AbroKenya/abro_cc-220", 600),
    "https://res.cloudinary.com/muthomi254/image/upload/f_auto,q_auto,w_600,c_limit/AbroKenya/abro_cc-220"
  );
  assert.equal(
    getCloudinaryThumbnailUrl("https://abro.com/wp-content/uploads/2020/07/SP-400.jpg", 600),
    "https://abro.com/wp-content/uploads/2020/07/SP-400.jpg"
  );
});

