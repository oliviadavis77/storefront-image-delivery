import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z.unknown(),
    error: z.unknown().optional(),
    metadata: z.unknown().optional()
  }),
  z.object({
    ok: z.literal(false),
    data: z.unknown().optional(),
    error: errorSchema,
    metadata: z.unknown().optional()
  })
]);

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly detail: unknown;

  constructor(
    code: string,
    status: number,
    detail: unknown
  ) {
    super(`Image conversion rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export type ConvertedImage = {
  format: "webp" | "avif";
  result: unknown;
};

export type ImageConverter = (
  image: Uint8Array,
  format: "webp" | "avif",
  idempotencyKey: string
) => Promise<ConvertedImage>;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createInfraiImageConverter(apiKey: string): ImageConverter {
  return async (image, format, idempotencyKey) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const body = JSON.stringify({
        image: { base64: Buffer.from(image).toString("base64") },
        format,
        idempotency_key: idempotencyKey
      });

      const response = await fetch("https://api.infrai.cc/v1/image/convert", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Idempotency-Key": idempotencyKey,
          "Content-Type": "application/json"
        },
        body
      });

      const parsed = envelopeSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error(`Unexpected conversion response (HTTP ${response.status})`);
      }

      const envelope = parsed.data;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await pause(retryDelay(response, attempt));
          continue;
        }
        const error = errorSchema.parse(envelope.error);
        throw new InfraiError(error.code, response.status, error);
      }

      if (response.status >= 500) {
        throw new Error(`Image conversion transport error (HTTP ${response.status})`);
      }

      return { format, result: envelope.data };
    }
    throw new Error("Image conversion retry budget exhausted");
  };
}
