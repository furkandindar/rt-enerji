import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { parseDocument } from 'htmlparser2';
import type { Element, Node, Text as DomText } from 'domhandler';

// ---------------------------------------------------------------------------
// HTML → react-pdf renderer for "Olur Yazısı" content (Tiptap output).
// Supported tags: <p>, <br>, <strong>/<b>, <em>/<i>, <u>, <ul>/<ol>/<li>.
// Anything else is rendered as plain text via its descendants.
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  paragraph: { marginBottom: 6, lineHeight: 1.4, textAlign: 'justify' },
  listItem: { flexDirection: 'row', marginBottom: 4, paddingLeft: 18 },
  listMarker: { width: 18 },
  listContent: { flex: 1, lineHeight: 1.4, textAlign: 'justify' },
});

interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function inlineStyleToPdf(style: InlineStyle) {
  const out: Record<string, string | number> = {};
  if (style.bold) out.fontWeight = 700;
  if (style.italic) out.fontStyle = 'italic';
  if (style.underline) out.textDecoration = 'underline';
  return out;
}

function isElement(node: Node): node is Element {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

function isText(node: Node): node is DomText {
  return node.type === 'text';
}

// ---------------------------------------------------------------------------
// Inline rendering — emits an array of <Text> spans with merged inline styles.
// Used inside <p> and <li>.
// ---------------------------------------------------------------------------
function renderInline(nodes: Node[], parentStyle: InlineStyle = {}, keyPrefix = ''): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  nodes.forEach((node, idx) => {
    const key = `${keyPrefix}${idx}`;
    if (isText(node)) {
      const text = node.data;
      if (!text) return;
      out.push(
        <Text key={key} style={inlineStyleToPdf(parentStyle)}>
          {text}
        </Text>,
      );
      return;
    }
    if (!isElement(node)) return;
    const tag = node.name.toLowerCase();
    if (tag === 'br') {
      out.push(<Text key={key}>{'\n'}</Text>);
      return;
    }
    const nextStyle: InlineStyle = { ...parentStyle };
    if (tag === 'strong' || tag === 'b') nextStyle.bold = true;
    if (tag === 'em' || tag === 'i') nextStyle.italic = true;
    if (tag === 'u') nextStyle.underline = true;
    out.push(...renderInline(node.children as Node[], nextStyle, `${key}-`));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Block rendering — handles <p>, <ul>, <ol>. Anything else falls through to
// inline rendering wrapped in a paragraph.
// ---------------------------------------------------------------------------
function renderList(node: Element, ordered: boolean, key: string): React.ReactNode {
  const items = (node.children as Node[]).filter(
    (c): c is Element => isElement(c) && c.name.toLowerCase() === 'li',
  );
  return (
    <View key={key}>
      {items.map((li, idx) => (
        <View key={`${key}-${idx}`} style={styles.listItem}>
          <Text style={styles.listMarker}>{ordered ? `${idx + 1}.` : '•'}</Text>
          <Text style={styles.listContent}>
            {renderInline(li.children as Node[])}
          </Text>
        </View>
      ))}
    </View>
  );
}

function renderBlock(node: Node, key: string): React.ReactNode {
  if (isText(node)) {
    const text = node.data?.trim();
    if (!text) return null;
    return (
      <Text key={key} style={styles.paragraph}>
        {text}
      </Text>
    );
  }
  if (!isElement(node)) return null;
  const tag = node.name.toLowerCase();
  if (tag === 'ul') return renderList(node, false, key);
  if (tag === 'ol') return renderList(node, true, key);
  if (tag === 'p') {
    return (
      <Text key={key} style={styles.paragraph}>
        {renderInline(node.children as Node[])}
      </Text>
    );
  }
  // Fallback: treat unknown blocks as a paragraph with their inline content
  return (
    <Text key={key} style={styles.paragraph}>
      {renderInline(node.children as Node[])}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Heuristic: a Tiptap-produced rich-text content always starts with a tag. */
export function isHtmlContent(content: string | null | undefined): boolean {
  if (!content) return false;
  return content.trim().startsWith('<');
}

/** Converts a Tiptap HTML string into react-pdf nodes. */
export function renderHtmlContent(html: string): React.ReactNode[] {
  const doc = parseDocument(html, { decodeEntities: true });
  return (doc.children as Node[])
    .map((node, idx) => renderBlock(node, `block-${idx}`))
    .filter((n): n is React.ReactNode => n !== null);
}
