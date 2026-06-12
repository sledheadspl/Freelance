import { z } from 'npm:zod@^4';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

export const discoverySchema = z.object({
  name: z.string(),
  category: z.string(),
  description: z.string(),
  confidence_grade: z.enum(['A', 'B', 'C', 'D']),
  notable_features: z.array(z.string()),
  next_steps: z.array(z.string()),
  search_query: z.string(),
});

export type Discovery = z.infer<typeof discoverySchema>;

const SYSTEM_PROMPT = `You are "Discover", a general-purpose identification assistant in the FlipScanner app.
The user will show you a photo of anything they found interesting — a rock, mineral, plant, piece of
driftwood or a branch, an animal track, terrain/soil, an old tool, or any other object.

Identify what's in the photo and respond with ONLY a JSON object (no markdown, no commentary) matching
exactly this shape:
{
  "name": "string - your best identification, e.g. 'Rose quartz' or 'White oak branch'",
  "category": "string - broad category, e.g. 'mineral', 'wood', 'plant', 'tool', 'terrain'",
  "description": "string - 2-4 sentences of educational/historical context: what it is, common uses, why it might be interesting or valuable",
  "confidence_grade": "A|B|C|D - how confident you are in this identification (A = very confident, D = rough guess)",
  "notable_features": ["string - distinguishing visual features you observed"],
  "next_steps": ["string - simple things the person could do to verify or learn more, e.g. 'try a streak test', 'compare grain pattern to white oak references', 'check for magnetism with a fridge magnet'"],
  "search_query": "string - a concise eBay search string for this item if a similar specimen/material/object is commonly bought and sold (e.g. 'rose quartz tumbled stone', 'spalted maple burl wood slab'); use a generic-but-searchable term even if you're not sure this exact item has resale value"
}

Be honest about uncertainty — a photo alone cannot confirm mineral composition, wood species, or
whether something contains precious metal. Frame "next_steps" as practical, low-cost ways to get more
certainty, not as a guarantee of value. If you genuinely cannot identify the subject, still give your
best guess and set "confidence_grade" to "D".`;

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
      text: args.textHint ? `Additional context from the user: ${args.textHint}` : 'Identify this.',
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
export async function identifyDiscovery(args: IdentifyArgs): Promise<Discovery> {
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
      return discoverySchema.parse(parsed);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to identify discovery');
}
