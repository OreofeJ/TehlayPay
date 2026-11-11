import type { ProcurementCategory, PurchaseRequirements } from './types.ts';

/**
 * Standard classification result providing granular category and subcategory details.
 */
export interface CategoryClassificationResult {
  category: ProcurementCategory;
  subcategory: string;
  categoryDisplayName: string;
  subcategoryDisplayName: string;
  fullDisplayName: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'buyer_intent' | 'product_metadata' | 'catalog' | 'fallback' | 'conflict';
  hasConflict?: boolean;
  conflictReason?: string;
}

export interface ClassificationContext {
  buyerPrompt?: string;
  targetItem?: string;
  extractedCategory?: string;
  productTitle?: string;
  productDescription?: string;
  supplierCategory?: string;
}

interface SubcategoryMatcher {
  subcategory: string;
  keywords: RegExp;
  category: ProcurementCategory;
}

/**
 * Comprehensive subcategory rules covering all specialist procurement categories.
 * Evaluated in strict order: Computing & IT subcategories are prioritized to prevent
 * ambiguous substrings (like "tablets" matching "table") from false classification.
 */
const SUBCATEGORY_RULES: SubcategoryMatcher[] = [
  // ----------------------------------------------------
  // 1. Computing & IT Subcategories
  // ----------------------------------------------------
  {
    subcategory: 'Tablets',
    category: 'computing',
    keywords: /\b(?:tablets?|ipads?|galaxy\s*tabs?|surface\s*pros?|kindle\s*fires?|fire\s*hds?|android\s*tablets?|tab\s*s\d*|tab\s*a\d*)\b/i,
  },
  {
    subcategory: 'Smartphones',
    category: 'computing',
    keywords: /\b(?:smartphones?|iphones?|galaxy\s*s\d+|pixel\s*\d+|mobile\s*phones?|cell\s*phones?|cellular\s*phones?|android\s*phones?|smart\s*phones?)\b/i,
  },
  {
    subcategory: 'Monitors',
    category: 'computing',
    keywords: /\b(?:monitors?|displays?|ultrawides?|curved\s*monitors?|computer\s*screens?|desktop\s*screens?|oled\s*monitors?|lcd\s*monitors?|led\s*monitors?)\b/i,
  },
  {
    subcategory: 'Networking',
    category: 'computing',
    keywords: /\b(?:networking|network\s*switch(?:es)?|ethernet\s*switch(?:es)?|routers?|wifi\s*routers?|access\s*points?|modems?|network\s*gateways?|firewalls?|patch\s*panels?|ethernet\s*cables?|cat6a?|cat5e?|nas|network\s*attached\s*storage)\b/i,
  },
  {
    subcategory: 'Laptops',
    category: 'computing',
    keywords: /\b(?:laptops?|notebooks?|macbooks?|chromebooks?|thinkpads?|ultrabooks?|latitudes?|elitebooks?|zenbooks?|ideapads?|yogas?|surface\s*laptops?)\b/i,
  },
  {
    subcategory: 'Desktop Computers',
    category: 'computing',
    keywords: /\b(?:desktops?|workstations?|all-in-ones?|tower\s*pcs?|imacs?|mac\s*minis?|mac\s*studios?|optiplex|thinkcentres?|desktop\s*computers?)\b/i,
  },
  {
    subcategory: 'Computer Peripherals',
    category: 'computing',
    keywords: /\b(?:keyboards?|mouse|mice|trackpads?|webcams?|web\s*cameras?|headsets?|microphones?|barcode\s*scanners?|drawing\s*tablets?|stylus(?:es)?)\b/i,
  },
  {
    subcategory: 'Servers & Storage',
    category: 'computing',
    keywords: /\b(?:servers?|rack\s*servers?|blade\s*servers?|external\s*hard\s*drives?|external\s*ssds?|portable\s*ssds?|internal\s*ssds?|nvmes?|storage\s*arrays?|sans?)\b/i,
  },
  {
    subcategory: 'Computer Accessories',
    category: 'computing',
    keywords: /\b(?:docking\s*stations?|usb\s*hubs?|laptop\s*stands?|monitor\s*arms?|monitor\s*mounts?|usb-c\s*cables?|hdmi\s*cables?|laptop\s*chargers?|power\s*adapters?)\b/i,
  },
  {
    subcategory: 'Printers & Scanners',
    category: 'computing',
    keywords: /\b(?:laser\s*printers?|inkjet\s*printers?|all-in-one\s*printers?|document\s*scanners?|flatbed\s*scanners?|multifunction\s*printers?)\b/i,
  },

  // ----------------------------------------------------
  // 2. Printer Consumables (Ink, Toner, Drums, Ribbons)
  // ----------------------------------------------------
  {
    subcategory: 'Ink Cartridges',
    category: 'printer_consumables',
    keywords: /\b(?:ink\s*cartridges?|printer\s*inks?|ink\s*tanks?|ink\s*bottles?|ink\s*refills?)\b/i,
  },
  {
    subcategory: 'Toner Cartridges',
    category: 'printer_consumables',
    keywords: /\b(?:toners?|toner\s*cartridges?|laser\s*toners?|copier\s*toners?)\b/i,
  },
  {
    subcategory: 'Printer Drums',
    category: 'printer_consumables',
    keywords: /\b(?:drum\s*units?|imaging\s*drums?|printer\s*drums?|photoreceptor\s*drums?)\b/i,
  },
  {
    subcategory: 'Printer Ribbons',
    category: 'printer_consumables',
    keywords: /\b(?:printer\s*ribbons?|thermal\s*ribbons?|ink\s*ribbons?|typewriter\s*ribbons?)\b/i,
  },
  {
    subcategory: 'Other Printer Consumables',
    category: 'printer_consumables',
    keywords: /\b(?:waste\s*toner\s*box(?:es)?|fuser\s*kits?|maintenance\s*kits?|transfer\s*belts?|printheads?)\b/i,
  },

  // ----------------------------------------------------
  // 3. Office Supplies (Paper, Stationery, Writing, Filing)
  // ----------------------------------------------------
  {
    subcategory: 'Paper',
    category: 'office_supplies',
    keywords: /\b(?:copier\s*paper|copy\s*paper|printer\s*paper|printing\s*paper|multipurpose\s*paper|cardstock|notepads?|notebook\s*paper|post-its?|sticky\s*notes?|legal\s*pads?|paper\s*reams?|ream\s*of\s*paper|\bpaper\b)\b/i,
  },
  {
    subcategory: 'Stationery',
    category: 'office_supplies',
    keywords: /\b(?:stationery|envelopes?|letterhead|greeting\s*cards?|index\s*cards?)\b/i,
  },
  {
    subcategory: 'Writing Instruments',
    category: 'office_supplies',
    keywords: /\b(?:ballpoint\s*pens?|gel\s*pens?|rollerballs?|mechanical\s*pencils?|markers?|highlighters?|sharpies?|dry\s*erase\s*markers?|erasers?|correction\s*tapes?|\bpens?\b|\bpencils?\b)\b/i,
  },
  {
    subcategory: 'Filing Supplies',
    category: 'office_supplies',
    keywords: /\b(?:file\s*folders?|manila\s*folders?|ring\s*binders?|file\s*dividers?|hanging\s*files?|label\s*makers?|folders?|binders?|labels?)\b/i,
  },
  {
    subcategory: 'Presentation Supplies',
    category: 'office_supplies',
    keywords: /\b(?:whiteboards?|white\s*boards?|dry\s*erase\s*boards?|bulletin\s*boards?|cork\s*boards?|easels?|flipcharts?|flip\s*charts?|presentation\s*clickers?)\b/i,
  },
  {
    subcategory: 'Binding Supplies',
    category: 'office_supplies',
    keywords: /\b(?:staplers?|staples?|paperclips?|paper\s*clips?|binder\s*clips?|hole\s*punch(?:es)?|laminators?|laminating\s*pouches?|binding\s*machines?)\b/i,
  },

  // ----------------------------------------------------
  // 4. Cleaning Supplies (Chemicals, Detergents, Janitorial)
  // ----------------------------------------------------
  {
    subcategory: 'Cleaning Chemicals',
    category: 'cleaning_supplies',
    keywords: /\b(?:cleaning\s*chemicals?|bleach|degreasers?|window\s*cleaners?|glass\s*cleaners?|all-purpose\s*cleaners?|floor\s*cleaners?)\b/i,
  },
  {
    subcategory: 'Detergents',
    category: 'cleaning_supplies',
    keywords: /\b(?:detergents?|dish\s*soaps?|laundry\s*detergents?|dishwasher\s*soaps?|hand\s*soaps?|liquid\s*soaps?)\b/i,
  },
  {
    subcategory: 'Disinfectants',
    category: 'cleaning_supplies',
    keywords: /\b(?:disinfect(?:ants?|ing)?|sanitiz(?:ers?|ing)?|hand\s*sanitizers?|antiseptics?|clorox\s*wipes?|lysol)\b/i,
  },
  {
    subcategory: 'Janitorial Supplies',
    category: 'cleaning_supplies',
    keywords: /\b(?:janitorial|trash\s*bags?|garbage\s*bags?|can\s*liners?|paper\s*towels?|toilet\s*paper|bath\s*tissues?|soap\s*dispensers?|trash\s*cans?)\b/i,
  },
  {
    subcategory: 'Cleaning Equipment & Accessories',
    category: 'cleaning_supplies',
    keywords: /\b(?:mops?|brooms?|dustpans?|buckets?|vacuums?|vacuum\s*cleaners?|floor\s*scrubbers?|squeegees?|cleaning\s*wipes?|microfiber\s*cloths?|sponges?|scrub\s*brushes?)\b/i,
  },

  // ----------------------------------------------------
  // 5. Tools & Hardware
  // ----------------------------------------------------
  {
    subcategory: 'Hand Tools',
    category: 'tools_hardware',
    keywords: /\b(?:hammers?|screwdrivers?|wrenches?|pliers?|hand\s*saws?|utility\s*knives?|tape\s*measures?|chisels?|allen\s*wrenches?|hex\s*keys?|socket\s*sets?)\b/i,
  },
  {
    subcategory: 'Power Tools',
    category: 'tools_hardware',
    keywords: /\b(?:power\s*tools?|drills?|cordless\s*drills?|hammer\s*drills?|impact\s*drivers?|circular\s*saws?|miter\s*saws?|jigsaws?|angle\s*grinders?|sanders?)\b/i,
  },
  {
    subcategory: 'Electrical Hardware',
    category: 'tools_hardware',
    keywords: /\b(?:electrical\s*hardware|electrical\s*wires?|cable\s*ties?|zip\s*ties?|multimeters?|circuit\s*breakers?|junction\s*boxes?|conduits?|wire\s*strippers?|electrical\s*tapes?)\b/i,
  },
  {
    subcategory: 'Plumbing Supplies',
    category: 'tools_hardware',
    keywords: /\b(?:plumbing|pipes?|pipe\s*fittings?|plumbing\s*valves?|faucets?|pvc\s*pipes?|drain\s*snakes?|plungers?|teflon\s*tapes?)\b/i,
  },
  {
    subcategory: 'Maintenance Equipment',
    category: 'tools_hardware',
    keywords: /\b(?:maintenance\s*equipment|ladders?|step\s*ladders?|step\s*stools?|workbenches?|tool\s*boxes?|tool\s*chests?|generators?|pressure\s*washers?|air\s*compressors?)\b/i,
  },
  {
    subcategory: 'Fasteners & Fittings',
    category: 'tools_hardware',
    keywords: /\b(?:fasteners?|screws?|bolts?|nuts?|washers?|wall\s*anchors?|nails?|rivets?|hardware\s*fittings?)\b/i,
  },

  // ----------------------------------------------------
  // 6. Office Furniture
  // CRITICAL: Tables rule must strictly use whole-word boundary and explicitly exclude "tablet"
  // ----------------------------------------------------
  {
    subcategory: 'Office Chairs',
    category: 'furniture',
    keywords: /\b(?:office\s*chairs?|desk\s*chairs?|ergonomic\s*chairs?|executive\s*chairs?|task\s*chairs?|conference\s*chairs?|stools?|drafting\s*chairs?|\bchairs?\b)\b/i,
  },
  {
    subcategory: 'Desks',
    category: 'furniture',
    keywords: /\b(?:standing\s*desks?|sit\s*stand\s*desks?|height\s*adjustable\s*desks?|executive\s*desks?|computer\s*desks?|workstation\s*desks?|corner\s*desks?|\bdesks?\b)\b/i,
  },
  {
    subcategory: 'Tables',
    category: 'furniture',
    // Matches "table" or "tables" as whole word, NEVER matching "tablet" or "tablets"
    keywords: /\b(?:conference|meeting|breakroom|coffee|drafting|dining)?\s*tables?\b(?!t)/i,
  },
  {
    subcategory: 'Cabinets',
    category: 'furniture',
    keywords: /\b(?:filing\s*cabinets?|file\s*cabinets?|storage\s*cabinets?|lateral\s*files?|\bcabinets?\b)\b/i,
  },
  {
    subcategory: 'Shelving',
    category: 'furniture',
    keywords: /\b(?:shelving|shelves|bookshelves?|bookcases?|storage\s*racks?|\bshelf\b)\b/i,
  },
  {
    subcategory: 'Storage Furniture',
    category: 'furniture',
    keywords: /\b(?:credenzas?|wardrobes?|lockers?|storage\s*units?|hutches?)\b/i,
  },
];

