import 'server-only'

const GEMINI_MODEL = 'gemma-4-31b-it'
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export type GeminiPart = { text?: string; thought?: boolean }

export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY
}

export function getGeminiUrl() {
  const apiKey = getGeminiApiKey()
  return `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`
}
