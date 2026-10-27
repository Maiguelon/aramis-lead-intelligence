# Two native AI analyses

`n8n/leadops-openai-pilot.json` is a manual, fictional-input smoke test of the same request and validation functions used by the Node adapter. It has no CRM or email nodes. It verifies model generation and evidence handling separately from commercial record creation.

## Run and inspect

The export starts in **preview**. It shows the minimized outbound context and executes no HTTP nodes. **live** requires `confirmPaidDemo=YES_RUN_AI_DEMO` and the saved OpenAI credential on both HTTP nodes. Generation and web tools consume paid API usage; repeat executions may incur new charges. Automatic retries are disabled.

Two fixtures are available:

- `basic`: a fictional website inquiry with no company, budget or launch date. No web tool is supplied.
- `public_company`: the same fictional inquiry with Aramis Agency and its public website supplied explicitly. The request allows public company research, with a requested limit of three web tool calls so it can search and open pages.

Both pass a strict fictional-identity and explicit-consent gate. No private person is researched. Name, email, phone, social handle and consent records are excluded from the model context. Email and international-phone patterns in supplied text are redacted; this minimizes data, but does not guarantee free text contains no personal information. Derived service hints stay internal so a person's occupation is not mistaken for requested services.

Agent 1 summarizes and researches; Agent 2 recommends service fit and certainty. Missing budget or timing alone is not low fit. Human review is required in the output schema and validator. Certainty is a qualitative recommendation, not a calibrated probability of conversion.

## Evidence and failure rules

Both responses use strict JSON schemas. Form-fact sources are constrained to known intake labels. Qualification sources are constrained to those labels and the supplied research URLs. The request uses `store=false`, bounded output tokens and low reasoning effort on the pilot's GPT-5 model. Model IDs remain operator configuration.

An external fact must cite an HTTPS URL present in the provider's inline citations or in a completed web tool's opened/consulted-page evidence. A model-written URL alone is rejected. Structured JSON may omit inline annotations, so completed `open_page` evidence is also accepted. The provider trace must show completed research before the analysis can claim research was performed. These checks establish source provenance, not factual entailment; the reviewer must still inspect the source.

Invalid, refused or incomplete research stops before qualification. Provider, permission and quota failures remain separate, and no raw provider error is copied into the summary. Attempts and reported token usage are recorded even when output fails validation. Missing usage data does not prove an attempt was free.

The preparation helper validates the saved inactive, unpinned graph and logic before binding credential references. It snapshots the workflow privately and never reads credential values. The runner saves a private intent before a paid run and restores preview in `finally`. An unresolved earlier attempt blocks another paid run until reviewed.

```powershell
# Replace the placeholder with the local personal-project ID; no API key belongs here.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-n8n-ai-pilot.ps1 -ProjectId YOUR_LOCAL_PROJECT_ID

# Explicit paid test, after inspecting preview and configuration:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-n8n-ai-pilot.ps1 -ProjectId YOUR_LOCAL_PROJECT_ID -Fixture public_company -Live -ConfirmPaidDemo
```

Regenerate with `npm run build:n8n-ai-pilot` after shared contract or builder changes. The preparation helper deliberately refuses to overwrite a locally changed workflow; review and migrate the change explicitly.

## Verified — 2026-10-27

All 54 automated tests passed. Native n8n 2.41.7 preview executed no HTTP nodes. The basic fixture completed two actual Responses requests and produced high service fit, medium certainty, explicit unknowns and no invented extra service request. A live analysis without web research is labelled as live analysis rather than an offline stub.

The public-company fixture also completed both analyses. The research opened Aramis's website and returned three externally sourced facts linked to `https://aramis.agency/`; the qualification cited those supplied sources and retained human review. A no-reliable-findings run also returned no external facts. Development failures were retained and reviewed rather than silently retried; sanitized receipts and provider traces remain private under `.local/n8n/leadops-verification/`.

The final manual workflow was restored to inactive preview. These tests created no CRM records and sent no mail. Integration with the persistent intake ledger, CRM handoff and actual internal delivery is a separate remaining step.

Official references: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [web research and source evidence](https://developers.openai.com/api/docs/guides/tools-web-search), [GPT-5.4 Mini capabilities](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
