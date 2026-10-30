# Engineering Decision Log

## Purpose

This document records the engineering decisions behind the Promotion Calculation Service, the alternatives considered, and the trade-offs accepted.

The primary goals are:

1. Correct and explainable promotion calculations.
2. Predictable behavior when multiple promotions qualify.
3. Reliable auditability of calculation outcomes.
4. Clear separation between business rules and infrastructure.
5. An implementation proportionate to the scope and time constraints of the assessment.

The service is intentionally not designed as a general-purpose promotion platform. Where a simpler implementation was selected, the assumptions and conditions that would justify revisiting it are documented.

---

## 1. Express as the HTTP Framework

### Problem

The service requires an HTTP API that validates requests, executes promotion calculations, persists audit records, and returns consistent responses.

The framework should support these responsibilities without coupling promotion logic to HTTP-specific concepts.

### Alternatives considered

**Express:** Minimal framework with a mature middleware ecosystem and explicit request handling.

**Fastify:** Offers schema-oriented request handling and performance-oriented defaults.

**NestJS:** Provides dependency injection, modules, decorators, and an opinionated application structure.

### Decision

Use Express with a thin HTTP layer.

### Reasoning

The primary complexity of this service is promotion evaluation, not HTTP request routing.

Express allows the API boundary to remain small while keeping the promotion engine independent of the framework.

This separation means business rules can be tested without starting an HTTP server or connecting to PostgreSQL.

The framework's maturity and familiarity also reduce implementation risk within the assessment's time constraints.

### Trade-offs

Express requires us to select and configure validation, error handling, and other middleware explicitly.

Fastify could reduce some integration work and offer better throughput under certain workloads. NestJS could become valuable if the service grew into a larger application with many modules and dependencies.

Neither advantage currently justifies the additional migration or framework complexity.

### Revisit when

Measured HTTP-layer performance becomes a bottleneck, or the application grows enough that stronger framework conventions would materially improve maintainability.

---

## 2. Ajv and JSON Schema for Request Validation

### Problem

The API accepts untrusted JSON containing customer information, cart lines, quantities, prices, and subtotals.

Invalid inputs must be rejected before they can affect monetary calculations or audit records.

### Alternatives considered

**Ajv with JSON Schema:** Standards-based runtime validation.

**Zod:** TypeScript-oriented validation with strong developer ergonomics.

**Joi:** Mature runtime validation with an expressive API.

### Decision

Use Ajv with JSON Schema at the HTTP boundary.

### Reasoning

JSON Schema provides a language-independent representation of the request contract.

This is useful if the service later needs to publish schemas to other consumers or reuse them in API documentation and testing tools.

Ajv also allows explicit constraints on monetary values, quantities, array sizes, and unexpected properties.

For example, the current schema requires integer quantities and prices, rejects negative values, and limits cart size.

### Trade-offs

JSON Schema is more verbose than some TypeScript-first alternatives.

The TypeScript type and runtime schema must also remain aligned. A TypeScript type alone does not validate incoming JSON.

Schema validation is not a substitute for business validation. For example, checking that a subtotal is an integer does not establish that it equals the sum of the cart lines.

### Revisit when

Schema authoring becomes a significant maintenance burden or the service needs richer validation that is difficult to express clearly in JSON Schema.

---

## 3. Jest for Automated Testing

### Problem

The implementation needs repeatable tests for promotion eligibility, monetary calculations, conflict resolution, HTTP validation, and failure handling.

### Alternatives considered

Jest, Mocha with Chai, and Vitest.

### Decision

Use Jest.

### Reasoning

Jest provides a test runner, assertions, mocks, and coverage tooling in one package.

This reduces setup complexity and supports both isolated engine tests and HTTP-level tests.

The tests are organized by responsibility:

- Engine tests verify business rules and monetary outcomes.
- API tests verify request handling, validation, and infrastructure failure responses.

### Trade-offs

Jest requires TypeScript integration configuration.

Vitest would also be a reasonable choice, particularly in a project already using its surrounding tooling.

Mocha and Chai provide flexibility but require more decisions about supporting libraries.

### Revisit when

