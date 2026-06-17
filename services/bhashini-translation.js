import fs from "fs";
import dotenv from "dotenv";
import OpenAI from "openai";
import XLSX from "xlsx";
import BhashiniConfig from "../config/bhashini.config.js";

dotenv.config();

const translationClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const TRANSLATION_MODEL =
  process.env.OPENAI_TRANSLATION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

const SUPPORTED_SOURCE_LANGUAGES = new Map([
  ["kn", "Kannada"],
  ["hi", "Hindi"],
  ["te", "Telugu"],
  ["ta", "Tamil"],
  ["ml", "Malayalam"],
]);

const SCRIPT_PATTERNS = {
  kn: /\p{Script=Kannada}/gu,
  hi: /\p{Script=Devanagari}/gu,
  te: /\p{Script=Telugu}/gu,
  ta: /\p{Script=Tamil}/gu,
  ml: /\p{Script=Malayalam}/gu,
};

const SCRIPT_TESTERS = {
  kn: /\p{Script=Kannada}/u,
  hi: /\p{Script=Devanagari}/u,
  te: /\p{Script=Telugu}/u,
  ta: /\p{Script=Tamil}/u,
  ml: /\p{Script=Malayalam}/u,
};

const ENGLISH_LIKE_PATTERN = /\p{Script=Latin}/u;
const URL_PATTERN = /^(?:https?:\/\/|www\.)\S+$/i;
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{5,}[0-9]$/;
const DATE_PATTERN =
  /^(?:\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})$/;
const GENERIC_COLUMN_PATTERN = /^column\s+\d+$/i;
const UNNAMED_COLUMN_PATTERN = /^unnamed(?::|\s+column)?$/i;

