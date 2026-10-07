# QA Scorecard

Evaluation tool for calls and WhatsApp conversations: live scoring, calibration comparison and an agent dashboard.

- **Evaluate:** pick the form (Calls / WhatsApp) and the interaction type. Items that do not apply to that type are set to N/A automatically. Evidence (timestamp) is required for every "Not met" and "Error".
- **Scoring:** NC score = weights met ÷ weights applicable. Any critical error (CC / EU / BC) sets the final score to 0%. Pass = 85% or more with no critical error.
- **Calibration:** all evaluators score the same interaction with the same "Calibration sample ref". The Calibration page shows the scores side by side, the gap from the agreed score (target ±5 points) and the items where evaluators differ.
- **Dashboard:** average final score, NC score and CC / EU / BC accuracy per agent, plus the most missed items.
- **Certification:** per agent, from saved evaluations in a date window: live QA average (before critical zeroing), evaluations with a critical error, Odoo accuracy (Odoo items passed out of Odoo items scored in the live calls) and the two role-plays, which are scored on the same form with "Certification role-play" ticked. Calibration samples and role-plays are left out of the live numbers and the dashboard. Decision: Certified, Conditional, Not certified or Pending (fewer than 5 scored calls or 2 role-plays). Only coaching notes are typed on the page; they stay on the browser, so download the CSV to keep them.

Items, weights and examples live in `forms.js`. Change them there and bump `version`.

## Connecting to the Google Sheet

The sheet link is set in `config.js`. The access key is not stored in this public repository.

- **Admin (once):** Settings > paste the access key > Save > **Copy setup link for evaluators**. Send that link privately to each evaluator.
- **Evaluators (once):** open the setup link. Their browser is connected; they then pick their own name on the Evaluate page.

## Names

Agents and evaluators are chosen from one shared list (the "Roster" tab in the Google Sheet) so reports group correctly. "+ Add a new name…" adds a name; names that look similar to an existing one are flagged first. Rename or deactivate names in the Roster tab (Active = No).

## Google Sheet setup (one time)

1. Create a Google Sheet (e.g. "QA Evaluations").
2. Extensions > Apps Script. Replace the code with `apps-script/Code.gs`.
3. Change `ACCESS_KEY` at the top to a private key. Save.
4. Deploy > New deployment > **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and allow access.
5. Put the web app link (ends with `/exec`) in `config.js`.

After updating `Code.gs` later: Deploy > Manage deployments > Edit > Version: **New version** > Deploy. The link stays the same.

## Privacy

The tool itself holds no evaluation data. Evaluations live only in the Google Sheet. Do not put customer names or phone numbers in comments; use the Odoo lead ref.
