/**
 * Minimal XML for the EUIS SOAP client: escaping when building requests, and a
 * small non-validating reader for responses. Elements are matched by local name,
 * so the reader does not depend on the prefixes the server picks (the EUIS
 * samples show `S:`, `ns3:`, `ns5:`…). DOCTYPEs are refused and no external
 * entities are ever resolved.
 */

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export type XmlNode = { name: string; local: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });

const localName = (name: string) => name.slice(name.indexOf(":") + 1);

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!([^>]*)>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export class XmlError extends Error {}

/** Parse a document into a tree. Throws XmlError on malformed input. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#document", local: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let consumed = 0;
  for (const m of xml.matchAll(TOKEN)) {
    if (m.index !== consumed) throw new XmlError("Unexpected character in XML.");
    consumed = m.index + m[0].length;
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2] !== undefined) throw new XmlError("DOCTYPE is not allowed.");
    else if (m[3] !== undefined) {
      if (stack.length < 2 || top.name !== m[3]) throw new XmlError(`Unexpected </${m[3]}>.`);
      stack.pop();
    } else if (m[4] !== undefined) {
      const attrs: Record<string, string> = {};
      for (const a of (m[5] ?? "").matchAll(ATTR)) attrs[a[1]] = decode(a[2] ?? a[3] ?? "");
      const node: XmlNode = { name: m[4], local: localName(m[4]), attrs, children: [], text: "" };
      top.children.push(node);
      if (!m[6]) stack.push(node);
    } else if (m[7] !== undefined) {
      top.text += decode(m[7]);
    }
  }
  if (consumed !== xml.length || stack.length !== 1) throw new XmlError("Incomplete XML.");
  if (root.children.length !== 1) throw new XmlError("XML must have one root element.");
  return root.children[0];
}

/** First descendant (depth-first) with this local name. */
export function find(node: XmlNode | undefined, local: string): XmlNode | undefined {
  if (!node) return undefined;
  for (const child of node.children) {
    if (child.local === local) return child;
    const deeper = find(child, local);
    if (deeper) return deeper;
  }
  return undefined;
}

/** All descendants with this local name. */
export function findAll(node: XmlNode | undefined, local: string, out: XmlNode[] = []): XmlNode[] {
  for (const child of node?.children ?? []) {
    if (child.local === local) out.push(child);
    findAll(child, local, out);
  }
  return out;
}

/** Direct child with this local name. */
export const child = (node: XmlNode | undefined, local: string) => node?.children.find((c) => c.local === local);

/** Trimmed text of a direct child, or undefined when absent/empty. */
export function childText(node: XmlNode | undefined, local: string): string | undefined {
  const text = child(node, local)?.text.trim();
  return text ? text : undefined;
}