/**
 * Maps ProcurementCategory to primary display label.
 */
export function getCategoryDisplayName(categoryOrQuery?: string): string {
  if (!categoryOrQuery) return 'General / Other';
  let cat: ProcurementCategory;
  if (
    categoryOrQuery === 'computing' ||
    categoryOrQuery === 'office_supplies' ||
    categoryOrQuery === 'printer_consumables' ||
    categoryOrQuery === 'cleaning_supplies' ||
    categoryOrQuery === 'tools_hardware' ||
    categoryOrQuery === 'furniture' ||
    categoryOrQuery === 'general'
  ) {
    cat = categoryOrQuery;
  } else {
    cat = classifySingleText(categoryOrQuery).category;
  }

  switch (cat) {
    case 'computing':
      return 'Computing & IT';
    case 'office_supplies':
      return 'Office Supplies';
    case 'printer_consumables':
      return 'Printer Consumables';
    case 'cleaning_supplies':
      return 'Cleaning Supplies';
    case 'tools_hardware':
      return 'Tools & Hardware';
    case 'furniture':
      return 'Office Furniture';
    case 'general':
    default:
      return 'General / Other';
  }
}

/**
 * Classifies a single raw text string against subcategory rules.
 */
function classifySingleText(text?: any): {
  category: ProcurementCategory;
  subcategory: string;
  confidence: 'high' | 'medium' | 'low';
} {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { category: 'general', subcategory: 'Other', confidence: 'low' };
  }

  const clean = text.trim();
  const lower = clean.toLowerCase();

  // Explicit safety check: Tablets must NEVER match furniture tables
  const isTablet = /\b(?:tablets?|galaxy\s*tabs?|ipads?)\b/i.test(lower);
  if (isTablet) {
    return { category: 'computing', subcategory: 'Tablets', confidence: 'high' };
  }

  // Iterate over prioritized subcategory matchers
  for (const rule of SUBCATEGORY_RULES) {
    if (rule.subcategory === 'Tables' && lower.includes('tablet')) {
      continue; // Extra safety guard
    }
    if (rule.keywords.test(clean)) {
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        confidence: 'high',
      };
    }
  }

  // Fallback keyword checks for broad category names
  if (lower.includes('computing') || lower === 'computer' || lower === 'pc') {
    return { category: 'computing', subcategory: 'Desktop Computers', confidence: 'medium' };
  }
  if (lower.includes('office supply') || lower.includes('office supplies') || lower === 'stationery') {
    return { category: 'office_supplies', subcategory: 'Paper', confidence: 'medium' };
  }
  if (lower.includes('printer consumable') || lower.includes('printer ink') || lower === 'consumable') {
    return { category: 'printer_consumables', subcategory: 'Toner Cartridges', confidence: 'medium' };
  }
  if (lower.includes('cleaning') || lower.includes('janitor')) {
    return { category: 'cleaning_supplies', subcategory: 'Janitorial Supplies', confidence: 'medium' };
  }
  if (lower.includes('tool') || lower.includes('hardware') || lower === 'maintenance') {
    return { category: 'tools_hardware', subcategory: 'Hand Tools', confidence: 'medium' };
  }
  if (lower.includes('furniture') && !lower.includes('tablet')) {
    return { category: 'furniture', subcategory: 'Office Chairs', confidence: 'medium' };
  }

  return { category: 'general', subcategory: 'Other', confidence: 'low' };
}

