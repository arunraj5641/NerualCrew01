/**
 * CIS Audit Dashboard — backend
 *
 * Thin proxy that forwards structured audit findings to an OpenAI-compatible
 * LLM (default: NVIDIA NIM at https://integrate.api.nvidia.com/v1) and returns
 * a human-readable AI remediation report. The API key lives ONLY on the server
 * (server/.env, gitignored) and is never exposed to the browser.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
const BASE_URL = process.env.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.LLM_MODEL || "meta/llama-3.1-70b-instruct";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const SYSTEM_PROMPT = `You are a senior Linux security auditor. You are given a structured
CIS-benchmark audit report (a JSON object with "summary" and "findings"). For every
FINDING with status FAIL, produce a remediation recommendation. For PASS findings, give
a one-line confirmation that the control is satisfied. For UNKNOWN findings, explain why
it could not be verified and what to check manually.

Respond ONLY with a single JSON object with this exact shape (no prose, no markdown):
{
  "executive_summary": "3-4 sentence plain-English overview of the host's security posture",
  "items": [
    {
      "rule_id": "<rule_id>",
      "status": "PASS|FAIL|UNKNOWN",
      "severity_hint": "critical|high|medium|low",
      "finding": "plain-English explanation for this specific result, referencing the evidence",
      "why_it_matters": "real-world impact if left unaddressed",
      "fix_command": "exact, runnable remediation command (or an empty string for PASS/UNKNOWN)",
      "risk_assessment": "short risk note, only for FAIL items"
    }
  ]
}
Include ALL findings, one item each, preserving rule_ids. Be specific and grounded in the
given evidence. Never invent facts not present in the report.`;

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    llmConfigured: Boolean(API_KEY),
    model: MODEL,
    baseUrl: BASE_URL,
  });
});

app.post("/api/analyze", async (req, res) => {
  const { findings, summary, target, transport, fix_list } = req.body || {};

  if (!Array.isArray(findings) || findings.length === 0) {
    return res.status(400).json({ error: "No findings provided." });
  }
  if (!API_KEY) {
    return res.status(500).json({
      error:
        "Server has no NVIDIA_API_KEY set. Put it in server/.env and restart.",
    });
  }

  const payload = {
    target,
    transport,
    summary,
    findings: findings.map((f) => ({
      rule_id: f.rule_id,
      title: f.title,
      status: f.status,
      severity_hint: f.severity_hint,
      evidence: String(f.evidence || "").slice(0, 500),
    })),
    fix_list: (fix_list || []).map((f) => ({
      rule_id: f.rule_id,
      fix_command: f.fix_command,
    })),
  };

  try {
    const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const cleaned = raw
      .trim()
      .replace(/^```(json)?/i, "")
      .replace(/```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.items)) {
      throw new Error("LLM response missing 'items' array");
    }
    res.json({ model: MODEL, ...parsed });
  } catch (e) {
    console.error("LLM call failed:", e.message);
    res.status(502).json({ error: `LLM call failed: ${e.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`CIS audit server listening on http://localhost:${PORT}`);
  console.log(`  model: ${MODEL}`);
  console.log(`  LLM configured: ${Boolean(API_KEY)}`);
});