const HEADER_RULES = [
  { match: /^आपका पूरा नाम/i, value: "Your Full Name:" },
  { match: /^आपका ईमेल पता/i, value: "Your Email Address:" },
  { match: /^आपका दूरभाष संख्या/i, value: "Your Phone Number:" },
  { match: /^आपका फोन नंबर/i, value: "Your Phone Number:" },
  { match: /^ईमेल पता/i, value: "Email Address of the Person Being Nominated:" },
  { match: /^फोन नंबर/i, value: "Your Phone Number:" },
  { match: /^फ़ोन नंबर/i, value: "Your Phone Number:" },
  { match: /^वैकल्पिक संख्या/i, value: "Alternate Phone (Optional):" },
  { match: /^वैकल्पिक फोन/i, value: "Alternate Phone (Optional):" },
  { match: /^वैकल्पिक फ़ोन/i, value: "Alternate Phone (Optional):" },
  {
    match: /^आपका संगठन .*भूमिका\/पदनाम/i,
    value: "Your Organization and Title (Optional):",
  },
  {
    match: /^आपका संस्थान .*भूमिका\/पदनाम/i,
    value: "Your Organization and Title (Optional):",
  },
  {
    match: /^नामांकित किए जा रहे व्यक्ति से आपका संबंध/i,
    value: "Your Relationship with the Nominee:",
  },
  {
    match: /^नामांकित किए जा रहे व्यक्ति के साथ आपका संबंध/i,
    value: "Your Relationship with the Nominee:",
  },
  {
    match: /^आपने पुरस्कारों के विषय में कहाँ सुना/i,
    value: "Where Did You Hear About the Shikshagraha Awards? (Multiple Choice)",
  },
  {
    match: /^शिक्षाग्रह पुरस्कार/i,
    value: "Where Did You Hear About the Shikshagraha Awards? (Multiple Choice)",
  },
  {
    match: /^नामांकित किए जा रहे व्यक्ति का पूरा नाम/i,
    value: "Full Name of the Person Being Nominated:",
  },
  {
    match: /^नामांकित किए जा रहे व्यक्ति की आयु/i,
    value: "Age of the Nominee:",
  },
  {
    match: /^नामांकित किए जा रहे व्यक्ति की संपर्क जानकारी/i,
    value:
      "Contact Information of the Person Being Nominated (Phone and/or Email Address):",
  },
  {
    match: /^दूरभाष संख्या/i,
    value: "Phone Number of the Person Being Nominated:",
  },
  {
    match: /^ईमेल पता/i,
    value: "Email Address of the Person Being Nominated:",
  },
  {
    match: /^नामांकित किए जा रहे व्यक्ति का वर्तमान पता/i,
    value:
      "Current Address of the Nominee (Village/Panchayat/Town/City/District/State):",
  },
  {
    match: /^नामांकित किए जा रहे व्यक्ति की प्राथमिक भाषा/i,
    value: "Nominee's Mother Tongue:",
  },
  {
    match: /^नामांकित किए जा रहे व्यक्ति की मातृ भाषा\b/i,
    value: "Nominee's Mother Tongue:",
  },
  { match: /^नेता का प्रकार/i, value: "Leader Category:" },
  {
    match: /^नामांकित किए जा रहे व्यक्ति की वर्तमान भूमिका और संगठन\/संबद्धता/i,
    value: "Nominee's Current Organization / Role / Position:",
  },
  { match: /^संबोधित की गई चुनौती/i, value: "Challenges Addressed:" },
  { match: /^समाधान और की गई कार्यवाहियाँ/i, value: "Solution and Actions Taken:" },
  { match: /^प्राप्त प्रभाव/i, value: "Achievements:" },
  {
    match: /^यह नेता विशेष क्यों है/i,
    value: "Why This Leader's Achievement Is Special:",
  },
  { match: /^संदर्भ/i, value: "References:" },
  { match: /^सहायक दस्तावेज़/i, value: "Supporting Documents:" },
  {
    match: /^कार्य\/परियोजनाओं का लिंक/i,
    value: "Project/Work Links (Optional):",
  },
  { match: /^पुष्टि/i, value: "Confirmation:" },
  { match: /^सहमति/i, value: "Consent:" },
  { match: /^स्व-?नामांकन$/i, value: "Self-Nomination" },
  { match: /^ईमेल आईडी समान है$/i, value: "Email ID is Same" },
  { match: /^नाम समान है$/i, value: "Name is Same" },
  { match: /ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು/i, value: "Your Full Name:" },
  { match: /ನಿಮ್ಮ ಇಮೇಲ್ ವಿಳಾಸ/i, value: "Your Email Address:" },
  { match: /ಪರ್ಯಾಯ ಫೋನ್/i, value: "Alternate Phone (Optional):" },
  { match: /ಫೋನ್ ಸಂಖ್ಯೆ/i, value: "Your Phone Number:" },
  {
    match: /ನಿಮ್ಮ ಸಂಸ್ಥೆ ಮತ್ತು ಹುದ್ದೆ/i,
    value: "Your Organization and Title (Optional):",
  },
  {
    match: /ಸಹಸಂಬಂಧ|ನಾಮನಿರ್ದೇಶನಗೊಳ್ಳುತ್ತಿರುವ ವ್ಯಕ್ತಿಯೊಂದಿಗೆ ನಿಮ್ಮ ಸಹಸಂಬಂಧ/i,
    value: "Your Relationship with the Nominee:",
  },
  {
    match: /ಶಿಕ್ಷಾಗ್ರಹ ಪ್ರಶಸ್ತಿಯ ಕುರಿತು ನೀವು ಎಲ್ಲಿ ಕೇಳಿದ್ದಿರಿ/i,
    value: "Where Did You Hear About the Shikshagraha Awards? (Multiple Choice)",
  },
  {
    match: /ನಾಮನಿರ್ದೇಶಿತ ವ್ಯಕ್ತಿಯ ಪೂರ್ಣ ಹೆಸರು/i,
    value: "Full Name of the Person Being Nominated:",
  },
  {
    match: /ನಾಮನಿರ್ದೇಶಿತ ವ್ಯಕ್ತಿಯ ವಯಸ್ಸು/i,
    value: "Age of the Nominee:",
  },
  {
    match: /ನಾಮನಿರ್ದೇಶಿತ ವ್ಯಕ್ತಿಯ ಮಾಹಿತಿ|ದೂರವಾಣಿ ಸಂಖ್ಯೆ/i,
    value:
      "Contact Information of the Person Being Nominated (Phone and/or Email Address):",
  },
  {
    match: /ನಾಮನಿರ್ದೇಶಿತ ವ್ಯಕ್ತಿಯ ಪ್ರಸ್ತುತ ವಿಳಾಸ/i,
    value:
      "Current Address of the Nominee (Village/Panchayat/Town/City/District/State):",
  },
  {
    match: /ನಾಮನಿರ್ದೇಶಿತ ವ್ಯಕ್ತಿಯ ಮಾತೃ ಭಾಷೆ/i,
    value: "Nominee's Mother Tongue:",
  },
  {
    match: /ನಾಯಕರ ವಿಭಾಗ/i,
    value: "Leader Category:",
  },
  {
    match: /ನಾಮನಿರ್ದೇಶನಗೊಳ್ಳುತ್ತಿರುವ ವ್ಯಕ್ತಿಯ ಪ್ರಸ್ತುತ\s*ಸಂಸ್ಥೆ|ಪ್ರಸ್ತುತ\s*ಸಂಸ್ಥೆ\/\s*ಸಂಘಟನೆ/i,
    value: "Nominee's Current Organization / Role / Position:",
  },
  {
    match: /ಪರಿಹರಿಸಲಾದ ಸವಾಲುಗಳು/i,
    value: "Challenges Addressed:",
  },
  {
    match: /ಪರಿಹಾರ ಮತ್ತು ತೆಗೆದುಕೊಂಡ ಕ್ರಮಗಳು/i,
    value: "Solution and Actions Taken:",
  },
  {
    match: /ಅವರ ಸಾಧನೆಗಳು/i,
    value: "Achievements:",
  },
  {
    match: /ಈ ನಾಯಕನ ಸಾಧನೆ/i,
    value: "Why This Leader's Achievement Is Special:",
  },
  {
    match: /ಉಲ್ಲೇಖಗಳು/i,
    value: "References:",
  },
  {
    match: /ಸಹಾಯಕ ದಾಖಲೆಗಳು/i,
    value: "Supporting Documents:",
  },
  {
    match: /ಕೆಲಸ\/ಯೋಜನೆಗಳ ಲಿಂಕ್/i,
    value: "Project/Work Links (Optional):",
  },
  { match: /ದೃಢೀಕರಣ/i, value: "Confirmation:" },
  { match: /ಸಮ್ಮತಿ/i, value: "Consent:" },
  { match: /^உங்கள் முழு பெயர்/i, value: "Your Full Name:" },
  { match: /^உங்கள் தொலைபேசி எண்/i, value: "Your Phone Number:" },
  { match: /^மாற்று எண்/i, value: "Alternate Phone (Optional):" },
  {
    match: /^உங்கள் அமைப்பு .* பதவி\/வகிக்கும் பொறுப்பு/i,
    value: "Your Organization and Title (Optional):",
  },
  {
    match: /^பரிந்துரைக்கப்படும் நபருடன் உங்கள் உறவு/i,
    value: "Your Relationship with the Nominee:",
  },
  {
    match: /^விருதுகளைப் பற்றி நீங்கள் எங்கிருந்து கேள்விப்பட்டீர்கள்/i,
    value: "Where Did You Hear About the Shikshagraha Awards? (Multiple Choice)",
  },
  {
    match: /^பரிந்துரைக்கப்படும் நபரின் முழு பெயர்/i,
    value: "Full Name of the Person Being Nominated:",
  },
  {
    match: /^பரிந்துரைக்கப்படும் நபரின் வயது/i,
    value: "Age of the Nominee:",
  },
  {
    match: /^பரிந்துரைக்கப்படும் நபரின் தொடர்புத் தகவல்/i,
    value:
      "Contact Information of the Person Being Nominated (Phone and/or Email Address):",
  },
  {
    match: /^பரிந்துரைக்கப்படும் நபரின் தற்போதைய முகவரி/i,
    value:
      "Current Address of the Nominee (Village/Panchayat/Town/City/District/State):",
  },
  {
    match: /^பரிந்துரைக்கப்படும் நபரின் (?:முதன்மை|தாய்) மொழி/i,
    value: "Nominee's Mother Tongue:",
  },
  { match: /^தலைவரின் வகை/i, value: "Leader Category:" },
  {
    match: /^பரிந்துரைக்கப்படும் நபரின் தற்போதைய பங்கு மற்றும் அமைப்பு\/தொடர்பு/i,
    value: "Nominee's Current Organization / Role / Position:",
  },
  { match: /^தீர்க்கப்பட்ட சவால்/i, value: "Challenges Addressed:" },
  { match: /^தீர்வு மற்றும் எடுக்கப்பட்ட நடவடிக்கைகள்/i, value: "Solution and Actions Taken:" },
  { match: /^அடையப்பட்ட தாக்கம்/i, value: "Achievements:" },
  {
    match: /^இந்த தலைவர் ஏன் சிறப்பு வாய்ந்தவர்/i,
    value: "Why This Leader's Achievement Is Special:",
  },
  { match: /^குறிப்புகள்/i, value: "References:" },
  { match: /^துணை ஆவணங்கள்/i, value: "Supporting Documents:" },
  {
    match: /^பணி\/திட்டங்களுக்கான இணைப்பு/i,
    value: "Project/Work Links (Optional):",
  },
  { match: /^உறுதிப்படுத்தல்/i, value: "Confirmation:" },
  { match: /^சம்மதம்/i, value: "Consent:" },
  { match: /^మీ పూర్తి పేరు/i, value: "Your Full Name:" },
  { match: /^మీ ఇమెయిల్ చిరునామా/i, value: "Your Email Address:" },
  { match: /^మీ ఫోన్ నంబర్/i, value: "Your Phone Number:" },
  { match: /^మరొక్క ఫోన్ నంబర్/i, value: "Alternate Phone (Optional):" },
  {
    match: /^మీ సంస్థ .* పాత్ర\/హోదా/i,
    value: "Your Organization and Title (Optional):",
  },
  {
    match: /^నామినేట్ చేయబడిన వ్యక్తితో మీ సంబంధం/i,
    value: "Your Relationship with the Nominee:",
  },
  {
    match: /^మీరు అవార్డుల గురించి ఎక్కడ విన్నారు/i,
    value: "Where Did You Hear About the Shikshagraha Awards? (Multiple Choice)",
  },
  {
    match: /^నామినేట్ చేయబడిన వ్యక్తి పూర్తి పేరు/i,
    value: "Full Name of the Person Being Nominated:",
  },
  {
    match: /^నామినేట్ చేయబడిన వ్యక్తి వయస్సు/i,
    value: "Age of the Nominee:",
  },
  {
    match: /^నామినేట్ చేయబడిన వ్యక్తి సంప్రదింపు సమాచారం/i,
    value:
      "Contact Information of the Person Being Nominated (Phone and/or Email Address):",
  },
  {
    match: /^నామినేట్ చేయబడిన వ్యక్తి ప్రస్తుత చిరునామా/i,
    value:
      "Current Address of the Nominee (Village/Panchayat/Town/City/District/State):",
  },
  {
    match: /^నామినేట్ చేయబడిన వ్యక్తి యొక్క (?:ప్రాథమిక|మాతృ) భాష/i,
    value: "Nominee's Mother Tongue:",
  },
  { match: /^నాయకుల రకం/i, value: "Leader Category:" },
  {
    match: /^నామినేట్ చేయబడిన వ్యక్తి యొక్క ప్రస్తుత పాత్ర మరియు సంస్థ\/అనుబంధం/i,
    value: "Nominee's Current Organization / Role / Position:",
  },
  { match: /^సవాలును పరిష్కరించడం/i, value: "Challenges Addressed:" },
  { match: /^పరిష్కారం మరియు తీసుకున్న చర్యలు/i, value: "Solution and Actions Taken:" },
  { match: /^సాధించిన ప్రభావం/i, value: "Achievements:" },
  {
    match: /^ఈ నాయకుడు ఎందుకు ప్రత్యేకమైనవాడు/i,
    value: "Why This Leader's Achievement Is Special:",
  },
  { match: /^సూచనలు/i, value: "References:" },
  { match: /^సహాయక పత్రాలు/i, value: "Supporting Documents:" },
  {
    match: /^పని\/ప్రాజెక్ట్‌లకు లింక్/i,
    value: "Project/Work Links (Optional):",
  },
  { match: /^ధృవీకరణ/i, value: "Confirmation:" },
  { match: /^సమ్మతి/i, value: "Consent:" },
  { match: /^self nomination$/i, value: "Self-Nomination" },
  { match: /^email id is same$/i, value: "Email ID is Same" },
  { match: /^email iid is same$/i, value: "Email ID is Same" },
  { match: /^email iD is same$/i, value: "Email ID is Same" },
  { match: /^name is same$/i, value: "Name is Same" },
  { match: /^timestamp$/i, value: "Timestamp" },
  { match: /^your full name\b/i, value: "Your Full Name:" },
  { match: /^your email address\b/i, value: "Your Email Address:" },
  { match: /^your phone number\b/i, value: "Your Phone Number:" },
  { match: /^alternate (?:phone|number)\b/i, value: "Alternate Phone (Optional):" },
  {
    match: /^your organisation\b.*role\/designation\b/i,
    value: "Your Organization and Title (Optional):",
  },
  {
    match: /^your organization\b.*role\/designation\b/i,
    value: "Your Organization and Title (Optional):",
  },
  {
    match: /^your relationship(?: to)?(?: with)? the person being nominated\b/i,
    value: "Your Relationship with the Nominee:",
  },
  {
    match: /^where did you hear about the awards\b/i,
    value: "Where Did You Hear About the Shikshagraha Awards? (Multiple Choice)",
  },
  {
    match: /^full name of the person being nominated\b/i,
    value: "Full Name of the Person Being Nominated:",
  },
  {
    match: /^age of the person being nominated\b/i,
    value: "Age of the Nominee:",
  },
  {
    match: /^contact information of the person being nominated\b/i,
    value:
      "Contact Information of the Person Being Nominated (Phone and/or Email Address):",
  },
  {
    match: /^phone number of the person being nominated\b/i,
    value: "Phone Number of the Person Being Nominated:",
  },
  {
    match: /^email address of the person being nominated\b/i,
    value: "Email Address of the Person Being Nominated:",
  },
  {
    match: /^current address of the person being nominated\b/i,
    value:
      "Current Address of the Nominee (Village/Panchayat/Town/City/District/State):",
  },
  {
    match: /^primary language of the person being nominated\b/i,
    value: "Nominee's Mother Tongue:",
  },
  { match: /^kind of leader\b/i, value: "Leader Category:" },
  {
    match: /^current role and organisation\/affiliation of the person being nominated\b/i,
    value: "Nominee's Current Organization / Role / Position:",
  },
  {
    match: /^the challenge addressed\b/i,
    value: "Challenges Addressed:",
  },
  {
    match: /^the solution and actions taken\b/i,
    value: "Solution and Actions Taken:",
  },
  { match: /^the impact achieved\b/i, value: "Achievements:" },
  {
    match: /^why this leader is special\b/i,
    value: "Why This Leader's Achievement Is Special:",
  },
  { match: /^references\b/i, value: "References:" },
  { match: /^supporting documents\b/i, value: "Supporting Documents:" },
  {
    match: /^link to work\/projects\b/i,
    value: "Project/Work Links (Optional):",
  },
  { match: /^confirmation\b/i, value: "Confirmation:" },
  { match: /^consent\b/i, value: "Consent:" },
  { match: /^references?:?\s*$/i, value: "References:" },
  { match: /^reference\b/i, value: "Reference Score (0 or 1)" },
  { match: /^evidence\b/i, value: "Evidence Score (0 or 1)" },
  { match: /^relevence\b/i, value: "Relevance Score (0 or 1)" },
  { match: /^impact\b/i, value: "Impact Score (0 or 1)" },
  { match: /^solution\b/i, value: "Solution Score (0 or 1)" },
];