/**
 * Filter out generic supplier category placeholders that provide no real classification signal.
 */
function isGenericSupplierCategory(category?: any): boolean {
  if (!category || typeof category !== 'string') return true;
  const lower = category.trim().toLowerCase();
  const genericPlaceholders = [
    'general',
    'other',
    'all',
    'all products',
    'uncategorized',
    'miscellaneous',
    'misc',
    'products',
    'merchandise',
    'catalog',
    'goods',
    'items',
  ];
  return genericPlaceholders.includes(lower);
}

/**
 * Resolves the final ProcurementCategory, subcategory, and display labels from all available signals:
 * 1. Buyer intent (original prompt / target item)
 * 2. Extracted category
 * 3. Actual Channel3 product title & description
 * 4. Supplier catalog category (where available)
 */
export function resolveClassification(context: ClassificationContext): CategoryClassificationResult {
  // 1. Signal 1: Buyer intent (what buyer actually requested)
  const buyerText = context.targetItem || context.buyerPrompt || '';
  const buyerClassification = classifySingleText(buyerText);

  // 2. Signal 2: Extracted category from LLM or parser
  const extractedClassification = context.extractedCategory
    ? classifySingleText(context.extractedCategory)
    : null;

  // 3. Signal 3: Product metadata
  const productText = `${context.productTitle || ''} ${context.productDescription || ''}`.trim();
  const productClassification = classifySingleText(productText);

  // 4. Signal 4: Supplier category
  const hasSpecificSupplierCat =
    context.supplierCategory && !isGenericSupplierCategory(context.supplierCategory);
  const supplierClassification = hasSpecificSupplierCat
    ? classifySingleText(context.supplierCategory)
    : null;

  // ----------------------------------------------------
  // Decision Precedence & Conflict Detection
  // ----------------------------------------------------

  // Rule A: A clearly identified buyer request (e.g. "Samsung tablets") takes precedence over
  // a stale or incorrect extractedCategory field (e.g. extracted says "furniture")
  let effectiveBuyer = buyerClassification;
  if (buyerClassification.category !== 'general') {
    effectiveBuyer = buyerClassification;
  } else if (extractedClassification && extractedClassification.category !== 'general') {
    // If targetItem didn't match a rule, but extractedCategory is specific and doesn't conflict
    effectiveBuyer = extractedClassification;
  }

  // If this classification is for buyer policy display alone (no product metadata provided):
  if (!context.productTitle) {
    const catDisplayName = getCategoryDisplayName(effectiveBuyer.category);
    const subDisplayName = effectiveBuyer.subcategory;
    const fullDisplayName =
      effectiveBuyer.category === 'general'
        ? 'General / Other'
        : `${catDisplayName} → ${subDisplayName}`;

    return {
      category: effectiveBuyer.category,
      subcategory: effectiveBuyer.subcategory,
      categoryDisplayName: catDisplayName,
      subcategoryDisplayName: subDisplayName,
      fullDisplayName,
      confidence: effectiveBuyer.confidence,
      source: 'buyer_intent',
    };
  }

  // Product evaluation context: evaluate both buyer intent and product evidence
  let resolvedCategory = effectiveBuyer.category;
  let resolvedSubcategory = effectiveBuyer.subcategory;
  let source: CategoryClassificationResult['source'] = 'buyer_intent';
  let hasConflict = false;
  let conflictReason: string | undefined = undefined;

  if (productClassification.category !== 'general') {
    if (effectiveBuyer.category === 'general') {
      // Buyer request was general/unclassified, product title is specific
      resolvedCategory = productClassification.category;
      resolvedSubcategory = productClassification.subcategory;
      source = 'product_metadata';
    } else if (effectiveBuyer.category !== productClassification.category) {
      // Genuine conflict: Buyer wanted one specialist category, product is an entirely different one
      hasConflict = true;
      conflictReason = `Genuine classification conflict: Buyer intent is [${getCategoryDisplayName(
        effectiveBuyer.category
      )}], but product listing indicates [${getCategoryDisplayName(productClassification.category)}].`;
      source = 'conflict';
    } else {
      // Corroborating: both agree on category
      resolvedCategory = effectiveBuyer.category;
      // Refine subcategory using product details if product offers a specific subcategory
      resolvedSubcategory = productClassification.subcategory;
      source = 'product_metadata';
    }
  } else if (hasSpecificSupplierCat && supplierClassification && supplierClassification.category !== 'general') {
    if (effectiveBuyer.category === 'general') {
      resolvedCategory = supplierClassification.category;
      resolvedSubcategory = supplierClassification.subcategory;
      source = 'catalog';
    } else if (effectiveBuyer.category !== supplierClassification.category) {
      hasConflict = true;
      conflictReason = `Classification conflict with supplier catalogue: Buyer requested [${getCategoryDisplayName(
        effectiveBuyer.category
      )}], but supplier catalogue classifies item as [${getCategoryDisplayName(supplierClassification.category)}].`;
      source = 'conflict';
    }
  }

  const catDisplayName = getCategoryDisplayName(resolvedCategory);
  const subDisplayName = resolvedSubcategory;
  const fullDisplayName =
    resolvedCategory === 'general'
      ? 'General / Other'
      : `${catDisplayName} → ${subDisplayName}`;

  return {
    category: resolvedCategory,
    subcategory: resolvedSubcategory,
    categoryDisplayName: catDisplayName,
    subcategoryDisplayName: subDisplayName,
    fullDisplayName,
    confidence: hasConflict ? 'low' : productClassification.confidence || effectiveBuyer.confidence,
    source,
    hasConflict,
    conflictReason,
  };
}

