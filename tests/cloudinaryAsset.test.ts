import assert from "node:assert/strict";
import test from "node:test";
import { getManagedCloudinaryPublicId, getProductImagePublicId, isCloudinaryAccountImage } from "../src/cloudinaryAsset";

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
