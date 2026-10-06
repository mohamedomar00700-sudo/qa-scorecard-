# QA Scorecard

Evaluation tool for calls and WhatsApp conversations: live scoring, calibration comparison and an agent dashboard.

- **Evaluate:** pick the form (Calls / WhatsApp) and the interaction type. Items that do not apply to that type are set to N/A automatically. Evidence (timestamp) is required for every "Not met" and "Error".
- **Scoring:** NC score = weights met ÷ weights applicable. Any critical error (CC / EU / BC) sets the final score to 0%. Pass = 85% or more with no critical error.
- **Calibration:** all evaluators score the same interaction with the same "Calibration sample ref". The Calibration page shows the scores side by side, the gap from the agreed score (target ±5 points) and the items where evaluators differ.
- **Dashboard:** average final score, NC score and CC / EU / BC accuracy per agent, plus the most missed items.

Items, weights and examples live in `forms.js`. Change them there and bump `version`.

## Saving to a Google Sheet (one-time setup)

1. Create a new Google Sheet (e.g. "QA Evaluations").
2. Extensions > Apps Script. Replace the code with `apps-script/Code.gs`.
3. Change `ACCESS_KEY` at the top to a private key of your choice. Save.
4. Deploy > New deployment > type **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and allow access.
5. Copy the web app link (ends with `/exec`).
6. In the tool, open **Settings**, paste the link and the key, then **Test connection**.

Each evaluator does step 6 once in their own browser. Without the link, each evaluation is downloaded as a file; files can be imported back on the Calibration and Dashboard pages.

## Privacy

The tool itself holds no evaluation data. Evaluations live only in the Google Sheet. Do not put customer names or phone numbers in comments; use the Odoo lead ref.
