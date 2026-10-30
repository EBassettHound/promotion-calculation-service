import { randomUUID } from "crypto";
import {
  CalculateRequest,
  CalculationResult,
  CartLine,
  Promotion,
  PromotionEvaluation
} from "../domain/types";
import { configuredPromotions } from "../domain/promotions";
import {
  calculateDiscountCents,
  eligibleValueCents
} from "./discount";
import { DomainValidationError } from "../domain/types";
function quantityOf(items: CartLine[], sku: string): number {
  return items.filter((item) => item.sku === sku).reduce((sum, item) => sum + item.quantity, 0);
}


function amountForFreeUnits(
  items: CartLine[],
  sku: string,
  count: number
): number {
  return eligibleValueCents(items, sku, count);
}

function rejected(promotion: Promotion, reason: string): PromotionEvaluation {
  return {
    promotionId: promotion.id,
    promotionName: promotion.name,
    outcome: "REJECTED",
    discountAmountCents: 0,
    reason,
    priority: promotion.priority
  };
}

/**
 * Evaluates each configured promotion independently, then resolves conflicts.
 * Conflict policy: descending priority; a target SKU may receive a discount from
 * at most one promotion. Trigger units are not consumed except where the target
 * is also a trigger SKU; in that case eligibility is conservatively checked
 * against the combined quantity requirement.
 */
function evaluate(
  promotion: Promotion,
  items: CartLine[]
): PromotionEvaluation {
  switch (promotion.type) {
    case "BUY_X_GET_Y_FREE": {
      const triggerQty = quantityOf(items, promotion.triggerSku);
      const rewardQty = quantityOf(items, promotion.rewardSku);
      const sameSku = promotion.triggerSku === promotion.rewardSku;
      const possible = sameSku
        ? Math.floor(triggerQty / (promotion.triggerQuantity + 1))
        : Math.floor(triggerQty / promotion.triggerQuantity);
      const applications = sameSku
  ? possible
  : Math.min(possible, rewardQty);
      if (applications < 1) {
        return rejected(promotion, `Requires ${promotion.triggerQuantity} unit(s) of ${promotion.triggerSku} and an eligible unit of ${promotion.rewardSku}.`);
      }
      const discount = amountForFreeUnits(items, promotion.rewardSku, applications);
      return {
        promotionId: promotion.id, promotionName: promotion.name, outcome: "APPLIED",
        discountAmountCents: discount, reason: `Qualified with ${triggerQty} unit(s) of ${promotion.triggerSku}; ${applications} unit(s) of ${promotion.rewardSku} discounted to free.`,
        priority: promotion.priority, targetSku: promotion.rewardSku
      };
    }
    case "BUY_X_AND_Y_GET_Z_FREE": {
      const x = quantityOf(items, promotion.triggerSkuX);
      const y = quantityOf(items, promotion.triggerSkuY);
      const z = quantityOf(items, promotion.rewardSku);
      const sameX = promotion.rewardSku === promotion.triggerSkuX;
      const sameY = promotion.rewardSku === promotion.triggerSkuY;
      const possible = Math.min(
        sameX ? Math.floor(x / 2) : x,
        sameY ? Math.floor(y / 2) : y,
        z
      );
      if (possible < 1) return rejected(promotion, `Requires at least one unit each of ${promotion.triggerSkuX} and ${promotion.triggerSkuY}, plus an eligible ${promotion.rewardSku} unit.`);
      return {
        promotionId: promotion.id, promotionName: promotion.name, outcome: "APPLIED",
        discountAmountCents: amountForFreeUnits(items, promotion.rewardSku, possible),
        reason: `Qualified with ${promotion.triggerSkuX}, ${promotion.triggerSkuY}, and ${possible} eligible reward unit(s) of ${promotion.rewardSku}.`,
        priority: promotion.priority, targetSku: promotion.rewardSku
      };
    }
    case "BUY_X_GET_DISCOUNT_ON_Y": {
  const triggerQty = quantityOf(items, promotion.triggerSku);

  const targetQty = quantityOf(items, promotion.targetSku);

  const sameSku = promotion.triggerSku === promotion.targetSku;

  const eligibleApplications = Math.floor(
    triggerQty / promotion.triggerQuantity
  );

  const availableTargetUnits = sameSku
    ? Math.max(0, targetQty - promotion.triggerQuantity)
    : targetQty;

  const applications =
    eligibleApplications > 0 ? availableTargetUnits : 0;

  if (applications < 1) {
    return rejected(
      promotion,
      `Requires ${promotion.triggerQuantity} unit(s) of ${promotion.triggerSku} and at least one eligible unit of ${promotion.targetSku}.`
    );
  }

  return {
    promotionId: promotion.id,
    promotionName: promotion.name,
    outcome: "APPLIED",
    discountAmountCents: calculateDiscountCents(
      promotion,
      items,
      promotion.targetSku,
      applications
    ),
    reason: `Qualified with ${triggerQty} unit(s) of ${promotion.triggerSku}; discount applied to ${applications} unit(s) of ${promotion.targetSku}.`,
    priority: promotion.priority,
    targetSku: promotion.targetSku
  };
}
    case "BUY_X_AND_Y_GET_DISCOUNT_ON_Z": {
      const x = quantityOf(items, promotion.triggerSkuX);
      const y = quantityOf(items, promotion.triggerSkuY);
      const targetQty = quantityOf(items, promotion.targetSku);
      const sameX = promotion.targetSku === promotion.triggerSkuX;
      const sameY = promotion.targetSku === promotion.triggerSkuY;
      const targetAvailable = Math.max(
  0,
  targetQty - (sameX ? 1 : 0) - (sameY ? 1 : 0)
);
      const applications = Math.min(x, y, targetAvailable);
      if (applications < 1) {
  return rejected(
    promotion,
    `Requires one unit each of ${promotion.triggerSkuX} and ${promotion.triggerSkuY}, plus an eligible ${promotion.targetSku} unit.`
  );
}
      return {
        promotionId: promotion.id, promotionName: promotion.name, outcome: "APPLIED",
        discountAmountCents: calculateDiscountCents(
  promotion,
  items,
  promotion.targetSku,
  applications
),
        reason: `Qualified with ${promotion.triggerSkuX} and ${promotion.triggerSkuY}; discount applied to ${applications} unit(s) of ${promotion.targetSku}.`,
        priority: promotion.priority, targetSku: promotion.targetSku
      };
    }
  }
}

