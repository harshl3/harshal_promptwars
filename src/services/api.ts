import type {
  DecisionInput,
  BlindSpotAnalysis,
  ChallengeResponse,
  PremortemResponse
} from "../types/decision";

const API_BASE = "";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Submit decision to Gemini for full 8-section analysis
 */
export async function analyzeDecision(input: DecisionInput): Promise<BlindSpotAnalysis> {
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(data.error || "Analysis failed. Please verify your connection.", response.status);
  }

  return data as BlindSpotAnalysis;
}

/**
 * Request Gemini Devil's Advocate counterargument
 */
export async function challengeThinking(payload: {
  decision: string;
  context: string;
  options: string[];
  currentThinking: string;
  analysisSummary: string;
}): Promise<ChallengeResponse> {
  const response = await fetch(`${API_BASE}/api/challenge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(data.error || "Failed to challenge thinking.", response.status);
  }

  return data as ChallengeResponse;
}

/**
 * Request Gemini backward-reasoning Pre-Mortem analysis
 */
export async function runPremortem(payload: {
  decision: string;
  context: string;
  chosenOption: string;
  timeHorizon?: string;
}): Promise<PremortemResponse> {
  const response = await fetch(`${API_BASE}/api/premortem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(data.error || "Failed to generate pre-mortem scenario.", response.status);
  }

  return data as PremortemResponse;
}

/**
 * Check backend health
 */
export async function checkApiHealth(): Promise<{ status: string; geminiConfigured: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) return { status: "error", geminiConfigured: false };
    return await res.json();
  } catch {
    return { status: "unreachable", geminiConfigured: false };
  }
}
