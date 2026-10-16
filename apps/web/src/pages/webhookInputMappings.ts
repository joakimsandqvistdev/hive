export function defaultWebhookIdentifier(label: string): string {
  const words = label.trim().replace(/([a-z0-9])([A-Z])/g, "$1 $2").match(/[A-Za-z0-9]+/g) ?? [];
  return words.map((word, index) => index === 0
    ? word[0]!.toLowerCase() + word.slice(1)
    : word[0]!.toUpperCase() + word.slice(1)).join("");
}
