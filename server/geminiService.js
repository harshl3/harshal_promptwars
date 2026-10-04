import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY || "";

if (!API_KEY) {
  console.warn("⚠️ Warning: GEMINI_API_KEY is not defined in environment variables.");
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// Candidate models in order of preferred speed and availability
const MODEL_CANDIDATES = [
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.8-flash"
];

/**
 * Execute Gemini call with fallback and retry logic
 */
async function callGeminiWithFallback(prompt, systemInstruction = "") {
  if (!genAI) {
    throw new Error("Gemini API key is not configured on the server. Please check your .env configuration.");
  }

  let lastError = null;

  for (const modelName of MODEL_CANDIDATES) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction || undefined,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 5500,
            responseMimeType: "application/json"
          }
        });

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return text;
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini] Model ${modelName} attempt ${attempt} failed: ${err.message}`);
        if (err.message && (err.message.includes("503") || err.message.includes("429"))) {
          await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        } else {
          break; // Try next candidate model
        }
      }
    }
  }

  throw new Error(`All Gemini models failed. Last error: ${lastError?.message || "Unknown error"}`);
}

/**
 * Clean and parse JSON response from Gemini
 */
function parseCleanJson(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
  }
  return JSON.parse(cleaned);
}

/**
 * Section C: Full BlindSpot Structured Analysis
 */
export async function generateBlindSpotAnalysis(input) {
  const { decision, context = "", options = [], priorities = "", currentThinking = "" } = input;

  if (!decision || typeof decision !== "string" || decision.trim().length < 5) {
    throw new Error("A specific decision statement (at least 5 characters) is required.");
  }
  if (!Array.isArray(options) || options.filter(o => o && o.trim()).length < 2) {
    throw new Error("At least two distinct options must be provided for examination.");
  }

  const systemInstruction = `You are BlindSpot, an expert AI thinking companion and cognitive reasoning partner.
Your goal is to help users examine their reasoning, spot what might be missing, and uncover hidden assumptions, overlooked risks, and alternative perspectives.
CORE PRINCIPLES:
1. NEVER make the decision for the user or recommend a single "winning" option. The decision remains solely theirs.
2. NEVER invent false certainty or numerical probability scores.
3. Distinguish actual statements made by the user from AI inferences. Never assert the user believes something they did not state.
4. Keep insights sharp, actionable, intellectually rigorous, and tailored to the exact user situation.
5. Return strictly valid JSON adhering to the required schema.`;

  const prompt = `Analyze this decision situation and return a concise, high-value structured JSON report.

DECISION: "${decision.slice(0, 500)}"
CONTEXT: "${(context || "None provided").slice(0, 1000)}"
OPTIONS: ${JSON.stringify(options.map(o => String(o).slice(0, 200)))}
PRIORITIES / WHAT MATTERS MOST: "${(priorities || "None specified").slice(0, 500)}"
CURRENT THINKING / BELIEF: "${(currentThinking || "Undisclosed").slice(0, 500)}"

Return a JSON object with EXACTLY this structure:
{
  "decisionSummary": "A concise, objective summary of the decision and stated priorities in 2-3 sentences.",
  "assumptions": [
    {
      "statement": "A possible unstated assumption the user is treating as fact",
      "whyItMatters": "Why this assumption directly impacts the outcome",
      "question": "A probing question that tests whether this assumption holds",
      "confidence": "low | medium | high"
    }
  ],
  "blindSpots": [
    {
      "factor": "An overlooked variable, dependency, or blind spot",
      "impact": "How this factor could silently derail or alter the decision",
      "nextStep": "A concrete action to investigate or verify this factor"
    }
  ],
  "risks": [
    {
      "risk": "A plausible failure mode, trade-off, or unintended second-order effect",
      "reason": "Why this risk could materialize under the current options",
      "warningSign": "An early indicator that this risk is happening",
      "mitigation": "A practical safeguard or mitigation strategy",
      "uncertainty": "low | medium | high"
    }
  ],
  "perspectives": [
    {
      "viewpoint": "e.g. Cautious Risk Auditor / Long-Term (5-year) Stakeholder / Affected Frontline User / Contrarian Competitor",
      "reasoning": "How this stakeholder would evaluate the situation differently from the user's initial premise"
    }
  ],
  "questions": [
    {
      "question": "A thoughtful question exposing trade-offs or conflicting priorities",
      "purpose": "What critical blind spot this question helps reveal"
    }
  ],
  "evidenceGaps": [
    {
      "unknown": "A crucial unknown that could materially swing the decision",
      "importance": "Why discovering this unknown matters before committing",
      "verification": "A practical way to obtain or test this evidence"
    }
  ],
  "reflectionPrompt": "What might you see differently now about this decision?"
}

