// Scorecard items. Edit this file to change items, weights or examples.
window.FORMS = {
 "version": "v2-draft",
 "forms": {
  "calls": {
   "name": "Calls",
   "types": {
    "Outbound - new lead": "SALES",
    "Outbound - follow-up after consultation": "FU",
    "Outbound - existing client": "SALES",
    "Inbound - enquiry / callback": "SALES",
    "Inbound - complaint": "CMP"
   },
   "outcomes": [
    "Booked consultation",
    "Callback scheduled",
    "Not interested",
    "Hold - pregnancy",
    "Complaint logged & escalated",
    "Feedback logged",
    "Wrong number / not the lead"
   ],
   "durationLabel": "Call duration (mm:ss)",
   "nc": [
    {
     "section": "Opening",
     "item": "Greets within 6 seconds of connection",
     "applies": [
      "ALL"
     ],
     "weight": 3,
     "guide": "Silence or late greeting over 6 seconds."
    },
    {
     "section": "Opening",
     "item": "Introduces self and the clinic: agent name + 'Handsome & Pretty Medical Center'",
     "applies": [
      "ALL"
     ],
     "weight": 4,
     "guide": "No name, or clinic name missing / unclear."
    },
    {
     "section": "Opening",
     "item": "Outbound: states the reason for the call and checks it is a good time. Inbound: asks how they can help",
     "applies": [
      "ALL"
     ],
     "weight": 4,
     "guide": "Jumps into the offer without context or permission."
    },
    {
     "section": "Discovery",
     "item": "Asks probing questions: concern / area, previous treatments, expectations, preferred branch & timing",
     "applies": [
      "SALES"
     ],
     "weight": 8,
     "guide": "Pitches prices before understanding the need; fewer than 2 relevant questions."
    },
    {
     "section": "Discovery",
     "item": "Asks about the consultation experience and finds the real reason for not booking (price, timing, doubts, doctor's advice)",
     "applies": [
      "FU"
     ],
     "weight": 8,
     "guide": "Accepts 'I'll think about it' without exploring the reason."
    },
    {
     "section": "Discovery",
     "item": "Listens actively: no interruption, picks up on what the customer says",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Interrupts, or asks for information already given."
    },
    {
     "section": "Offer",
     "item": "Links the offer to the customer's need (benefit first, not a list of prices)",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 7,
     "guide": "Reads a list of offers not linked to the need."
    },
    {
     "section": "Offer",
     "item": "Presents the free consultation (or the next session) as the next step, with its value",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 6,
     "guide": "Next step not offered or offered without any value."
    },
    {
     "section": "Offer",
     "item": "Handles objections with the approved approach: acknowledge, clarify, answer, ask again",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 8,
     "guide": "Ignores the objection, argues, or gives up straight away."
    },
    {
     "section": "Complaint",
     "item": "Takes complaint details properly: listens, apologises for the experience, collects name, number, branch, date and issue, explains it will be passed to the clinic team",
     "applies": [
      "CMP"
     ],
     "weight": 8,
     "guide": "Missing details, defends the clinic, or no explanation of what happens next."
    },
    {
     "section": "Closing",
     "item": "Summarises the next step: service, branch & landmark, date & time, pre-visit instructions (or what happens with the complaint / feedback)",
     "applies": [
      "ALL"
     ],
     "weight": 7,
     "guide": "Customer is not clear what happens next."
    },
    {
     "section": "Closing",
     "item": "Offers further help and closes politely",
     "applies": [
      "ALL"
     ],
     "weight": 3,
     "guide": "Abrupt close."
    },
    {
     "section": "Soft skills",
     "item": "Tone of voice: clear, warm, confident (not speedy, sleepy, monotone or hesitant)",
     "applies": [
      "ALL"
     ],
     "weight": 6,
     "guide": "Tone sounds bored, rushed or unsure for a large part of the call."
    },
    {
     "section": "Soft skills",
     "item": "Language matched to the customer: clear Arabic suited to UAE / Gulf customers, no confusing slang or jargon",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Customer asks to repeat or does not understand terms."
    },
    {
     "section": "Soft skills",
     "item": "Empathy and rapport: respectful address, reassures on concerns",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Concern raised and not acknowledged."
    },
    {
     "section": "Soft skills",
     "item": "Positive and professional language",
     "applies": [
      "ALL"
     ],
     "weight": 4,
     "guide": "Negative phrasing ('I can't', 'not my job'), over-familiar wording."
    },
    {
     "section": "Soft skills",
     "item": "Hold etiquette (ask, max 1 min, thank) and no dead air over 15 seconds",
     "applies": [
      "ALL"
     ],
     "weight": 4,
     "guide": "Hold without asking, over 1 min, or dead air over 15 sec."
    },
    {
     "section": "Odoo (minor)",
     "item": "Minor mistakes in Odoo notes or fields that do not change the lead's status, booking or escalation",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Typos or incomplete notes that are still understandable."
    }
   ],
   "crit": [
    {
     "bucket": "CC",
     "item": "Gives medical advice, a diagnosis or a suitability decision instead of referring to the doctor",
     "applies": [
      "ALL"
     ],
     "example": "'Botox is fine while breastfeeding', 'with your condition laser is safe'."
    },
    {
     "bucket": "CC",
     "item": "Promises results or uses unapproved claims",
     "applies": [
      "ALL"
     ],
     "example": "'Guaranteed', 'permanent', '100%', 'you'll lose 10 kg', 'FDA-approved', 'alternative to surgery', 'no side effects'."
    },
    {
     "bucket": "CC",
     "item": "Pregnancy rule not followed",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Books a pregnant customer without her insisting / without noting it, or does not put her on Hold with a callback after delivery."
    },
    {
     "bucket": "CC",
     "item": "Quotes unapproved figures",
     "applies": [
      "ALL"
     ],
     "example": "VAT %, installment fee %, Sculptra session count, or calculates a regular price."
    },
    {
     "bucket": "CC",
     "item": "Discusses treatment or personal details before confirming they are speaking to the lead",
     "applies": [
      "ALL"
     ],
     "example": "Talks about her laser sessions with whoever answers the phone."
    },
    {
     "bucket": "CC",
     "item": "Uses a misleading pretext or false urgency",
     "applies": [
      "ALL"
     ],
     "example": "'Updating your VIP file', invented deadline."
    },
    {
     "bucket": "CC",
     "item": "Ignores a clear 'do not call me' / not-interested request",
     "applies": [
      "ALL"
     ],
     "example": "Keeps pushing or schedules another call after a clear refusal."
    },
    {
     "bucket": "EU",
     "item": "Wrong price, offer or gift information",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Wrong price, wrong gift, or does not say prices are before VAT."
    },
    {
     "bucket": "EU",
     "item": "Missing information the customer needs",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Branch & address, hours, free consultation, pre-laser prep, shaving fee."
    },
    {
     "bucket": "EU",
     "item": "Wrong or missing booking (date, time, branch, service)",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Booked in the wrong branch or not booked in Odoo at all."
    },
    {
     "bucket": "EU",
     "item": "Complaint or negative experience not logged in Odoo or not escalated to the UAE team",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "Customer complains and nothing is logged or sent."
    },
    {
     "bucket": "EU",
     "item": "Does not refer when required (medical question to the doctor, request for a supervisor)",
     "applies": [
      "ALL"
     ],
     "example": "Answers a medical question instead of booking a doctor consultation."
    },
    {
     "bucket": "EU",
     "item": "Does not call back at the promised time",
     "applies": [
      "ALL"
     ],
     "example": "Promised callback missed with no reason in Odoo."
    },
    {
     "bucket": "EU",
     "item": "Rude, arguing, or takes things personally",
     "applies": [
      "ALL"
     ],
     "example": "Raises voice, sarcasm, argues with the customer."
    },
    {
     "bucket": "EU",
     "item": "Call avoidance or release",
     "applies": [
      "ALL"
     ],
     "example": "Hangs up, mutes, or ignores the customer."
    },
    {
     "bucket": "BC",
     "item": "Wrong clinic name",
     "applies": [
      "ALL"
     ],
     "example": "Must be 'Handsome & Pretty Medical Center' unless instructed per branch."
    },
    {
     "bucket": "BC",
     "item": "No attempt to book, or gives up at the first objection, when the customer is eligible",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Ends the call without offering the consultation."
    },
    {
     "bucket": "BC",
     "item": "Promises a discount, gift, price or compensation that is not approved",
     "applies": [
      "ALL"
     ],
     "example": "Extra discount, extra gift, refund or free session promise."
    },
    {
     "bucket": "BC",
     "item": "Handles a complaint beyond our scope",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "Promises an outcome, blames the doctor or clinic, or argues about what happened."
    },
    {
     "bucket": "BC",
     "item": "Work instructions not followed",
     "applies": [
      "ALL"
     ],
     "example": "Mandatory script lines, calling hours, attempts."
    },
    {
     "bucket": "BC",
     "item": "Odoo: wrong or missing disposition, lead stage or reason for not booking",
     "applies": [
      "ALL"
     ],
     "example": "Lead left in 'New' after the call; reason for not booking missing."
    },
    {
     "bucket": "BC",
     "item": "Odoo: missing notes or next activity (callback date) not set",
     "applies": [
      "ALL"
     ],
     "example": "No next activity on a lead that needs a callback."
    },
    {
     "bucket": "BC",
     "item": "Odoo: duplicate lead or activity created",
     "applies": [
      "ALL"
     ],
     "example": "New lead created instead of updating the existing one."
    },
    {
     "bucket": "BC",
     "item": "Negative talk about the clinic, doctors, colleagues or competitors",
     "applies": [
      "ALL"
     ],
     "example": "'The other branch is bad', 'that clinic is cheap'."
    }
   ]
  },
  "whatsapp": {
   "name": "WhatsApp",
   "types": {
    "New campaign lead": "SALES",
    "Lead moved from call": "SALES",
    "Follow-up after consultation": "FU",
    "Existing client": "SALES",
    "Complaint": "CMP"
   },
   "outcomes": [
    "Booked consultation",
    "Moved to call",
    "Callback scheduled",
    "Not interested",
    "Hold - pregnancy",
    "Complaint logged & escalated",
    "No reply from customer"
   ],
   "durationLabel": "First response time (min)",
   "nc": [
    {
     "section": "Speed",
     "item": "First response to a new lead within the agreed SLA (proposal: 5 minutes in working hours – to confirm)",
     "applies": [
      "ALL"
     ],
     "weight": 8,
     "guide": "First reply later than the SLA, measured from lead creation in Odoo."
    },
    {
     "section": "Speed",
     "item": "Keeps the conversation moving: replies within the agreed time while the customer is active (proposal: 3 minutes)",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Customer waits and repeats the question or leaves."
    },
    {
     "section": "Opening",
     "item": "Greets, introduces self and 'Handsome & Pretty Medical Center' using the approved opening",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "No greeting / name / clinic name."
    },
    {
     "section": "Engagement",
     "item": "Personalised replies that answer the actual question (not copy-paste or robotic)",
     "applies": [
      "ALL"
     ],
     "weight": 6,
     "guide": "Same template pasted regardless of the question."
    },
    {
     "section": "Discovery",
     "item": "Asks probing questions: concern / area, previous treatments, expectations, preferred branch & timing",
     "applies": [
      "SALES"
     ],
     "weight": 12,
     "guide": "Sends prices before understanding the need."
    },
    {
     "section": "Offer",
     "item": "Links the offer to the customer's need",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 8,
     "guide": "Sends the full offers list with no link to the need."
    },
    {
     "section": "Offer",
     "item": "Clear call to action: free consultation / booking, with its value",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 8,
     "guide": "Conversation ends without a next step."
    },
    {
     "section": "Offer",
     "item": "Offers a call when it helps (complex question, hesitation) and respects the customer's choice to stay on WhatsApp",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Forces a call, or never offers one when the chat is stuck."
    },
    {
     "section": "Offer",
     "item": "Handles objections with the approved approach",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 10,
     "guide": "Ignores or argues with the objection."
    },
    {
     "section": "Writing",
     "item": "Clear and short messages: one idea per message, no long blocks of text",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Long paragraphs the customer has to scroll."
    },
    {
     "section": "Writing",
     "item": "Correct spelling, grammar and punctuation",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Repeated spelling mistakes."
    },
    {
     "section": "Writing",
     "item": "Tone and language matched to the customer (respectful, Gulf-friendly, moderate emoji use)",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Too informal, too stiff, or slang the customer may not understand."
    },
    {
     "section": "Writing",
     "item": "Empathy: acknowledges concerns and feelings",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Concern raised and not acknowledged."
    },
    {
     "section": "Closing",
     "item": "Confirms the booking in one clear message: service, branch + location pin, date & time, pre-visit instructions",
     "applies": [
      "ALL"
     ],
     "weight": 8,
     "guide": "Details scattered or missing."
    },
    {
     "section": "Odoo (minor)",
     "item": "Minor mistakes in Odoo notes or fields that do not change the lead's status, booking or escalation",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Typos or incomplete notes that are still understandable."
    }
   ],
   "crit": [
    {
     "bucket": "CC",
     "item": "Gives medical advice or judges suitability, including from photos the customer sends",
     "applies": [
      "ALL"
     ],
     "example": "'From your photo you need 2 syringes', 'it's safe with your medication'."
    },
    {
     "bucket": "CC",
     "item": "Promises results or uses unapproved claims",
     "applies": [
      "ALL"
     ],
     "example": "'Guaranteed', 'permanent', '100%', kg loss, 'FDA-approved'."
    },
    {
     "bucket": "CC",
     "item": "Pregnancy rule not followed",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Books a pregnant customer without her insisting / without noting it."
    },
    {
     "bucket": "CC",
     "item": "Quotes unapproved figures",
     "applies": [
      "ALL"
     ],
     "example": "VAT %, installment fee %, Sculptra session count, regular price."
    },
    {
     "bucket": "CC",
     "item": "Sends unapproved content or other customers' data",
     "applies": [
      "ALL"
     ],
     "example": "Before / after photos, files or prices not on the approved list; another customer's details."
    },
    {
     "bucket": "CC",
     "item": "Uses a misleading pretext or false urgency",
     "applies": [
      "ALL"
     ],
     "example": "Invented deadline."
    },
    {
     "bucket": "CC",
     "item": "Ignores a clear 'stop messaging me' request",
     "applies": [
      "ALL"
     ],
     "example": "Keeps sending offers after a refusal."
    },
    {
     "bucket": "EU",
     "item": "Wrong price, offer or gift information",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Wrong price, or does not say prices are before VAT."
    },
    {
     "bucket": "EU",
     "item": "Missing information the customer needs",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Branch, hours, free consultation, prep instructions."
    },
    {
     "bucket": "EU",
     "item": "Wrong or missing booking",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Wrong branch / time, or not booked in Odoo."
    },
    {
     "bucket": "EU",
     "item": "Customer left without a reply (chat abandoned)",
     "applies": [
      "ALL"
     ],
     "example": "Last message is the customer's question with no answer."
    },
    {
     "bucket": "EU",
     "item": "Complaint not logged in Odoo or not escalated to the UAE team",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "Complaint in the chat and nothing logged."
    },
    {
     "bucket": "EU",
     "item": "Rude or arguing",
     "applies": [
      "ALL"
     ],
     "example": "Sarcasm, blaming the customer."
    },
    {
     "bucket": "BC",
     "item": "Wrong clinic name",
     "applies": [
      "ALL"
     ],
     "example": "Must be 'Handsome & Pretty Medical Center'."
    },
    {
     "bucket": "BC",
     "item": "No call to action / no booking attempt when the customer is eligible",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Answers questions only, never invites to book."
    },
    {
     "bucket": "BC",
     "item": "Promises a discount, gift, price or compensation that is not approved",
     "applies": [
      "ALL"
     ],
     "example": "Extra discount or gift."
    },
    {
     "bucket": "BC",
     "item": "Handles a complaint beyond our scope",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "Promises an outcome or blames the clinic."
    },
    {
     "bucket": "BC",
     "item": "Uses a personal number or channel instead of the approved WhatsApp account",
     "applies": [
      "ALL"
     ],
     "example": "Moves the chat to the agent's own phone."
    },
    {
     "bucket": "BC",
     "item": "Odoo: wrong or missing stage, disposition, notes or next activity",
     "applies": [
      "ALL"
     ],
     "example": "Chat not reflected on the lead card."
    },
    {
     "bucket": "BC",
     "item": "Odoo: duplicate lead or activity created",
     "applies": [
      "ALL"
     ],
     "example": "New lead created for an existing customer."
    }
   ]
  }
 }
};
