import Anthropic from "@anthropic-ai/sdk"
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const MODEL = "claude-sonnet-4-6"
export const MAX_TOKENS_TRIAGE = 8192
export const MAX_TOKENS_CHAT = 1500
