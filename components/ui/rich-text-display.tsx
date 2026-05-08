import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";

interface RichTextDisplayProps {
  content: string;
  className?: string;
}

const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li"];

/** Detection helper — Tiptap output always starts with a tag. */
export function isRichTextContent(content: string | null | undefined): boolean {
  if (!content) return false;
  return content.trim().startsWith("<");
}

/**
 * Renders sanitized rich-text (Tiptap HTML) for the approval-letter content.
 * Falls back to plain-text rendering for legacy newline-separated content.
 */
export function RichTextDisplay({ content, className }: RichTextDisplayProps) {
  if (!isRichTextContent(content)) {
    return (
      <p className={cn("text-sm font-semibold whitespace-pre-wrap", className)}>
        {content}
      </p>
    );
  }
  const safe = DOMPurify.sanitize(content, { ALLOWED_TAGS, ALLOWED_ATTR: [] });
  return (
    <div
      className={cn(
        "text-sm font-semibold",
        "[&_p]:my-1.5",
        "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:my-0.5 [&_li>p]:my-0",
        "[&_strong]:font-bold",
        "[&_em]:italic",
        "[&_u]:underline",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
