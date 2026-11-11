import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'node:crypto';
import type { PurchaseRequirements, ProductCondition } from '../src/shared/types.ts';
import { isConsumableCategory, isComputingCategory, resolveClassification } from '../src/shared/categories.ts';

function getAiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function extractQuantityFromPrompt(prompt: string): number {
  const lower = prompt.toLowerCase();

  // Explicit keyword: "qty: 5", "quantity: 3", "quantity of 4"
  const explicitQty = lower.match(/(?:qty|quantity)\s*(?:of|:)?\s*(\d+)/i);
  if (explicitQty && explicitQty[1]) {
    const val = parseInt(explicitQty[1], 10);
    if (val > 0) return val;
  }

  // Word numbers map
  const wordMap: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  // Digits preceding nouns (with optional adjectives in between, e.g. "2 ergonomic chairs", "5 packs")
  const numUnit = lower.match(
    /\b(\d+)\s+(?:[\w-]+\s+){0,3}(?:packs?|units?|items?|bottles?|chairs?|boxes?|cartridges?|reams?|laptops?|tablets?|monitors?|switches?|drills?)\b/i
  );
  if (numUnit && numUnit[1]) {
    const val = parseInt(numUnit[1], 10);
    if (val > 0) return val;
  }

  // Word numbers preceding nouns (with optional adjectives in between, e.g. "two ergonomic chairs")
  const wordMatch = lower.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:[\w-]+\s+){0,3}(?:packs?|units?|items?|bottles?|chairs?|boxes?|cartridges?|reams?|laptops?|tablets?|monitors?|switches?|drills?)\b/i
  );
  if (wordMatch && wordMatch[1] && wordMap[wordMatch[1]]) {
    return wordMap[wordMatch[1]];
  }

  return 1;
}

