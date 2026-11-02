/** Enkel XML-bygger uten avhengigheter. Elementer med verdien null/undefined utelates. */

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export type XmlNode = string | null | undefined | false | XmlNode[];

/** Lager <tag attr="..">innhold</tag>. Tekstinnhold escapes; barn sendes som el(...)-resultater i en liste. */
export function el(tag: string, content: XmlNode | number, attrs?: Record<string, string | undefined>): string {
  if (content === null || content === undefined || content === false) return "";
  const a = attrs ? Object.entries(attrs).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k}="${esc(v!)}"`).join("") : "";
  if (Array.isArray(content)) return `<${tag}${a}>${flat(content)}</${tag}>`;
  return `<${tag}${a}>${esc(String(content))}</${tag}>`;
}

function flat(nodes: XmlNode[]): string {
  return nodes.map((n) => (Array.isArray(n) ? flat(n) : n || "")).join("");
}

/** Øre til desimalbeløp med to desimaler og punktum, f.eks. 123456 → "1234.56". */
export function amount(ore: number): string {
  const sign = ore < 0 ? "-" : "";
  const abs = Math.abs(ore);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>\n';
