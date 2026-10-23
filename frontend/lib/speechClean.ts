/**
 * Clean markdown formatting, symbols, and code from text for natural speech synthesis.
 * Ensures the entire response is voiced without premature cutoffs.
 */
export function cleanForSpeech(text: string, maxLen = 2500): string {
  if (!text) return "";
  return text
    // Remove code blocks
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove bold/italics
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Remove markdown links [title](url) -> title
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove headers and bullets
    .replace(/^[#\->*\s•]+(?:\d+\.)?\s*/gm, "")
    // Remove emotion tags like [happy] or (smiling)
    .replace(/\[(happy|sad|curious|neutral|thinking|excited|warm)\]/gi, "")
    // Normalize spaces
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
