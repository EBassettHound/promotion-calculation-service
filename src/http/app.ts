import express, { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { PromotionEngine } from "../engine/promotion-engine";
import { validateCalculateRequest } from "../validation/schemas";
import { AuditRepository } from "../db/audit-repository";
import { DomainValidationError } from "../domain/types";
export function createApp(
  engine = new PromotionEngine(),
  auditRepository = new AuditRepository()
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use((req, res, next) => {
    const correlationId = req.header("x-correlation-id")?.slice(0, 100) || randomUUID();
    res.setHeader("x-correlation-id", correlationId);
    res.locals.correlationId = correlationId;
    next();
  });

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.post("/api/v1/promotions/calculate", async (req: Request, res: Response, next: NextFunction) => {
    if (!validateCalculateRequest(req.body)) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request payload is invalid.",
          details: validateCalculateRequest.errors?.map((error) => ({
            path: error.instancePath,
            message: error.message
          }))
        },
        correlationId: res.locals.correlationId
      });
    }

    try {
      const result = engine.calculate(req.body);
      // Fail closed: only return success after the audit transaction commits.
      await auditRepository.saveCalculation(req.body.customer.id, result);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    // Do not expose SQL, stack traces, or internal implementation details.
    const correlationId = res.locals.correlationId;
    if (error instanceof DomainValidationError) {
      return res.status(400).json({
        error: { code: "BUSINESS_VALIDATION_ERROR", message: error.message },
        correlationId
      });
    }
    console.error(JSON.stringify({
      level: "error",
      event: "request_failed",
      correlationId,
      message: error.message
    }));
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "The calculation could not be completed." },
      correlationId
    });
  });

  return app;
}
