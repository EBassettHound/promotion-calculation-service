# AI Usage Report

## Tools used

- ChatGPT was used as an engineering assistant to compare architectural options, generate an initial implementation scaffold, and draft documentation.

## Some instances of prompts used
- "Compare Zod and Ajv for request and promotion configuration validation."
- "Evaluate Express, Ajv, Jest, PostgreSQL and node-postgres for this service."
- "Design an explainable conflict-resolution policy for overlapping promotions."
## Generated output rejected or revised

The design discussion initially considered using an application logger as the audit store. This was rejected because operational logs are not a durable, relational business audit record. SQL audit tables were selected, while structured stdout logs remain for diagnostics.
## Security and performance review
The implementation uses Ajv strict schemas, request size limits, unknown-property rejection, parameterized SQL, generic client-facing 500 errors, and integer cents. These controls are not a substitute for a full security review. The synchronous audit write adds database latency and makes database availability part of request availability; this is an intentional consistency trade-off.

## Validation performed

The included Jest tests cover the four configured rule types, one conflict case, subtotal mismatch, request validation, and audit persistence failure. Additional tests were added for edge cases, given time constraints with workload at restaurant I found this appropriate.
