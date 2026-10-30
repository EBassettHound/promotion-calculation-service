import request from "supertest";
import { createApp } from "../src/http/app";

describe("POST /api/v1/promotions/calculate", () => {
  const auditRepository = { saveCalculation: jest.fn().mockResolvedValue(undefined) };
  const app = createApp(undefined, auditRepository as any);

  beforeEach(() => auditRepository.saveCalculation.mockClear());
  
  
  test("returns a calculation and persists its audit record", async () => {
    const response = await request(app)
      .post("/api/v1/promotions/calculate")
      .send({
        customer: { id: "customer-1" },
        items: [{ sku: "SKU-BOOT-01", quantity: 4, unitPriceCents: 10000 }],
        cartSubtotalCents: 40000
      });

    expect(response.status).toBe(200);
    expect(response.body.totalDiscountCents).toBe(10000);
    expect(response.body.finalTotalCents).toBe(30000);
    expect(auditRepository.saveCalculation).toHaveBeenCalledTimes(1);
    expect(response.headers["x-correlation-id"]).toBeDefined();
  });

  test("rejects malformed payloads", async () => {
    const response = await request(app)
      .post("/api/v1/promotions/calculate")
      .send({ customer: { id: "" }, items: [], cartSubtotalCents: -1 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(auditRepository.saveCalculation).not.toHaveBeenCalled();
  });

  test("does not return success when audit persistence fails", async () => {
    auditRepository.saveCalculation.mockRejectedValueOnce(new Error("database offline"));
    const response = await request(app)
      .post("/api/v1/promotions/calculate")
      .send({
        customer: { id: "customer-1" },
        items: [{ sku: "SKU-BOOT-01", quantity: 4, unitPriceCents: 10000 }],
        cartSubtotalCents: 40000
      });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(response.body.error.message).not.toContain("database");
  });
});
