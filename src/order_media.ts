import { z } from "zod";
import type { ConvertedImage, ImageConverter } from "./infrai_image.ts";

export const checkoutBodySchema = z.object({
  orderId: z.string().min(1),
  customerEmail: z.string().email(),
  product: z.object({
    sku: z.string().min(1),
    title: z.string().min(1),
    imageBase64: z.string().min(1)
  }),
  preferredFormat: z.enum(["webp", "avif"]).default("avif")
});

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;

export type OrderResult = {
  orderId: string;
  checkout: { status: "confirmed"; sku: string };
  fulfillment: { status: "media_ready"; primaryFormat: "webp" | "avif" };
  receipt: { to: string; line: string };
  customerUpdate: { status: "ready"; message: string };
  assets: ConvertedImage[];
};

export async function fulfillProductMedia(
  checkout: CheckoutBody,
  convert: ImageConverter
): Promise<OrderResult> {
  const image = Uint8Array.from(Buffer.from(checkout.product.imageBase64, "base64"));
  const formats: Array<"webp" | "avif"> = checkout.preferredFormat === "avif"
    ? ["avif", "webp"]
    : ["webp", "avif"];

  const assets = await Promise.all(
    formats.map((format) =>
      convert(image, format, `${checkout.orderId}:${checkout.product.sku}:${format}`)
    )
  );

  return {
    orderId: checkout.orderId,
    checkout: { status: "confirmed", sku: checkout.product.sku },
    fulfillment: { status: "media_ready", primaryFormat: formats[0] },
    receipt: {
      to: checkout.customerEmail,
      line: `${checkout.product.title} media prepared as ${formats.join(" + ")}`
    },
    customerUpdate: {
      status: "ready",
      message: `Order ${checkout.orderId} product media is ready.`
    },
    assets
  };
}