/**
 * Normalizes any category string or search query into a standard ProcurementCategory.
 * Backward compatible with all existing callers.
 */
export function classifyCategory(input?: string): ProcurementCategory {
  if (!input) return 'general';
  return resolveClassification({ targetItem: input }).category;
}

/**
 * Returns true if category or query represents Computing / IT equipment.
 */
export function isComputingCategory(categoryOrQuery?: string): boolean {
  if (!categoryOrQuery) return false;
  return classifyCategory(categoryOrQuery) === 'computing';
}

/**
 * Returns true if category represents consumable goods (e.g. paper, ink, cleaning supplies).
 * Consumable goods must strictly enforce 'new' condition.
 */
export function isConsumableCategory(categoryOrQuery?: string): boolean {
  if (!categoryOrQuery || typeof categoryOrQuery !== 'string') return false;
  const clean = categoryOrQuery.trim().toLowerCase();
  if (
    clean === 'office_supplies' ||
    clean === 'printer_consumables' ||
    clean === 'cleaning_supplies' ||
    clean.includes('office_supplies') ||
    clean.includes('printer_consumables') ||
    clean.includes('cleaning_supplies')
  ) {
    return true;
  }
  const cat = classifyCategory(categoryOrQuery.replace(/_/g, ' '));
  return cat === 'office_supplies' || cat === 'printer_consumables' || cat === 'cleaning_supplies';
}

