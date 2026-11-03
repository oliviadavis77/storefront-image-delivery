import assert from "node:assert/strict";
import test from "node:test";
import { fulfillProductMedia } from "../src/order_media.ts";
import type { ImageConverter } from "../src/infrai_image.ts";

test("AVIF preference drives fulfillment and keeps WebP fallback", async () => {
  const calls: string[] = [];
  const convert: ImageConverter = async (_image, format, idempotencyKey) => {
    calls.push(`${format}:${idempotencyKey}`);
    return { format, result: { assetId: `asset-${format}` } };
  };

  const result = await fulfillProductMedia({
    orderId: "order-77",
    customerEmail: "studio@example.com",
    product: {
      sku: "canvas-12",
      title: "Studio Canvas",
      imageBase64: Buffer.from("pixels").toString("base64")
    },
    preferredFormat: "avif"
  }, convert);

  assert.equal(result.fulfillment.status, "media_ready");
  assert.equal(result.fulfillment.primaryFormat, "avif");
  assert.deepEqual(result.assets.map((asset) => asset.format), ["avif", "webp"]);
  assert.deepEqual(calls, [
    "avif:order-77:canvas-12:avif",
    "webp:order-77:canvas-12:webp"
  ]);
  assert.match(result.receipt.line, /avif \+ webp/);
  assert.equal(result.customerUpdate.status, "ready");
});