The broader engineering organization standardizes on another runner or test execution performance becomes a measurable concern.

---

## 4. PostgreSQL with Explicit SQL for Audit Persistence

### Problem

Promotion calculations need durable records that explain what was applied, what was rejected, and why.

Operational logs alone are insufficient for reliable business-level audit history.

### Alternatives considered

**PostgreSQL with `pg`:** Relational storage accessed through explicit SQL.

**ORM such as Prisma:** Higher-level database access and schema tooling.

**Structured application logs only:** Lower implementation complexity but weaker business audit guarantees.

**Event broker:** Asynchronous persistence and integration with downstream consumers.

### Decision

Use PostgreSQL with parameterized SQL through `pg`.

### Reasoning

The audit data is structured and naturally relational.

PostgreSQL supports durable storage, indexing, and querying by calculation identifiers and other indexed fields.

Using explicit SQL makes database operations visible and avoids introducing an ORM abstraction for a small persistence layer.

Parameterized queries also separate query structure from untrusted values.

### Trade-offs

SQL and schema migrations must be maintained manually.

The application is responsible for managing database connections and handling persistence failures.

A broker could decouple calculation latency from persistence, but it would introduce delivery guarantees, retries, ordering, and consistency concerns that are outside the initial scope.

### Revisit when

Audit volume, retention requirements, query patterns, or integration requirements justify partitioning, asynchronous ingestion, or additional data infrastructure.

---

## 5. Modular Monolith Rather Than Microservices

### Problem

The service needs maintainable boundaries without unnecessary deployment complexity.

### Alternatives considered

A modular monolith, independently deployed microservices, or a tightly coupled application.

### Decision

Use a modular monolith with separate domain, engine, validation, HTTP, and persistence modules.

### Reasoning

Promotion evaluation is the core domain responsibility.

Keeping it independent of Express and PostgreSQL allows business rules to evolve without requiring changes to transport or persistence code.

A single deployable application also avoids network communication between components that currently have no operational reason to be separated.

### Trade-offs

All modules share one deployment lifecycle.

A failure affecting the application process can affect the entire service.

However, splitting the system into microservices would introduce network failures, distributed tracing, deployment coordination, and potentially distributed consistency problems.

Those costs are not justified by the current requirements.

### Revisit when

Different components have independently measurable scaling requirements, ownership boundaries, or deployment needs.

---

## 6. Integer Cents for Monetary Values

### Problem

Promotion calculations must avoid monetary inaccuracies caused by representing currency values as floating-point dollars.

### Alternatives considered

Floating-point dollars, integer minor units, and arbitrary-precision decimal arithmetic.

### Decision

Represent USD monetary amounts as integer cents.

### Reasoning

Using cents avoids representing values such as $9.99 as an imprecise floating-point dollar amount.

It also simplifies subtotal calculations, fixed discounts, and comparisons between competing promotions.

Percentage discounts are rounded to the nearest cent using a defined rounding policy.

### Trade-offs and limitations

JavaScript's `number` type is not an arbitrary-precision integer.

Integer cents alone do not guarantee correctness if calculations exceed `Number.MAX_SAFE_INTEGER`.

Percentage calculations may also involve intermediate multiplication and rounding.

Therefore, financial safety requires more than choosing integer cents:

- Request values must be bounded.
- Calculated totals must remain safe integers.
- Intermediate arithmetic must be checked or structured to avoid precision loss.
- Rounding behavior must be documented and tested.

The current Ajv schema places limits on cart size, quantities, prices, and declared subtotals.

Additional engine-level safe-integer checks are an appropriate hardening step, particularly because the engine can be called independently of the HTTP validation layer.

PostgreSQL `BIGINT` can store larger integers than JavaScript can represent exactly. Database storage capacity does not remove the need for application-level precision checks.

### Revisit when

The service adds currencies with different minor units, tax calculations requiring additional precision, or monetary values outside JavaScript's safe integer range.

At that point, a decimal library or `bigint`-based money representation should be evaluated.

---

## 7. Customer-Savings Maximization for Promotion Conflicts

### Problem

A cart may qualify for several promotions simultaneously.