export function extractTargetItemFromPrompt(prompt: string): string {
  let cleaned = prompt.trim();

  // Strip leading conversational phrases
  cleaned = cleaned.replace(
    /^(?:i\s+(?:need|want|am\s+looking\s+for|would\s+like)|please\s+(?:find|get|buy|search\s+for)|find|search\s+for|looking\s+for|buy|purchase|order|get|procure)\s+/i,
    ''
  );

  // Strip leading articles
  cleaned = cleaned.replace(/^(?:a|an)\s+/i, '');

  // Strip leading "new " if at the beginning of product phrase
  cleaned = cleaned.replace(/^new\s+/i, '');

  // Strip leading quantity phrases (e.g. "5 packs of copier paper" -> "copier paper", "2 ergonomic chairs" -> "ergonomic chairs")
  cleaned = cleaned.replace(
    /^(?:(?:[0-9]+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:packs?|units?|items?|bottles?|boxes?|cartridges?|reams?)\s*(?:of\s+)?)/i,
    ''
  );
  cleaned = cleaned.replace(
    /^(?:(?:[0-9]+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)/i,
    ''
  );

  // Strip budget clauses
  cleaned = cleaned.replace(
    /,?\s*(?:costing\s+no\s+more\s+than|budget\s*(?:max|ceiling|limit|of)?|costing|under|max|up\s+to|no\s+more\s+than)\s*(?:usd|\$)?\s*\d+(?:\.\d+)?(?:\s*usd)?/gi,
    ''
  );

  // Strip RAM clauses
  cleaned = cleaned.replace(
    /,?\s*(?:with\s+)?(?:at\s+least\s+)?\d+\s*(?:gb|gig|gigs)\s*(?:of\s+)?(?:ram|memory)/gi,
    ''
  );

  // Strip Storage clauses
  cleaned = cleaned.replace(
    /,?\s*(?:with\s+)?(?:at\s+least\s+)?\d+\s*(?:gb|tb)\s*(?:ssd|storage|hard\s*drive|drive)/gi,
    ''
  );

  // Strip Condition clauses
  cleaned = cleaned.replace(
    /,?\s*(?:and\s+)?(?:no\s+refurbished(?:\s+products)?|brand\s+new|new\s+only|not\s+refurbished)/gi,
    ''
  );

  // Clean trailing and leading punctuation / whitespace
  cleaned = cleaned.replace(/^[,.;:\s]+|[,.;:\s]+$/g, '').trim();

  return cleaned || prompt.trim();
}

export function inferCategoryFromItem(targetItem: string): string {
  const lower = targetItem.toLowerCase();

  // 1. Tablets (prioritized before furniture so "tablet" never matches "table")
  if (
    lower.includes('tablet') ||
    lower.includes('ipad') ||
    lower.includes('galaxy tab') ||
    lower.includes('surface pro') ||
    lower.includes('kindle fire')
  ) {
    return 'tablets';
  }

  // 2. Smartphones
  if (
    lower.includes('smartphone') ||
    lower.includes('iphone') ||
    lower.includes('galaxy s') ||
    lower.includes('pixel') ||
    lower.includes('mobile phone') ||
    lower.includes('cell phone')
  ) {
    return 'smartphones';
  }

  // 3. Monitors & Displays
  if (
    lower.includes('monitor') ||
    lower.includes('display') ||
    lower.includes('ultrawide') ||
    lower.includes('curved monitor')
  ) {
    return 'monitors';
  }

  // 4. Networking
  if (
    lower.includes('network') ||
    lower.includes('router') ||
    lower.includes('switch') ||
    lower.includes('access point') ||
    lower.includes('wifi')
  ) {
    return 'networking';
  }

  // 5. Laptop & Computers
  if (
    lower.includes('laptop') ||
    lower.includes('macbook') ||
    lower.includes('notebook') ||
    lower.includes('chromebook') ||
    lower.includes('thinkpad') ||
    lower.includes('computer') ||
    lower.includes('workstation') ||
    lower.includes('desktop') ||
    lower.includes('pc')
  ) {
    return 'laptop';
  }

  // 6. Paper & Office Supplies
  if (
    lower.includes('paper') ||
    lower.includes('pen') ||
    lower.includes('stationery') ||
    lower.includes('folder') ||
    lower.includes('binder')
  ) {
    return 'office supplies';
  }

  // 7. Cleaning & Janitorial Supplies
  if (
    lower.includes('clean') ||
    lower.includes('janitorial') ||
    lower.includes('soap') ||
    lower.includes('sanitizer') ||
    lower.includes('wipe') ||
    lower.includes('disinfect')
  ) {
    return 'cleaning supplies';
  }

  // 8. Maintenance Tools & Hardware
  if (
    lower.includes('tool') ||
    lower.includes('hardware') ||
    lower.includes('drill') ||
    lower.includes('screwdriver') ||
    lower.includes('wrench') ||
    lower.includes('hammer')
  ) {
    return 'maintenance tools';
  }

  // 9. Office Furniture (MUST NOT match tablet)
  if (
    lower.includes('furniture') ||
    lower.includes('chair') ||
    lower.includes('desk') ||
    (/\btables?\b/i.test(lower) && !lower.includes('tablet')) ||
    lower.includes('cabinet') ||
    lower.includes('bookshelf')
  ) {
    return 'office furniture';
  }

  return 'general procurement';
}

export async function extractRequirementsFromPrompt(prompt: string): Promise<PurchaseRequirements> {
  const reqId = `req_${crypto.randomUUID().slice(0, 8)}`;

  const ai = getAiClient();
  if (!ai) {
    console.warn('[GeminiService] GEMINI_API_KEY not configured. Using deterministic fallback parser.');
    return deterministicFallbackParser(prompt, reqId);
  }

  try {
    const generatePromise = ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `You are an AI purchasing policy extractor for corporate procurement in small businesses.
Analyze the following natural-language purchase request from a business owner:
"${prompt}"

Extract the structured procurement policy requirements:
- category: The product category (e.g., "office supplies", "cleaning supplies", "maintenance tools", "office furniture", "computing").
- targetItem: Short descriptive title of the target item/search query without policy constraints (e.g. "printer and copier paper", "commercial cleaning supplies", "laptop for software development").
- quantity: Positive integer count of items/units requested (e.g., 5 for "5 packs", 2 for "2 chairs"). Default to 1 if unspecified.
- maxBudget: The maximum allowed total budget ceiling as a numeric float.
- currency: ISO 4217 3-letter currency code (e.g. "USD", "EUR", "GBP"). Default to "USD" if unspecified.
- allowedConditions: Array of allowed conditions ('new', 'refurbished', 'used'). If the user requests "new" or "no refurbished", only include 'new'.
- minRamGb: Minimum RAM in Gigabytes ONLY if the user explicitly requested a RAM requirement for a computing item; otherwise 0.
- minStorageGb: Minimum SSD/storage in Gigabytes ONLY if the user explicitly requested storage; otherwise 0.
- extractedReasoning: A concise, human-readable explanation of why these constraints and defaults were chosen.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            targetItem: { type: Type.STRING },
            quantity: { type: Type.INTEGER },
            maxBudget: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            allowedConditions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            minRamGb: { type: Type.INTEGER },
            minStorageGb: { type: Type.INTEGER },
            extractedReasoning: { type: Type.STRING },
          },
          required: [
            'category',
            'targetItem',
            'maxBudget',
            'currency',
            'allowedConditions',
            'extractedReasoning',
          ],
        },
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out after 8s')), 8000)
    );

    const response = await Promise.race([generatePromise, timeoutPromise]);

    const parsed = JSON.parse(response.text || '{}');

    // Clean conditions to valid type
    const validConditions: ProductCondition[] = (parsed.allowedConditions || ['new'])
      .map((c: string) => c.toLowerCase())
      .filter((c: string): c is ProductCondition => ['new', 'refurbished', 'used'].includes(c));

    const targetItem =
      parsed.targetItem && typeof parsed.targetItem === 'string' && parsed.targetItem.trim().length > 0
        ? parsed.targetItem.trim()
        : extractTargetItemFromPrompt(prompt);

    const quantity =
      typeof parsed.quantity === 'number' && parsed.quantity > 0
        ? Math.floor(parsed.quantity)
        : extractQuantityFromPrompt(prompt);

    const minRamGb =
      typeof parsed.minRamGb === 'number' && parsed.minRamGb > 0
        ? parsed.minRamGb
        : 0;

    const minStorageGb =
      typeof parsed.minStorageGb === 'number' && parsed.minStorageGb > 0
        ? parsed.minStorageGb
        : undefined;

    const category = parsed.category || inferCategoryFromItem(targetItem);
    const isConsumable = isConsumableCategory(category);
    const finalConditions: ProductCondition[] = isConsumable
      ? ['new']
      : validConditions.length > 0
      ? validConditions
      : ['new'];

    const targetSpecs: Record<string, string | number> = {};
    if (minRamGb > 0) targetSpecs['RAM'] = `${minRamGb} GB`;
    if (minStorageGb) {
      targetSpecs['Storage'] =
        minStorageGb >= 1024 ? `${minStorageGb / 1024} TB` : `${minStorageGb} GB`;
    }

    const classification = resolveClassification({
      buyerPrompt: prompt,
      targetItem,
      extractedCategory: category,
    });

    return {
      id: reqId,
      category,
      subcategory: classification.subcategory,
      targetItem,
      quantity,
      maxBudget: typeof parsed.maxBudget === 'number' && parsed.maxBudget > 0 ? parsed.maxBudget : 800,
      currency: (parsed.currency || 'USD').toUpperCase(),
      allowedConditions: finalConditions,
      minRamGb,
      minStorageGb,
      targetSpecs,
      originalPrompt: prompt,
      extractedReasoning:
        parsed.extractedReasoning ||
        (quantity > 1
          ? `Extracted by Gemini: target "${targetItem}", quantity ${quantity} units, total budget ${parsed.maxBudget || 800} USD.`
          : minRamGb > 0
          ? `Extracted by Gemini: target "${targetItem}", budget ${parsed.maxBudget || 800} USD, min RAM ${minRamGb} GB.`
          : `Extracted by Gemini: target "${targetItem}", budget ${parsed.maxBudget || 800} USD. No RAM constraint specified.`),
      createdAt: new Date().toISOString(),
    };
  } catch (err: any) {
    console.error('[GeminiService] Gemini call failed, resorting to resilient fallback parser:', err?.message || err);
    return deterministicFallbackParser(prompt, reqId);
  }
}

export function deterministicFallbackParser(
  prompt: string,
  reqId: string = `req_fallback_${Date.now()}`
): PurchaseRequirements {
  const lower = prompt.toLowerCase();

  // Extract budget
  let maxBudget = 800;
  const budgetMatch = lower.match(
    /(?:under|max|budget\s*max|costing\s*no\s*more\s*than|no\s*more\s*than|\$|usd)\s*(\d+(?:\.\d+)?)/i
  );
  if (budgetMatch && budgetMatch[1]) {
    maxBudget = parseFloat(budgetMatch[1]);
  }

  // Extract quantity
  const quantity = extractQuantityFromPrompt(prompt);

  // Extract RAM (ONLY if explicitly specified by user)
  let minRamGb = 0;
  const ramMatch =
    lower.match(/(\d+)\s*(?:gb|gig|gigs)\s*(?:of\s+)?ram/i) ||
    lower.match(/(?:at\s+least\s+)?(\d+)\s*(?:gb|gig|gigs)\s*memory/i);
  if (ramMatch && ramMatch[1]) {
    minRamGb = parseInt(ramMatch[1], 10);
  }

  // Extract Storage (ONLY if explicitly specified by user)
  let minStorageGb: number | undefined = undefined;
  const storageMatch = lower.match(/(\d+)\s*(?:gb|tb)\s*(?:ssd|storage|hard\s*drive|drive)/i);
  if (storageMatch && storageMatch[1]) {
    const val = parseInt(storageMatch[1], 10);
    minStorageGb = storageMatch[0].toLowerCase().includes('tb') ? val * 1024 : val;
  }

  // Preserve user's actual target item
  const targetItem = extractTargetItemFromPrompt(prompt);
  const category = inferCategoryFromItem(targetItem);
  const isConsumable = isConsumableCategory(category);

  // Conditions: consumables strictly default to 'new'
  const isNoRefurb =
    lower.includes('no refurb') ||
    lower.includes('new only') ||
    lower.includes('brand new') ||
    lower.includes('not refurb');
  const allowedConditions: ProductCondition[] = isConsumable || isNoRefurb ? ['new'] : ['new', 'refurbished'];

  // Category-specific target specifications
  const targetSpecs: Record<string, string | number> = {};
  if (minRamGb > 0) targetSpecs['RAM'] = `${minRamGb} GB`;
  if (minStorageGb) {
    targetSpecs['Storage'] =
      minStorageGb >= 1024 ? `${minStorageGb / 1024} TB` : `${minStorageGb} GB`;
  }
  if (lower.includes('8.5x11') || lower.includes('letter')) targetSpecs['Size'] = 'Letter (8.5" x 11")';
  else if (lower.includes('a4')) targetSpecs['Size'] = 'A4';
  if (lower.includes('20 lb') || lower.includes('20lb') || lower.includes('75 gsm')) targetSpecs['Weight'] = '20 lb / 75 GSM';
  else if (lower.includes('80 gsm') || lower.includes('80gsm')) targetSpecs['Weight'] = '80 GSM';
  if (lower.includes('500 sheets') || lower.includes('ream')) targetSpecs['Sheet Count'] = '500 Sheets';
  if (lower.includes('commercial')) targetSpecs['Grade'] = 'Commercial';
  if (lower.includes('cordless')) targetSpecs['Type'] = 'Cordless';
  if (lower.includes('18v') || lower.includes('18-volt') || lower.includes('18 volt')) targetSpecs['Voltage'] = '18V';
  else if (lower.includes('20v') || lower.includes('20-volt') || lower.includes('20 volt')) targetSpecs['Voltage'] = '20V';
  if (lower.includes('24 port') || lower.includes('24-port')) targetSpecs['Ports'] = '24 Ports';
  else if (lower.includes('48 port') || lower.includes('48-port')) targetSpecs['Ports'] = '48 Ports';
  if (lower.includes('gigabit')) targetSpecs['Speed'] = 'Gigabit';
  if (lower.includes('laserjet')) targetSpecs['Compatibility'] = 'LaserJet';
  if (lower.includes('58a')) targetSpecs['Cartridge Model'] = '58A';
  if (lower.includes('ergonomic')) targetSpecs['Design'] = 'Ergonomic';

  const classification = resolveClassification({
    buyerPrompt: prompt,
    targetItem,
    extractedCategory: category,
  });

  return {
    id: reqId,
    category,
    subcategory: classification.subcategory,
    targetItem,
    quantity,
    maxBudget,
    currency: 'USD',
    allowedConditions,
    minRamGb,
    minStorageGb,
    targetSpecs,
    originalPrompt: prompt,
    extractedReasoning:
      quantity > 1
        ? `Deterministic rule extraction applied: parsed target product ("${targetItem}"), quantity (${quantity} units), max budget (${maxBudget} USD), and conditions directly from owner prompt.`
        : minRamGb > 0
        ? `Deterministic rule extraction applied: parsed target product ("${targetItem}"), max budget (${maxBudget} USD), explicit min RAM (${minRamGb} GB), and conditions directly from owner prompt.`
        : `Deterministic rule extraction applied: parsed target product ("${targetItem}"), max budget (${maxBudget} USD), and conditions directly from owner prompt. No RAM constraint specified.`,
    createdAt: new Date().toISOString(),
  };
}
