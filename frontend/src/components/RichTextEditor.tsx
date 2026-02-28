import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  onUploadImage: (file: File) => Promise<string>;
  disabled?: boolean;
};

type ToolbarButtonProps = {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
};

function ToolbarButton({ active = false, disabled = false, onClick, label }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-3 py-1 text-xs ${
        active ? "border-gold bg-gold text-ink" : "border-white/30 text-offwhite"
      } disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  onUploadImage,
  disabled = false,
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        inline: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto", "tel"],
      }),
      Placeholder.configure({
        placeholder: "Write article content with headings, paragraphs, and images...",
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
    }
  }, [editor, value]);

  const handleImageUpload = async (file: File) => {
    if (!editor) return;
    setUploadingImage(true);
    try {
      const imageUrl = await onUploadImage(file);
      editor.chain().focus().setImage({ src: imageUrl, alt: file.name }).run();
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/25 bg-white/10 p-3 md:col-span-2">
      <div className="mb-3 flex flex-wrap gap-2">
        <ToolbarButton
          label="B"
          active={!!editor?.isActive("bold")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="I"
          active={!!editor?.isActive("italic")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="H2"
          active={!!editor?.isActive("heading", { level: 2 })}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          label="H3"
          active={!!editor?.isActive("heading", { level: 3 })}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <ToolbarButton
          label="Bullet"
          active={!!editor?.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Numbered"
          active={!!editor?.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label={uploadingImage ? "Uploading..." : "Image"}
          disabled={disabled || uploadingImage}
          onClick={() => fileInputRef.current?.click()}
        />
        <ToolbarButton
          label="Link"
          disabled={disabled}
          onClick={() => {
            const url = window.prompt("Enter URL");
            if (!url) return;
            editor?.chain().focus().setLink({ href: url, target: "_blank" }).run();
          }}
        />
        <ToolbarButton
          label="Unlink"
          disabled={disabled}
          onClick={() => editor?.chain().focus().unsetLink().run()}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleImageUpload(file);
          }
          event.currentTarget.value = "";
        }}
      />

      <div className="rich-editor-container min-h-60 rounded-md border border-white/20 bg-ink/35 px-3 py-2 text-offwhite">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