/**
 * Helper to produce list of specification pills for Target Specification display.
 */
export interface SpecItem {
  label: string;
  value: string;
  isConstrained: boolean;
}

export function extractDisplaySpecs(requirements: PurchaseRequirements): SpecItem[] {
  const classification = resolveClassification({
    targetItem: requirements.targetItem,
    extractedCategory: requirements.category,
    buyerPrompt: requirements.extractedReasoning,
  });
  const isComputing = classification.category === 'computing';
  const specs: SpecItem[] = [];

  if (isComputing) {
    // RAM
    if (requirements.minRamGb && requirements.minRamGb > 0) {
      specs.push({
        label: 'RAM',
        value: `${requirements.minRamGb} GB Min`,
        isConstrained: true,
      });
    } else {
      specs.push({
        label: 'RAM',
        value: 'Unconstrained',
        isConstrained: false,
      });
    }

    // Storage
    if (requirements.minStorageGb && requirements.minStorageGb > 0) {
      const storageText =
        requirements.minStorageGb >= 1024
          ? `${requirements.minStorageGb / 1024} TB Min`
          : `${requirements.minStorageGb} GB Min`;
      specs.push({
        label: 'Storage',
        value: storageText,
        isConstrained: true,
      });
    }

    // Any other targetSpecs passed
    if (requirements.targetSpecs) {
      for (const [key, val] of Object.entries(requirements.targetSpecs)) {
        if (key.toLowerCase() !== 'ram' && key.toLowerCase() !== 'storage') {
          specs.push({
            label: key,
            value: String(val),
            isConstrained: true,
          });
        }
      }
    }
  } else {
    // Non-computing categories: ONLY display specs if explicitly present
    if (requirements.targetSpecs && Object.keys(requirements.targetSpecs).length > 0) {
      for (const [key, val] of Object.entries(requirements.targetSpecs)) {
        if (key.toLowerCase() !== 'ram' && key.toLowerCase() !== 'storage') {
          specs.push({
            label: key,
            value: String(val),
            isConstrained: true,
          });
        }
      }
    }
  }

  return specs;
}
