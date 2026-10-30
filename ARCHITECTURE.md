# Architecture — Promotion Calculation Service

## 1. Overview

The Promotion Calculation Service is implemented as a TypeScript modular monolith.

Its primary responsibility is to evaluate configured promotions against a customer's cart, resolve competing discounts, calculate the final payable amount, and persist an auditable explanation of the result.

The architecture separates five concerns:

- **HTTP:** Express handles requests, responses, and error handling.
- **Validation:** Ajv validates incoming JSON against explicit schemas.
- **Domain:** TypeScript types represent carts, promotions, and calculation outcomes.
- **Engine:** Pure business logic evaluates promotions and resolves conflicts.
- **Persistence:** PostgreSQL stores calculation summaries and promotion evaluations.

The promotion engine has no direct dependency on Express or PostgreSQL. This allows its business behavior to be tested independently of infrastructure.

### Request flow

```text
Client
  |
  v
Express HTTP API
  |
  v
Ajv Request Validation
  |
  v
Promotion Engine
  |
  +--> Validate Cart Subtotal
  |
  +--> Evaluate Enabled Promotions
  |
  +--> Calculate Candidate Discounts
  |
  +--> Resolve Conflicts by Customer Savings
  |
  +--> Calculate Final Total
  |
  v
Audit Repository
  |
  v
PostgreSQL Transaction
  |
  v
HTTP Response
```

A successful response is returned only after audit persistence completes.

This creates an intentional dependency between API availability and audit durability.

---

## 2. Component Responsibilities

### HTTP/API Layer

The Express layer is responsible for:

- Exposing the versioned REST API.
- Accepting and parsing JSON requests.
- Enforcing request size limits.
- Invoking request validation.
- Generating or propagating correlation identifiers.
- Calling the calculation engine.
- Coordinating audit persistence.
- Returning consistent HTTP responses.

Business rules are not implemented in Express route handlers.

### Validation Layer

Ajv validates requests at the external trust boundary.

The schema constrains:

- Required fields and permitted properties.
- Customer identifiers.
- Cart size.
- SKU values.
- Integer quantities.
- Integer prices in cents.
- Declared cart subtotals.

Validation rejects malformed or out-of-range requests before they reach the calculation engine.

However, schema validation cannot establish all business invariants. The engine independently verifies that the declared cart subtotal matches the sum of the cart lines.

### Domain Layer

The domain layer defines the data structures used throughout the calculation process.

Promotion types are represented explicitly rather than through arbitrary executable expressions.

This makes supported promotion behavior visible in the code and allows TypeScript to help detect unsupported rule variants.

### Promotion Engine

The engine has two major phases.

**Phase 1: Evaluate promotions**

Each enabled promotion is checked against the cart.

For each promotion, the engine determines:

- Whether its qualifying conditions are satisfied.
- Which SKU receives the discount.
- How many units are eligible.
- The monetary value of the discount.
- Why the promotion qualified or did not qualify.

**Phase 2: Resolve conflicts**

Eligible promotions are grouped by target SKU.

For each target SKU, the engine selects the promotion offering the largest monetary discount.

Ties are resolved by:

1. Higher configured priority.
2. Ascending promotion ID.

Promotions targeting different SKUs may apply together.

The engine returns the selected promotions, rejected evaluations, total discount, and final cart total.

### Persistence Layer

The `AuditRepository` owns database writes.

Calculation summaries and individual promotion evaluations are persisted transactionally.

This ensures the audit record does not contain only part of a calculation's outcome.

The persistence implementation is separate from the engine, allowing tests to exercise business rules without a database connection.

### Tests

Automated tests cover:

- Promotion eligibility.
- Discount calculations.
- Same-SKU repeatability.
- Duplicate-SKU cart lines.
- Different prices for the same SKU.
- Highest-priced eligible unit selection.
- Discount caps and rounding.
- Customer-savings conflict resolution.
- Independent promotion stacking.
- HTTP validation and error handling.

Engine tests use isolated promotion configurations, while API tests exercise the HTTP boundary with an injected audit repository.

---

## 3. Promotion Rule Evaluation

The service uses explicit rule evaluation rather than a general-purpose promotion expression language.

This is appropriate because the assessment defines a limited set of promotion types.

The current design supports four rule categories:

1. Buy X, Get Y Free.
2. Buy X and Y, Get Z Free.
3. Buy X, Get a Discount on Y.
4. Buy X and Y, Get a Discount on Z.

Each rule type has dedicated evaluation logic.

### Why not a general-purpose rules engine?

A general-purpose rules engine could support business-authored expressions and more complex conditions.

However, it would also introduce additional concerns:

- Expression parsing and validation.
- Execution safety.
- Rule versioning.
- More complex debugging.
- A larger testing surface.

Explicit TypeScript evaluation keeps the current rules understandable and easier to verify.

### Trade-off

Adding a new promotion type requires a code change and corresponding tests.

If promotion definitions eventually need to be managed dynamically by business users, a more configurable rule representation may become appropriate.

---

## 4. Conflict Resolution Policy

### Problem

A cart may qualify for several promotions that discount the same product.

Applying all of them could produce unintended discount stacking.