Include 3-4 assumptions, 3-4 blindSpots, 3-4 risks, 3-4 perspectives, 4-5 questions, and 3-4 evidenceGaps. Keep each entry focused, clear, and high-impact.`;

  const rawJson = await callGeminiWithFallback(prompt, systemInstruction);
  return parseCleanJson(rawJson);
}

/**
 * Screen D: Challenge My Thinking Counterargument
 */
export async function generateChallengeThinking(input) {
  const { decision, context = "", options = [], currentThinking = "", analysisSummary = "" } = input;

  if (!decision || typeof decision !== "string" || decision.trim().length < 5) {
    throw new Error("Decision context is required to challenge thinking.");
  }

  const systemInstruction = `You are BlindSpot's Devil's Advocate and Stress-Testing Engine.
Construct the strongest, most intellectually honest counterargument against the user's current line of reasoning.
Your role is to challenge assumptions and reveal cognitive bias constructively, without hostility.
Return strictly valid JSON.`;

  const prompt = `Construct an incisive counterargument to test the user's reasoning.

DECISION: "${decision.slice(0, 500)}"
CONTEXT: "${(context || "").slice(0, 800)}"
OPTIONS: ${JSON.stringify(options.map(o => String(o).slice(0, 150)))}
CURRENT THINKING: "${(currentThinking || "The user prefers their primary option").slice(0, 500)}"
SUMMARY OF PREVIOUS ANALYSIS: "${(analysisSummary || "").slice(0, 500)}"

Return a JSON object with this exact structure:
{
  "counterargument": "The single strongest, most compelling argument against the current leaning or reasoning.",
  "vulnerableAssumption": "The fragile premise that, if false, causes this entire strategy to unravel.",
  "alternativeInterpretation": "A completely different, plausible interpretation of the same facts.",
  "secondOrderConsequence": "An unexpected secondary consequence that could emerge 6-18 months later.",
  "challengingQuestions": [
    "A direct question challenging the user's core logic",
    "A question exploring what happens if the opposite approach is taken"
  ],
  "evidenceConsiderations": {
    "strengthens": "What specific observable data point would support this counterargument?",
    "weakens": "What evidence would disprove this counterargument and validate the user's original reasoning?"
  }
}`;

  const rawJson = await callGeminiWithFallback(prompt, systemInstruction);
  return parseCleanJson(rawJson);
}

/**
 * Screen E: Run a Pre-Mortem Scenario
 */
export async function generatePremortem(input) {
  const { decision, context = "", chosenOption = "The primary option", timeHorizon = "12 months" } = input;

  if (!decision || typeof decision !== "string" || decision.trim().length < 5) {
    throw new Error("Decision context is required to run a pre-mortem.");
  }

  const systemInstruction = `You are a Pre-Mortem Scenario Analyst.
Assume it is now ${timeHorizon} in the future, and the chosen course of action has produced an undeniable, disappointing failure.
Reason backward like a post-mortem investigator to identify root causes, overlooked vulnerabilities, and preventive measures.
Treat this strictly as a hypothetical stress-test exercise, not a prediction.
Return strictly valid JSON.`;

  const prompt = `Perform a rigorous pre-mortem exercise on this decision.

DECISION: "${decision.slice(0, 500)}"
CONTEXT: "${(context || "").slice(0, 800)}"
OPTION EXAMINED: "${(chosenOption || "The proposed strategy").slice(0, 250)}"
TIME HORIZON: "${timeHorizon}"

Return a JSON object with this exact structure:
{
  "failureScenario": "A vivid, realistic narrative describing how this decision went off the rails over the next ${timeHorizon}.",
  "plausibleContributingFactors": [
    "Root cause 1: e.g. Overestimated customer adoption or team bandwidth",
    "Root cause 2: e.g. Dependency bottleneck that was neglected",
    "Root cause 3: e.g. Incentive misalignment between stakeholders"
  ],
  "earlyWarningSigns": [
    "Signal at Month 1-2 indicating trouble",
    "Signal at Month 3-4 indicating diversion from plan"
  ],
  "preventiveQuestions": [
    "What question should we ask every Monday morning to catch this early?",
    "What tripwire or circuit-breaker should cause us to pause?"
  ],
  "riskReductionActions": [
    "Specific low-cost pre-commitment action before starting",
    "Failsafe fallback or dual-track hedge"
  ]
}`;

  const rawJson = await callGeminiWithFallback(prompt, systemInstruction);
  return parseCleanJson(rawJson);
}