Applying every eligible promotion could discount the same product multiple times. Conversely, choosing promotions purely by configured priority could reject a more valuable offer.

For example, a customer qualifying for both "Get Z Free" and "Get 30% Off Z" should not receive the smaller discount merely because it has a higher internal priority.

### Alternatives considered

**Apply every matching promotion:** Maximizes stacking but risks unintended discounts on the same product.

**Apply the best single promotion for the entire cart:** Prevents stacking but may reject unrelated promotions that could safely coexist.

**Apply promotions by priority:** Predictable for business operations but does not necessarily maximize customer savings.

**Maximize customer savings with target-SKU exclusivity:** Selects the largest discount for each target SKU while allowing promotions on different SKUs to coexist.

**General cart-wide optimization:** Could support more complex interactions but requires a richer model of promotion dependencies and resource consumption.

### Decision

Maximize customer savings with target-SKU exclusivity.

For each target SKU:

1. Evaluate all enabled promotions.
2. Identify eligible promotions and calculate their monetary discounts.
3. Select the promotion offering the largest discount.
4. Use configured priority to break equal-discount ties.
5. Use promotion ID as the final deterministic tie-breaker.
6. Record why competing promotions were not selected.

Promotions targeting different SKUs may apply together.

### Reasoning

The chosen policy is aligned with a customer-facing expectation: when multiple offers apply to the same product, the customer receives the most valuable one.

It also prevents unintended stacking on a single target SKU.

For example:

- Buy X and Y, Get Z Free: saves $40.
- Buy X and Y, Get 30% Off Z: saves $12.

The free-item promotion wins, even if the percentage promotion has a higher configured priority.

The engine compares actual monetary savings rather than assuming that one promotion type is always better.

A percentage discount across several units can therefore beat a promotion that makes one unit free.

### Why this is not a general optimizer

The current algorithm selects the best promotion independently for each target SKU.

This maximizes total savings under the current model because each promotion discounts one target SKU and qualifying trigger items are not generally consumed by other promotions.

It would not necessarily maximize savings if future rules introduced:

- Promotions discounting multiple SKUs together.
- Shared limits on qualifying units.
- Mutually exclusive promotion groups spanning different targets.
- Cart-wide discount budgets.

Those features would require a more general selection algorithm.

### Trade-offs

Maximizing customer savings may reduce merchant margin compared with priority-first selection.

It also requires evaluating monetary outcomes before resolving conflicts.

Priority remains useful for deterministic tie-breaking but is no longer the primary selection criterion.

### Revisit when

Business stakeholders introduce merchant-funded limits, stacking restrictions, promotion budgets, or rules that interact across multiple target SKUs.

---

## 8. Synchronous, Fail-Closed Audit Persistence

### Problem

The service must decide whether a successful calculation can be returned when its audit record cannot be stored.

### Alternatives considered

**Fail closed:** Return success only after the audit record is persisted.

**Best-effort persistence:** Return the calculation immediately and log persistence failures.

**Asynchronous queue or transactional outbox:** Decouple calculation processing from downstream audit storage.

### Decision

Persist the audit record before returning a successful response.

### Reasoning

The response contains financial decisions that may need to be explained to customers, support teams, or reviewers.

Returning success without durable audit history could create calculations that cannot be reconstructed or investigated later.

Fail-closed behavior establishes a clear contract: a successful API response corresponds to a persisted audit record.

### Trade-offs

This couples API availability and latency to database availability and write performance.

A database outage can prevent the service from returning successful calculations even when the calculation engine itself is healthy.

This is an intentional consistency-versus-availability trade-off.

A production system should also consider the ambiguous-failure case: the database may commit a record even if the client never receives the response.

Idempotency keys or a request-reconciliation mechanism would help prevent duplicate audit records during retries.

### Revisit when

Availability requirements justify asynchronous audit processing, provided the system can preserve an acceptable durability guarantee.

---

## 9. No Calculation-Result Cache Initially

### Problem

Repeated calculations may consume CPU and database capacity.

Caching could reduce repeated work but introduce correctness risks.

### Alternatives considered

Cache complete calculation results, cache promotion configuration, or introduce no cache initially.

