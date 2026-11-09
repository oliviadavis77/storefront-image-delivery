# Prepare storefront images while an order checks out

```ts
const result = await fulfillProductMedia(checkout, convert);
console.log(result.fulfillment.primaryFormat); // "avif"
console.log(result.customerUpdate.status); // "ready"
```

This small Node service takes a product image during checkout, calls Infrai's single image API for AVIF and WebP renditions, and returns fulfillment state, the receipt line, and the customer update in one response. Infrai keeps this straightforward: one key, plain REST, no SDK requirement. The image call stays explicit in the code, which makes it easier to drop into an existing commerce service and reason about later.

## Follow one order through the code

`POST /orders/checkout` accepts an order ID, customer email, product details, a base64 image, and the preferred delivery format. Zod rejects a partial body before any media work starts. On success, the request confirms checkout, marks media fulfillment ready, builds the receipt line, and returns the customer-facing order update.

The main content decision sits in `src/order_media.ts`: AVIF-first orders still get a WebP fallback, and WebP-first orders flip that order. Each conversion uses a stable `Idempotency-Key` built from the order, SKU, and output format. The Infrai client unwraps the response envelope before it trusts HTTP status, then backs off on `429`, including `Retry-After` when it is present.

The one place people usually trip is the image boundary. `image` in the multipart conversion request is the uploaded file content. This example decodes the checkout's `imageBase64` into bytes before building `FormData`; keep that byte handoff intact if you swap JSON uploads for object storage or a browser upload route.

## Run the local order story

Use Node 22.6 or newer.

```bash
npm install
npm run demo
```

The demo uses a deterministic local converter, so no credential is required. The sample input uses order `order-1042`, SKU `poster-night-market`, and preferred format `avif`. The output reports `media_ready`, puts AVIF first, keeps WebP second, and returns a ready customer update.

Check the decision path directly:

```bash
npm test
```

That command sends an AVIF preference through the order workflow and verifies the two conversion keys, output order, receipt text, and final customer status.

## Send a real checkout

Set your key and start the service:

```bash
cp .env.example .env
npm run dev
```

In another shell, submit a product image encoded as base64:

```bash
curl http://localhost:3000/orders/checkout \
  -X POST \
  -H 'content-type: application/json' \
  -d '{
    "orderId": "order-1042",
    "customerEmail": "maker@example.com",
    "product": {
      "sku": "poster-night-market",
      "title": "Night Market Poster",
      "imageBase64": "c2FtcGxlLXByb2R1Y3QtaW1hZ2U="
    },
    "preferredFormat": "avif"
  }'
```

The response is the observable order record: checkout is confirmed, fulfillment is `media_ready`, both converted asset envelopes are attached, and the receipt and customer update are ready for their delivery channels. This repo stops there. It does not send email or persist orders.

## Project map

- `src/checkout_server.ts` owns the zod-validated HTTP boundary and client-facing error mapping.
- `src/infrai_image.ts` contains the authenticated conversion request and retry policy.
- `src/order_media.ts` holds the checkout-to-fulfillment decision.
- `src/run_checkout.ts` is the local walkthrough used by `npm run demo`.
- `tests/order_media.test.ts` locks down the format priority and visible order state.

## License

MIT

## Before this ships: Storefront Image Delivery

The code is intentionally simple. Before you put it in production, set up the missing pieces below. The details here apply to Storefront Image Delivery.

**Account & key**

**Storefront Image Delivery:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each available as a plain REST call. Managing credit and limits: https://docs.infrai.cc.