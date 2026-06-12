import { z } from 'npm:zod@^4';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

export const listingDraftSchema = z.object({
  title: z.string().max(80),
  description: z.string(),
});

export type ListingDraft = z.infer<typeof listingDraftSchema>;

export interface ListingDraftInput {
  itemName: string;
  category: string;
  brand?: string | null;
  model?: string | null;
  partNumber?: string | null;
  conditionEstimate?: string | null;
  notableFlaws?: string[];
}

const SYSTEM_PROMPT = `You are a listing copywriter for a reseller app called FlipScanner.
Given details about a used item, write an eBay listing title and description.

Respond with ONLY a JSON object (no markdown, no commentary) matching exactly this shape:
{
  "title": "string, 80 characters or fewer, eBay-style keyword-rich title",
  "description": "string, a few short paragraphs describing the item, its condition, and any flaws"
}

The title must be 80 characters or fewer and should front-load brand, model, part number, and item
type so buyers searching for those terms find it. The description should be honest and specific about
condition and any notable flaws (don't hide them — buyers expect accurate disclosure), and should NOT
include a price or shipping details.`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUserPrompt(input: ListingDraftInput): string {
  const lines = [
    `Item: ${input.itemName}`,
    `Category: ${input.category}`,
    `Brand: ${input.brand ?? 'unknown'}`,
    `Model: ${input.model ?? 'unknown'}`,
    `Part number: ${input.partNumber ?? 'unknown'}`,
    `Condition: ${input.conditionEstimate ?? 'unknown'}`,
  ];

  if (input.notableFlaws && input.notableFlaws.length > 0) {
    lines.push(`Notable flaws: ${input.notableFlaws.join(', ')}`);
  } else {
    lines.push('Notable flaws: none observed');
  }

  return lines.join('\n');
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('Claude response did not contain a JSON object');
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function callAnthropic(prompt: string): Promise<unknown> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

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
        messages: [{ role: 'user', content: prompt }],
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

/** Generates an eBay listing title + description for an inventory item, with retry + timeout. */
export async function generateListingDraft(input: ListingDraftInput): Promise<ListingDraft> {
  const prompt = buildUserPrompt(input);
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callAnthropic(prompt);
      const messageSchema = z.object({
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
      });
      const message = messageSchema.parse(result);
      const textBlock = message.content.find((block) => block.type === 'text');
      if (!textBlock?.text) {
        throw new Error('Claude response contained no text block');
      }

      const parsed = extractJson(textBlock.text);
      return listingDraftSchema.parse(parsed);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to generate listing draft');
}
