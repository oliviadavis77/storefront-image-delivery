import { fulfillProductMedia } from "./order_media.ts";
import type { ImageConverter } from "./infrai_image.ts";

const previewConverter: ImageConverter = async (_image, format, idempotencyKey) => ({
  format,
  result: { assetId: `preview-${format}`, idempotencyKey }
});

const result = await fulfillProductMedia({
  orderId: "order-1042",
  customerEmail: "maker@example.com",
  product: {
    sku: "poster-night-market",
    title: "Night Market Poster",
    imageBase64: Buffer.from("sample-product-image").toString("base64")
  },
  preferredFormat: "avif"
}, previewConverter);

console.log(JSON.stringify(result, null, 2));
