# Aramis LeadOps

Portfolio implementation of an inbound lead-review process for Aramis. The scenario and all committed submissions are fictional. Aramis currently obtains most work by referral; this project does not claim measured commercial impact.

The intended path is intake → deterministic validation and consent gate → HubSpot contact → two bounded AI analyses → review email → human decision in HubSpot. HubSpot is the commercial system of record. The email is an alert with a link, not a second CRM.

## Status

Work in progress. See [scope and acceptance contract](docs/01-scope.md). No production Formspree, HubSpot, OpenAI, or email credentials are stored here.

## Repository rules

- Demo records must be fictional.
- No automatic outreach to prospects.
- No changes to Aramis-Web, GestorAramis, or AramisEditorial from this project.
- Integration claims require live validation; a mock pass is labelled as such.