const POSITIONAL_HEADER_FALLBACKS = new Map([
  [1, "Timestamp"],
  [2, "Your Full Name:"],
  [3, "Your Email Address:"],
  [4, "Your Phone Number:"],
  [5, "Alternate Phone (Optional):"],
  [6, "Your Organization and Title (Optional):"],
  [7, "Your Relationship with the Nominee:"],
  [
    8,
    "Where Did You Hear About the Shikshagraha Awards? (Multiple Choice)",
  ],
  [9, "Full Name of the Person Being Nominated:"],
  [10, "Age of the Nominee:"],
  [
    11,
    "Contact Information of the Person Being Nominated (Phone and/or Email Address):",
  ],
  [
    12,
    "Phone Number of the Person Being Nominated:",
  ],
  [
    13,
    "Email Address of the Person Being Nominated:",
  ],
  [
    14,
    "Current Address of the Nominee (Village/Panchayat/Town/City/District/State):",
  ],
  [15, "Nominee's Mother Tongue:"],
  [16, "Leader Category:"],
  [
    17,
    "Nominee's Current Organization / Role / Position:",
  ],
  [18, "Challenges Addressed:"],
  [19, "Solution and Actions Taken:"],
  [20, "Achievements:"],
  [21, "Why This Leader's Achievement Is Special:"],
  [22, "References:"],
  [23, "Supporting Documents:"],
  [24, "Project/Work Links (Optional):"],
  [25, "Confirmation:"],
  [26, "Consent:"],
  [27, "Owner Allotted"],
  [28, "Self-Nomination"],
  [29, "Status"],
  [30, "Gender"],
  [31, "Category"],
  [
    32,
    "Has the nominee provided references who can validate their work?",
  ],
  [
    33,
    "Have supporting documents (reports, photos, videos, or case studies) been provided?",
  ],
  [
    34,
    "Is the challenge relevant to advancing education equity?",
  ],
  [
    35,
    "Is the nominee’s impact clearly explained with specific examples or measurable results?",
  ],
  [
    36,
    "Is the nominee’s solution clearly explained with specific actions or strategies?",
  ],
  [37, "Comments"],
  [38, "Email ID is Same"],
  [39, "Name is Same"],
  [40, "Reference Score (0 or 1)"],
  [41, "Evidence Score (0 or 1)"],
  [42, "Relevance Score (0 or 1)"],
  [43, "Impact Score (0 or 1)"],
  [44, "Solution Score (0 or 1)"],
  [45, "Total"],
  [46, "1 Pager"],
]);

