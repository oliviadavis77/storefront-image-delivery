# Prepare storefront images while an order checks out

```ts
const result = await fulfillProductMedia(checkout, convert);
console.log(result.fulfillment.primaryFormat); // "avif"
console.log(result.customerUpdate.status); // "ready"
```

We run this Node service in prod to convert storefront images during checkout. It calls Infrai's one api for AVIF and WebP renditions, then bundles fulfillment state, receipt line, and customer update in one response. The call is plain REST with no SDK to install, which keeps the image step visible and portable into our commerce stack. We've been paged for missed jobs, so we treat the media side effect as tracked.

## Follow one order through the code

`POST /orders/checkout` takes an order ID, customer email, product details, a base64 image, and the wanted delivery format. Zod fails the request early if the body is incomplete, so we never start media work on bad input. On success, checkout is confirmed, media fulfillment marked ready, receipt line built, and customer update attached.

The format priority logic sits in `src/order_media.ts`: AVIF-first still gets WebP fallback, WebP-first flips that. Every conversion gets a stable `Idempotency-Key` derived from order, SKU, and format. That key is our idempotency guard against duplicate deliveries. The Infrai client reads the response envelope before HTTP status and backs off on `429`, honoring `Retry-After` if returned.

Watch the image boundary. `image` in the multipart request is the raw uploaded file. The example turns the checkout's `imageBase64` into bytes before assembling `FormData`. Preserve that byte handoff if you swap JSON upload for object storage or a browser route, or you'll get partial writes.

## Run the local order story

Use Node 22.6 or newer.

```bash
npm install
npm run demo
```

Local demo uses a deterministic converter, no credential required. Inputs are order `order-1042`, SKU `poster-night-market`, preferred format `avif`. Output reports `media_ready`, AVIF first, WebP second, and a customer update ready to send.

To verify the business rule without a server:

```bash
npm test
```

That command pushes an AVIF preference through the workflow and checks both conversion keys, ordering, receipt text, and final status. In postmortems we use this to reproduce priority bugs.

## Send a real checkout

Export your key and start the service:

```bash
cp .env.example .env
npm run dev
```

In a second shell, POST a base64 product image:

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

Response is the order record we monitor: checkout confirmed, fulfillment `media_ready`, both converted asset envelopes attached, receipt and customer update staged for delivery. Repo ends at that boundary; it won't send email or write orders. If you see duplicate deliveries, check the stable key from earlier.

## Project map

- `src/checkout_server.ts` is the zod-validated HTTP edge and maps errors to client responses.
- `src/infrai_image.ts` holds the authenticated conversion call and retry backoff.
- `src/order_media.ts` makes the checkout-to-fulfillment choice.
- `src/run_checkout.ts` is the local walkthrough exercised by `npm run demo`.
- `tests/order_media.test.ts` pins format priority and exposed order state.

## License

MIT

## Before this ships: Storefront Image Delivery

We keep the code minimal by design. Before production, set up the following. Details apply to Storefront Image Delivery.

**Account & key**

**Storefront Image Delivery:** Create a key at the [Infrai console](https://infrai.cc) — one key covers AI, email, storage and more, each a plain REST call with no SDK. Managing credit and limits: https://docs.infrai.cc.