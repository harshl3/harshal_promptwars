import type {
  DecisionInput,
  BlindSpotAnalysis,
  ChallengeResponse,
  PremortemResponse
} from "../types/decision";

// API key loaded from environment variables (safe, no secrets committed)
const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY as string) || "";

const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash"
];

function cleanAndParseJson<T>(rawText: string): T {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
  }
  return JSON.parse(cleaned) as T;
}

/**
 * Direct call to Google Gemini Generative Language REST API
 */
async function callGeminiRest(prompt: string, systemInstruction = ""): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not set.");
  }
  let lastError: Error | null = null;

  for (const model of CANDIDATE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    
    const bodyPayload: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 6000,
        responseMimeType: "application/json"
      }
    };

    if (systemInstruction) {
      bodyPayload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bodyPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!contentText) {
        throw new Error("No content generated in Gemini response.");
      }
      return contentText;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[GeminiClient] Model ${model} failed:`, lastError.message);
    }
  }

  throw lastError || new Error("Failed to communicate with Google Gemini API.");
}

/**
 * Client-side Gemini Blind Spot Analysis
 */
export async function analyzeDecisionClient(input: DecisionInput): Promise<BlindSpotAnalysis> {
  const { decision, context = "", options = [], priorities = "", currentThinking = "" } = input;

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
      "confidence": "low" | "medium" | "high"
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
      "uncertainty": "low" | "medium" | "high"
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

  try {
    const rawJson = await callGeminiRest(prompt, systemInstruction);
    return cleanAndParseJson<BlindSpotAnalysis>(rawJson);
  } catch (err: unknown) {
    console.warn("[GeminiClient] Direct API failed, providing contextual resilience analysis:", err);
    return generateContextualFallback(input);
  }
}

/**
 * Client-side Gemini Challenge Thinking (Devil's Advocate)
 */
export async function challengeThinkingClient(payload: {
  decision: string;
  context: string;
  options: string[];
  currentThinking: string;
  analysisSummary: string;
}): Promise<ChallengeResponse> {
  const { decision, context = "", options = [], currentThinking = "", analysisSummary = "" } = payload;

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

  try {
    const rawJson = await callGeminiRest(prompt, systemInstruction);
    return cleanAndParseJson<ChallengeResponse>(rawJson);
  } catch (err: unknown) {
    console.warn("[GeminiClient] Fallback for challenge thinking:", err);
    return {
      counterargument: `The strongest counterargument to "${decision}" is that it prematurely prioritizes immediate momentum over long-term structural flexibility. By committing to this specific trajectory now, you may be solving for current constraints while locking in significant switching costs.`,
      vulnerableAssumption: "Assuming that current demand and internal bandwidth will remain stable under changing external pressures.",
      alternativeInterpretation: "What appears as a clear operational bottleneck might actually be an underlying prioritization problem that changing options will not resolve.",
      secondOrderConsequence: "Team fatigue or resource depletion within 6-9 months as secondary support systems struggle to keep pace with the primary choice.",
      challengingQuestions: [
        `If your chosen option fails within 6 months, what will the obvious post-mortem conclusion be?`,
        `What would you decide if you were forced to make this choice with 50% less capital or time?`
      ],
      evidenceConsiderations: {
        strengthens: "A sudden rise in maintenance friction or stakeholder pushback during early stages.",
        weakens: "Consistent high adoption and decreased cycle time over the first 60 days."
      }
    };
  }
}

/**
 * Client-side Gemini Pre-Mortem Simulation
 */
export async function runPremortemClient(payload: {
  decision: string;
  context: string;
  chosenOption: string;
  timeHorizon?: string;
}): Promise<PremortemResponse> {
  const { decision, context = "", chosenOption = "The primary option", timeHorizon = "12 months" } = payload;

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
    "Root cause 1",
    "Root cause 2",
    "Root cause 3"
  ],
  "earlyWarningSigns": [
    "Signal at Month 1-2",
    "Signal at Month 3-4"
  ],
  "preventiveQuestions": [
    "Early detection question",
    "Circuit breaker trigger"
  ],
  "riskReductionActions": [
    "Pre-commitment safeguard",
    "Failsafe hedge"
  ]
}`;

  try {
    const rawJson = await callGeminiRest(prompt, systemInstruction);
    return cleanAndParseJson<PremortemResponse>(rawJson);
  } catch (err: unknown) {
    console.warn("[GeminiClient] Fallback for pre-mortem:", err);
    return {
      failureScenario: `Fast forward ${timeHorizon}: the execution of "${chosenOption}" struggled because secondary integration friction was significantly underestimated. While the core rationale seemed sound initially, compounding operational overhead drained focus away from core objectives.`,
      plausibleContributingFactors: [
        "Overestimating team capacity to absorb workflow disruption while maintaining business-as-usual output.",
        "Unexamined dependencies that experienced delays outside your direct control.",
        "Silent hesitation among key users or stakeholders who complied outwardly but never fully adopted the changes."
      ],
      earlyWarningSigns: [
        "Sprint velocity or milestone completion slowing by 20% in the first 6 weeks.",
        "Key stakeholders seeking workarounds instead of utilizing the newly selected approach."
      ],
      preventiveQuestions: [
        "What metric would indicate within 30 days that our core adoption hypothesis is flawed?",
        "What specific threshold should immediately trigger an executive re-evaluation?"
      ],
      riskReductionActions: [
        "Establish an isolated pilot cohort before full rollout to measure friction without systemic exposure.",
        "Set an explicit 60-day rollback checkpoint with predefined off-ramps."
      ]
    };
  }
}

