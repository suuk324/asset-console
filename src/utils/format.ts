export function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`
}

export function toSentenceCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
