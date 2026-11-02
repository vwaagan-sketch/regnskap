/**
 * Liten XML-leser for kontoutskrifter (CAMT.053). Leser elementer, attributter og tekst.
 * Navnerom-prefiks fjernes. DOCTYPE og entiteter utover de fem standardene avvises,
 * så filen kan ikke hente inn eksterne ressurser.
 */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export class XmlError extends Error {}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    if (e in ENTITIES) return ENTITIES[e];
    throw new XmlError(`Ukjent XML-entitet &${e};`);
  });
}

const localName = (n: string) => n.slice(n.indexOf(":") + 1);

export function parseXml(input: string): XmlNode {
  const src = input.replace(/^﻿/, "");
  if (/<!DOCTYPE/i.test(src)) throw new XmlError("XML med DOCTYPE støttes ikke");
  const token = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let m: RegExpExecArray | null;
  while ((m = token.exec(src))) {
    const [, cdata, closing, tag, attrSrc, selfClosing, text, stray] = m;
    const top = stack[stack.length - 1];
    if (stray) throw new XmlError("Ugyldig XML");
    if (cdata !== undefined) top.text += cdata;
    else if (text !== undefined) top.text += decode(text);
    else if (tag) {
      const name = localName(tag);
      if (closing) {
        if (top.name !== name || stack.length === 1) throw new XmlError(`Uventet slutt-tagg </${tag}>`);
        stack.pop();
        top.text = top.text.trim();
      } else {
        const attrs: Record<string, string> = {};
        for (const a of (attrSrc ?? "").matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
          attrs[localName(a[1])] = decode(a[2] ?? a[3] ?? "");
        }
        const node: XmlNode = { name, attrs, children: [], text: "" };
        top.children.push(node);
        if (!selfClosing) stack.push(node);
      }
    }
  }
  if (stack.length !== 1) throw new XmlError(`Elementet <${stack[stack.length - 1].name}> er ikke avsluttet`);
  const doc = root.children[0];
  if (!doc || root.children.length !== 1) throw new XmlError("XML-filen må ha ett rotelement");
  return doc;
}

/** Første etterkommer langs en sti, f.eks. at(n, "Acct", "Id", "IBAN"). */
export function at(node: XmlNode | undefined, ...path: string[]): XmlNode | undefined {
  let cur = node;
  for (const p of path) {
    cur = cur?.children.find((c) => c.name === p);
    if (!cur) return undefined;
  }
  return cur;
}

export function all(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((c) => c.name === name) ?? [];
}

export function textAt(node: XmlNode | undefined, ...path: string[]): string | undefined {
  const n = at(node, ...path);
  return n && n.text !== "" ? n.text : undefined;
}

/** Finner første element med navnet hvor som helst under noden. */
export function find(node: XmlNode, name: string): XmlNode | undefined {
  if (node.name === name) return node;
  for (const c of node.children) {
    const hit = find(c, name);
    if (hit) return hit;
  }
  return undefined;
}