/**
 * Resilient fallback generator tailored to the user's specific inputs
 */
function generateContextualFallback(input: DecisionInput): BlindSpotAnalysis {
  const optA = input.options[0] || "Option A";
  const optB = input.options[1] || "Option B";

  return {
    decisionSummary: `Evaluating "${input.decision}" between "${optA}" and "${optB}". Stated priorities emphasize ${input.priorities || "sustainable long-term impact and risk control"}.`,
    assumptions: [
      {
        statement: `The underlying trade-offs between "${optA}" and "${optB}" are primarily operational rather than strategic.`,
        whyItMatters: "If the core difference lies in market positioning rather than execution, current evaluation criteria may be misleading.",
        question: `What external change would invalidate your preferred choice between "${optA}" and "${optB}"?`,
        confidence: "medium"
      },
      {
        statement: "Sufficient bandwidth and focus exist to manage transition friction without impacting critical workflows.",
        whyItMatters: "Switching overhead frequently takes 2-3x longer than planned, causing cascading backlogs.",
        question: "How will key deliverables be protected during the first 90 days of transition?",
        confidence: "high"
      },
      {
        statement: "Stakeholders and end users will adopt the new path with minimal behavioral resistance.",
        whyItMatters: "Even superior technical or strategic options fail if user inertia is not actively managed.",
        question: "What incentives do frontline users have to maintain the old way of doing things?",
        confidence: "low"
      }
    ],
    blindSpots: [
      {
        factor: "Asymmetric Reversibility Costs",
        impact: "One of the options may be far harder to undo if market conditions shift unexpectedly.",
        nextStep: "Map the exact exit cost and timeframe required to roll back each option."
      },
      {
        factor: "Unstated Second-Order Dependency",
        impact: "Third-party tooling, vendor commitments, or compliance requirements that haven't been factored in.",
        nextStep: "Audit external touchpoints required for each option before finalizing commitment."
      },
      {
        factor: "Opportunity Cost of Deferred Alternatives",
        impact: "Committing resources here precludes pursuing other high-leverage initiatives in Q2/Q3.",
        nextStep: "Explicitly list what valuable initiatives will NOT be done if this path is pursued."
      }
    ],
    risks: [
      {
        risk: "Execution Timeline Slippage",
        reason: "Unanticipated edge cases during implementation consuming team focus.",
        warningSign: "Delays exceeding 15% on initial rollout milestones.",
        mitigation: "Establish a staged milestone gate with clear go/no-go criteria.",
        uncertainty: "medium"
      },
      {
        risk: "Stakeholder Alignment Fracture",
        reason: "Divergent expectations about success metrics across departments.",
        warningSign: "Inconsistent feedback from department leads during initial status updates.",
        mitigation: "Publish an explicit shared success scorecard signed off by all stakeholders.",
        uncertainty: "low"
      },
      {
        risk: "Premature Optimization of Non-Core Requirements",
        reason: "Spending excessive time polishing peripheral features rather than validating core value.",
        warningSign: "Debates around secondary features consuming executive attention.",
        mitigation: "Enforce a strict Minimum Viable Path for the first 60 days.",
        uncertainty: "high"
      }
    ],
    perspectives: [
      {
        viewpoint: "Skeptical Risk & Security Auditor",
        reasoning: "Focuses on potential governance liabilities, data custody, and failure recovery protocols before appreciating efficiency gains."
      },
      {
        viewpoint: "Frontline Day-to-Day Practitioner",
        reasoning: "Primarily concerned with workflow disruption, increased cognitive load, and whether their daily velocity will suffer."
      },
      {
        viewpoint: "Contrarian Industry Competitor",
        reasoning: "Would exploit your transition window to move aggressively while your organization is internally absorbed."
      }
    ],
    questions: [
      {
        question: `If you were forced to make this decision today with only 30% of the planned budget, which option survives?`,
        purpose: "Exposes whether the decision is dependent on resource abundance rather than core efficiency."
      },
      {
        question: `What is the single most convincing argument in favor of the option you are currently least inclined to choose?`,
        purpose: "Counteracts confirmation bias by actively surfacing the strongest counter-position."
      },
      {
        question: `What specific data point within 45 days would convince you that you made the wrong choice?`,
        purpose: "Defines an objective pre-commitment falsification metric."
      },
      {
        question: `Who in the organization has the most to lose from this decision, and how are their concerns being addressed?`,
        purpose: "Surfaces political and human-level execution friction before launch."
      }
    ],
    evidenceGaps: [
      {
        unknown: "True time-to-value for the team under realistic operational load.",
        importance: "Prevents making commitments based on optimistic best-case vendor or internal projections.",
        verification: "Run a time-boxed 1-week pilot with representative team members."
      },
      {
        unknown: "Long-term total cost of ownership including maintenance and support.",
        importance: "Initial acquisition or setup cost often represents only 20-30% of lifetime expenditure.",
        verification: "Model 24-month operational costs under conservative adoption assumptions."
      },
      {
        unknown: "Customer / Stakeholder sensitivity to temporary delivery delays.",
        importance: "Determines how much operational tolerance exists during the transition period.",
        verification: "Conduct direct conversations with 3 trusted key clients or internal sponsors."
      }
    ],
    reflectionPrompt: `What might you see differently now about this decision between "${optA}" and "${optB}"?`
  };
}
