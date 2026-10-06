// Scorecard items. Edit this file to change items, weights, examples, explanations or coaching tips.
// Each item has an "ar" block with the Arabic text shown when the tool is switched to Arabic.
window.FORMS = {
 "version": "v2.3-draft",
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
     "coach": "Start speaking as soon as the call connects; have the opening line ready before dialling.",
     "explain": "Measures how fast the agent speaks once the call connects. Silence at the start makes customers hang up or think it is a robocall.",
     "ar": {
      "label": "سرعة التحية",
      "item": "يرحّب بالعميل خلال 6 ثواني من فتح الخط",
      "guide": "سكوت أو تحية متأخرة أكتر من 6 ثواني.",
      "coach": "ابدأ الكلام أول ما الخط يفتح، وخلّي جملة الافتتاح جاهزة قبل ما تتصل.",
      "explain": "بيقيس الإيجنت بدأ يتكلم بسرعة قد إيه بعد ما الخط فتح. السكوت في الأول بيخلي العميل يقفل أو يفتكرها مكالمة آلية."
     }
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
     "coach": "Always say your name and 'Handsome & Pretty Medical Center' clearly at the start.",
     "explain": "The customer must know who is calling and from where. This builds trust and avoids confusion with other clinics.",
     "ar": {
      "label": "تعريف واضح",
      "item": "يعرّف بنفسه وبالمركز: اسم الإيجنت + 'مركز هاندسم آند بريتي الطبي'",
      "guide": "مفيش اسم، أو اسم المركز ناقص / مش واضح.",
      "coach": "قول اسمك واسم 'مركز هاندسم آند بريتي الطبي' بوضوح في أول المكالمة دايمًا.",
      "explain": "العميل لازم يعرف مين بيكلمه ومن أنهي مكان. ده بيبني ثقة ويمنع إنه يتلخبط بين المراكز.",
      "vs": "الاسم أو اسم المركز ماتقالش ← N2. اتقال اسم مركز غلط ← C16 (حرج)."
     },
     "vs": "Name or clinic not said → N2. A wrong clinic name said → C16 (critical)."
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
     "coach": "State why you are calling (her enquiry / the offer / the follow-up) and ask if it is a good time before moving on.",
     "explain": "Explaining why you are calling and checking it is a good time makes the customer willing to listen instead of rushing to end the call.",
     "ar": {
      "label": "سبب المكالمة",
      "item": "في الأوتباوند: يقول سبب المكالمة ويتأكد إن الوقت مناسب. في الإنباوند: يسأل يقدر يساعد في إيه",
      "guide": "يدخل على العرض على طول من غير ما يوضح أو يستأذن.",
      "coach": "وضّح بتتصل ليه (استفسارها / العرض / الفولو أب) واسأل لو الوقت مناسب قبل ما تكمل.",
      "explain": "لما توضح بتتصل ليه وتستأذن في الوقت، العميل بيبقى مستعد يسمع بدل ما يحاول يخلص المكالمة."
     }
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
     "coach": "Ask at least 2–3 questions about the concern, area, previous treatments and expectations before mentioning any price.",
     "explain": "The agent must understand what the customer wants before offering anything. Without it, the offer sounds random and the customer is less likely to book.",
     "ar": {
      "label": "فهم الاحتياج",
      "item": "يسأل أسئلة استكشافية: المشكلة / المنطقة، العلاجات السابقة، التوقعات، الفرع والوقت المناسب",
      "guide": "بيقول الأسعار قبل ما يفهم الاحتياج؛ أقل من سؤالين مناسبين.",
      "coach": "اسأل 2–3 أسئلة على الأقل عن المشكلة والمنطقة والعلاجات السابقة والتوقعات قبل ما تقول أي سعر.",
      "explain": "الإيجنت لازم يفهم العميل عايز إيه قبل ما يعرض أي حاجة. من غير كده العرض بيبان عشوائي وفرصة الحجز بتقل."
     }
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
     "coach": "Ask how the consultation went and dig into the real reason for not booking (price, timing, doubts, doctor's advice) before offering anything.",
     "explain": "On follow-up calls after a consultation, the real reason for not booking is what lets us help the customer and what the clinic needs to know.",
     "ar": {
      "label": "استكشاف الفولو أب",
      "item": "يسأل عن تجربة الاستشارة ويعرف السبب الحقيقي لعدم الحجز (السعر، الوقت، تردد، رأي الدكتور)",
      "guide": "يقبل 'هفكر' من غير ما يعرف السبب.",
      "coach": "اسأل الاستشارة كانت عاملة إزاي، ودوّر على السبب الحقيقي لعدم الحجز قبل ما تعرض أي حاجة.",
      "explain": "في مكالمات الفولو أب بعد الاستشارة، معرفة السبب الحقيقي لعدم الحجز هي اللي بتخلينا نساعد العميل، وهي معلومة مهمة للعيادة."
     }
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
     "coach": "Let the customer finish, then confirm what you heard ('so your main concern is…') before answering.",
     "explain": "Shows the customer they are heard. Interrupting or asking again for something already said feels careless.",
     "ar": {
      "label": "الاستماع الجيد",
      "item": "يسمع كويس: مش بيقاطع، وبياخد باله من كلام العميل",
      "guide": "بيقاطع، أو بيسأل عن حاجة العميل قالها قبل كده.",
      "coach": "سيب العميل يخلص كلامه، وبعدين أكّد اللي فهمته ('يعني أكتر حاجة مضايقاكي…') قبل ما ترد.",
      "explain": "بيبيّن للعميل إننا سامعينه. المقاطعة أو السؤال عن حاجة اتقالت قبل كده بيدّي إحساس بعدم الاهتمام.",
      "vs": "N6 عن السماع (مايقاطعش ومايسألش تاني على حاجة اتقالت). إنه يطمّن العميل ويقدّر مشاعره ده N15."
     },
     "vs": "N6 is about listening (no interrupting, no asking again for what was said). Acknowledging feelings and concerns is N15."
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
     "coach": "Present one offer that matches what she told you, benefit first, instead of reading the offers list.",
     "explain": "One offer that matches the customer's need sells better than a list of prices.",
     "ar": {
      "label": "ربط العرض بالاحتياج",
      "item": "يربط العرض باحتياج العميل (الفايدة الأول، مش قايمة أسعار)",
      "guide": "بيقرا قايمة عروض مالهاش علاقة بالاحتياج.",
      "coach": "اعرض عرض واحد مناسب للي قالته، وابدأ بالفايدة بدل ما تقرا قايمة العروض.",
      "explain": "عرض واحد مناسب لاحتياج العميل بيبيع أحسن من قايمة أسعار."
     }
    },
    {
     "section": "Offer",
     "item": "Presents the free consultation (or the next session) as the next step, with its value",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 6,
     "guide": "Offered without explaining its value. If it was never offered at all → C17.",
     "label": "Selling the free consultation",
     "coach": "Explain the value of the free consultation: a doctor assesses her case and the follow-up is free too.",
     "explain": "The free consultation is the main goal of the call. The agent should explain why it is worth coming (a doctor assesses her case, free follow-up).",
     "ar": {
      "label": "بيع الاستشارة المجانية",
      "item": "يعرض الاستشارة المجانية (أو الجلسة الجاية) كخطوة جاية مع توضيح قيمتها",
      "guide": "اتعرضت من غير ما يوضح قيمتها. لو ماتعرضتش خالص ← C17.",
      "coach": "وضّح قيمة الاستشارة المجانية: دكتور هيقيّم حالتها، والفولو أب كمان مجاني.",
      "explain": "الاستشارة المجانية هي الهدف الأساسي من المكالمة. الإيجنت لازم يوضح ليه تستاهل تيجي (دكتور يقيّم حالتها، والفولو أب مجاني).",
      "vs": "اتعرضت بشكل ضعيف ← N8. ماتعرضتش خالص ← C17 (حرج). ضاعت بعد اعتراض ← N9."
     },
     "vs": "Offered weakly → N8. Never offered at all → C17 (critical). Lost after an objection → N9."
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
     "coach": "Use acknowledge, clarify, answer, then ask again; practise the two top objections from the guide.",
     "explain": "Objections (price, 'no results before', 'I'll think about it') are normal. Handling them well is what turns a 'no' into a booking.",
     "ar": {
      "label": "التعامل مع الاعتراضات",
      "item": "يتعامل مع الاعتراضات بالطريقة المعتمدة: يتفهم، يوضح، يرد، ويعرض تاني",
      "guide": "يتجاهل الاعتراض، أو يجادل، أو يستسلم على طول.",
      "coach": "استخدم: تفهّم، وضّح، رد، وبعدين اعرض تاني. ودرّب نفسك على أشهر اعتراضين في الجايد.",
      "explain": "الاعتراضات (السعر، 'جربت ومفيش نتيجة'، 'هفكر') طبيعية. التعامل الصح معاها هو اللي بيحوّل الرفض لحجز.",
      "vs": "تعامل ضعيف أو استسلام بعد الاعتراض ← N9. جدال بقلة ذوق ← C14. ماعرضش الحجز خالص ← C17."
     },
     "vs": "Weak handling or giving up after an objection → N9. Arguing rudely → C14. Never offering the booking at all → C17."
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
     "coach": "Listen, apologise for the experience, collect name, number, branch, date and issue, and explain the clinic team will follow up. No promises.",
     "explain": "We do not solve complaints; we log them well and pass them to the UAE team. Complete details and a calm tone are what matter.",
     "ar": {
      "label": "استلام الشكوى",
      "item": "ياخد بيانات الشكوى صح: يسمع، يعتذر عن التجربة، ياخد الاسم والرقم والفرع والتاريخ والمشكلة، ويوضح إنها هتتبعت لفريق العيادة",
      "guide": "بيانات ناقصة، أو بيدافع عن العيادة، أو مش بيوضح اللي هيحصل بعد كده.",
      "coach": "اسمع واعتذر عن التجربة، وخد الاسم والرقم والفرع والتاريخ والمشكلة، ووضّح إن فريق العيادة هيتابع. من غير وعود.",
      "explain": "إحنا مش بنحل الشكوى، إحنا بنسجلها صح ونبعتها لفريق الإمارات. المهم البيانات تكون كاملة والأسلوب هادي.",
      "vs": "N10 = طريقة أخد بيانات الشكوى. ماتسجلتش / ماتصعّدتش ← C11. وعد بنتيجة أو حكم مين الصح ← C19."
     },
     "vs": "N10 = how the complaint details were taken. Not logged / not escalated → C11. Promising an outcome or deciding who is right → C19."
    },
    {
     "section": "Closing",
     "item": "Summarises the next step: service, branch & landmark, date & time, pre-visit instructions (or what happens with the complaint / feedback)",
     "applies": [
      "ALL"
     ],
     "weight": 7,
     "guide": "No recap at the end; the customer is not sure what happens next.",
     "label": "Clear next step",
     "coach": "Before closing, repeat the service, branch and landmark, date and time, and any pre-visit instructions.",
     "explain": "A clear summary prevents no-shows and wrong bookings.",
     "ar": {
      "label": "وضوح الخطوة الجاية",
      "item": "يلخّص الخطوة الجاية: الخدمة، الفرع وعلامة مميزة، اليوم والساعة، تعليمات قبل الزيارة (أو اللي هيحصل في الشكوى / الفيدباك)",
      "guide": "مفيش تلخيص في الآخر، والعميل مش متأكد إيه اللي هيحصل.",
      "coach": "قبل ما تقفل، كرر الخدمة والفرع والعلامة المميزة واليوم والساعة وأي تعليمات قبل الزيارة.",
      "explain": "التلخيص الواضح بيقلل إن العميل ميجيش أو يحصل غلط في الحجز.",
      "vs": "المعلومة اتقالت بس ماتلخصتش في الآخر ← N11. المعلومة ماتقالتش خالص ← C9. الحجز غلط على أودوو ← C10."
     },
     "vs": "Information given but not recapped at the end → N11. Information never given at all → C9. Booked wrong in Odoo → C10."
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
     "coach": "Offer further help and use the closing line; don't end abruptly.",
     "explain": "The last impression of the call. A polite close leaves a good image of the clinic.",
     "ar": {
      "label": "إنهاء لطيف",
      "item": "يعرض مساعدة إضافية ويقفل بأسلوب لطيف",
      "guide": "قفلة مفاجئة.",
      "coach": "اعرض مساعدة إضافية واستخدم جملة القفل، ومتقفلش فجأة.",
      "explain": "آخر انطباع في المكالمة. القفلة اللطيفة بتسيب صورة حلوة عن المركز."
     }
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
     "coach": "Smile while talking, keep a steady pace and energy; listen back to this call to hear the difference.",
     "explain": "On the phone, the voice is all the customer has. Tone decides whether they trust and stay on the call.",
     "ar": {
      "label": "نبرة الصوت",
      "item": "نبرة الصوت: واضحة، ودودة، واثقة (مش سريعة، ولا نايمة، ولا رتيبة، ولا مترددة)",
      "guide": "النبرة باينة زهقانة أو مستعجلة أو مش واثقة في جزء كبير من المكالمة.",
      "coach": "ابتسم وإنت بتتكلم، وحافظ على سرعة وطاقة ثابتة. اسمع المكالمة تاني عشان تحس بالفرق.",
      "explain": "في التليفون، الصوت هو كل اللي العميل شايفه. النبرة هي اللي بتحدد هيثق ويكمل المكالمة ولا لأ.",
      "vs": "N13 = الصوت نفسه بيتسمع إزاي. الكلمات المستخدمة ← N16. اللهجة ووضوحها للعميل ← N14."
     },
     "vs": "N13 = how the voice sounds. The words used → N16. Dialect and clarity for the customer → N14."
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
     "coach": "Use clear Arabic that a UAE customer understands; avoid Egyptian slang and English jargon. Review the Gulf terms page.",
     "explain": "Customers are in the UAE. Egyptian slang or English jargon can confuse them and make the call longer.",
     "ar": {
      "label": "لغة مناسبة",
      "item": "لغة مناسبة للعميل: عربي واضح يفهمه العميل في الإمارات والخليج، من غير كلمات عامية محيرة أو مصطلحات",
      "guide": "العميل بيطلب إعادة أو مش فاهم الكلام.",
      "coach": "استخدم عربي واضح يفهمه العميل في الإمارات، وابعد عن العامية المصرية والمصطلحات الإنجليزي. راجع صفحة المصطلحات الخليجية.",
      "explain": "العملاء في الإمارات. العامية المصرية أو المصطلحات الإنجليزي ممكن تلخبطهم وتطوّل المكالمة.",
      "vs": "N14 = العميل فاهم ولا لأ (اللهجة والمصطلحات). نبرة الصوت ← N13. الكلمات مهذبة ولا سلبية ← N16."
     },
     "vs": "N14 = can the customer understand (dialect, terms). Tone of voice → N13. Polite vs negative wording → N16."
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
     "coach": "Acknowledge her concern before answering and address her respectfully throughout.",
     "explain": "Beauty treatments are personal. Customers book when they feel understood and reassured.",
     "ar": {
      "label": "التعاطف والألفة",
      "item": "التعاطف والألفة: أسلوب محترم، ويطمّن العميل على مخاوفه",
      "guide": "العميل قال قلق ومحدش رد عليه.",
      "coach": "اعترف بقلق العميل قبل ما ترد، وخلي أسلوبك محترم طول المكالمة.",
      "explain": "العلاجات التجميلية حاجة شخصية. العميل بيحجز لما يحس إن فيه حد فاهمه ومطمّنه.",
      "vs": "N15 = تقدير مشاعر العميل وقلقه. السماع من غير مقاطعة ← N6."
     },
     "vs": "N15 = acknowledging feelings and concerns. Listening without interrupting → N6."
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
     "coach": "Replace negative phrases ('I can't') with what you can do; keep it warm but professional.",
     "explain": "Positive wording keeps the customer focused on solutions instead of limits.",
     "ar": {
      "label": "لغة مهنية",
      "item": "لغة إيجابية ومهنية",
      "guide": "عبارات سلبية ('مقدرش'، 'مش شغلي')، أو كلام فيه تبسّط زيادة.",
      "coach": "بدّل العبارات السلبية ('مقدرش') باللي تقدر تعمله، وخليك ودود بس مهني.",
      "explain": "الكلام الإيجابي بيخلي العميل يركز على الحلول مش على المشاكل.",
      "vs": "كلمة سلبية بسيطة أو تبسّط زيادة ← N16. قلة ذوق أو تريقة أو جدال ← C14 (حرج)."
     },
     "vs": "Minor negative or over-familiar wording → N16. Rude, sarcastic or arguing → C14 (critical)."
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
     "coach": "Ask before placing on hold, keep it under 1 minute, thank her after; fill silences while you check information.",
     "explain": "Long holds or silence make the customer feel ignored and often lead to hang-ups.",
     "ar": {
      "label": "الانتظار والسكوت",
      "item": "أسلوب الانتظار (يستأذن، أقصى حاجة دقيقة، يشكر) ومفيش سكوت أكتر من 15 ثانية",
      "guide": "انتظار من غير استئذان، أو أكتر من دقيقة، أو سكوت أكتر من 15 ثانية.",
      "coach": "استأذن قبل الانتظار، وخليه أقل من دقيقة، واشكر العميل بعده. واملا السكوت وإنت بتدوّر على المعلومة.",
      "explain": "الانتظار الطويل أو السكوت بيحسّس العميل إنه متجاهل، وغالبًا بيقفل.",
      "vs": "هولد أو سكوت متعملش صح ← N17. قفل السكة أو الميوت أو تجاهل العميل عن قصد ← C15 (حرج)."
     },
     "vs": "Hold or silence handled badly → N17. Deliberately hanging up, muting or ignoring the customer → C15 (critical)."
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
     "coach": "Re-read your Odoo notes before saving; keep them short, clear and complete.",
     "explain": "Clean Odoo notes help the next colleague who calls the same customer.",
     "ar": {
      "label": "ملاحظات أودوو",
      "item": "غلطات بسيطة في ملاحظات أو خانات أودوو مش بتغيّر حالة الليد أو الحجز أو التصعيد",
      "guide": "غلطات كتابة أو ملاحظات ناقصة بس لسه مفهومة.",
      "coach": "راجع ملاحظاتك على أودوو قبل الحفظ، وخليها قصيرة وواضحة وكاملة.",
      "explain": "ملاحظات أودوو النضيفة بتساعد الزميل اللي هيكلم نفس العميل بعد كده.",
      "vs": "غلطة بسيطة على أودوو ومش بتغيّر حاجة ← N18. لو بتغيّر حالة الليد أو الحجز أو التصعيد ← C10 أو C11 أو C21 أو C22 أو C23."
     },
     "vs": "Small Odoo mistakes that change nothing → N18. If it changes the lead status, booking or escalation → C10, C11, C21, C22 or C23."
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
     "coach": "Never advise on medical suitability. Say: 'The doctor will assess this in the free consultation' and book it.",
     "explain": "Agents are not doctors. Any medical opinion can harm the customer and expose the clinic legally. Medical questions always go to the doctor.",
     "ar": {
      "item": "يدّي نصيحة طبية أو تشخيص أو يقرر الحالة تنفع ولا لأ بدل ما يحوّل للدكتور",
      "example": "'البوتوكس عادي وإنتي بترضعي'، 'مع حالتك الليزر آمن'.",
      "coach": "متدّيش رأي طبي أبدًا. قول: 'الدكتور هيقيّم ده في الاستشارة المجانية' واحجزها.",
      "explain": "الإيجنت مش دكتور. أي رأي طبي ممكن يأذي العميل ويعرّض المركز لمشاكل قانونية. الأسئلة الطبية دايمًا للدكتور.",
      "vs": "أي نصيحة طبية أو تشخيص أو 'ده آمن ليكي' ← C1 بس (مش C12 كمان). إنه يقول لحامل إن العلاج آمن برضه C1؛ أما إجراءات الحجز / الـ Hold للحمل ← C3."
     },
     "vs": "Any medical advice, diagnosis or 'it's safe for you' → C1 only (not C12 too). Telling a pregnant customer a treatment is safe is also C1; the booking / hold process for pregnancy is C3."
    },
    {
     "bucket": "CC",
     "item": "Promises results or uses unapproved claims",
     "applies": [
      "ALL"
     ],
     "example": "'Guaranteed', 'permanent', '100%', 'you'll lose 10 kg', 'FDA-approved', 'alternative to surgery', 'no side effects'.",
     "coach": "Use only approved wording: 'results vary from person to person'. Never 'guaranteed', 'permanent', '100%' or kg promises.",
     "explain": "Results differ from person to person. Promises create false expectations and complaints, and can be illegal in health advertising.",
     "ar": {
      "item": "يوعد بنتايج أو يستخدم ادعاءات مش معتمدة",
      "example": "'مضمون'، 'دايم'، '100%'، 'هتخسي 10 كيلو'، 'معتمد من FDA'، 'بديل للعمليات'، 'مفيش أعراض جانبية'.",
      "coach": "استخدم الكلام المعتمد بس: 'النتايج بتختلف من شخص للتاني'. ومتقولش 'مضمون' أو 'دايم' أو '100%' أو وعود بالكيلو.",
      "explain": "النتايج بتختلف من شخص للتاني. الوعود بتعمل توقعات غلط وشكاوى، وممكن تكون مخالفة لقوانين الإعلان الطبي.",
      "vs": "C2 = ادعاءات عن النتيجة ('مضمون'، 'دايم'). الضغط أو مواعيد نهائية مخترعة ← C6."
     },
     "vs": "C2 = claims about results ('guaranteed', 'permanent'). Pressure tactics or invented deadlines → C6."
    },
    {
     "bucket": "CC",
     "item": "Pregnancy rule not followed",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Books a pregnant customer without her insisting / without noting it, or does not put her on Hold with a callback after delivery.",
     "coach": "Review the pregnancy rule: put her on Hold and schedule a call after delivery; book only if she insists, and note it.",
     "explain": "Most treatments are not done during pregnancy. The approved rule is Hold and call back after delivery.",
     "ar": {
      "item": "مش ملتزم بقاعدة الحمل",
      "example": "يحجز لعميلة حامل من غير ما تصر / من غير ما يكتب ده، أو مش بيحطها Hold مع مكالمة بعد الولادة.",
      "coach": "راجع قاعدة الحمل: Hold ومكالمة بعد الولادة. ومتحجزش غير لو هي أصرّت، واكتب ده.",
      "explain": "أغلب العلاجات مش بتتعمل أثناء الحمل. القاعدة المعتمدة: Hold ومكالمة بعد الولادة.",
      "vs": "C3 = إجراءات الحجز / الـ Hold للحامل. إنه يقول العلاج آمن في الحمل ← C1."
     },
     "vs": "C3 = the pregnancy booking / hold process. Saying a treatment is safe in pregnancy → C1."
    },
    {
     "bucket": "CC",
     "item": "Quotes unapproved figures",
     "applies": [
      "ALL"
     ],
     "example": "VAT %, installment fee %, Sculptra session count, or calculates a regular price.",
     "coach": "Don't quote VAT %, installment fees or session counts. Say these details are confirmed before booking.",
     "explain": "Some figures are not confirmed by the client yet. Quoting them creates wrong expectations and complaints later.",
     "ar": {
      "item": "يقول أرقام مش معتمدة",
      "example": "نسبة الضريبة، نسبة رسوم التقسيط، عدد جلسات Sculptra، أو يحسب سعر عادي.",
      "coach": "متقولش نسبة الضريبة أو رسوم التقسيط أو عدد الجلسات. قول إن التفاصيل دي بتتأكد قبل الحجز.",
      "explain": "فيه أرقام لسه العيادة مأكدهاش. قولها بيعمل توقعات غلط وشكاوى بعد كده.",
      "vs": "C4 = رقم ممنوع نقوله أصلًا (نسبة الضريبة، نسبة رسوم التقسيط، عدد الجلسات، السعر الأصلي). سعر معتمد اتقال غلط ← C8. وعد بخصم زيادة ← C18."
     },
     "vs": "C4 = a figure we must never quote (VAT %, installment fee %, session counts, regular price). A wrong approved price → C8. Promising an extra discount → C18."
    },
    {
     "bucket": "CC",
     "item": "Discusses treatment or personal details before confirming they are speaking to the lead",
     "applies": [
      "ALL"
     ],
     "example": "Talks about her laser sessions with whoever answers the phone.",
     "coach": "Confirm you are speaking to the lead herself before discussing any treatment or personal details.",
     "explain": "Treatment information is private. Sharing it with a family member or wrong person breaks the customer's privacy.",
     "ar": {
      "item": "يتكلم في تفاصيل العلاج أو البيانات الشخصية قبل ما يتأكد إنه بيكلم صاحب الطلب",
      "example": "يتكلم عن جلسات الليزر بتاعتها مع أي حد رد على التليفون.",
      "coach": "اتأكد إنك بتكلم صاحبة الطلب نفسها قبل ما تتكلم في أي علاج أو بيانات شخصية.",
      "explain": "معلومات العلاج خاصة. مشاركتها مع حد من العيلة أو شخص غلط بتنتهك خصوصية العميل."
     }
    },
    {
     "bucket": "CC",
     "item": "Uses a misleading pretext or false urgency",
     "applies": [
      "ALL"
     ],
     "example": "'Updating your VIP file', invented deadline.",
     "coach": "Use only the approved reasons for calling; never invent deadlines or pretexts.",
     "explain": "Misleading reasons damage trust and the clinic's reputation once discovered.",
     "ar": {
      "item": "يستخدم حجة مضللة أو استعجال مش حقيقي",
      "example": "'بنحدّث ملف الـ VIP بتاعك'، أو ميعاد نهاية عرض مش حقيقي.",
      "coach": "استخدم الأسباب المعتمدة بس للاتصال، ومتخترعش مواعيد أو حجج.",
      "explain": "الأسباب المضللة بتضيّع الثقة وسمعة المركز أول ما تتكشف.",
      "vs": "C6 = سبب مضلل للمكالمة أو استعجال مزيف. ادعاءات عن النتيجة ← C2."
     },
     "vs": "C6 = misleading reason for the call or false urgency. Claims about results → C2."
    },
    {
     "bucket": "CC",
     "item": "Ignores a clear 'do not call me' / not-interested request",
     "applies": [
      "ALL"
     ],
     "example": "Keeps pushing or schedules another call after a clear refusal.",
     "coach": "Respect a clear refusal: thank the customer, mark 'Not interested' in Odoo and do not call again.",
     "explain": "Calling people who refused is harassment and can lead to complaints against the clinic.",
     "ar": {
      "item": "يتجاهل طلب واضح 'متتصلش بيا' / مش مهتم",
      "example": "يفضل يضغط أو يحدد مكالمة تانية بعد رفض واضح.",
      "coach": "احترم الرفض الواضح: اشكر العميل، وسجّل 'مش مهتم' على أودوو، ومتتصلش تاني.",
      "explain": "الاتصال بحد رفض بيبقى إزعاج، وممكن يعمل شكاوى ضد المركز."
     }
    },
    {
     "bucket": "EU",
     "item": "Wrong price, offer or gift information",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Wrong price, wrong gift, or does not say prices are before VAT.",
     "coach": "Check the offers sheet before quoting and always say prices are before VAT.",
     "explain": "Wrong prices lead to disputes at the clinic and lost trust.",
     "ar": {
      "item": "معلومة غلط في السعر أو العرض أو الهدية",
      "example": "سعر غلط، هدية غلط، أو مش بيقول إن الأسعار قبل الضريبة.",
      "coach": "راجع شيت العروض قبل ما تقول السعر، وقول دايمًا إن الأسعار قبل الضريبة.",
      "explain": "الأسعار الغلط بتعمل خلاف في العيادة وبتضيّع الثقة.",
      "vs": "غلطة في سعر أو عرض أو هدية معتمدة ← C8. وعد بحاجة زيادة مش معتمدة ← C18. رقم ممنوع نقوله أصلًا ← C4."
     },
     "vs": "Honest mistake in an approved price, offer or gift → C8. Promising something extra that is not approved → C18. Quoting a figure we must never quote → C4."
    },
    {
     "bucket": "EU",
     "item": "Missing information the customer needs",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Branch & address, hours, free consultation, pre-laser prep, shaving fee.",
     "coach": "Use the booking checklist: branch and address, hours, free consultation, pre-laser prep, shaving fee.",
     "explain": "Missing information (address, preparation, fees) makes the visit fail or surprises the customer.",
     "ar": {
      "item": "معلومات ناقصة العميل محتاجها",
      "example": "الفرع والعنوان، المواعيد، الاستشارة المجانية، تحضيرات الليزر، رسوم الحلاقة.",
      "coach": "استخدم قايمة الحجز: الفرع والعنوان، المواعيد، الاستشارة المجانية، تحضيرات الليزر، رسوم الحلاقة.",
      "explain": "المعلومات الناقصة (العنوان، التحضيرات، الرسوم) بتبوّظ الزيارة أو بتفاجئ العميل.",
      "vs": "المعلومة ماتقالتش خالص ← C9. اتقالت بس ماتلخصتش في الآخر ← N11. سعر غلط ← C8."
     },
     "vs": "Information never given at all → C9. Given but not recapped at the end → N11. Wrong price → C8."
    },
    {
     "bucket": "EU",
     "item": "Wrong or missing booking (date, time, branch, service)",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Booked in the wrong branch or not booked in Odoo at all.",
     "coach": "Double-check date, time, branch and service in Odoo before ending the call, and read them back to the customer.",
     "explain": "A wrong booking means the customer arrives and is not expected, the worst experience possible.",
     "ar": {
      "item": "حجز غلط أو مش متسجل (اليوم، الساعة، الفرع، الخدمة)",
      "example": "حجز في فرع غلط أو مش متسجل على أودوو خالص.",
      "coach": "راجع اليوم والساعة والفرع والخدمة على أودوو قبل ما تقفل، واقراهم للعميل.",
      "explain": "الحجز الغلط معناه إن العميل يوصل ومحدش مستنيه، ودي أسوأ تجربة ممكنة.",
      "vs": "حجز غلط أو مش متسجل ← C10 بس (مش C21 كمان)."
     },
     "vs": "Wrong or missing booking → C10 only (not C21 too)."
    },
    {
     "bucket": "EU",
     "item": "Complaint or negative experience not logged in Odoo or not escalated to the UAE team",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "Customer complains and nothing is logged or sent.",
     "coach": "Log every complaint or negative experience in Odoo and escalate it to the UAE team the same day.",
     "explain": "Our job with complaints is to log and escalate. If we don't, nobody at the clinic knows and the customer is lost.",
     "ar": {
      "item": "شكوى أو تجربة سلبية مش متسجلة على أودوو أو مش متصعّدة لفريق الإمارات",
      "example": "العميل اشتكى ومحدش سجّل أو بعت حاجة.",
      "coach": "سجّل أي شكوى أو تجربة سلبية على أودوو وصعّدها لفريق الإمارات في نفس اليوم.",
      "explain": "دورنا في الشكاوى إننا نسجل ونصعّد. لو معملناش كده محدش في العيادة هيعرف، والعميل هيضيع.",
      "vs": "الشكوى ماتسجلتش أو ماتصعّدتش ← C11 بس (مش C22 كمان). اتسجلت بس الإيجنت وعد بنتيجة ← C19."
     },
     "vs": "Complaint not logged or not escalated → C11 only (not C22 too). Logged, but the agent promised an outcome → C19."
    },
    {
     "bucket": "EU",
     "item": "Does not escalate when required (customer asks for a supervisor, or a request the agent is not allowed to decide)",
     "applies": [
      "ALL"
     ],
     "example": "Customer asks for a supervisor and the agent refuses or ends the call.",
     "coach": "When a customer asks for a supervisor or something you can't decide, say you'll pass it on and escalate it to your team leader the same day.",
     "explain": "Some requests are beyond the agent's role. Passing them on correctly protects the customer and the agent.",
     "ar": {
      "item": "مش بيصعّد لما يكون لازم (العميل طلب مشرف، أو طلب مش من صلاحية الإيجنت)",
      "example": "العميل طلب مشرف والإيجنت رفض أو قفل المكالمة.",
      "coach": "لما العميل يطلب مشرف أو حاجة مش من صلاحيتك، قوله إنك هتوصّلها، وصعّدها للتيم ليدر في نفس اليوم.",
      "explain": "فيه طلبات أكبر من دور الإيجنت. توصيلها صح بيحمي العميل والإيجنت.",
      "vs": "الأسئلة الطبية ← C1 بس. الشكاوى ← C11 / C19. C12 لطلب المشرف وأي قرار مش من صلاحية الإيجنت."
     },
     "vs": "Medical questions → C1 only. Complaints → C11 / C19. C12 is for supervisor requests and other decisions outside the agent's authority."
    },
    {
     "bucket": "EU",
     "item": "Does not call back at the promised time",
     "applies": [
      "ALL"
     ],
     "example": "Promised callback missed with no reason in Odoo.",
     "coach": "Set the callback as an Odoo activity with a reminder and call at the promised time.",
     "explain": "A missed promised callback tells the customer we don't keep our word.",
     "ar": {
      "item": "مش بيتصل في ميعاد المكالمة اللي وعد بيه",
      "example": "وعد بمكالمة وفاتت من غير سبب مكتوب على أودوو.",
      "coach": "حط المكالمة كـ Activity على أودوو بتذكير، واتصل في الميعاد اللي وعدت بيه.",
      "explain": "المكالمة اللي اتوعد بيها وماتعملتش بتقول للعميل إننا مش بنلتزم بكلامنا.",
      "vs": "C13 = مكالمة اتوعد بيها العميل ده بالذات وماتعملتش. قواعد الاتصال العامة (مواعيد الاتصال، عدد المحاولات) ← C20."
     },
     "vs": "C13 = a callback promised to this customer and missed. General calling rules (calling hours, number of attempts) → C20."
    },
    {
     "bucket": "EU",
     "item": "Rude, arguing, or takes things personally",
     "applies": [
      "ALL"
     ],
     "example": "Raises voice, sarcasm, argues with the customer.",
     "coach": "Stay calm and polite even when the customer is not; never argue. Ask the TL for support on difficult calls.",
     "explain": "One rude call can lose the customer and damage the clinic's reputation.",
     "ar": {
      "item": "قلة ذوق، أو جدال، أو ياخد الكلام بشكل شخصي",
      "example": "يعلّي صوته، أو يتريق، أو يجادل العميل.",
      "coach": "خليك هادي ومحترم حتى لو العميل مش كده، ومتجادلش. واطلب دعم التيم ليدر في المكالمات الصعبة.",
      "explain": "مكالمة واحدة فيها قلة ذوق ممكن تخسرنا العميل وتأذي سمعة المركز.",
      "vs": "قلة ذوق أو تريقة أو جدال ← C14. كلمة سلبية بسيطة ← N16. الجدال في تفاصيل الشكوى برضه C14."
     },
     "vs": "Rude, sarcastic or arguing → C14. Minor negative wording → N16. Arguing about what happened in a complaint is also C14."
    },
    {
     "bucket": "EU",
     "item": "Call avoidance or release",
     "applies": [
      "ALL"
     ],
     "example": "Hangs up, mutes, or ignores the customer.",
     "coach": "Never hang up on or ignore a customer; if the line is bad, call back and note it in Odoo.",
     "explain": "Hanging up or ignoring the customer is a serious attitude breach.",
     "ar": {
      "item": "تهرّب من المكالمة أو قفلها",
      "example": "يقفل في وش العميل، أو يعمل ميوت، أو يتجاهله.",
      "coach": "متقفلش في وش العميل ومتتجاهلوش. ولو الخط وحش، اتصل تاني واكتب ده على أودوو.",
      "explain": "القفل في وش العميل أو تجاهله مخالفة كبيرة في الأسلوب.",
      "vs": "قفل السكة أو الميوت أو التجاهل عن قصد ← C15. هولد طويل أو سكوت متعملش صح ← N17."
     },
     "vs": "Deliberately hanging up, muting or ignoring → C15. A long hold or silence handled badly → N17."
    },
    {
     "bucket": "BC",
     "item": "Wrong clinic name",
     "applies": [
      "ALL"
     ],
     "example": "Must be 'Handsome & Pretty Medical Center' unless instructed per branch.",
     "coach": "Introduce the clinic only as 'Handsome & Pretty Medical Center'.",
     "explain": "The client asked for this name on calls. A wrong name confuses customers and the brand.",
     "ar": {
      "item": "اسم المركز غلط",
      "example": "لازم يكون 'مركز هاندسم آند بريتي الطبي' إلا لو فيه تعليمات مختلفة للفرع.",
      "coach": "عرّف المركز باسم 'مركز هاندسم آند بريتي الطبي' بس.",
      "explain": "العيادة طلب الاسم ده في المكالمات. الاسم الغلط بيلخبط العملاء والبراند.",
      "vs": "اتقال اسم مركز غلط ← C16. اسم المركز ماتقالش خالص ← N2."
     },
     "vs": "A wrong clinic name said → C16. Clinic name not said at all → N2."
    },
    {
     "bucket": "BC",
     "item": "No attempt at all to book or offer the consultation when the customer is eligible",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Answers questions only and ends the call without ever offering the consultation.",
     "coach": "Always offer the free consultation and handle at least one objection before ending the call.",
     "explain": "Booking the free consultation is the purpose of the call. Not trying is a lost opportunity for the business.",
     "ar": {
      "item": "مفيش أي محاولة لحجز أو عرض الاستشارة والعميل ينفع يحجز",
      "example": "بيرد على الأسئلة بس ويقفل المكالمة من غير ما يعرض الاستشارة خالص.",
      "coach": "اعرض الاستشارة المجانية دايمًا، واتعامل مع اعتراض واحد على الأقل قبل ما تقفل.",
      "explain": "حجز الاستشارة المجانية هو الهدف من المكالمة. عدم المحاولة فرصة ضايعة على الشغل.",
      "vs": "ماتعرضتش خالص ← C17. اتعرضت بشكل ضعيف ← N8. استسلم أو اتعامل غلط مع اعتراض ← N9."
     },
     "vs": "Never offered at all → C17. Offered weakly → N8. Gave up or handled an objection badly → N9."
    },
    {
     "bucket": "BC",
     "item": "Promises a discount, gift, price or compensation that is not approved",
     "applies": [
      "ALL"
     ],
     "example": "Extra discount, extra gift, refund or free session promise.",
     "coach": "Offer only what is on the approved offers sheet; escalate any special request to the TL.",
     "explain": "Unapproved promises cost money and cause disputes when the clinic refuses them.",
     "ar": {
      "item": "يوعد بخصم أو هدية أو سعر أو تعويض مش معتمد",
      "example": "خصم زيادة، هدية زيادة، استرجاع فلوس، أو جلسة مجانية.",
      "coach": "اعرض اللي في شيت العروض المعتمد بس، وأي طلب خاص صعّده للتيم ليدر.",
      "explain": "الوعود اللي مش معتمدة بتكلف فلوس، وبتعمل خلاف لما العيادة ترفضها.",
      "vs": "وعد بحاجة زيادة مش معتمدة ← C18. غلطة في سعر معتمد ← C8. رقم ممنوع نقوله ← C4."
     },
     "vs": "Promising something extra that is not approved → C18. An honest mistake in an approved price → C8. Quoting a forbidden figure → C4."
    },
    {
     "bucket": "BC",
     "item": "Goes beyond our role in a complaint: promises an outcome, refund or timeline, or decides who is right",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "'We'll refund you', 'the doctor will redo it for free', 'you're right, the doctor made a mistake'.",
     "coach": "Take complaint details and escalate; don't promise outcomes or comment on the doctor or clinic.",
     "explain": "Complaints are resolved by the UAE team. Promises or blame from the agent make the situation harder.",
     "ar": {
      "item": "يتعدّى دوره في الشكوى: يوعد بنتيجة أو استرجاع فلوس أو ميعاد حل، أو يحكم مين الصح",
      "example": "'هنرجعلك فلوسك'، 'الدكتور هيعيدها ببلاش'، 'عندك حق، الدكتور غلط'.",
      "coach": "خد بيانات الشكوى وصعّدها، ومتوعدش بنتيجة ومتعلقش على الدكتور أو العيادة.",
      "explain": "الشكاوى بيحلها فريق الإمارات. وعود الإيجنت أو لومه بيصعّب الموقف.",
      "vs": "وعد أو حكم في الشكوى ← C19. جدال مع العميل ← C14. كلام وحش عن العيادة أو الدكاترة بره الشكوى ← C24. بيانات الشكوى ناقصة ← N10."
     },
     "vs": "Promising or judging in a complaint → C19. Arguing with the customer → C14. Speaking badly about the clinic or doctors outside a complaint → C24. Missing complaint details → N10."
    },
    {
     "bucket": "BC",
     "item": "Other work instructions not followed (only when no other item covers it)",
     "applies": [
      "ALL"
     ],
     "example": "Mandatory script lines skipped, calling outside the allowed hours, more or fewer attempts than the lead process.",
     "coach": "Follow the mandatory script lines, calling hours and attempt rules.",
     "explain": "Work instructions keep every call consistent and compliant with the client's rules.",
     "ar": {
      "item": "مش ملتزم بتعليمات الشغل التانية (بس لو مفيش بند تاني بيغطيها)",
      "example": "ساب جمل السكريبت الإجبارية، أو اتصل بره المواعيد المسموحة، أو عدد محاولات أكتر أو أقل من نظام الليدز.",
      "coach": "التزم بجمل السكريبت الإجبارية ومواعيد الاتصال وقواعد عدد المحاولات.",
      "explain": "تعليمات الشغل بتخلي كل المكالمات بنفس المستوى وملتزمة بقواعد العميل.",
      "vs": "استخدم C20 بس لو مفيش بند تاني مناسب. مكالمة اتوعد بيها وماتعملتش ← C13. اسم مركز غلط ← C16. غلطات أودوو ← C21–C23."
     },
     "vs": "Use C20 only when no other item fits. Missed promised callback → C13. Wrong clinic name → C16. Odoo mistakes → C21–C23."
    },
    {
     "bucket": "BC",
     "item": "Odoo: wrong or missing disposition, lead stage or reason for not booking",
     "applies": [
      "ALL"
     ],
     "example": "Lead left in 'New' after the call; reason for not booking missing.",
     "coach": "Update the lead stage, disposition and reason for not booking in Odoo right after every call.",
     "explain": "Reports and follow-ups depend on the lead status. Wrong data means lost leads and wrong numbers.",
     "ar": {
      "item": "أودوو: حالة الليد أو نتيجة المكالمة أو سبب عدم الحجز غلط أو مش موجود",
      "example": "الليد فاضل 'New' بعد المكالمة؛ سبب عدم الحجز مش مكتوب.",
      "coach": "حدّث حالة الليد ونتيجة المكالمة وسبب عدم الحجز على أودوو بعد كل مكالمة على طول.",
      "explain": "التقارير والمتابعة معتمدة على حالة الليد. الداتا الغلط معناها ليدز بتضيع وأرقام غلط.",
      "vs": "C21 = حالة الليد ونتيجة المكالمة وسبب عدم الحجز. الملاحظات والـ Next activity ← C22. الحجز ← C10. الشكوى ← C11. أخطاء كتابة بسيطة ← N18."
     },
     "vs": "C21 = lead stage, call result, reason for not booking. Notes and next activity → C22. Booking → C10. Complaint → C11. Small typos → N18."
    },
    {
     "bucket": "BC",
     "item": "Odoo: missing notes or next activity (callback date) not set",
     "applies": [
      "ALL"
     ],
     "example": "No next activity on a lead that needs a callback.",
     "coach": "Add clear notes and set the next activity (callback date) on every lead that needs follow-up.",
     "explain": "Without notes and a next activity, nobody knows when to call the customer back or what was said.",
     "ar": {
      "item": "أودوو: ملاحظات ناقصة أو Next activity (ميعاد المكالمة الجاية) مش متحدد",
      "example": "مفيش Next activity على ليد محتاج مكالمة تانية.",
      "coach": "اكتب ملاحظات واضحة وحدد الـ Next activity (ميعاد المكالمة الجاية) لكل ليد محتاج متابعة.",
      "explain": "من غير ملاحظات وNext activity، محدش هيعرف يتصل بالعميل إمتى أو اتقال إيه.",
      "vs": "C22 = ملاحظات ناقصة أو الـ Next activity مش متحدد. حالة الليد / النتيجة ← C21. المكالمة الموعودة نفسها ماتعملتش ← C13. أخطاء كتابة بسيطة ← N18."
     },
     "vs": "C22 = notes missing or next activity not set. Lead stage / result → C21. Missed the promised call itself → C13. Small typos → N18."
    },
    {
     "bucket": "BC",
     "item": "Odoo: duplicate lead or activity created",
     "applies": [
      "ALL"
     ],
     "example": "New lead created instead of updating the existing one.",
     "coach": "Search Odoo by phone number before creating a new lead or activity.",
     "explain": "Duplicates split the customer's history and can lead to calling the same person twice.",
     "ar": {
      "item": "أودوو: ليد أو Activity متكرر",
      "example": "عمل ليد جديد بدل ما يحدّث الموجود.",
      "coach": "دوّر برقم التليفون على أودوو قبل ما تعمل ليد أو Activity جديد.",
      "explain": "التكرار بيقسم تاريخ العميل، وممكن يخلينا نكلم نفس الشخص مرتين."
     }
    },
    {
     "bucket": "BC",
     "item": "Negative talk about the clinic, doctors, colleagues or competitors",
     "applies": [
      "ALL"
     ],
     "example": "'The other branch is bad', 'that clinic is cheap'.",
     "coach": "Keep comments about the clinic, doctors, colleagues and competitors positive or neutral.",
     "explain": "Negative talk damages the brand and looks unprofessional.",
     "ar": {
      "item": "كلام سلبي عن العيادة أو الدكاترة أو الزملاء أو المنافسين",
      "example": "'الفرع التاني وحش'، 'العيادة دي رخيصة'.",
      "coach": "خلي كلامك عن العيادة والدكاترة والزملاء والمنافسين إيجابي أو محايد.",
      "explain": "الكلام السلبي بيأذي البراند وبيبان مش مهني.",
      "vs": "كلام سلبي عام عن العيادة أو الدكاترة أو الزملا أو المنافسين ← C24. الانحياز جوه شكوى ← C19."
     },
     "vs": "General negative talk about the clinic, doctors, colleagues or competitors → C24. Taking sides inside a complaint → C19."
    }
   ],
   "ar": {
    "name": "المكالمات",
    "types": {
     "Outbound - new lead": "أوتباوند - ليد جديد",
     "Outbound - follow-up after consultation": "أوتباوند - فولو أب بعد الاستشارة",
     "Outbound - existing client": "أوتباوند - عميل حالي",
     "Inbound - enquiry / callback": "إنباوند - استفسار / رد على مكالمة",
     "Inbound - complaint": "إنباوند - شكوى"
    },
    "outcomes": {
     "Booked consultation": "اتحجزت استشارة",
     "Callback scheduled": "اتحدد ميعاد مكالمة",
     "Not interested": "مش مهتم",
     "Hold - pregnancy": "Hold - حمل",
     "Complaint logged & escalated": "الشكوى اتسجلت واتصعّدت",
     "Feedback logged": "الفيدباك اتسجل",
     "Wrong number / not the lead": "رقم غلط / مش صاحب الطلب"
    }
   },
   "duration": {
    "kind": "mmss",
    "label": "Call duration",
    "labelAr": "مدة المكالمة"
   }
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
     "coach": "Check new leads continuously and send the first reply within the SLA; the first minutes decide the conversion.",
     "explain": "Leads that get a fast first reply book much more often. Time is measured from when the lead appears in Odoo.",
     "ar": {
      "label": "سرعة الرد على الليد",
      "item": "أول رد على الليد الجديد في الوقت المتفق عليه (اقتراح: 5 دقايق في مواعيد الشغل – لسه هيتأكد)",
      "guide": "أول رد اتأخر عن الوقت المتفق عليه، محسوب من وقت نزول الليد على أودوو.",
      "coach": "تابع الليدز الجديدة باستمرار وابعت أول رد في الوقت المتفق عليه؛ أول دقايق هي اللي بتفرق في الحجز.",
      "explain": "الليد اللي بياخد رد سريع بيحجز أكتر بكتير. الوقت بيتحسب من وقت ما الليد ينزل على أودوو.",
      "vs": "N1 = أول رد على ليد جديد. الردود بعد كده في الشات ← N2."
     },
     "vs": "N1 = the first reply to a new lead. Replies later in the chat → N2."
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
     "coach": "Keep replying while the customer is active; if you need to check something, say so first.",
     "explain": "Long gaps during an active chat make the customer lose interest or go to another clinic.",
     "ar": {
      "label": "سرعة الرد أثناء المحادثة",
      "item": "يكمّل المحادثة: يرد في الوقت المتفق عليه طول ما العميل متفاعل (اقتراح: 3 دقايق)",
      "guide": "العميل بيستنى ويكرر السؤال أو يمشي.",
      "coach": "كمّل الرد طول ما العميل متفاعل، ولو محتاج تتأكد من حاجة قوله الأول.",
      "explain": "الفترات الطويلة وسط محادثة شغالة بتخلي العميل يزهق أو يروح لمركز تاني.",
      "vs": "ردود بطيئة أثناء الشات ← N2. آخر رسالة للعميل فضلت من غير رد خالص ← C11 (حرج)."
     },
     "vs": "Slow replies during the chat → N2. Customer's last message left with no reply at all → C11 (critical)."
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
     "coach": "Use the approved opening with your name and 'Handsome & Pretty Medical Center'.",
     "explain": "The customer must know who is writing and from where, the same as on a call.",
     "ar": {
      "label": "رسالة الافتتاح",
      "item": "يرحّب ويعرّف بنفسه وبـ 'مركز هاندسم آند بريتي الطبي' بالافتتاحية المعتمدة",
      "guide": "مفيش ترحيب / اسم / اسم المركز.",
      "coach": "استخدم الافتتاحية المعتمدة باسمك واسم 'مركز هاندسم آند بريتي الطبي'.",
      "explain": "العميل لازم يعرف مين بيكلمه ومن أنهي مكان، زي المكالمة بالظبط.",
      "vs": "الاسم أو اسم المركز ماتقالش ← N3. اسم مركز غلط ← C14 (حرج)."
     },
     "vs": "Name or clinic not said → N3. A wrong clinic name → C14 (critical)."
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
     "coach": "Answer her exact question first, then adapt the template; avoid pasting the same text to everyone.",
     "explain": "Copy-paste replies feel like a bot. Answering the actual question keeps the customer engaged.",
     "ar": {
      "label": "ردود شخصية",
      "item": "ردود مخصوصة بترد على سؤال العميل نفسه (مش نسخ ولصق أو ردود آلية)",
      "guide": "نفس التمبلت بيتبعت أيًا كان السؤال.",
      "coach": "رد على سؤالها بالظبط الأول، وبعدين عدّل التمبلت؛ ومتبعتش نفس الكلام للكل.",
      "explain": "الردود المنسوخة بتحسّس العميل إنه بيكلم روبوت. الرد على سؤاله بالظبط بيخليه يكمل.",
      "vs": "N4 = الرد بيجاوب على السؤال نفسه. رسايل قصيرة وسهلة ← N10. الأسلوب ← N12."
     },
     "vs": "N4 = the reply answers the actual question. Short, readable messages → N10. Tone → N12."
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
     "coach": "Ask 2–3 questions about the concern, area, previous treatments and expectations before sending prices.",
     "explain": "Understanding the need first makes the offer relevant and increases bookings.",
     "ar": {
      "label": "فهم الاحتياج",
      "item": "يسأل أسئلة استكشافية: المشكلة / المنطقة، العلاجات السابقة، التوقعات، الفرع والوقت المناسب",
      "guide": "بيبعت الأسعار قبل ما يفهم الاحتياج.",
      "coach": "اسأل 2–3 أسئلة عن المشكلة والمنطقة والعلاجات السابقة والتوقعات قبل ما تبعت أسعار.",
      "explain": "فهم الاحتياج الأول بيخلي العرض مناسب وبيزوّد الحجوزات."
     }
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
     "coach": "Send one offer that matches what she told you, benefit first, not the full list.",
     "explain": "One relevant offer is clearer and more convincing than the full price list.",
     "ar": {
      "label": "ربط العرض بالاحتياج",
      "item": "يربط العرض باحتياج العميل",
      "guide": "بيبعت قايمة العروض كلها من غير ربط بالاحتياج.",
      "coach": "ابعت عرض واحد مناسب للي قالته، وابدأ بالفايدة، مش القايمة كلها.",
      "explain": "عرض واحد مناسب أوضح وأقنع من قايمة الأسعار كلها."
     }
    },
    {
     "section": "Offer",
     "item": "Clear call to action: free consultation / booking, with its value",
     "applies": [
      "SALES",
      "FU"
     ],
     "weight": 8,
     "guide": "Next step suggested without its value. If there is no call to action at all → C15.",
     "label": "Call to action",
     "coach": "End every useful exchange with a clear next step: book the free consultation and explain its value.",
     "explain": "Without a clear next step, chats end with questions answered but no booking.",
     "ar": {
      "label": "الدعوة للحجز",
      "item": "دعوة واضحة للخطوة الجاية: الاستشارة المجانية / الحجز، مع توضيح قيمتها",
      "guide": "الخطوة الجاية اتقالت من غير قيمتها. لو مفيش دعوة للحجز خالص ← C15.",
      "coach": "اختم أي كلام مفيد بخطوة واضحة: احجزي الاستشارة المجانية، ووضّح قيمتها.",
      "explain": "من غير خطوة جاية واضحة، المحادثة بتخلص والأسئلة اتجاوبت بس من غير حجز.",
      "vs": "دعوة للحجز ضعيفة ← N7. مفيش دعوة للحجز خالص ← C15 (حرج)."
     },
     "vs": "Weak call to action → N7. No call to action at all → C15 (critical)."
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
     "coach": "Offer a call when the chat gets long or she hesitates; respect it if she prefers WhatsApp.",
     "explain": "Some customers decide faster on a call; others prefer WhatsApp. The agent should offer, not force.",
     "ar": {
      "label": "التحويل لمكالمة",
      "item": "يعرض مكالمة لما تكون مفيدة (سؤال معقد، تردد) ويحترم لو العميل عايز يكمل واتساب",
      "guide": "يفرض مكالمة، أو عمره ما يعرضها لما المحادثة تقف.",
      "coach": "اعرض مكالمة لما المحادثة تطول أو العميل يتردد، واحترم لو هو عايز يكمل واتساب.",
      "explain": "فيه عملاء بيقرروا أسرع في مكالمة، وفيه اللي بيفضل الواتساب. الإيجنت يعرض بس ميفرضش."
     }
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
     "coach": "Use acknowledge, clarify, answer, then ask again; use the approved answers for the top objections.",
     "explain": "Objections are normal. Handling them well in writing turns hesitation into a booking.",
     "ar": {
      "label": "التعامل مع الاعتراضات",
      "item": "يتعامل مع الاعتراضات بالطريقة المعتمدة",
      "guide": "يتجاهل الاعتراض أو يجادل.",
      "coach": "استخدم: تفهّم، وضّح، رد، وبعدين اعرض تاني؛ واستخدم الردود المعتمدة لأشهر الاعتراضات.",
      "explain": "الاعتراضات طبيعية. التعامل الصح معاها في الكتابة بيحوّل التردد لحجز.",
      "vs": "تعامل ضعيف مع الاعتراض ← N9. قلة ذوق أو جدال ← C13. مفيش دعوة للحجز خالص ← C15."
     },
     "vs": "Weak handling of an objection → N9. Rude or arguing → C13. Never inviting to book → C15."
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
     "coach": "One idea per message, short lines, no long paragraphs.",
     "explain": "Customers read on their phones. Short messages are read; long blocks are skipped.",
     "ar": {
      "label": "رسايل قصيرة وواضحة",
      "item": "رسايل قصيرة وواضحة: فكرة واحدة في كل رسالة، من غير فقرات طويلة",
      "guide": "فقرات طويلة العميل لازم يعمل سكرول عشان يقراها.",
      "coach": "فكرة واحدة في كل رسالة، وسطور قصيرة، ومن غير فقرات طويلة.",
      "explain": "العميل بيقرا من الموبايل. الرسايل القصيرة بتتقري، والفقرات الطويلة بتتساب."
     }
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
     "coach": "Re-read each message before sending; keep templates corrected.",
     "explain": "Spelling mistakes in writing look unprofessional for a medical center.",
     "ar": {
      "label": "الإملاء والقواعد",
      "item": "إملاء وقواعد وعلامات ترقيم صح",
      "guide": "غلطات إملائية متكررة.",
      "coach": "راجع كل رسالة قبل ما تبعتها، وصحّح التمبلتس.",
      "explain": "الغلطات الإملائية في الكتابة بتبان مش مهنية لمركز طبي."
     }
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
     "coach": "Respectful, Gulf-friendly wording with moderate emojis; avoid slang and being too informal.",
     "explain": "The writing style should match a medical center and a Gulf customer.",
     "ar": {
      "label": "الأسلوب واللغة",
      "item": "أسلوب ولغة مناسبين للعميل (محترم، مناسب للخليج، إيموجي باعتدال)",
      "guide": "تبسّط زيادة، أو رسمي زيادة، أو كلمات عامية ممكن العميل ميفهمهاش.",
      "coach": "استخدم كلام محترم ومناسب للخليج، وإيموجي باعتدال، وابعد عن العامية والتبسّط الزيادة.",
      "explain": "أسلوب الكتابة لازم يناسب مركز طبي وعميل من الخليج.",
      "vs": "N12 = الأسلوب والكلمات. تقدير مشاعر العميل ← N13. قلة ذوق أو جدال ← C13."
     },
     "vs": "N12 = style and wording. Acknowledging feelings → N13. Rude or arguing → C13."
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
     "coach": "Acknowledge her concern in words before giving information.",
     "explain": "Acknowledging feelings in writing makes the customer feel heard.",
     "ar": {
      "label": "التعاطف",
      "item": "التعاطف: يعترف بمخاوف العميل ومشاعره",
      "guide": "العميل قال قلق ومحدش رد عليه.",
      "coach": "اعترف بقلق العميل بالكلام قبل ما تدّي المعلومة.",
      "explain": "الاعتراف بمشاعر العميل في الكتابة بيحسّسه إن فيه حد سامعه.",
      "vs": "N13 = تقدير مشاعر العميل وقلقه. الأسلوب والكلمات ← N12."
     },
     "vs": "N13 = acknowledging feelings and concerns. Style and wording → N12."
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
     "coach": "Send one confirmation message: service, branch with location pin, date and time, pre-visit instructions.",
     "explain": "One clear confirmation message is easy to find later and reduces no-shows.",
     "ar": {
      "label": "تأكيد الحجز",
      "item": "يأكد الحجز في رسالة واحدة واضحة: الخدمة، الفرع + لوكيشن، اليوم والساعة، تعليمات قبل الزيارة",
      "guide": "التفاصيل متفرقة أو ناقصة.",
      "coach": "ابعت رسالة تأكيد واحدة: الخدمة، الفرع مع اللوكيشن، اليوم والساعة، تعليمات قبل الزيارة.",
      "explain": "رسالة تأكيد واحدة واضحة سهل العميل يلاقيها بعدين، وبتقلل إنه ميجيش.",
      "vs": "التفاصيل اتقالت بس مش في رسالة تأكيد واحدة واضحة ← N14. معلومة ماتقالتش خالص ← C9. الحجز غلط على أودوو ← C10."
     },
     "vs": "Details given but not in one clear confirmation → N14. A detail never given at all → C9. Booked wrong in Odoo → C10."
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
     "coach": "Re-read your Odoo notes before saving; keep them short, clear and complete.",
     "explain": "Clean Odoo notes help the next colleague who contacts the same customer.",
     "ar": {
      "label": "ملاحظات أودوو",
      "item": "غلطات بسيطة في ملاحظات أو خانات أودوو مش بتغيّر حالة الليد أو الحجز أو التصعيد",
      "guide": "غلطات كتابة أو ملاحظات ناقصة بس لسه مفهومة.",
      "coach": "راجع ملاحظاتك على أودوو قبل الحفظ، وخليها قصيرة وواضحة وكاملة.",
      "explain": "ملاحظات أودوو النضيفة بتساعد الزميل اللي هيكلم نفس العميل بعد كده.",
      "vs": "غلطة بسيطة على أودوو ومش بتغيّر حاجة ← N15. لو بتغيّر حالة الليد أو الحجز أو التصعيد ← C10 أو C12 أو C19 أو C20."
     },
     "vs": "Small Odoo mistakes that change nothing → N15. If it changes the lead status, booking or escalation → C10, C12, C19 or C20."
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
     "coach": "Never assess photos or medical suitability in the chat. Say the doctor will assess it in the free consultation and book it.",
     "explain": "Judging photos or medical suitability is a medical opinion. Only the doctor can do it.",
     "ar": {
      "item": "يدّي نصيحة طبية أو يقيّم الحالة، حتى من الصور اللي العميل بيبعتها",
      "example": "'من صورتك محتاجة سرنجتين'، 'آمن مع الدوا اللي بتاخديه'.",
      "coach": "متقيّمش الصور أو الحالة الطبية في الشات أبدًا. قول إن الدكتور هيقيّمها في الاستشارة المجانية واحجزها.",
      "explain": "تقييم الصور أو الحالة رأي طبي، والدكتور بس هو اللي يقدر يعمله.",
      "vs": "أي نصيحة طبية أو حكم على الحالة حتى من الصور ← C1. إنه يقول العلاج آمن في الحمل برضه C1؛ إجراءات الحجز / الـ Hold للحمل ← C3."
     },
     "vs": "Any medical advice or suitability judgement, including from photos → C1. Saying a treatment is safe in pregnancy is also C1; the pregnancy booking / hold process → C3."
    },
    {
     "bucket": "CC",
     "item": "Promises results or uses unapproved claims",
     "applies": [
      "ALL"
     ],
     "example": "'Guaranteed', 'permanent', '100%', kg loss, 'FDA-approved'.",
     "coach": "Use only approved wording: 'results vary from person to person'. Never 'guaranteed', 'permanent', '100%' or kg promises.",
     "explain": "Written promises are evidence. They create false expectations and complaints.",
     "ar": {
      "item": "يوعد بنتايج أو يستخدم ادعاءات مش معتمدة",
      "example": "'مضمون'، 'دايم'، '100%'، وعود بالكيلو، 'معتمد من FDA'.",
      "coach": "استخدم الكلام المعتمد بس: 'النتايج بتختلف من شخص للتاني'. ومتقولش 'مضمون' أو 'دايم' أو '100%' أو وعود بالكيلو.",
      "explain": "الوعود المكتوبة بتبقى دليل، وبتعمل توقعات غلط وشكاوى."
     }
    },
    {
     "bucket": "CC",
     "item": "Pregnancy rule not followed",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Books a pregnant customer without her insisting / without noting it.",
     "coach": "Review the pregnancy rule: Hold and follow up after delivery; book only if she insists, and note it.",
     "explain": "Most treatments are not done during pregnancy. The approved rule is Hold and follow up after delivery.",
     "ar": {
      "item": "مش ملتزم بقاعدة الحمل",
      "example": "يحجز لعميلة حامل من غير ما تصر / من غير ما يكتب ده.",
      "coach": "راجع قاعدة الحمل: Hold ومتابعة بعد الولادة. ومتحجزش غير لو هي أصرّت، واكتب ده.",
      "explain": "أغلب العلاجات مش بتتعمل أثناء الحمل. القاعدة المعتمدة: Hold ومتابعة بعد الولادة.",
      "vs": "C3 = إجراءات الحجز / الـ Hold للحامل. إنه يقول العلاج آمن في الحمل ← C1."
     },
     "vs": "C3 = the pregnancy booking / hold process. Saying a treatment is safe in pregnancy → C1."
    },
    {
     "bucket": "CC",
     "item": "Quotes unapproved figures",
     "applies": [
      "ALL"
     ],
     "example": "VAT %, installment fee %, Sculptra session count, regular price.",
     "coach": "Don't quote VAT %, installment fees or session counts in writing. Say these are confirmed before booking.",
     "explain": "Unconfirmed figures in writing become a commitment the clinic may not honour.",
     "ar": {
      "item": "يقول أرقام مش معتمدة",
      "example": "نسبة الضريبة، رسوم التقسيط، عدد جلسات Sculptra، سعر عادي.",
      "coach": "متكتبش نسبة الضريبة أو رسوم التقسيط أو عدد الجلسات. قول إن التفاصيل دي بتتأكد قبل الحجز.",
      "explain": "الأرقام اللي مش متأكدة لما تتكتب بتبقى التزام ممكن العيادة متقدرش تنفذه.",
      "vs": "C4 = رقم ممنوع نقوله أصلًا. سعر معتمد اتقال غلط ← C8. وعد بخصم زيادة ← C16."
     },
     "vs": "C4 = a figure we must never quote. A wrong approved price → C8. Promising an extra discount → C16."
    },
    {
     "bucket": "CC",
     "item": "Sends unapproved content or other customers' data",
     "applies": [
      "ALL"
     ],
     "example": "Before / after photos, files or prices not on the approved list; another customer's details.",
     "coach": "Send only approved media and prices; never share other customers' photos or details.",
     "explain": "Other customers' photos and data are private. Unapproved media can also break advertising rules.",
     "ar": {
      "item": "يبعت محتوى مش معتمد أو بيانات عملاء تانيين",
      "example": "صور قبل / بعد، ملفات، أو أسعار مش في القايمة المعتمدة؛ أو بيانات عميل تاني.",
      "coach": "ابعت الميديا والأسعار المعتمدة بس، ومتشاركش أبدًا صور أو بيانات عملاء تانيين.",
      "explain": "صور وبيانات العملاء التانيين خاصة. والميديا اللي مش معتمدة ممكن تخالف قواعد الإعلان.",
      "vs": "C5 = بعت ملفات أو صور أو بيانات مش معتمدة أو بتاعة عميل تاني. الحكم الطبي من الصور ← C1."
     },
     "vs": "C5 = sending files, photos or data that are not approved or belong to another customer. Medical judgement from photos → C1."
    },
    {
     "bucket": "CC",
     "item": "Uses a misleading pretext or false urgency",
     "applies": [
      "ALL"
     ],
     "example": "Invented deadline.",
     "coach": "Use only approved messages; never invent deadlines.",
     "explain": "Misleading messages damage trust once discovered.",
     "ar": {
      "item": "يستخدم حجة مضللة أو استعجال مش حقيقي",
      "example": "ميعاد نهاية عرض مش حقيقي.",
      "coach": "استخدم الرسايل المعتمدة بس، ومتخترعش مواعيد.",
      "explain": "الرسايل المضللة بتضيّع الثقة أول ما تتكشف."
     }
    },
    {
     "bucket": "CC",
     "item": "Ignores a clear 'stop messaging me' request",
     "applies": [
      "ALL"
     ],
     "example": "Keeps sending offers after a refusal.",
     "coach": "Respect a 'stop messaging me' request: confirm politely, mark it in Odoo and stop.",
     "explain": "Messaging people who refused is spam and can get the WhatsApp number blocked.",
     "ar": {
      "item": "يتجاهل طلب واضح 'متبعتليش تاني'",
      "example": "يفضل يبعت عروض بعد الرفض.",
      "coach": "احترم طلب 'متبعتليش': أكّد بأدب، وسجّله على أودوو، ووقّف.",
      "explain": "إنك تبعت لحد رفض بيبقى سبام، وممكن رقم الواتساب يتبلّك."
     }
    },
    {
     "bucket": "EU",
     "item": "Wrong price, offer or gift information",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Wrong price, or does not say prices are before VAT.",
     "coach": "Check the offers sheet before quoting and always say prices are before VAT.",
     "explain": "A wrong price in writing is hard to take back and leads to disputes.",
     "ar": {
      "item": "معلومة غلط في السعر أو العرض أو الهدية",
      "example": "سعر غلط، أو مش بيقول إن الأسعار قبل الضريبة.",
      "coach": "راجع شيت العروض قبل ما تكتب السعر، وقول دايمًا إن الأسعار قبل الضريبة.",
      "explain": "السعر الغلط المكتوب صعب يترجع فيه وبيعمل خلاف.",
      "vs": "غلطة في سعر أو عرض أو هدية معتمدة ← C8. وعد بحاجة زيادة مش معتمدة ← C16. رقم ممنوع نقوله ← C4."
     },
     "vs": "Honest mistake in an approved price, offer or gift → C8. Promising something extra that is not approved → C16. Quoting a forbidden figure → C4."
    },
    {
     "bucket": "EU",
     "item": "Missing information the customer needs",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Branch, hours, free consultation, prep instructions.",
     "coach": "Use the booking checklist: branch, hours, free consultation, prep instructions.",
     "explain": "Missing information makes the visit fail or surprises the customer.",
     "ar": {
      "item": "معلومات ناقصة العميل محتاجها",
      "example": "الفرع، المواعيد، الاستشارة المجانية، تعليمات التحضير.",
      "coach": "استخدم قايمة الحجز: الفرع، المواعيد، الاستشارة المجانية، تعليمات التحضير.",
      "explain": "المعلومات الناقصة بتبوّظ الزيارة أو بتفاجئ العميل.",
      "vs": "المعلومة ماتقالتش خالص ← C9. اتقالت بس مش في رسالة تأكيد واضحة ← N14. سعر غلط ← C8."
     },
     "vs": "Information never given at all → C9. Given but not in one clear confirmation → N14. Wrong price → C8."
    },
    {
     "bucket": "EU",
     "item": "Wrong or missing booking",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Wrong branch / time, or not booked in Odoo.",
     "coach": "Double-check date, time, branch and service in Odoo before confirming in the chat.",
     "explain": "A wrong booking means the customer arrives and is not expected.",
     "ar": {
      "item": "حجز غلط أو مش متسجل",
      "example": "فرع / ميعاد غلط، أو مش متسجل على أودوو.",
      "coach": "راجع اليوم والساعة والفرع والخدمة على أودوو قبل ما تأكد في الشات.",
      "explain": "الحجز الغلط معناه إن العميل يوصل ومحدش مستنيه.",
      "vs": "حجز غلط أو مش متسجل ← C10 بس (مش C19 كمان)."
     },
     "vs": "Wrong or missing booking → C10 only (not C19 too)."
    },
    {
     "bucket": "EU",
     "item": "Customer left without a reply (chat abandoned)",
     "applies": [
      "ALL"
     ],
     "example": "Last message is the customer's question with no answer.",
     "coach": "Never leave a customer's question unanswered; hand over the chat if you are going off shift.",
     "explain": "An unanswered question is a lost customer and a bad image of the clinic.",
     "ar": {
      "item": "العميل اتساب من غير رد (محادثة متروكة)",
      "example": "آخر رسالة سؤال من العميل ومحدش رد عليه.",
      "coach": "متسيبش سؤال عميل من غير رد أبدًا؛ ولو شيفتك خلصت سلّم المحادثة لزميل.",
      "explain": "السؤال اللي ملوش رد عميل ضايع وصورة وحشة عن المركز.",
      "vs": "الشات اتساب من غير رد خالص ← C11. ردود بطيئة ← N2."
     },
     "vs": "Chat left with no reply at all → C11. Slow replies → N2."
    },
    {
     "bucket": "EU",
     "item": "Complaint not logged in Odoo or not escalated to the UAE team",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "Complaint in the chat and nothing logged.",
     "coach": "Log every complaint in Odoo and escalate it to the UAE team the same day.",
     "explain": "Our role is to log and escalate complaints so the clinic can act.",
     "ar": {
      "item": "شكوى مش متسجلة على أودوو أو مش متصعّدة لفريق الإمارات",
      "example": "شكوى في الشات ومحدش سجّلها.",
      "coach": "سجّل أي شكوى على أودوو وصعّدها لفريق الإمارات في نفس اليوم.",
      "explain": "دورنا إننا نسجل الشكاوى ونصعّدها عشان العيادة تتصرف.",
      "vs": "الشكوى ماتسجلتش أو ماتصعّدتش ← C12 بس (مش C19 كمان). اتسجلت بس الإيجنت وعد بنتيجة ← C17."
     },
     "vs": "Complaint not logged or not escalated → C12 only (not C19 too). Logged, but the agent promised an outcome → C17."
    },
    {
     "bucket": "EU",
     "item": "Rude or arguing",
     "applies": [
      "ALL"
     ],
     "example": "Sarcasm, blaming the customer.",
     "coach": "Stay polite in writing even when the customer is not; never argue or use sarcasm.",
     "explain": "Rude messages can be screenshotted and shared, damaging the brand.",
     "ar": {
      "item": "قلة ذوق أو جدال",
      "example": "تريقة، أو لوم العميل.",
      "coach": "خليك محترم في الكتابة حتى لو العميل مش كده، ومتجادلش أو تتريق.",
      "explain": "الرسايل اللي فيها قلة ذوق ممكن تتصوّر وتتنشر وتأذي البراند.",
      "vs": "قلة ذوق أو تريقة أو جدال ← C13. أسلوب متبسّط زيادة أو ناشف شوية ← N12."
     },
     "vs": "Rude, sarcastic or arguing → C13. Style that is a bit too informal or stiff → N12."
    },
    {
     "bucket": "BC",
     "item": "Wrong clinic name",
     "applies": [
      "ALL"
     ],
     "example": "Must be 'Handsome & Pretty Medical Center'.",
     "coach": "Introduce the clinic only as 'Handsome & Pretty Medical Center'.",
     "explain": "The client asked for this name. A wrong name confuses customers.",
     "ar": {
      "item": "اسم المركز غلط",
      "example": "لازم يكون 'مركز هاندسم آند بريتي الطبي'.",
      "coach": "عرّف المركز باسم 'مركز هاندسم آند بريتي الطبي' بس.",
      "explain": "العيادة طلبت الاسم ده. الاسم الغلط بيلخبط العملاء.",
      "vs": "اسم مركز غلط ← C14. اسم المركز ماتقالش خالص ← N3."
     },
     "vs": "A wrong clinic name → C14. Clinic name not said at all → N3."
    },
    {
     "bucket": "BC",
     "item": "No call to action at all / no booking attempt when the customer is eligible",
     "applies": [
      "SALES",
      "FU"
     ],
     "example": "Answers questions only, never invites to book.",
     "coach": "Always invite the customer to book the free consultation when she is eligible.",
     "explain": "Booking is the goal of the chat. Answering questions without inviting to book loses the lead.",
     "ar": {
      "item": "مفيش أي دعوة للحجز / محاولة حجز والعميل ينفع يحجز",
      "example": "بيرد على الأسئلة بس، وعمره ما يدعو للحجز.",
      "coach": "ادعِ العميل دايمًا يحجز الاستشارة المجانية لما يكون ينفع.",
      "explain": "الحجز هو هدف المحادثة. الرد على الأسئلة من غير دعوة للحجز بيضيّع الليد.",
      "vs": "مفيش دعوة للحجز خالص ← C15. دعوة ضعيفة ← N7. تعامل ضعيف مع اعتراض ← N9."
     },
     "vs": "No call to action at all → C15. A weak call to action → N7. Weak objection handling → N9."
    },
    {
     "bucket": "BC",
     "item": "Promises a discount, gift, price or compensation that is not approved",
     "applies": [
      "ALL"
     ],
     "example": "Extra discount or gift.",
     "coach": "Offer only what is on the approved offers sheet; escalate special requests to the TL.",
     "explain": "A written promise must be honoured; unapproved ones cost money or cause disputes.",
     "ar": {
      "item": "يوعد بخصم أو هدية أو سعر أو تعويض مش معتمد",
      "example": "خصم أو هدية زيادة.",
      "coach": "اعرض اللي في شيت العروض المعتمد بس، وأي طلب خاص صعّده للتيم ليدر.",
      "explain": "الوعد المكتوب لازم يتنفذ؛ واللي مش معتمد بيكلف فلوس أو يعمل خلاف.",
      "vs": "وعد بحاجة زيادة مش معتمدة ← C16. غلطة في سعر معتمد ← C8. رقم ممنوع نقوله ← C4."
     },
     "vs": "Promising something extra that is not approved → C16. An honest mistake in an approved price → C8. Quoting a forbidden figure → C4."
    },
    {
     "bucket": "BC",
     "item": "Goes beyond our role in a complaint: promises an outcome, refund or timeline, or decides who is right",
     "applies": [
      "CMP",
      "FU"
     ],
     "example": "'We'll refund you', 'you're right, the doctor made a mistake'.",
     "coach": "Take complaint details and escalate; don't promise outcomes or comment on the clinic.",
     "explain": "Complaints are resolved by the UAE team, not in the chat.",
     "ar": {
      "item": "يتعدّى دوره في الشكوى: يوعد بنتيجة أو استرجاع فلوس أو ميعاد حل، أو يحكم مين الصح",
      "example": "'هنرجعلك فلوسك'، 'عندك حق، الدكتور غلط'.",
      "coach": "خد بيانات الشكوى وصعّدها، ومتوعدش بنتيجة ومتعلقش على العيادة.",
      "explain": "الشكاوى بيحلها فريق الإمارات، مش في الشات.",
      "vs": "وعد أو حكم في الشكوى ← C17. جدال ← C13. ماتسجلتش / ماتصعّدتش ← C12."
     },
     "vs": "Promising or judging in a complaint → C17. Arguing → C13. Not logged / not escalated → C12."
    },
    {
     "bucket": "BC",
     "item": "Uses a personal number or channel instead of the approved WhatsApp account",
     "applies": [
      "ALL"
     ],
     "example": "Moves the chat to the agent's own phone.",
     "coach": "Use only the approved WhatsApp account; never move a customer to a personal number.",
     "explain": "Personal numbers break privacy rules and the clinic loses the conversation history.",
     "ar": {
      "item": "يستخدم رقم أو قناة شخصية بدل حساب الواتساب المعتمد",
      "example": "ينقل المحادثة لموبايله الشخصي.",
      "coach": "استخدم حساب الواتساب المعتمد بس، ومتنقلش العميل لرقم شخصي أبدًا.",
      "explain": "الأرقام الشخصية بتخالف قواعد الخصوصية، والمركز بيخسر تاريخ المحادثة."
     }
    },
    {
     "bucket": "BC",
     "item": "Odoo: wrong or missing stage, disposition, notes or next activity",
     "applies": [
      "ALL"
     ],
     "example": "Chat not reflected on the lead card.",
     "coach": "Update stage, disposition, notes and next activity in Odoo after every chat.",
     "explain": "Odoo is the record of every lead; chats must be reflected there for follow-up and reports.",
     "ar": {
      "item": "أودوو: حالة أو نتيجة أو ملاحظات أو Next activity غلط أو مش موجودة",
      "example": "المحادثة مش ظاهرة على كارت الليد.",
      "coach": "حدّث الحالة والنتيجة والملاحظات والـ Next activity على أودوو بعد كل محادثة.",
      "explain": "أودوو هو سجل كل ليد؛ المحادثات لازم تتسجل عليه عشان المتابعة والتقارير.",
      "vs": "حالة الليد أو النتيجة أو الملاحظات أو الـ Next activity ← C19. الحجز ← C10. الشكوى ← C12. أخطاء كتابة بسيطة ← N15."
     },
     "vs": "Lead stage, result, notes or next activity → C19. Booking → C10. Complaint → C12. Small typos → N15."
    },
    {
     "bucket": "BC",
     "item": "Odoo: duplicate lead or activity created",
     "applies": [
      "ALL"
     ],
     "example": "New lead created for an existing customer.",
     "coach": "Search Odoo by phone number before creating a new lead or activity.",
     "explain": "Duplicates split the customer's history and cause double contact.",
     "ar": {
      "item": "أودوو: ليد أو Activity متكرر",
      "example": "ليد جديد لعميل موجود.",
      "coach": "دوّر برقم التليفون على أودوو قبل ما تعمل ليد أو Activity جديد.",
      "explain": "التكرار بيقسم تاريخ العميل وبيخلينا نكلمه مرتين."
     }
    }
   ],
   "ar": {
    "name": "الواتساب",
    "types": {
     "New campaign lead": "ليد جديد من حملة",
     "Lead moved from call": "ليد اتحوّل من مكالمة",
     "Follow-up after consultation": "فولو أب بعد الاستشارة",
     "Existing client": "عميل حالي",
     "Complaint": "شكوى"
    },
    "outcomes": {
     "Booked consultation": "اتحجزت استشارة",
     "Moved to call": "اتحوّل لمكالمة",
     "Callback scheduled": "اتحدد ميعاد مكالمة",
     "Not interested": "مش مهتم",
     "Hold - pregnancy": "Hold - حمل",
     "Complaint logged & escalated": "الشكوى اتسجلت واتصعّدت",
     "No reply from customer": "العميل مردش"
    }
   },
   "duration": {
    "kind": "options",
    "label": "First response time",
    "labelAr": "وقت أول رد",
    "options": [
     "Under 1 min",
     "1–2 min",
     "3–5 min",
     "6–10 min",
     "11–15 min",
     "16–30 min",
     "31–60 min",
     "1–2 hours",
     "Over 2 hours"
    ],
    "optionsAr": [
     "أقل من دقيقة",
     "1–2 دقيقة",
     "3–5 دقايق",
     "6–10 دقايق",
     "11–15 دقيقة",
     "16–30 دقيقة",
     "31–60 دقيقة",
     "1–2 ساعة",
     "أكتر من ساعتين"
    ]
   }
  }
 },
 "sectionsAr": {
  "Opening": "الافتتاح",
  "Discovery": "فهم الاحتياج",
  "Offer": "العرض",
  "Complaint": "الشكوى",
  "Closing": "الختام",
  "Soft skills": "المهارات الشخصية",
  "Odoo (minor)": "أودوو (بسيط)",
  "Speed": "السرعة",
  "Engagement": "التفاعل",
  "Writing": "الكتابة"
 }
};