Choosing the highest-priority promotion could give the customer a smaller discount than another eligible offer.

### Selected strategy

**Maximize customer savings while allowing only one discounting promotion per target SKU.**

For each target SKU:

1. Evaluate all eligible promotions.
2. Calculate each candidate's actual monetary discount.
3. Select the largest discount.
4. Break equal-discount ties using priority.
5. Break remaining ties using promotion ID.
6. Record why competing promotions were not selected.

Promotions targeting different SKUs may stack.

### Example

Suppose a customer qualifies for:

- Promotion A: Get one item of SKU-Z free, saving $40.
- Promotion B: Get 30% off SKU-Z, saving $12.

Promotion A wins because it provides greater customer savings.

If Promotion B instead saved $50 across eligible units, Promotion B would win.

This policy compares actual discount amounts rather than assuming one promotion type is always superior.

### Scope and limitations

This is not a general-purpose cart-wide optimization algorithm.

The engine makes independent decisions for each target SKU.

That is appropriate for the current promotion model, where each promotion discounts one target SKU and qualifying items are not generally consumed across competing promotions.

Future requirements could invalidate that assumption.

Examples include:

- Promotions that discount multiple target SKUs.
- Shared qualifying-unit limits.
- Mutually exclusive promotions across different SKUs.
- Maximum discount budgets.
- Complex promotion stacking groups.

Those features would require a more sophisticated conflict model.

---

## 5. Quantity and Pricing Semantics

### Repeatable promotions

Same-SKU Buy X, Get One Free promotions are repeatable.

For example, Buy 3, Get 1 Free produces:

| Purchased units | Free units |
|---|---:|
| 3 | 0 |
| 4 | 1 |
| 8 | 2 |
| 12 | 3 |

The engine counts complete qualifying groups rather than limiting the promotion to one application per cart.

### Duplicate SKU lines

The engine accepts multiple cart lines containing the same SKU.

Eligibility is calculated using the combined quantity across matching lines.

This avoids incorrect behavior when a customer purchases the same product through multiple cart entries.

### Different prices for the same SKU

Matching cart lines retain their original unit prices.

When only some eligible units receive a discount, the highest-priced eligible units are discounted first.

For example, if a customer has eligible socks priced at $8 and $10 and receives one free sock, the $10 sock is selected.

This is consistent with the customer-savings policy.

### Limitations

The current result model does not provide a complete per-unit allocation ledger.

If the service later supports partial refunds, line-specific promotions, or shared qualifying units, it may need to record exactly which purchased units received each discount.

---

## 6. Monetary Calculations

All monetary values are represented as integer cents.

This avoids using floating-point dollar values for basic price and discount calculations.

For example:

```text
$19.99 -> 1999 cents
```

The engine calculates the cart subtotal from item quantities and unit prices, then compares it against the subtotal supplied in the request.

Percentage discounts are rounded to the nearest cent.

Discounts are capped by the eligible item value to prevent a promotion from discounting more than the relevant merchandise value.

### Precision limitations

JavaScript represents ordinary numbers using IEEE 754 floating-point arithmetic.

Although integer values are exact within the safe integer range, values beyond `Number.MAX_SAFE_INTEGER` may lose precision.

Percentage calculations also require care with intermediate arithmetic.

The request schema currently places explicit bounds on quantities, prices, and subtotals.

Additional engine-level safe-integer checks and safe intermediate arithmetic remain financial-hardening considerations until their implementation and tests are verified.

### Future requirements

More complex tax calculations, additional currencies, or larger monetary values may justify adopting a decimal or `bigint`-based money representation.

---

## 7. Persistence and Auditability

PostgreSQL provides durable audit storage.

The current persistence design records:

- Calculation-level outcomes.
- Per-promotion evaluations.
- Applied and rejected promotion information.
- Discount amounts.
- Explanatory reasons.

Related audit records are written within a database transaction.

### Why synchronous persistence?

The service does not return a successful calculation until the audit write completes.

This ensures that a successful response has a corresponding durable explanation.

### Trade-off

Database availability becomes part of the API's availability requirements.

If PostgreSQL is unavailable, the service cannot successfully complete the request even if the engine has already calculated a result.

This is an intentional choice favoring auditability over availability.

### Future improvements

A production deployment should consider:

- Immutable promotion configuration versions.
- Audit retention and archival policies.
- Idempotency for retried requests.
- Database backup and recovery procedures.
- Audit table partitioning as volume increases.

---

## 8. Scaling from 100 to 10,000 Requests per Minute

The initial design favors operational simplicity.

The following scaling stages are planning assumptions, not measured capacity guarantees.

### Approximately 100 requests/minute

Start with:

- One stateless API instance.
- A bounded PostgreSQL connection pool.
- Appropriate indexes.
- Basic application and database monitoring.

A single instance may be sufficient, but this must be verified through load testing.

### Approximately 1,000 requests/minute

Measure:

- Request throughput.
- p95 and p99 latency.
- Database query latency.
- Database connection pool saturation.
- Event-loop utilization.
- Audit write duration and failure rates.

Potential improvements include:

