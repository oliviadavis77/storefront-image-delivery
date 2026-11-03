import { createServer, type ServerResponse } from "node:http";
import { checkoutBodySchema, fulfillProductMedia } from "./order_media.ts";
import { createInfraiImageConverter, InfraiError } from "./infrai_image.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the checkout service");
const convert = createInfraiImageConverter(apiKey);

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/orders/checkout") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsed = checkoutBodySchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      send(response, 400, { error: "Invalid checkout body", issues: parsed.error.issues });
      return;
    }
    send(response, 201, await fulfillProductMedia(parsed.data, convert));
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, detail: error.detail });
      return;
    }
    send(response, 500, { error: "Checkout processing failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Checkout service listening on http://localhost:${port}`));