const EMAIL_LIKE_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$|^[A-Za-z0-9._%+-]+\s*\(\s*at\s*\)\s*[A-Za-z0-9.-]+\s*\(\s*dot\s*\)\s*[A-Za-z]{2,}$/i;

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHeaderTranslation(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/^\s*(?:EN|HI|KN|TE|TA|ML)\s*:\s*/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCellTranslation(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/^\s*(?:EN|HI|KN|TE|TA|ML)\s*:\s*/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

function isEnglishLike(value) {
  return ENGLISH_LIKE_PATTERN.test(String(value ?? ""));
}

function countScriptCharacters(text, pattern) {
  const matches = String(text ?? "").match(pattern);
  return matches ? matches.length : 0;
}

function detectSourceLanguage(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return null;
  }

  const counts = Object.entries(SCRIPT_PATTERNS).map(([code, pattern]) => ({
    code,
    count: countScriptCharacters(normalized, pattern),
  }));

  const supportedCounts = counts.filter((item) => item.count > 0);

  if (supportedCounts.length === 0) {
    const unsupportedLetters = normalized.replace(
      /[\p{Script=Latin}0-9\s\p{P}\p{S}]/gu,
      ""
    );

    if (/[\p{L}]/u.test(unsupportedLetters)) {
      throw new Error(
        `Unsupported language detected in text: "${normalized.slice(0, 120)}"`
      );
    }

    if (isEnglishLike(normalized)) {
      return null;
    }

    return null;
  }

  supportedCounts.sort((a, b) => b.count - a.count);
  return supportedCounts[0].code;
}

function isSkippableCellValue(value) {
  const text = normalizeText(value);

  if (!text) {
    return true;
  }

  if (
    EMAIL_LIKE_PATTERN.test(text) ||
    URL_PATTERN.test(text) ||
    PHONE_PATTERN.test(text) ||
    DATE_PATTERN.test(text)
  ) {
    return true;
  }

  if (!/[A-Za-z\p{L}]/u.test(text)) {
    return true;
  }

  return false;
}

function normalizeHeaderForMatching(header) {
  return cleanHeaderTranslation(normalizeText(header)).replace(/\s+/g, " ");
}

function isGenericHeaderLabel(header) {
  const normalized = normalizeHeaderForMatching(header);

  return (
    !normalized ||
    GENERIC_COLUMN_PATTERN.test(normalized) ||
    UNNAMED_COLUMN_PATTERN.test(normalized)
  );
}

function translateKnownHeader(header) {
  const normalized = normalizeHeaderForMatching(header);

  for (const rule of HEADER_RULES) {
    if (rule.match.test(normalized)) {
      return rule.value;
    }
  }

  return "";
}

function resolveCanonicalHeader(header, fallbackIndex) {
  const normalized = normalizeHeaderForMatching(header);

  if (!normalized) {
    return POSITIONAL_HEADER_FALLBACKS.get(fallbackIndex + 1) || "";
  }

  const knownTranslation = translateKnownHeader(normalized);
  if (knownTranslation) {
    return knownTranslation;
  }

  if (isGenericHeaderLabel(normalized)) {
    return POSITIONAL_HEADER_FALLBACKS.get(fallbackIndex + 1) || `Column ${fallbackIndex + 1}`;
  }

  return normalized;
}

function buildTranslationPrompt(sourceLanguage, sources) {
  return `
Translate the following ${sourceLanguage} text items into clear, natural English.

Rules:
- Return valid JSON only.
- Return exactly one translation per input item in the same order.
- Preserve names, URLs, email addresses, phone numbers, dates, file names, and codes exactly when present.
- Keep the meaning and structure of form labels and responses intact.
- Do not add commentary, numbering, or extra keys.

Return this exact shape:
{"translations":["item 1","item 2"]}

Input items:
${JSON.stringify(sources)}
`;
}

function extractOpenAITranslations(rawContent, expectedCount) {
  if (!rawContent) {
    return [];
  }

  let parsed;

  try {
    parsed = JSON.parse(rawContent);
  } catch {
    const match = rawContent.match(/\{[\s\S]*\}/);

    if (!match) {
      return rawContent
        .split(/\r?\n/)
        .map((item) => cleanCellTranslation(item))
        .filter(Boolean);
    }

    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }

  if (Array.isArray(parsed)) {
    return parsed.map((item) => cleanCellTranslation(item));
  }

  const candidate = parsed?.translations;

  if (Array.isArray(candidate)) {
    return candidate.map((item) => cleanCellTranslation(item));
  }

  if (typeof candidate === "string") {
    try {
      const nested = JSON.parse(candidate);
      if (Array.isArray(nested)) {
        return nested.map((item) => cleanCellTranslation(item));
      }
    } catch {
      return candidate
        .split(/\r?\n/)
        .map((item) => cleanCellTranslation(item))
        .filter(Boolean);
    }
  }

  if (typeof parsed?.translation === "string") {
    return [cleanCellTranslation(parsed.translation)];
  }

  if (typeof parsed?.translatedText === "string") {
    return [cleanCellTranslation(parsed.translatedText)];
  }

  if (typeof parsed?.result === "string") {
    return [cleanCellTranslation(parsed.result)];
  }

  const values = Object.values(parsed || {}).flatMap((value) =>
    Array.isArray(value) ? value : [value]
  );

  const extracted = values
    .map((item) => cleanCellTranslation(item))
    .filter(Boolean);

  if (extracted.length === expectedCount) {
    return extracted;
  }

  if (extracted.length > expectedCount) {
    return extracted.slice(0, expectedCount);
  }

  return extracted;
}

function isLikelyAlreadyEnglish(header) {
  const normalized = normalizeHeaderForMatching(header);

  if (!normalized) {
    return true;
  }

  return !Object.values(SCRIPT_TESTERS).some((pattern) => pattern.test(normalized));
}

function escapeCsvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildCsvString(headers, rows) {
  const body = [headers.map(escapeCsvValue).join(",")];

  for (const row of rows) {
    body.push(headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","));
  }

  return `\uFEFF${body.join("\r\n")}\r\n`;
}