### Decision

Do not cache calculation results in the initial implementation.

### Reasoning

Calculation results depend on cart contents, prices, customer context, and promotion definitions.

A result cache would require a carefully defined key that captures every relevant input and the applicable promotion configuration version.

Incorrect cache invalidation could return outdated discounts.

The initial implementation does not have measured performance evidence showing that caching is necessary.

### Trade-offs

Repeated identical requests may perform duplicate calculations.

However, avoiding a result cache reduces complexity and prevents an additional source of stale financial outcomes.

Caching immutable, versioned promotion configuration is a more attractive future optimization.

### Revisit when

Load testing identifies repeated calculation work as a meaningful bottleneck.

---

## 10. Repeatable Promotion Semantics

### Problem

Promotion descriptions such as "Buy 3, Get 1 Free" do not always specify whether an offer applies once per cart or repeatedly.

The interpretation directly affects customer savings.

### Alternatives considered

**Single application per cart:** Simple and potentially less expensive for the merchant.

**Repeatable application:** Every complete qualifying group earns the advertised reward.

**Configurable repeatability:** Flexible but requires additional promotion configuration and validation.

### Decision

Treat the same-SKU Buy X, Get One Free rule as repeatable.

For a Buy 3, Get 1 Free promotion:

- 3 units produce 0 free units.
- 4 units produce 1 free unit.
- 8 units produce 2 free units.
- 12 units produce 3 free units.

### Reasoning

Repeatability is a reasonable customer-facing interpretation when the offer does not explicitly state a per-cart limit.

The calculation uses complete groups of purchased and free units, ensuring qualifying units are accounted for.

### Trade-offs

This may be more generous than a merchant intended.

The behavior should therefore be configurable in a mature promotion platform rather than assumed universally.

Other promotion types may have different quantity semantics, which should be specified independently.

### Revisit when

Promotion configuration supports explicit maximum applications, per-customer limits, or nonrepeatable offers.

---

## 11. Duplicate SKUs and Highest-Priced Eligible Units

### Problem

A cart can contain multiple lines with the same SKU.

These lines may have identical or different unit prices.

Selecting only the first matching line can produce incorrect eligibility counts and discount amounts.

### Alternatives considered

**Reject duplicate SKUs:** Simplifies the engine but restricts otherwise valid cart representations.

**Merge all matching lines:** Works for identical prices but can lose pricing information when prices differ.

**Evaluate matching lines together while preserving prices:** Supports duplicate SKUs without changing the original monetary values.

### Decision

Accept duplicate SKU lines and calculate discounts across all matching lines.

When a promotion discounts only some eligible units, select the highest-priced eligible units first.

### Reasoning

A customer purchasing five socks should receive the same eligible quantity whether the cart contains one line with quantity five or multiple lines representing those five units.

When unit prices differ, selecting the highest-priced eligible units is consistent with the decision to maximize customer savings.

For example, if one sock is free and the cart contains socks priced at $8 and $10, the $10 sock is selected.

Percentage discounts covering all eligible units use the combined eligible monetary value.

### Trade-offs

Supporting multiple prices requires more calculation logic than simply looking up one line by SKU.

The highest-priced-first policy can be more expensive for the merchant.

It also introduces allocation questions when trigger and reward SKUs overlap, or when future promotions impose shared quantity limits.

### Revisit when

The service introduces line-level discount reporting, refunds requiring exact unit allocation, or promotion rules that consume specific purchased units.

---

## Summary of Architectural Boundaries

The current design deliberately favors correctness, explainability, and manageable complexity over premature generalization.

The main boundaries are:

- **HTTP and validation:** Accept and validate requests.
- **Promotion engine:** Determine eligibility, monetary discounts, and conflict outcomes.
- **Persistence:** Store auditable calculation records.
- **Operational logging:** Record technical events and failures.

The most significant accepted limitations are the absence of a general cart-wide promotion optimizer, synchronous dependence on PostgreSQL for successful responses, and the need for additional financial precision hardening beyond HTTP-level schema validation.

These are explicit engineering trade-offs rather than accidental omissions.
