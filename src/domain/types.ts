export interface CartLine {
  sku: string;
  quantity: number;
  unitPriceCents: number;
  category?: string;
}

export interface Customer {
  id: string;
  tier?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface CalculateRequest {
  customer: Customer;
  items: CartLine[];
  cartSubtotalCents: number;
}

interface PromotionBase {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
}

export interface BuyXGetYFree extends PromotionBase {
  type: "BUY_X_GET_Y_FREE";
  triggerSku: string;
  triggerQuantity: number;
  rewardSku: string;
}

export interface BuyXYGetZFree extends PromotionBase {
  type: "BUY_X_AND_Y_GET_Z_FREE";
  triggerSkuX: string;
  triggerSkuY: string;
  rewardSku: string;
}

export interface BuyXDiscountY extends PromotionBase {
  type: "BUY_X_GET_DISCOUNT_ON_Y";
  triggerSku: string;
  triggerQuantity: number;
  targetSku: string;
  discount: { kind: "PERCENTAGE"; value: number } | { kind: "FIXED"; valueCents: number };
}

export interface BuyXYDiscountZ extends PromotionBase {
  type: "BUY_X_AND_Y_GET_DISCOUNT_ON_Z";
  triggerSkuX: string;
  triggerSkuY: string;
  targetSku: string;
  discount: { kind: "PERCENTAGE"; value: number } | { kind: "FIXED"; valueCents: number };
}

export type Promotion =
  | BuyXGetYFree
  | BuyXYGetZFree
  | BuyXDiscountY
  | BuyXYDiscountZ;

export interface PromotionEvaluation {
  promotionId: string;
  promotionName: string;
  outcome: "APPLIED" | "REJECTED";
  discountAmountCents: number;
  reason: string;
  priority: number;
  targetSku?: string;
}

export interface CalculationResult {
  calculationId: string;
  currency: "USD";
  cartSubtotalCents: number;
  totalDiscountCents: number;
  finalTotalCents: number;
  appliedPromotions: PromotionEvaluation[];
  evaluations: PromotionEvaluation[];
}

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}