function makeUniqueHeaders(headers) {
  const seen = new Map();

  return headers.map((header, index) => {
    const baseHeader = cleanHeaderTranslation(header) || `Column ${index + 1}`;
    const currentCount = seen.get(baseHeader) || 0;
    seen.set(baseHeader, currentCount + 1);

    if (currentCount === 0) {
      return baseHeader;
    }

    return `${baseHeader} (${currentCount + 1})`;
  });
}

function getTranslationText(item) {
  if (typeof item === "string") {
    return item.trim();
  }

  if (!item || typeof item !== "object") {
    return "";
  }

  const candidateKeys = [
    "target",
    "translated",
    "translatedText",
    "translation",
    "result",
    "text",
  ];

  for (const key of candidateKeys) {
    if (typeof item[key] === "string" && item[key].trim()) {
      return item[key].trim();
    }
  }

  return "";
}

function collectTranslationCandidates(responseBody) {
  if (Array.isArray(responseBody)) {
    const values = responseBody.map((item) => getTranslationText(item)).filter(Boolean);
    if (values.length > 0) {
      return values;
    }
  }

  const candidates = [
    responseBody?.pipelineResponse?.[0]?.output,
    responseBody?.pipelineResponse?.[0]?.outputData,
    responseBody?.pipelineResponse?.[0]?.translations,
    responseBody?.outputData?.output,
    responseBody?.outputData?.translations,
    responseBody?.output,
    responseBody?.translations,
    responseBody?.result,
    responseBody?.data?.output,
    responseBody?.data?.translations,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const values = candidate
        .map((item) => getTranslationText(item))
        .filter(Boolean);

      if (values.length > 0) {
        return values;
      }
    }

    const value = getTranslationText(candidate);
    if (value) {
      return [value];
    }
  }

  return [];
}

