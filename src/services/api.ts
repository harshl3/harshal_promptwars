import type {
  DecisionInput,
  BlindSpotAnalysis,
  ChallengeResponse,
  PremortemResponse
} from "../types/decision";
import {
  analyzeDecisionClient,
  challengeThinkingClient,
  runPremortemClient
} from "./geminiClient";

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
 * Safely parse JSON from Response, returning null if empty or non-JSON
 */
async function safeParseJson<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    const text = await response.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Submit decision to Gemini for full 8-section analysis.
 * Uses backend API if available, with automatic client-side Gemini fallback for Netlify and static hosting.
 */
export async function analyzeDecision(input: DecisionInput): Promise<BlindSpotAnalysis> {
  try {
    const response = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    if (response.ok) {
      const data = await safeParseJson<BlindSpotAnalysis>(response);
      if (data && data.decisionSummary) {
        return data;
      }
    }
  } catch (err: unknown) {
    console.info("[API] Backend /api/analyze unreachable, activating direct Gemini client:", err);
  }

  // Fallback to direct client-side Gemini AI engine (works on Netlify and any static host)
  return analyzeDecisionClient(input);
}

/**
 * Request Gemini Devil's Advocate counterargument.
 * Uses backend API if available, with automatic client-side Gemini fallback.
 */
export async function challengeThinking(payload: {
  decision: string;
  context: string;
  options: string[];
  currentThinking: string;
  analysisSummary: string;
}): Promise<ChallengeResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/challenge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await safeParseJson<ChallengeResponse>(response);
      if (data && data.counterargument) {
        return data;
      }
    }
  } catch (err: unknown) {
    console.info("[API] Backend /api/challenge unreachable, activating direct Gemini client:", err);
  }

  // Fallback to direct client-side Gemini AI engine
  return challengeThinkingClient(payload);
}

/**
 * Request Gemini backward-reasoning Pre-Mortem analysis.
 * Uses backend API if available, with automatic client-side Gemini fallback.
 */
export async function runPremortem(payload: {
  decision: string;
  context: string;
  chosenOption: string;
  timeHorizon?: string;
}): Promise<PremortemResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/premortem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await safeParseJson<PremortemResponse>(response);
      if (data && data.failureScenario) {
        return data;
      }
    }
  } catch (err: unknown) {
    console.info("[API] Backend /api/premortem unreachable, activating direct Gemini client:", err);
  }

  // Fallback to direct client-side Gemini AI engine
  return runPremortemClient(payload);
}

/**
 * Check backend health
 */
export async function checkApiHealth(): Promise<{ status: string; geminiConfigured: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (res.ok) {
      const data = await safeParseJson<{ status: string; geminiConfigured: boolean }>(res);
      if (data) return data;
    }
  } catch {
    // Expected on static Netlify deploy
  }
  return { status: "client-ready", geminiConfigured: true };
}