- Horizontal API replicas.
- Connection pool tuning.
- Query and index optimization.
- Load testing against realistic promotion and cart distributions.

### Approximately 10,000 requests/minute

At this scale, audit persistence may become more significant than promotion evaluation.

Possible improvements include:

- Caching immutable, versioned promotion configuration.
- Partitioning large audit tables.
- Separating read-heavy configuration access from audit writes.
- Scaling database capacity based on measured write throughput.
- Introducing asynchronous audit/event pipelines if consistency requirements permit.

Moving audit persistence to an asynchronous queue would change the current guarantee that a successful response follows a committed audit transaction.

That change requires an explicit product and architecture decision.

### Scaling principle

Optimize based on observed bottlenecks rather than introducing distributed infrastructure solely because a traffic target has increased.

---

## 9. Caching Strategy

The service does not initially cache calculation responses.

Results depend on cart contents, unit prices, customer context, and promotion configuration.

A result cache would need to account for all these inputs and the exact configuration version.

Incorrect cache invalidation could return stale financial results.

### Future optimization

Cache immutable promotion configuration using explicit version identifiers.

Version-based invalidation is preferable to relying solely on time-to-live expiration.

Customer-specific eligibility results should not be cached without a defined privacy, correctness, and invalidation strategy.

---

## 10. Failure Handling and Recovery

### Invalid requests

Malformed requests and schema violations are rejected before promotion evaluation or audit persistence.

The API returns a controlled client error.

### Subtotal mismatch

The engine checks whether the declared cart subtotal equals the calculated subtotal.

A mismatch raises a domain validation error.

The HTTP mapping of domain errors should be verified against the implementation before claiming that every domain validation failure receives a specific client-error status.

### Database unavailability

Audit persistence failures prevent a successful calculation response.

The API returns an error rather than reporting an unaudited calculation as successful.

### Partial audit writes

Database transactions ensure that related audit records either commit together or roll back together.

### Process failure

A process crash may interrupt calculation or persistence.

A client may also fail to receive a response after the database has already committed an audit record.

Production retries therefore require an idempotency or reconciliation strategy to prevent duplicate records.

### Disaster recovery

Production operation should include:

- Automated backups.
- Point-in-time recovery where appropriate.
- Tested restoration procedures.
- Monitoring and alerting for persistence failures.

These are production requirements, not claims that all recovery infrastructure is already implemented.

---

## 11. Security

### Current design protections

The application uses:

- Strict request schemas.
- Rejection of unknown properties.
- Bounded cart sizes and numeric inputs.
- Request body size limits.
- Parameterized SQL.
- Controlled HTTP error responses.

### Production requirements

A production deployment should additionally address:

- Authentication and authorization.
- Transport encryption.
- Least-privilege database credentials.
- Rate limiting.
- Secret management.
- Data retention.
- Sensitive customer information handling.
- Access controls for audit records.

Authentication and authorization are treated as upstream concerns for the assessment.

That assumption must be validated before deploying the service in an environment where requests are not already authenticated and authorized.

---

## 12. Observability

The architecture separates technical operational events from business audit history.

### Technical logging

Structured JSON logs support diagnosis of application failures.

Correlation identifiers help associate logs with individual requests.

### Business audit records

PostgreSQL stores promotion decisions and explanatory reasons.

This allows support and engineering teams to investigate why a particular discount was applied or rejected.

### Recommended production metrics

A production deployment should measure:

- Request counts by endpoint and status.
- p50, p95, and p99 request latency.
- Validation failure rates.
- Calculation duration.
- Promotions evaluated, applied, and rejected.
- Database query latency.
- Connection pool wait time.
- Audit transaction failures.

Alerts should cover sustained latency, elevated server errors, database connection exhaustion, and audit persistence failures.

These metrics represent recommended instrumentation and should not be interpreted as already implemented unless verified.

---

## 13. Known Limitations and Future Evolution

The architecture intentionally does not include:

1. A general-purpose promotion expression language.
2. A globally optimal solver for complex promotion interactions.
3. Runtime promotion management by business users.
4. A complete per-unit discount allocation ledger.
5. Calculation-result caching.
6. An asynchronous audit pipeline.
7. A fully implemented production observability stack.

These omissions reflect the current scope and time constraints.

The design preserves clear boundaries so these capabilities can be added when justified by requirements or measured operational needs.

The most important future architectural changes would be driven by:

- More complex promotion dependencies.
- Greater financial precision requirements.
- Audit write throughput.
- Runtime promotion configuration.
- Stricter availability requirements.

---

## 14. Architecture Summary

The service uses a modular monolith because its current complexity is primarily in business rules, not distributed coordination.

The promotion engine is isolated so its behavior can be tested independently.

Customer-savings maximization provides a deterministic and explainable conflict policy for the current rule model.

Integer cents, bounded inputs, and explicit rounding support monetary correctness, while additional financial safety checks remain a hardening consideration.

Synchronous PostgreSQL audit persistence favors durable explanations over maximum availability.

The overall design prioritizes correctness, testability, auditability, and understandable trade-offs over premature infrastructure complexity.

Detailed alternative analysis is recorded in `DECISIONS.md`.