async function parseCsvFile(filePath) {
  const rawCsv = fs.readFileSync(filePath, "utf8");
  const workbook = XLSX.read(rawCsv, {
    type: "string",
    codepage: 65001,
    raw: true,
  });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return {
      headers: [],
      rows: [],
    };
  }

  const worksheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: true,
  });

  if (matrix.length === 0) {
    return {
      headers: [],
      rows: [],
    };
  }

  const headers = matrix[0].map((header) => String(header ?? "").replace(/^\uFEFF/, ""));
  const rows = matrix.slice(1).map((row) =>
    headers.map((_, index) => row?.[index] ?? "")
  );

  return {
    headers,
    rows,
  };
}

async function callBhashiniTranslation(sourceLanguage, sources) {
  const { pipelineInferenceUrl, authorizationKey, serviceId, targetLanguage } =
    BhashiniConfig;

  const missingConfig = [];

  if (!pipelineInferenceUrl) {
    missingConfig.push("BHASHINI_PIPELINE_INFERENCE_URL");
  }

  if (!authorizationKey) {
    missingConfig.push("BHASHINI_AUTHORIZATION_KEY");
  }

  if (!serviceId) {
    missingConfig.push("BHASHINI_SERVICE_ID");
  }

  if (missingConfig.length > 0) {
    throw new Error(
      `Missing Bhashini configuration: ${missingConfig.join(", ")}`
    );
  }

  let response;

  try {
    response = await fetch(pipelineInferenceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorizationKey,
      },
      body: JSON.stringify({
        pipelineTasks: [
          {
            taskType: "translation",
            config: {
              language: {
                sourceLanguage,
                targetLanguage: targetLanguage || "en",
              },
              serviceId,
            },
          },
        ],
        inputData: {
          input: sources.map((source) => ({ source })),
        },
      }),
    });
  } catch (error) {
    throw new Error(
      `Network failure while calling Bhashini: ${error?.message || "request failed"}`
    );
  }

  const responseText = await response.text();
  let parsedResponse = {};

  if (responseText) {
    try {
      parsedResponse = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Bhashini request failed with status ${response.status}: ${responseText.slice(0, 500)}`
      );
    }
  }

  if (!response.ok) {
    const errorMessage =
      parsedResponse?.error ||
      parsedResponse?.message ||
      responseText ||
      `HTTP ${response.status}`;

    throw new Error(`Bhashini request failed with status ${response.status}: ${errorMessage}`);
  }

  const translations = collectTranslationCandidates(parsedResponse);

  if (translations.length === 0) {
    throw new Error("Bhashini request failed: no translated text was returned.");
  }

  if (translations.length !== sources.length) {
    throw new Error(
      `Bhashini request failed: expected ${sources.length} translations but received ${translations.length}.`
    );
  }

  return translations;
}

async function callOpenAITranslation(sourceLanguage, sources) {
  if (!translationClient) {
    throw new Error(
      "OpenAI translation fallback is unavailable because OPENAI_API_KEY is not configured."
    );
  }

  const languageName = SUPPORTED_SOURCE_LANGUAGES.get(sourceLanguage) || sourceLanguage;

  const response = await translationClient.chat.completions.create({
    model: TRANSLATION_MODEL,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content:
          "You translate form fields and nomination text into English. Return only valid JSON.",
      },
      {
        role: "user",
        content: buildTranslationPrompt(languageName, sources),
      },
    ],
    temperature: 0,
  });

  const rawContent = response.choices?.[0]?.message?.content || "";

  if (!rawContent) {
    throw new Error("OpenAI translation fallback returned an empty response.");
  }

  const translations = extractOpenAITranslations(rawContent, sources.length);

  if (translations.length !== sources.length) {
    throw new Error(
      `OpenAI translation fallback expected ${sources.length} translations but received ${translations.length}.`
    );
  }

  return translations;
}

async function translateBatch(sourceLanguage, sources) {
  try {
    return await callBhashiniTranslation(sourceLanguage, sources);
  } catch (bhashiniError) {
    if (!translationClient) {
      throw bhashiniError;
    }

    try {
      return await callOpenAITranslation(sourceLanguage, sources);
    } catch (fallbackError) {
      throw new Error(
        `Translation failed for ${SUPPORTED_SOURCE_LANGUAGES.get(sourceLanguage) || sourceLanguage}: ${bhashiniError?.message || bhashiniError}; OpenAI fallback also failed: ${fallbackError?.message || fallbackError}`
      );
    }
  }
}

async function translatePlannedTexts(plans) {
  if (plans.length === 0) {
    return [];
  }

  const translated = new Array(plans.length);
  const supported = plans.filter((plan) => plan.language);

  const languageOrder = [];
  const grouped = new Map();

  for (const plan of supported) {
    if (!grouped.has(plan.language)) {
      grouped.set(plan.language, []);
      languageOrder.push(plan.language);
    }

    grouped.get(plan.language).push(plan);
  }

  for (const language of languageOrder) {
    const languagePlans = grouped.get(language) || [];

    for (let index = 0; index < languagePlans.length; index += BhashiniConfig.batchSize) {
      const batch = languagePlans.slice(index, index + BhashiniConfig.batchSize);
      const translations = await translateBatch(
        language,
        batch.map((item) => item.text)
      );

      batch.forEach((item, batchIndex) => {
        translated[item.index] = translations[batchIndex];
      });
    }
  }

  return translated;
}

function buildHeaderPlans(headers) {
  return headers.map((header, index) => {
    const knownTranslation = translateKnownHeader(header);
    if (knownTranslation) {
      return {
        index,
        original: header,
        translated: knownTranslation,
        canonical: true,
        language: null,
        requiresTranslation: false,
      };
    }

    const normalized = normalizeHeaderForMatching(header);

    if (isGenericHeaderLabel(normalized)) {
      const positionalFallback = POSITIONAL_HEADER_FALLBACKS.get(index + 1) || `Column ${index + 1}`;
      return {
        index,
        original: header,
        translated: positionalFallback,
        canonical: true,
        language: null,
        requiresTranslation: false,
      };
    }

    if (isLikelyAlreadyEnglish(normalized)) {
      return {
        index,
        original: header,
        translated: normalized,
        canonical: false,
        language: null,
        requiresTranslation: false,
      };
    }

    const sourceLanguage = detectSourceLanguage(normalized);

    if (!sourceLanguage) {
      return {
        index,
        original: header,
        translated: normalized,
        canonical: false,
        language: null,
        requiresTranslation: false,
      };
    }

    return {
      index,
      original: header,
      translated: "",
      language: sourceLanguage,
      text: normalized,
      requiresTranslation: true,
    };
  });
}

function buildCellPlans(rows, headers) {
  const plans = [];
  const detectedLanguages = new Map();
  let translatedCellCount = 0;

  rows.forEach((row, rowIndex) => {
    headers.forEach((_, headerIndex) => {
      const value = row?.[headerIndex];
      const normalizedValue = normalizeText(value);

      if (isSkippableCellValue(normalizedValue)) {
        return;
      }

      const language = detectSourceLanguage(normalizedValue);

      if (!language) {
        return;
      }

      detectedLanguages.set(language, (detectedLanguages.get(language) || 0) + 1);
      translatedCellCount += 1;
      plans.push({
        index: plans.length,
        rowIndex,
        headerIndex,
        text: String(value ?? "").replace(/\uFEFF/g, "").trim(),
        language,
      });
    });
  });

  return {
    plans,
    translatedCellCount,
    detectedLanguages,
  };
}

export async function translateCsvFile(filePath) {
  const { headers, rows } = await parseCsvFile(filePath);

  if (!rows.length) {
    throw new Error("Empty CSV file.");
  }

  if (!headers.length) {
    throw new Error("Invalid CSV format.");
  }

  const headerPlans = buildHeaderPlans(headers);
  const headerTranslationTasks = headerPlans
    .filter((plan) => plan.requiresTranslation)
    .map((plan) => ({
      index: plan.index,
      text: plan.text,
      language: plan.language,
    }));

  const translatedHeaderTexts = await translatePlannedTexts(headerTranslationTasks);
  const translatedHeaderLookup = new Map();

  headerTranslationTasks.forEach((task) => {
    const translatedHeader = translatedHeaderTexts[task.index];
    const canonicalHeader = translateKnownHeader(translatedHeader);

    if (canonicalHeader) {
      translatedHeaderLookup.set(task.index, canonicalHeader);
      return;
    }

    if (!translatedHeader) {
      translatedHeaderLookup.set(
        task.index,
        translateKnownHeader(task.text) || task.text || `Column ${task.index + 1}`
      );
      return;
    }

    translatedHeaderLookup.set(task.index, translatedHeader);
  });

  const finalHeaders = headerPlans.map((plan) => {
    if (plan.requiresTranslation) {
      const translatedHeader = translatedHeaderLookup.get(plan.index);
      const canonicalTranslatedHeader = translateKnownHeader(translatedHeader);

      if (canonicalTranslatedHeader) {
        return canonicalTranslatedHeader;
      }

      return (
        cleanHeaderTranslation(translatedHeader) ||
        POSITIONAL_HEADER_FALLBACKS.get(plan.index + 1) ||
        plan.original
      );
    }

    if (plan.canonical) {
      return plan.translated || POSITIONAL_HEADER_FALLBACKS.get(plan.index + 1) || plan.original;
    }

    const canonicalPlanHeader = translateKnownHeader(plan.translated);
    if (canonicalPlanHeader) {
      return canonicalPlanHeader;
    }

    return (
      cleanHeaderTranslation(plan.translated) ||
      POSITIONAL_HEADER_FALLBACKS.get(plan.index + 1) ||
      normalizeHeaderForMatching(plan.original)
    );
  });
  const uniqueHeaders = makeUniqueHeaders(finalHeaders);

  const { plans: cellPlans, translatedCellCount, detectedLanguages } = buildCellPlans(
    rows,
    headers
  );

  const translatedCellTexts = await translatePlannedTexts(
    cellPlans.map((plan) => ({
      index: plan.index,
      text: plan.text,
      language: plan.language,
    }))
  );

  const translatedCellLookup = new Map();

  cellPlans.forEach((plan, index) => {
    translatedCellLookup.set(
      `${plan.rowIndex}:${plan.headerIndex}`,
      translatedCellTexts[index]
    );
  });

  const translatedRows = rows.map((row, rowIndex) => {
    const translatedRow = {};

    headers.forEach((header, headerIndex) => {
      const translatedHeader = uniqueHeaders[headerIndex];
      const rawTranslatedValue = translatedCellLookup.get(`${rowIndex}:${headerIndex}`);
      const translatedValue =
        rawTranslatedValue === undefined
          ? undefined
          : cleanCellTranslation(rawTranslatedValue);

      translatedRow[translatedHeader] =
        translatedValue !== undefined ? translatedValue : row?.[headerIndex] ?? "";
    });

    return translatedRow;
  });

  return {
    detectedLanguages: [...detectedLanguages.keys()].map(
      (code) => `${SUPPORTED_SOURCE_LANGUAGES.get(code)} (${code})`
    ),
    translatedCellCount,
    translatedRows,
    translatedCsv: buildCsvString(uniqueHeaders, translatedRows),
  };
}