export class PromotionEngine {
  constructor(private readonly promotions: Promotion[] = configuredPromotions) {}

  calculate(request: CalculateRequest): CalculationResult {
    const calculatedSubtotal = request.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents, 0
    );

    // Reject inconsistent totals instead of silently calculating from two sources of truth.
    if (calculatedSubtotal !== request.cartSubtotalCents) {
      throw new DomainValidationError(`cartSubtotalCents mismatch: expected ${calculatedSubtotal}, received ${request.cartSubtotalCents}`);
    }

    // Step 1: Evaluate every enabled promotion independently.
const candidates = this.promotions
  .filter((promotion) => promotion.enabled)
  .map((promotion) => evaluate(promotion, request.items));

// Step 2: Group eligible promotions by the SKU they discount.
const promotionsByTarget = new Map<string, PromotionEvaluation[]>();

for (const candidate of candidates) {
  if (candidate.outcome !== "APPLIED" || !candidate.targetSku) {
    continue;
  }

  const existing = promotionsByTarget.get(candidate.targetSku) ?? [];
  existing.push(candidate);

  promotionsByTarget.set(candidate.targetSku, existing);
}

// Step 3: Choose the largest discount for each target SKU.
const winningPromotionIds = new Set<string>();

for (const promotions of promotionsByTarget.values()) {
  promotions.sort(
    (a, b) =>
      b.discountAmountCents - a.discountAmountCents ||
      b.priority - a.priority ||
      a.promotionId.localeCompare(b.promotionId)
  );

  const winner = promotions[0];

  if (winner) {
    winningPromotionIds.add(winner.promotionId);
  }
}

// Step 4: Record every promotion's final outcome.
const evaluations: PromotionEvaluation[] = candidates.map((candidate) => {
  if (candidate.outcome === "REJECTED" || !candidate.targetSku) {
    return candidate;
  }

  if (winningPromotionIds.has(candidate.promotionId)) {
    return candidate;
  }

  const winner = promotionsByTarget
    .get(candidate.targetSku)
    ?.find((promotion) => winningPromotionIds.has(promotion.promotionId));

  return {
    ...candidate,
    outcome: "REJECTED" as const,
    discountAmountCents: 0,
    reason: winner
      ? `Not applied because ${winner.promotionName} provides a better or equally preferred discount on ${candidate.targetSku}.`
      : `Not selected for ${candidate.targetSku}.`
  };
});

    const totalDiscountCents = evaluations.reduce((sum, item) => sum + item.discountAmountCents, 0);
    return {
      calculationId: randomUUID(),
      currency: "USD",
      cartSubtotalCents: calculatedSubtotal,
      totalDiscountCents,
      finalTotalCents: Math.max(0, calculatedSubtotal - totalDiscountCents),
      appliedPromotions: evaluations.filter((item) => item.outcome === "APPLIED"),
      evaluations
    };
  }
}
