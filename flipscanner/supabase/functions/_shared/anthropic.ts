import { z } from 'npm:zod@^4';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

export const identificationSchema = z.object({
  item_name: z.string(),
  category: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  part_number: z.string().nullable(),
  condition_estimate: z.enum(['new', 'like_new', 'good', 'fair', 'parts_only']),
  search_query: z.string(),
  notable_flaws: z.array(z.string()),
  id_confidence: z.number().min(0).max(1),
});

export type Identification = z.infer<typeof identificationSchema>;

const SYSTEM_PROMPT = `You are an item identification assistant for a reseller app called FlipScanner.
The user will show you a photo of an item found at a thrift store, junkyard, estate sale, or garage sale.

Identify the item and respond with ONLY a JSON object (no markdown, no commentary) matching exactly this shape:
{
  "item_name": "string",
  "category": "string",
  "brand": "string|null",
  "model": "string|null",
  "part_number": "string|null",
  "condition_estimate": "new|like_new|good|fair|parts_only",
  "search_query": "optimized eBay search string",
  "notable_flaws": ["string"],
  "id_confidence": 0.0
}

If the photo shows an automotive part, look closely for any stamped/printed part numbers, casting numbers,
or OEM/fitment labels and put the most useful one in "part_number" — this is critical for accurate pricing.
"search_query" should be a concise, high-signal eBay search string a buyer would use (brand + model/part
number + item type when known). "id_confidence" is your confidence in this identification from 0 to 1.
If you cannot identify the item with reasonable confidence, still return your best guess and set
"id_confidence" below 0.6.`;

interface IdentifyArgs {
  base64Image: string;
  mediaType: string;
  textHint?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAnthropic(args: IdentifyArgs): Promise<unknown> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const userContent: Array<Record<string, unknown>> = [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: args.mediaType,
        data: args.base64Image,
      },
    },
    {
      type: 'text',
      text: args.textHint
        ? `Additional context from the user: ${args.textHint}`
        : 'Identify this item.',
    },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('Claude response did not contain a JSON object');
  }
  return JSON.parse(text.slice(start, end + 1));
}

/** Calls Claude vision with retry + timeout, then validates the parsed result. */
export async function identifyItem(args: IdentifyArgs): Promise<Identification> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callAnthropic(args);
      const messageSchema = z.object({
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
      });
      const message = messageSchema.parse(result);
      const textBlock = message.content.find((block) => block.type === 'text');
      if (!textBlock?.text) {
        throw new Error('Claude response contained no text block');
      }

      const parsed = extractJson(textBlock.text);
      return identificationSchema.parse(parsed);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to identify item');
}
