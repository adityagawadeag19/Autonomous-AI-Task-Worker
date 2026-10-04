# Relay — Autonomous AI Task Worker prototype

Relay is a small, runnable prototype for one complete business workflow: find the newest invoice for a named vendor, read its fields, write a record to an internal ledger, and verify that the saved record matches the source. The inbox and ledger contain sample data and run entirely in the browser.

## Run it

No install, API key, or account is needed. Open `index.html` in a modern browser. For a local web server, run `python -m http.server 8000` from this directory and open `http://localhost:8000`.

Try: **“Find the latest invoice from Acme, record it in the ledger, and tell me when it's done.”** Acme's sample invoice is over the demo's $2,000 approval threshold, so review its details and approve or decline the write. Try Northstar for a lower-value run that proceeds without approval. The run panel shows the goal interpretation, chosen steps, tool observations, source details, saved record, and verification evidence. You can also enable the temporary inbox error to see one read-only retry, omit the vendor to see clarification, or ask for an unsupported task to see a safe stop. The Acme sample invoice is dated September 28, 2026; Northstar's is September 30, 2026. Ledger records and a task count persist in local browser storage. “Reset demo data” clears them.

### Suggested live demo

1. Run the Acme task and approve the write; show the approval decision, saved ledger row, and read-back verification.
2. Run the same task again to show idempotency without another approval prompt, or use Northstar to show a lower-value task completing without a gate.
3. Enable the timeout option for one run, then submit a request without a vendor to show retry and clarification behavior.

## Architecture

Check the “simulate one temporary inbox error” option before a run to see failure detection and one read-only retry. The same inbox adapter is used; the option injects one timeout so recovery is repeatable in a live demo.

- `index.html` and `styles.css` provide the single-page task console, tool status, ledger, timeline, and evidence view.
- `app.js` contains a bounded goal interpreter, small task planner, asynchronous execution loop, and local tool adapters for inbox search, invoice reading, ledger writes, and ledger verification.
- The source inbox is an in-memory sample dataset. The ledger and task history use `localStorage` so completed work survives a page refresh.

The worker selects invoices by vendor and sorts matching documents by invoice date. It remembers the selected invoice as structured data between tool calls. A ledger create is idempotent by invoice number, so rerunning a completed request verifies the existing row instead of duplicating it. A task is marked complete only after reading the saved row back and comparing invoice number, vendor, amount, currency, and due date. Writes for USD invoices at or above $2,000 pause for explicit human approval; the threshold is a demo policy, not financial advice or a production control. Completion evidence also shows the source email address, subject, invoice date, and key invoice fields.

## Design decisions and safety

The scope is intentionally narrow and self-contained: a working simulated company environment makes execution and verification observable without real credentials or third-party access. The UI shows each action and its observation, and records that already exist are reused without another approval prompt. Missing or conflicting vendor names trigger a clarification question before a write. Higher-value new writes pause for approval. Unsupported requests and payment, email, or document-submission requests stop without changing data. The “tell me” result is shown in the app; the prototype does not send external messages.

This version uses deterministic rules, not an LLM. No model, API, external service, or pre-built agent framework is used. That makes the demo reproducible and honest about what it can do, but limits its language understanding and breadth. No demo video or hosted live demo is included; the steps above reproduce the workflow locally.

## Assumptions and limitations

- The supported vendors and invoices are the sample records in `app.js`.
- Invoice fields are structured sample data; this prototype does not parse PDF or image attachments.
- Task interpretation supports one invoice vendor per request and a small vocabulary of invoice and ledger intents.
- Tool adapters run in the browser and use local state; there is no backend, authentication, or multi-user support.
- The flow demonstrates one bounded retry on a transient inbox error, but does not include a network-backed retry policy or computer/browser automation.
- Vendor matching and invoice selection are simple exact-name and date sorting rules.

## Next steps

1. Replace sample adapters with authenticated, least-privilege email and accounting APIs behind a backend.
2. Add a model-driven planner with strict schemas, bounded tool permissions, and prompt-injection defenses for document contents.
3. Extract fields from real PDF attachments and track source spans/confidence for human review.
4. Add durable execution state, retry/backoff, and recovery after process restarts; replace the demo approval threshold with a configurable policy.
5. Add a wider evaluation set for different phrasings, duplicate invoices, malformed documents, tool timeouts, and mismatched verification fields.

## Repository contents

- `index.html` — prototype interface
- `styles.css` — responsive visual design
- `app.js` — task interpreter, execution loop, sample tools, and persistence
