"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { motion, AnimatePresence } from "motion/react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, label, children }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "h-8 w-8 shrink-0",
        isActive && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </Button>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5"
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          disabled={disabled}
          label="Kalın"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          disabled={disabled}
          label="İtalik"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          disabled={disabled}
          label="Madde Listesi"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          disabled={disabled}
          label="Numaralı Liste"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </motion.div>
    </AnimatePresence>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        code: false,
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Yazmaya başlayın...",
      }),
    ],
    content: value || "",
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-[140px] px-3 py-2.5 text-sm focus:outline-none",
          "[&_p]:my-1.5",
          "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_li]:my-0.5 [&_li>p]:my-0",
          "[&_strong]:font-semibold",
          "[&_em]:italic",
          "[&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
          "[&_p.is-editor-empty:first-child]:before:text-muted-foreground",
          "[&_p.is-editor-empty:first-child]:before:float-left",
          "[&_p.is-editor-empty:first-child]:before:pointer-events-none",
          "[&_p.is-editor-empty:first-child]:before:h-0",
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Tiptap empty state -> store empty string for form validation
      onChange(editor.isEmpty ? "" : html);
    },
  });

  // Keep editor in sync when external value changes (e.g. form reset)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value || "";
    if (next !== current && !(editor.isEmpty && next === "")) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          "min-h-[180px] rounded-md border border-input bg-transparent",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-transparent shadow-xs",
        "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <Toolbar editor={editor} disabled={disabled} />
      <EditorContent editor={editor} />
    </div>
  );
}
