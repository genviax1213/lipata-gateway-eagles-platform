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

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read selected image."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function cropAndResizeEditorImage(file: File): Promise<File | null> {
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  const shouldCrop169 = window.confirm("Crop this image to 16:9 center before upload?");
  const widthInput = window.prompt("Max output width in px (e.g. 1400). Leave blank to keep original.", "1400");
  if (widthInput === null) return null;

  const parsedMaxWidth = Number.parseInt(widthInput.trim(), 10);
  const maxWidth = Number.isFinite(parsedMaxWidth) && parsedMaxWidth > 0
    ? parsedMaxWidth
    : sourceWidth;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (shouldCrop169) {
    const targetAspect = 16 / 9;
    const sourceAspect = sourceWidth / sourceHeight;

    if (sourceAspect > targetAspect) {
      sw = Math.round(sourceHeight * targetAspect);
      sx = Math.round((sourceWidth - sw) / 2);
    } else if (sourceAspect < targetAspect) {
      sh = Math.round(sourceWidth / targetAspect);
      sy = Math.round((sourceHeight - sh) / 2);
    }
  }

  const outputWidth = Math.max(1, Math.min(maxWidth, sw));
  const outputHeight = Math.max(1, Math.round(outputWidth * (sh / sw)));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  if (!context) return file;

  context.drawImage(image, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);

  const outputType = file.type === "image/png" ? "image/png" : "image/webp";
  const blob = await canvasToBlob(canvas, outputType, 0.86);
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const ext = outputType === "image/png" ? "png" : "webp";

  return new File([blob], `${baseName}-edited.${ext}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}

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
      const editedFile = await cropAndResizeEditorImage(file);
      if (!editedFile) return;
      const imageUrl = await onUploadImage(editedFile);
      editor.chain().focus().setImage({ src: imageUrl, alt: editedFile.name }).run();
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
