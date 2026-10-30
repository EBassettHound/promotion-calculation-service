import { PromotionEngine } from "../src/engine/promotion-engine";
import { CalculateRequest, Promotion } from "../src/domain/types";
import { configuredPromotions } from "../src/domain/promotions";


function request(items: CalculateRequest["items"]): CalculateRequest {
  return {
    customer: { id: "customer-1", tier: "GOLD" },
    items,
    cartSubtotalCents: items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
  };
}

describe("PromotionEngine", () => {
  const engine = new PromotionEngine();
  test("discounts the highest-priced eligible units first", () => {
  const engine = new PromotionEngine([
    {
      id: "FREE-SOCK",
      name: "Buy a shoe and get one sock free",
      type: "BUY_X_GET_Y_FREE",
      enabled: true,
      priority: 10,
      triggerSku: "SHOE",
      triggerQuantity: 1,
      rewardSku: "SOCK"
    }
  ]);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "SHOE", quantity: 1, unitPriceCents: 5000 },
      { sku: "SOCK", quantity: 2, unitPriceCents: 800 },
      { sku: "SOCK", quantity: 1, unitPriceCents: 1000 }
    ],
    cartSubtotalCents: 7600
  });

  // One sock is free. Choose the $10 sock, not an $8 sock.
  expect(result.totalDiscountCents).toBe(1000);
  expect(result.finalTotalCents).toBe(6600);
});
  test("discounts all units when a SKU appears on multiple lines at the same price", () => {
  const engine = new PromotionEngine([
    {
      id: "SOCK-DISCOUNT",
      name: "30% off socks",
      type: "BUY_X_GET_DISCOUNT_ON_Y",
      enabled: true,
      priority: 10,
      triggerSku: "SHOE",
      triggerQuantity: 1,
      targetSku: "SOCK",
      discount: {
        kind: "PERCENTAGE",
        value: 30
      }
    }
  ]);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "SHOE", quantity: 1, unitPriceCents: 5000 },
      { sku: "SOCK", quantity: 2, unitPriceCents: 1000 },
      { sku: "SOCK", quantity: 3, unitPriceCents: 1000 }
    ],
    cartSubtotalCents: 10000
  });

  // Five socks at $10 each, discounted by 30%.
  expect(result.totalDiscountCents).toBe(1500);
  expect(result.finalTotalCents).toBe(8500);
});
  test("fixed discounts cannot exceed the eligible item price", () => {
  const engine = new PromotionEngine([
    {
      id: "LARGE-DISCOUNT",
      name: "$50 off socks",
      type: "BUY_X_GET_DISCOUNT_ON_Y",
      enabled: true,
      priority: 10,
      triggerSku: "SHOE",
      triggerQuantity: 1,
      targetSku: "SOCK",
      discount: {
        kind: "FIXED",
        valueCents: 5000
      }
    }
  ]);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "SHOE", quantity: 1, unitPriceCents: 5000 },
      { sku: "SOCK", quantity: 1, unitPriceCents: 2000 }
    ],
    cartSubtotalCents: 7000
  });

  expect(result.totalDiscountCents).toBe(2000);
  expect(result.finalTotalCents).toBe(5000);
});
  test("percentage discounts round to the nearest cent", () => {
  const engine = new PromotionEngine([
    {
      id: "ROUNDING-TEST",
      name: "15% off item",
      type: "BUY_X_GET_DISCOUNT_ON_Y",
      enabled: true,
      priority: 10,
      triggerSku: "SHOE",
      triggerQuantity: 1,
      targetSku: "SOCK",
      discount: {
        kind: "PERCENTAGE",
        value: 15
      }
    }
  ]);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "SHOE", quantity: 1, unitPriceCents: 5000 },
      { sku: "SOCK", quantity: 1, unitPriceCents: 999 }
    ],
    cartSubtotalCents: 5999
  });

  expect(result.totalDiscountCents).toBe(150);
  expect(result.finalTotalCents).toBe(5849);
});
  test("buy 3 get 1 free: 12 boots gives 3 free", () => {
  const engine = new PromotionEngine([
    {
      id: "BOGO-BOOTS",
      name: "Buy 3 boots, get 1 free",
      type: "BUY_X_GET_Y_FREE",
      enabled: true,
      priority: 10,
      triggerSku: "BOOT",
      triggerQuantity: 3,
      rewardSku: "BOOT"
    }
  ]);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "BOOT", quantity: 12, unitPriceCents: 10000 }
    ],
    cartSubtotalCents: 120000
  });

  expect(result.totalDiscountCents).toBe(30000);
  expect(result.finalTotalCents).toBe(90000);
  expect(result.appliedPromotions).toHaveLength(1);
});
  test("buy 3 get 1 free: 4 boots gives 1 free", () => {
  const engine = new PromotionEngine([
    {
      id: "BOGO-BOOTS",
      name: "Buy 3 boots, get 1 free",
      type: "BUY_X_GET_Y_FREE",
      enabled: true,
      priority: 10,
      triggerSku: "BOOT",
      triggerQuantity: 3,
      rewardSku: "BOOT"
    }
  ]);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "BOOT", quantity: 4, unitPriceCents: 10000 }
    ],
    cartSubtotalCents: 40000
  });

  expect(result.totalDiscountCents).toBe(10000);
  expect(result.finalTotalCents).toBe(30000);
  expect(result.appliedPromotions).toHaveLength(1);
});
  test("buy 3 get 1 free: 3 boots gives no discount", () => {
  const engine = new PromotionEngine([
    {
      id: "BOGO-BOOTS",
      name: "Buy 3 boots, get 1 free",
      type: "BUY_X_GET_Y_FREE",
      enabled: true,
      priority: 10,
      triggerSku: "BOOT",
      triggerQuantity: 3,
      rewardSku: "BOOT"
    }
  ]);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "BOOT", quantity: 3, unitPriceCents: 10000 }
    ],
    cartSubtotalCents: 30000
  });

  expect(result.totalDiscountCents).toBe(0);
  expect(result.finalTotalCents).toBe(30000);
  expect(result.appliedPromotions).toHaveLength(0);
});
  test("equal discounts use priority and then promotion ID", () => {
  const promotions: Promotion[] = [
    {
      id: "PROMO-B",
      name: "Promotion B",
      type: "BUY_X_GET_DISCOUNT_ON_Y",
      enabled: true,
      priority: 50,
      triggerSku: "SHOE",
      triggerQuantity: 1,
      targetSku: "SOCK",
      discount: {
        kind: "FIXED",
        valueCents: 1000
      }
    },
    {
      id: "PROMO-A",
      name: "Promotion A",
      type: "BUY_X_GET_DISCOUNT_ON_Y",
      enabled: true,
      priority: 50,
      triggerSku: "SHOE",
      triggerQuantity: 1,
      targetSku: "SOCK",
      discount: {
        kind: "FIXED",
        valueCents: 1000
      }
    }
  ];

  const engine = new PromotionEngine(promotions);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "SHOE", quantity: 1, unitPriceCents: 5000 },
      { sku: "SOCK", quantity: 1, unitPriceCents: 2000 }
    ],
    cartSubtotalCents: 7000
  });

  expect(result.totalDiscountCents).toBe(1000);
  expect(result.appliedPromotions).toHaveLength(1);
  expect(result.appliedPromotions[0]?.promotionId).toBe("PROMO-A");

  const rejected = result.evaluations.find(
    (evaluation) => evaluation.promotionId === "PROMO-B"
  );

  expect(rejected?.outcome).toBe("REJECTED");
});
  test("independent promotions stack to maximize customer savings", () => {
  const promotions: Promotion[] = [
    {
      id: "SOCK-DISCOUNT",
      name: "30% off socks",
      type: "BUY_X_GET_DISCOUNT_ON_Y",
      enabled: true,
      priority: 10,
      triggerSku: "SHOE",
      triggerQuantity: 2,
      targetSku: "SOCK",
      discount: {
        kind: "PERCENTAGE",
        value: 30
      }
    },
    {
      id: "BAG-DISCOUNT",
      name: "$40 off bag",
      type: "BUY_X_AND_Y_GET_DISCOUNT_ON_Z",
      enabled: true,
      priority: 20,
      triggerSkuX: "CAMERA",
      triggerSkuY: "LENS",
      targetSku: "BAG",
      discount: {
        kind: "FIXED",
        valueCents: 4000
      }
    }
  ];

  const engine = new PromotionEngine(promotions);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "SHOE", quantity: 2, unitPriceCents: 5000 },
      { sku: "SOCK", quantity: 2, unitPriceCents: 1000 },
      { sku: "CAMERA", quantity: 1, unitPriceCents: 50000 },
      { sku: "LENS", quantity: 1, unitPriceCents: 20000 },
      { sku: "BAG", quantity: 1, unitPriceCents: 5000 }
    ],
    cartSubtotalCents: 87000
  });

  expect(result.totalDiscountCents).toBe(4600);
  expect(result.finalTotalCents).toBe(82400);
  expect(result.appliedPromotions).toHaveLength(2);

  expect(
    result.appliedPromotions.map((promotion) => promotion.promotionId).sort()
  ).toEqual(["BAG-DISCOUNT", "SOCK-DISCOUNT"]);
});
  test("percentage discount beats a free item when it saves more", () => {
  const promotions: Promotion[] = [
    {
      id: "FREE-SOCK",
      name: "Get one sock free",
      type: "BUY_X_AND_Y_GET_Z_FREE",
      enabled: true,
      priority: 100,
      triggerSkuX: "SHOE",
      triggerSkuY: "LACE",
      rewardSku: "SOCK"
    },
    {
      id: "PERCENT-SOCK",
      name: "Get 30% off socks",
      type: "BUY_X_GET_DISCOUNT_ON_Y",
      enabled: true,
      priority: 10,
      triggerSku: "SHOE",
      triggerQuantity: 1,
      targetSku: "SOCK",
      discount: {
        kind: "PERCENTAGE",
        value: 30
      }
    }
  ];

  const engine = new PromotionEngine(promotions);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "SHOE", quantity: 1, unitPriceCents: 5000 },
      { sku: "LACE", quantity: 1, unitPriceCents: 500 },
      { sku: "SOCK", quantity: 5, unitPriceCents: 1000 }
    ],
    cartSubtotalCents: 10500
  });

  expect(result.totalDiscountCents).toBe(1500);
  expect(result.appliedPromotions[0]?.promotionId).toBe("PERCENT-SOCK");

  const rejectedFree = result.evaluations.find(
    (evaluation) => evaluation.promotionId === "FREE-SOCK"
  );

  expect(rejectedFree?.outcome).toBe("REJECTED");
  expect(rejectedFree?.discountAmountCents).toBe(0);
});
  test("chooses a free item over a percentage discount", () => {
  const promotions: Promotion[] = [
    {
      id: "FREE-Z",
      name: "Get Z free",
      type: "BUY_X_AND_Y_GET_Z_FREE",
      enabled: true,
      priority: 10,
      triggerSkuX: "X",
      triggerSkuY: "Y",
      rewardSku: "Z"
    },
    {
      id: "DISCOUNT-Z",
      name: "Get 30% off Z",
      type: "BUY_X_AND_Y_GET_DISCOUNT_ON_Z",
      enabled: true,
      priority: 100,
      triggerSkuX: "X",
      triggerSkuY: "Y",
      targetSku: "Z",
      discount: {
        kind: "PERCENTAGE",
        value: 30
      }
    }
  ];

  const engine = new PromotionEngine(promotions);

  const result = engine.calculate({
    customer: { id: "customer-1" },
    items: [
      { sku: "X", quantity: 1, unitPriceCents: 5000 },
      { sku: "Y", quantity: 1, unitPriceCents: 5000 },
      { sku: "Z", quantity: 1, unitPriceCents: 4000 }
    ],
    cartSubtotalCents: 14000
  });

  expect(result.totalDiscountCents).toBe(4000);
  expect(result.finalTotalCents).toBe(10000);

  expect(result.appliedPromotions).toHaveLength(1);
  expect(result.appliedPromotions[0]?.promotionId).toBe("FREE-Z");

  const rejectedDiscount = result.evaluations.find(
    (evaluation) => evaluation.promotionId === "DISCOUNT-Z"
  );

  expect(rejectedDiscount?.outcome).toBe("REJECTED");
  expect(rejectedDiscount?.discountAmountCents).toBe(0);
});

  test("buy 3 boots, get 1 boot free", () => {
    const result = engine.calculate(request([
      { sku: "SKU-BOOT-01", quantity: 4, unitPriceCents: 10000 }
    ]));
    expect(result.totalDiscountCents).toBe(10000);
    expect(result.appliedPromotions[0]?.promotionId).toBe("PROMO-BOOT-B3G1");
  });

  test("buy jacket and scarf, get gloves free", () => {
    const result = engine.calculate(request([
      { sku: "SKU-JACKET-02", quantity: 1, unitPriceCents: 12000 },
      { sku: "SKU-SCARF-05", quantity: 1, unitPriceCents: 3000 },
      { sku: "SKU-GLOVE-03", quantity: 1, unitPriceCents: 2500 }
    ]));
    expect(result.totalDiscountCents).toBe(2500);
  });

  test("buy 2 shoes, get 30 percent off socks", () => {
    const result = engine.calculate(request([
      { sku: "SKU-SHOE-07", quantity: 2, unitPriceCents: 8000 },
      { sku: "SKU-SOCK-12", quantity: 2, unitPriceCents: 1000 }
    ]));
    expect(result.totalDiscountCents).toBe(600);
  });

  test("buy camera and lens, get $40 off bag, capped at target value", () => {
    const result = engine.calculate(request([
      { sku: "SKU-CAMERA-01", quantity: 1, unitPriceCents: 50000 },
      { sku: "SKU-LENS-04", quantity: 1, unitPriceCents: 20000 },
      { sku: "SKU-BAG-09", quantity: 1, unitPriceCents: 2500 }
    ]));
    expect(result.totalDiscountCents).toBe(2500);
    expect(result.finalTotalCents).toBe(70000);
  });

  test("rejects a cart subtotal that does not match line items", () => {
    const input = request([{ sku: "SKU-BOOT-01", quantity: 1, unitPriceCents: 1000 }]);
    input.cartSubtotalCents = 999;
    expect(() => engine.calculate(input)).toThrow(/cartSubtotalCents mismatch/);
  });

  test("higher priority promotion wins when two promotions discount same SKU", () => {
    const promotions: Promotion[] = [
      {
        id: "LOW", name: "Low", type: "BUY_X_GET_DISCOUNT_ON_Y",
        triggerSku: "A", triggerQuantity: 1, targetSku: "T",
        discount: { kind: "FIXED", valueCents: 100 }, priority: 1, enabled: true
      },
      {
        id: "HIGH", name: "High", type: "BUY_X_GET_DISCOUNT_ON_Y",
        triggerSku: "B", triggerQuantity: 1, targetSku: "T",
        discount: { kind: "FIXED", valueCents: 200 }, priority: 10, enabled: true
      }
    ];
    const customEngine = new PromotionEngine(promotions);
    const result = customEngine.calculate(request([
      { sku: "A", quantity: 1, unitPriceCents: 1000 },
      { sku: "B", quantity: 1, unitPriceCents: 1000 },
      { sku: "T", quantity: 1, unitPriceCents: 1000 }
    ]));
    expect(result.appliedPromotions.map((p) => p.promotionId)).toEqual(["HIGH"]);
    expect(result.evaluations.find((p) => p.promotionId === "LOW")?.outcome).toBe("REJECTED");
  });
});
