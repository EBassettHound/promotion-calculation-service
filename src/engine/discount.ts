import { CartLine, Promotion } from "../domain/types";

/**
 * Returns the total value of the most expensive eligible units
 * for a particular SKU.
 *
 * This maximizes customer savings when a SKU appears on multiple
 * cart lines with different prices.
 */
export function eligibleValueCents(
  items: CartLine[],
  sku: string,
  eligibleUnits: number
): number {
  const matchingLines = items
    .filter((item) => item.sku === sku)
    .sort((a, b) => b.unitPriceCents - a.unitPriceCents);

  let remainingUnits = eligibleUnits;
  let totalValue = 0;

  for (const line of matchingLines) {
    if (remainingUnits <= 0) {
      break;
    }

    const unitsToUse = Math.min(line.quantity, remainingUnits);

    totalValue += unitsToUse * line.unitPriceCents;
    remainingUnits -= unitsToUse;
  }

  return totalValue;
}

/**
 * Calculates a discount across the highest-priced eligible units.
 */
export function calculateDiscountCents(
  promotion: Extract<Promotion, { discount: unknown }>,
  items: CartLine[],
  targetSku: string,
  applications: number
): number {
  const eligibleValue = eligibleValueCents(
    items,
    targetSku,
    applications
  );

  if (promotion.discount.kind === "PERCENTAGE") {
    return Math.min(
      eligibleValue,
      Math.round(
        (eligibleValue * promotion.discount.value) / 100
      )
    );
  }

  return Math.min(
    eligibleValue,
    promotion.discount.valueCents * applications
  );
}