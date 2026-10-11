// Team settings. The access key is NOT stored here (this repository is public);
// evaluators receive it once through the private setup link.
window.QA_CONFIG = {
  // Default certification rules; each browser can change them on the Certification page.
  cert: { calls: 5, rolePlays: 2, qa: 85, odoo: 90, failCrit: 2 },
  sheetUrl: "https://script.google.com/macros/s/AKfycbxREN7jc2IfSI1q6RkZNMYG812eV4AY73EulaQA-XlM-1JFYQYGuZgzsWZAsf9Vf2yTqQ/exec",
  // Earlier web app links of the same sheet; browsers still using one are moved to sheetUrl.
  oldSheetUrls: ["https://script.google.com/macros/s/AKfycbzeltmwhgL4fwwmh_JhQCDCGybnZW4gkD-CfXvPDs6q90PI3kNRs1tvOdAS_DWKXPxwYg/exec"],
};
