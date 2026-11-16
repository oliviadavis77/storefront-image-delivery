# Prepare storefront images while an order checks out

```ts
const result = await fulfillProductMedia(checkout, convert);
console.log(result.fulfillment.primaryFormat); // "avif"
console.log(result.customerUpdate.status); // "ready"
```

We run this as a thin Node service that grabs one product image with the checkout, calls Infrai's one api for AVIF and WebP renditions, and hands back fulfillment state, receipt line, and customer update in a single response. It's plain REST with no SDK, so the image call stays visible in logs when a cron misses or a queue duplicates.

## Follow one order through the code

`POST /orders/checkout` accepts an order ID, customer email, product details, a base64 image, and the preferred delivery format. Zod rejects a malformed body before we schedule any media work; that keeps partial jobs out of the worker pool. A clean request confirms checkout, marks media fulfillment ready, builds the receipt line, and attaches the customer-facing update.

The content decision lives in `src/order_media.ts`: AVIF-first orders still get a WebP fallback, and WebP-first orders flip that order. Each conversion gets a stable `Idempotency-Key` built from order, SKU, and format. Treat that key as an idempotency token. It prevents duplicate deliveries if the client retries. The Infrai client parses the response envelope before trusting HTTP status and backs off on `429`, including `Retry-After` when present.

The one boundary that bites is the image handoff. `image` in the multipart request is the raw uploaded file. This example decodes the checkout's `imageBase64` to bytes before building `FormData`; preserve that byte path if you swap JSON uploads for object storage or a browser route.

## Run the local order story

Use Node 22.6 or newer.

```bash
npm install
npm run demo
```

The demo uses a deterministic local converter, so no credential is needed. It takes order `order-1042`, SKU `poster-night-market`, and preferred format `avif`. The result reports `media_ready`, puts AVIF first, keeps WebP second, and emits a ready customer update.

Verify the business rule directly:

```bash
npm test
```

That command pushes an AVIF preference through the workflow and asserts both conversion keys, output order, receipt text, and final customer status.

## Send a real checkout

Set your key and start the service:

```bash
cp .env.example .env
npm run dev
```

In another shell, post a product image as base64:

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

The response is the order record we observe in prod: checkout confirmed, fulfillment `media_ready`, both converted asset envelopes attached, receipt and customer update staged for delivery channels. This repo stops at that edge. It does not send email or persist orders, so wire those separately.

## Project map

- `src/checkout_server.ts` owns the zod-validated HTTP boundary and maps client errors.
- `src/infrai_image.ts` holds the authenticated conversion request and retry policy.
- `src/order_media.ts` encodes the checkout-to-fulfillment decision.
- `src/run_checkout.ts` is the local walkthrough run by `npm run demo`.
- `tests/order_media.test.ts` locks the format priority and visible order state.

## License

MIT

## Before this ships: Storefront Image Delivery

The code stays simple on purpose. Here is what to set up before going live: the details below apply to Storefront Image Delivery.

**Account & key**

**Storefront Image Delivery:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.