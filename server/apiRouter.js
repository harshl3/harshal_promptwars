import express from "express";
import {
  generateBlindSpotAnalysis,
  generateChallengeThinking,
  generatePremortem
} from "./geminiService.js";

export const apiRouter = express.Router();

// Simple in-memory rate-limiter / anti-flood guard
const requestTimestamps = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.headers["x-forwarded-for"] || "client";
  const now = Date.now();
  const timestamps = requestTimestamps.get(ip) || [];
  const validTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: "Too many requests. Please wait a moment before trying again.",
      retryAfterSeconds: Math.ceil((validTimestamps[0] + RATE_LIMIT_WINDOW_MS - now) / 1000)
    });
  }

  validTimestamps.push(now);
  requestTimestamps.set(ip, validTimestamps);
  next();
}

apiRouter.use(rateLimitMiddleware);

/**
 * Health check endpoint
 */
apiRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "BlindSpot API",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/analyze
 */
apiRouter.post("/analyze", async (req, res) => {
  try {
    const { decision, context, options, priorities, currentThinking } = req.body;

    if (!decision || typeof decision !== "string" || decision.trim().length < 5) {
      return res.status(400).json({
        error: "Invalid input: 'decision' must be a descriptive string of at least 5 characters."
      });
    }

    if (!Array.isArray(options) || options.filter(o => o && String(o).trim().length > 0).length < 2) {
      return res.status(400).json({
        error: "Invalid input: You must provide at least two distinct options to evaluate."
      });
    }

    const analysis = await generateBlindSpotAnalysis({
      decision: String(decision).trim(),
      context: String(context || "").trim(),
      options: options.map(o => String(o).trim()),
      priorities: String(priorities || "").trim(),
      currentThinking: String(currentThinking || "").trim()
    });

    return res.json(analysis);
  } catch (err) {
    console.error("[API /analyze error]", err);
    return res.status(500).json({
      error: err.message || "Failed to generate decision analysis. Please try again."
    });
  }
});

/**
 * POST /api/challenge
 */
apiRouter.post("/challenge", async (req, res) => {
  try {
    const { decision, context, options, currentThinking, analysisSummary } = req.body;

    if (!decision) {
      return res.status(400).json({ error: "Missing 'decision' in request." });
    }

    const challenge = await generateChallengeThinking({
      decision,
      context,
      options,
      currentThinking,
      analysisSummary
    });

    return res.json(challenge);
  } catch (err) {
    console.error("[API /challenge error]", err);
    return res.status(500).json({
      error: err.message || "Failed to challenge thinking. Please try again."
    });
  }
});

/**
 * POST /api/premortem
 */
apiRouter.post("/premortem", async (req, res) => {
  try {
    const { decision, context, chosenOption, timeHorizon } = req.body;

    if (!decision) {
      return res.status(400).json({ error: "Missing 'decision' in request." });
    }

    const premortem = await generatePremortem({
      decision,
      context,
      chosenOption,
      timeHorizon
    });

    return res.json(premortem);
  } catch (err) {
    console.error("[API /premortem error]", err);
    return res.status(500).json({
      error: err.message || "Failed to generate pre-mortem. Please try again."
    });
  }
});
