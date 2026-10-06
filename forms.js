// Scorecard items. Edit this file to change items, weights, examples or coaching tips.
window.FORMS = {
 "version": "v2.1-draft",
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
     "guide": "Silence or late greeting over 6 seconds.",
     "label": "Quick greeting",
     "coach": "Start speaking as soon as the call connects; have the opening line ready before dialling."
    },
    {
     "section": "Opening",
     "item": "Introduces self and the clinic: agent name + 'Handsome & Pretty Medical Center'",
     "applies": [
      "ALL"
     ],
     "weight": 4,
     "guide": "No name, or clinic name missing / unclear.",
     "label": "Clear introduction",
     "coach": "Always say your name and 'Handsome & Pretty Medical Center' clearly at the start."
    },
    {
     "section": "Opening",
     "item": "Outbound: states the reason for the call and checks it is a good time. Inbound: asks how they can help",
     "applies": [
      "ALL"
     ],
     "weight": 4,
     "guide": "Jumps into the offer without context or permission.",
     "label": "Reason for the call",
     "coach": "State why you are calling (her enquiry / the offer / the follow-up) and ask if it is a good time before moving on."
    },
    {
     "section": "Discovery",
     "item": "Asks probing questions: concern / area, previous treatments, expectations, preferred branch & timing",
     "applies": [
      "SALES"
     ],
     "weight": 8,
     "guide": "Pitches prices before understanding the need; fewer than 2 relevant questions.",
     "label": "Needs discovery",
     "coach": "Ask at least 2–3 questions about the concern, area, previous treatments and expectations before mentioning any price."
    },
    {
     "section": "Discovery",
     "item": "Asks about the consultation experience and finds the real reason for not booking (price, timing, doubts, doctor's advice)",
     "applies": [
      "FU"
     ],
     "weight": 8,
     "guide": "Accepts 'I'll think about it' without exploring the reason.",
     "label": "Follow-up discovery",
     "coach": "Ask how the consultation went and dig into the real reason for not booking (price, timing, doubts, doctor's advice) before offering anything."
    },
    {
     "section": "Discovery",
     "item": "Listens actively: no interruption, picks up on what the customer says",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Interrupts, or asks for information already given.",
     "label": "Active listening",
     "coach": "Let the customer finish, then confirm what you heard ('so your main concern is…') before answering."
    },
    {
     "section": "Offer",
     "item": "Links the offer to the customer's need (benefit first, not a list of prices)",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 7,
     "guide": "Reads a list of offers not linked to the need.",
     "label": "Linking the offer to the need",
     "coach": "Present one offer that matches what she told you, benefit first, instead of reading the offers list."
    },
    {
     "section": "Offer",
     "item": "Presents the free consultation (or the next session) as the next step, with its value",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 6,
     "guide": "Next step not offered or offered without any value.",
     "label": "Selling the free consultation",
     "coach": "Explain the value of the free consultation: a doctor assesses her case and the follow-up is free too."
    },
    {
     "section": "Offer",
     "item": "Handles objections with the approved approach: acknowledge, clarify, answer, ask again",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 8,
     "guide": "Ignores the objection, argues, or gives up straight away.",
     "label": "Objection handling",
     "coach": "Use acknowledge, clarify, answer, then ask again; practise the two top objections from the guide."
    },
    {
     "section": "Complaint",
     "item": "Takes complaint details properly: listens, apologises for the experience, collects name, number, branch, date and issue, explains it will be passed to the clinic team",
     "applies": [
      "CMP"
     ],
     "weight": 8,
     "guide": "Missing details, defends the clinic, or no explanation of what happens next.",
     "label": "Complaint intake",
     "coach": "Listen, apologise for the experience, collect name, number, branch, date and issue, and explain the clinic team will follow up. No promises."
    },
    {
     "section": "Closing",
     "item": "Summarises the next step: service, branch & landmark, date & time, pre-visit instructions (or what happens with the complaint / feedback)",
     "applies": [
      "ALL"
     ],
     "weight": 7,
     "guide": "Customer is not clear what happens next.",
     "label": "Clear next step",
     "coach": "Before closing, repeat the service, branch and landmark, date and time, and any pre-visit instructions."
    },
    {
     "section": "Closing",
     "item": "Offers further help and closes politely",
     "applies": [
      "ALL"
     ],
     "weight": 3,
     "guide": "Abrupt close.",
     "label": "Polite closing",
     "coach": "Offer further help and use the closing line; don't end abruptly."
    },
    {
     "section": "Soft skills",
     "item": "Tone of voice: clear, warm, confident (not speedy, sleepy, monotone or hesitant)",
     "applies": [
      "ALL"
     ],
     "weight": 6,
     "guide": "Tone sounds bored, rushed or unsure for a large part of the call.",
     "label": "Tone of voice",
     "coach": "Smile while talking, keep a steady pace and energy; listen back to this call to hear the difference."
    },
    {
     "section": "Soft skills",
     "item": "Language matched to the customer: clear Arabic suited to UAE / Gulf customers, no confusing slang or jargon",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Customer asks to repeat or does not understand terms.",
     "label": "Language fit",
     "coach": "Use clear Arabic that a UAE customer understands; avoid Egyptian slang and English jargon. Review the Gulf terms page."
    },
    {
     "section": "Soft skills",
     "item": "Empathy and rapport: respectful address, reassures on concerns",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Concern raised and not acknowledged.",
     "label": "Empathy and rapport",
     "coach": "Acknowledge her concern before answering and address her respectfully throughout."
    },
    {
     "section": "Soft skills",
     "item": "Positive and professional language",
     "applies": [
      "ALL"
     ],
     "weight": 4,
     "guide": "Negative phrasing ('I can't', 'not my job'), over-familiar wording.",
     "label": "Professional language",
     "coach": "Replace negative phrases ('I can't') with what you can do; keep it warm but professional."
    },
    {
     "section": "Soft skills",
     "item": "Hold etiquette (ask, max 1 min, thank) and no dead air over 15 seconds",
     "applies": [
      "ALL"
     ],
     "weight": 4,
     "guide": "Hold without asking, over 1 min, or dead air over 15 sec.",
     "label": "Hold and dead air",
     "coach": "Ask before placing on hold, keep it under 1 minute, thank her after; fill silences while you check information."
    },
    {
     "section": "Odoo (minor)",
     "item": "Minor mistakes in Odoo notes or fields that do not change the lead's status, booking or escalation",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Typos or incomplete notes that are still understandable.",
     "label": "Odoo notes",
     "coach": "Re-read your Odoo notes before saving; keep them short, clear and complete."
    }
   ],
   "crit": [
    {
     "bucket": "CC",
     "item": "Gives medical advice, a diagnosis or a suitability decision instead of referring to the doctor",
     "applies": [
      "ALL"
     ],
     "example": "'Botox is fine while breastfeeding', 'with your condition laser is safe'.",
     "coach": "Never advise on medical suitability. Say: 'The doctor will assess this in the free consultation' and book it."
    },
    {
     "bucket": "CC",
     "item": "Promises results or uses unapproved claims",
     "applies": [
      "ALL"
     ],
     "example": "'Guaranteed', 'permanent', '100%', 'you'll lose 10 kg', 'FDA-approved', 'alternative to surgery', 'no side effects'.",
     "coach": "Use only approved wording: 'results vary from person to person'. Never 'guaranteed', 'permanent', '100%' or kg promises."
    },
    {
     "bucket": "CC",
     "item": "Pregnancy rule not followed",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Books a pregnant customer without her insisting / without noting it, or does not put her on Hold with a callback after delivery.",
     "coach": "Review the pregnancy rule: put her on Hold and schedule a call after delivery; book only if she insists, and note it."
    },
    {
     "bucket": "CC",
     "item": "Quotes unapproved figures",
     "applies": [
      "ALL"
     ],
     "example": "VAT %, installment fee %, Sculptra session count, or calculates a regular price.",
     "coach": "Don't quote VAT %, installment fees or session counts. Say these details are confirmed before booking."
    },
    {
     "bucket": "CC",
     "item": "Discusses treatment or personal details before confirming they are speaking to the lead",
     "applies": [
      "ALL"
     ],
     "example": "Talks about her laser sessions with whoever answers the phone.",
     "coach": "Confirm you are speaking to the lead herself before discussing any treatment or personal details."
    },
    {
     "bucket": "CC",
     "item": "Uses a misleading pretext or false urgency",
     "applies": [
      "ALL"
     ],
     "example": "'Updating your VIP file', invented deadline.",
     "coach": "Use only the approved reasons for calling; never invent deadlines or pretexts."
    },
    {
     "bucket": "CC",
     "item": "Ignores a clear 'do not call me' / not-interested request",
     "applies": [
      "ALL"
     ],
     "example": "Keeps pushing or schedules another call after a clear refusal.",
     "coach": "Respect a clear refusal: thank the customer, mark 'Not interested' in Odoo and do not call again."
    },
    {
     "bucket": "EU",
     "item": "Wrong price, offer or gift information",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Wrong price, wrong gift, or does not say prices are before VAT.",
     "coach": "Check the offers sheet before quoting and always say prices are before VAT."
    },
    {
     "bucket": "EU",
     "item": "Missing information the customer needs",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Branch & address, hours, free consultation, pre-laser prep, shaving fee.",
     "coach": "Use the booking checklist: branch and address, hours, free consultation, pre-laser prep, shaving fee."
    },
    {
     "bucket": "EU",
     "item": "Wrong or missing booking (date, time, branch, service)",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Booked in the wrong branch or not booked in Odoo at all.",
     "coach": "Double-check date, time, branch and service in Odoo before ending the call, and read them back to the customer."
    },
    {
     "bucket": "EU",
     "item": "Complaint or negative experience not logged in Odoo or not escalated to the UAE team",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "Customer complains and nothing is logged or sent.",
     "coach": "Log every complaint or negative experience in Odoo and escalate it to the UAE team the same day."
    },
    {
     "bucket": "EU",
     "item": "Does not refer when required (medical question to the doctor, request for a supervisor)",
     "applies": [
      "ALL"
     ],
     "example": "Answers a medical question instead of booking a doctor consultation.",
     "coach": "When a medical question or supervisor request comes up, refer it or book the doctor; don't handle it yourself."
    },
    {
     "bucket": "EU",
     "item": "Does not call back at the promised time",
     "applies": [
      "ALL"
     ],
     "example": "Promised callback missed with no reason in Odoo.",
     "coach": "Set the callback as an Odoo activity with a reminder and call at the promised time."
    },
    {
     "bucket": "EU",
     "item": "Rude, arguing, or takes things personally",
     "applies": [
      "ALL"
     ],
     "example": "Raises voice, sarcasm, argues with the customer.",
     "coach": "Stay calm and polite even when the customer is not; never argue. Ask the TL for support on difficult calls."
    },
    {
     "bucket": "EU",
     "item": "Call avoidance or release",
     "applies": [
      "ALL"
     ],
     "example": "Hangs up, mutes, or ignores the customer.",
     "coach": "Never hang up on or ignore a customer; if the line is bad, call back and note it in Odoo."
    },
    {
     "bucket": "BC",
     "item": "Wrong clinic name",
     "applies": [
      "ALL"
     ],
     "example": "Must be 'Handsome & Pretty Medical Center' unless instructed per branch.",
     "coach": "Introduce the clinic only as 'Handsome & Pretty Medical Center'."
    },
    {
     "bucket": "BC",
     "item": "No attempt to book, or gives up at the first objection, when the customer is eligible",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Ends the call without offering the consultation.",
     "coach": "Always offer the free consultation and handle at least one objection before ending the call."
    },
    {
     "bucket": "BC",
     "item": "Promises a discount, gift, price or compensation that is not approved",
     "applies": [
      "ALL"
     ],
     "example": "Extra discount, extra gift, refund or free session promise.",
     "coach": "Offer only what is on the approved offers sheet; escalate any special request to the TL."
    },
    {
     "bucket": "BC",
     "item": "Handles a complaint beyond our scope",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "Promises an outcome, blames the doctor or clinic, or argues about what happened.",
     "coach": "Take complaint details and escalate; don't promise outcomes or comment on the doctor or clinic."
    },
    {
     "bucket": "BC",
     "item": "Work instructions not followed",
     "applies": [
      "ALL"
     ],
     "example": "Mandatory script lines, calling hours, attempts.",
     "coach": "Follow the mandatory script lines, calling hours and attempt rules."
    },
    {
     "bucket": "BC",
     "item": "Odoo: wrong or missing disposition, lead stage or reason for not booking",
     "applies": [
      "ALL"
     ],
     "example": "Lead left in 'New' after the call; reason for not booking missing.",
     "coach": "Update the lead stage, disposition and reason for not booking in Odoo right after every call."
    },
    {
     "bucket": "BC",
     "item": "Odoo: missing notes or next activity (callback date) not set",
     "applies": [
      "ALL"
     ],
     "example": "No next activity on a lead that needs a callback.",
     "coach": "Add clear notes and set the next activity (callback date) on every lead that needs follow-up."
    },
    {
     "bucket": "BC",
     "item": "Odoo: duplicate lead or activity created",
     "applies": [
      "ALL"
     ],
     "example": "New lead created instead of updating the existing one.",
     "coach": "Search Odoo by phone number before creating a new lead or activity."
    },
    {
     "bucket": "BC",
     "item": "Negative talk about the clinic, doctors, colleagues or competitors",
     "applies": [
      "ALL"
     ],
     "example": "'The other branch is bad', 'that clinic is cheap'.",
     "coach": "Keep comments about the clinic, doctors, colleagues and competitors positive or neutral."
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
     "guide": "First reply later than the SLA, measured from lead creation in Odoo.",
     "label": "Speed to lead",
     "coach": "Check new leads continuously and send the first reply within the SLA; the first minutes decide the conversion."
    },
    {
     "section": "Speed",
     "item": "Keeps the conversation moving: replies within the agreed time while the customer is active (proposal: 3 minutes)",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Customer waits and repeats the question or leaves.",
     "label": "Response time",
     "coach": "Keep replying while the customer is active; if you need to check something, say so first."
    },
    {
     "section": "Opening",
     "item": "Greets, introduces self and 'Handsome & Pretty Medical Center' using the approved opening",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "No greeting / name / clinic name.",
     "label": "Opening message",
     "coach": "Use the approved opening with your name and 'Handsome & Pretty Medical Center'."
    },
    {
     "section": "Engagement",
     "item": "Personalised replies that answer the actual question (not copy-paste or robotic)",
     "applies": [
      "ALL"
     ],
     "weight": 6,
     "guide": "Same template pasted regardless of the question.",
     "label": "Personalised replies",
     "coach": "Answer her exact question first, then adapt the template; avoid pasting the same text to everyone."
    },
    {
     "section": "Discovery",
     "item": "Asks probing questions: concern / area, previous treatments, expectations, preferred branch & timing",
     "applies": [
      "SALES"
     ],
     "weight": 12,
     "guide": "Sends prices before understanding the need.",
     "label": "Needs discovery",
     "coach": "Ask 2–3 questions about the concern, area, previous treatments and expectations before sending prices."
    },
    {
     "section": "Offer",
     "item": "Links the offer to the customer's need",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 8,
     "guide": "Sends the full offers list with no link to the need.",
     "label": "Linking the offer to the need",
     "coach": "Send one offer that matches what she told you, benefit first, not the full list."
    },
    {
     "section": "Offer",
     "item": "Clear call to action: free consultation / booking, with its value",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 8,
     "guide": "Conversation ends without a next step.",
     "label": "Call to action",
     "coach": "End every useful exchange with a clear next step: book the free consultation and explain its value."
    },
    {
     "section": "Offer",
     "item": "Offers a call when it helps (complex question, hesitation) and respects the customer's choice to stay on WhatsApp",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Forces a call, or never offers one when the chat is stuck.",
     "label": "Moving to a call",
     "coach": "Offer a call when the chat gets long or she hesitates; respect it if she prefers WhatsApp."
    },
    {
     "section": "Offer",
     "item": "Handles objections with the approved approach",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 10,
     "guide": "Ignores or argues with the objection.",
     "label": "Objection handling",
     "coach": "Use acknowledge, clarify, answer, then ask again; use the approved answers for the top objections."
    },
    {
     "section": "Writing",
     "item": "Clear and short messages: one idea per message, no long blocks of text",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Long paragraphs the customer has to scroll.",
     "label": "Short clear messages",
     "coach": "One idea per message, short lines, no long paragraphs."
    },
    {
     "section": "Writing",
     "item": "Correct spelling, grammar and punctuation",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Repeated spelling mistakes.",
     "label": "Spelling and grammar",
     "coach": "Re-read each message before sending; keep templates corrected."
    },
    {
     "section": "Writing",
     "item": "Tone and language matched to the customer (respectful, Gulf-friendly, moderate emoji use)",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Too informal, too stiff, or slang the customer may not understand.",
     "label": "Tone and language",
     "coach": "Respectful, Gulf-friendly wording with moderate emojis; avoid slang and being too informal."
    },
    {
     "section": "Writing",
     "item": "Empathy: acknowledges concerns and feelings",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Concern raised and not acknowledged.",
     "label": "Empathy",
     "coach": "Acknowledge her concern in words before giving information."
    },
    {
     "section": "Closing",
     "item": "Confirms the booking in one clear message: service, branch + location pin, date & time, pre-visit instructions",
     "applies": [
      "ALL"
     ],
     "weight": 8,
     "guide": "Details scattered or missing.",
     "label": "Booking confirmation",
     "coach": "Send one confirmation message: service, branch with location pin, date and time, pre-visit instructions."
    },
    {
     "section": "Odoo (minor)",
     "item": "Minor mistakes in Odoo notes or fields that do not change the lead's status, booking or escalation",
     "applies": [
      "ALL"
     ],
     "weight": 5,
     "guide": "Typos or incomplete notes that are still understandable.",
     "label": "Odoo notes",
     "coach": "Re-read your Odoo notes before saving; keep them short, clear and complete."
    }
   ],
   "crit": [
    {
     "bucket": "CC",
     "item": "Gives medical advice or judges suitability, including from photos the customer sends",
     "applies": [
      "ALL"
     ],
     "example": "'From your photo you need 2 syringes', 'it's safe with your medication'.",
     "coach": "Never assess photos or medical suitability in the chat. Say the doctor will assess it in the free consultation and book it."
    },
    {
     "bucket": "CC",
     "item": "Promises results or uses unapproved claims",
     "applies": [
      "ALL"
     ],
     "example": "'Guaranteed', 'permanent', '100%', kg loss, 'FDA-approved'.",
     "coach": "Use only approved wording: 'results vary from person to person'. Never 'guaranteed', 'permanent', '100%' or kg promises."
    },
    {
     "bucket": "CC",
     "item": "Pregnancy rule not followed",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Books a pregnant customer without her insisting / without noting it.",
     "coach": "Review the pregnancy rule: Hold and follow up after delivery; book only if she insists, and note it."
    },
    {
     "bucket": "CC",
     "item": "Quotes unapproved figures",
     "applies": [
      "ALL"
     ],
     "example": "VAT %, installment fee %, Sculptra session count, regular price.",
     "coach": "Don't quote VAT %, installment fees or session counts in writing. Say these are confirmed before booking."
    },
    {
     "bucket": "CC",
     "item": "Sends unapproved content or other customers' data",
     "applies": [
      "ALL"
     ],
     "example": "Before / after photos, files or prices not on the approved list; another customer's details.",
     "coach": "Send only approved media and prices; never share other customers' photos or details."
    },
    {
     "bucket": "CC",
     "item": "Uses a misleading pretext or false urgency",
     "applies": [
      "ALL"
     ],
     "example": "Invented deadline.",
     "coach": "Use only approved messages; never invent deadlines."
    },
    {
     "bucket": "CC",
     "item": "Ignores a clear 'stop messaging me' request",
     "applies": [
      "ALL"
     ],
     "example": "Keeps sending offers after a refusal.",
     "coach": "Respect a 'stop messaging me' request: confirm politely, mark it in Odoo and stop."
    },
    {
     "bucket": "EU",
     "item": "Wrong price, offer or gift information",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Wrong price, or does not say prices are before VAT.",
     "coach": "Check the offers sheet before quoting and always say prices are before VAT."
    },
    {
     "bucket": "EU",
     "item": "Missing information the customer needs",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Branch, hours, free consultation, prep instructions.",
     "coach": "Use the booking checklist: branch, hours, free consultation, prep instructions."
    },
    {
     "bucket": "EU",
     "item": "Wrong or missing booking",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Wrong branch / time, or not booked in Odoo.",
     "coach": "Double-check date, time, branch and service in Odoo before confirming in the chat."
    },
    {
     "bucket": "EU",
     "item": "Customer left without a reply (chat abandoned)",
     "applies": [
      "ALL"
     ],
     "example": "Last message is the customer's question with no answer.",
     "coach": "Never leave a customer's question unanswered; hand over the chat if you are going off shift."
    },
    {
     "bucket": "EU",
     "item": "Complaint not logged in Odoo or not escalated to the UAE team",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "Complaint in the chat and nothing logged.",
     "coach": "Log every complaint in Odoo and escalate it to the UAE team the same day."
    },
    {
     "bucket": "EU",
     "item": "Rude or arguing",
     "applies": [
      "ALL"
     ],
     "example": "Sarcasm, blaming the customer.",
     "coach": "Stay polite in writing even when the customer is not; never argue or use sarcasm."
    },
    {
     "bucket": "BC",
     "item": "Wrong clinic name",
     "applies": [
      "ALL"
     ],
     "example": "Must be 'Handsome & Pretty Medical Center'.",
     "coach": "Introduce the clinic only as 'Handsome & Pretty Medical Center'."
    },
    {
     "bucket": "BC",
     "item": "No call to action / no booking attempt when the customer is eligible",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Answers questions only, never invites to book.",
     "coach": "Always invite the customer to book the free consultation when she is eligible."
    },
    {
     "bucket": "BC",
     "item": "Promises a discount, gift, price or compensation that is not approved",
     "applies": [
      "ALL"
     ],
     "example": "Extra discount or gift.",
     "coach": "Offer only what is on the approved offers sheet; escalate special requests to the TL."
    },
    {
     "bucket": "BC",
     "item": "Handles a complaint beyond our scope",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "Promises an outcome or blames the clinic.",
     "coach": "Take complaint details and escalate; don't promise outcomes or comment on the clinic."
    },
    {
     "bucket": "BC",
     "item": "Uses a personal number or channel instead of the approved WhatsApp account",
     "applies": [
      "ALL"
     ],
     "example": "Moves the chat to the agent's own phone.",
     "coach": "Use only the approved WhatsApp account; never move a customer to a personal number."
    },
    {
     "bucket": "BC",
     "item": "Odoo: wrong or missing stage, disposition, notes or next activity",
     "applies": [
      "ALL"
     ],
     "example": "Chat not reflected on the lead card.",
     "coach": "Update stage, disposition, notes and next activity in Odoo after every chat."
    },
    {
     "bucket": "BC",
     "item": "Odoo: duplicate lead or activity created",
     "applies": [
      "ALL"
     ],
     "example": "New lead created for an existing customer.",
     "coach": "Search Odoo by phone number before creating a new lead or activity."
    }
   ]
  }
 }
};
