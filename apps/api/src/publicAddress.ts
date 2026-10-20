import { isIP } from "node:net";

export function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [a, b, c] = octets;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)) ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
      (a === 203 && b === 0 && c === 113));
  }

  const normalized = address.toLowerCase();
  if (isIP(normalized) !== 6) return false;
  // Public IPv6 unicast is within 2000::/3. Exclude documentation, transition,
  // mapped, link-local, unique-local, loopback, and other non-global ranges.
  const firstSegment = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return firstSegment >= 0x2000 && firstSegment <= 0x3fff &&
    !normalized.startsWith("2001:db8:") && !normalized.startsWith("2001:0:") &&
    !normalized.startsWith("2002:");
}
