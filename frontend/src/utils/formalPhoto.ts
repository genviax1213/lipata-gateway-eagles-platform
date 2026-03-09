export const FORMAL_PHOTO_OUTPUT_WIDTH = 1080;
export const FORMAL_PHOTO_OUTPUT_HEIGHT = 1350;

export interface FormalPhotoRecord {
  id?: number;
  image_url?: string | null;
  owner_image_url?: string | null;
  view_url?: string | null;
  url?: string | null;
  upload_url?: string | null;
  upload_field_name?: string | null;
  filename?: string | null;
  status?: string | null;
  width?: number | null;
  height?: number | null;
  template_key?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FormalPhotoAdjustments {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface FormalPhotoComposition {
  blob: Blob;
  file: File;
  previewUrl: string;
}

interface FaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BrowserDetectedFace {
  boundingBox?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

interface BrowserFaceDetector {
  detect(image: HTMLImageElement): Promise<BrowserDetectedFace[]>;
}

type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => BrowserFaceDetector;

function getFaceDetectorConstructor(): FaceDetectorConstructor | null {
  const candidate = (globalThis as { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
  return typeof candidate === "function" ? candidate : null;
}

function toUploadFile(blob: Blob, originalName: string): File {
  const cleanName = originalName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return new File([blob], `${cleanName || "formal-photo"}-formal.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function createImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = src;
  });
}

function createObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}

function revokeObjectUrl(url: string | null | undefined): void {
  if (url) URL.revokeObjectURL(url);
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to generate the formal photo preview."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.92,
    );
  });
}

async function detectFaceBounds(image: HTMLImageElement): Promise<FaceBounds | null> {
  const FaceDetectorApi = getFaceDetectorConstructor();
  if (!FaceDetectorApi) return null;

  try {
    const detector = new FaceDetectorApi({ fastMode: true, maxDetectedFaces: 1 });
    const faces = await detector.detect(image);
    const first = faces[0]?.boundingBox;
    if (!first) return null;

    const width = Number(first.width ?? 0);
    const height = Number(first.height ?? 0);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    return {
      x: Number(first.x ?? 0),
      y: Number(first.y ?? 0),
      width,
      height,
    };
  } catch {
    return null;
  }
}

function estimateFallbackFaceBounds(image: HTMLImageElement): FaceBounds {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const faceWidth = Math.max(width * 0.28, Math.min(width, height) * 0.24);
  const faceHeight = faceWidth * 1.18;

  return {
    x: width / 2 - faceWidth / 2,
    y: height * 0.1,
    width: faceWidth,
    height: faceHeight,
  };
}

async function resolveFaceBounds(image: HTMLImageElement): Promise<FaceBounds> {
  return (await detectFaceBounds(image)) ?? estimateFallbackFaceBounds(image);
}

export function defaultFormalPhotoAdjustments(): FormalPhotoAdjustments {
  return {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  };
}

export function formatFormalPhotoTimestamp(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not saved yet";
}

export function resolveFormalPhotoImageUrl(formalPhoto?: FormalPhotoRecord | null): string | null {
  return formalPhoto?.owner_image_url ?? formalPhoto?.image_url ?? formalPhoto?.view_url ?? formalPhoto?.url ?? null;
}

export function resolveFormalPhotoUploadUrl(formalPhoto?: FormalPhotoRecord | null): string {
  return formalPhoto?.upload_url?.trim() || "/formal-photos/me";
}

export function resolveFormalPhotoUploadField(formalPhoto?: FormalPhotoRecord | null): string {
  return formalPhoto?.upload_field_name?.trim() || "photo";
}

export async function composeFormalPhoto(
  sourceFile: File,
  overlayUrl: string,
  adjustments: FormalPhotoAdjustments,
): Promise<FormalPhotoComposition> {
  const sourceUrl = createObjectUrl(sourceFile);

  try {
    const [sourceImage, overlayImage] = await Promise.all([
      createImageElement(sourceUrl),
      createImageElement(overlayUrl),
    ]);

    const face = await resolveFaceBounds(sourceImage);
    const canvas = document.createElement("canvas");
    canvas.width = FORMAL_PHOTO_OUTPUT_WIDTH;
    canvas.height = FORMAL_PHOTO_OUTPUT_HEIGHT;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas rendering is not available in this browser.");
    }

    context.fillStyle = "#eef2f8";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const imageWidth = sourceImage.naturalWidth || sourceImage.width;
    const imageHeight = sourceImage.naturalHeight || sourceImage.height;
    const faceCenterX = face.x + face.width / 2;
    const faceCenterY = face.y + face.height * 0.42;
    const desiredFaceWidth = canvas.width * 0.27;
    const desiredFaceCenterY = canvas.height * 0.24;

    const faceScale = desiredFaceWidth / face.width;
    const coverScale = Math.max(canvas.width / imageWidth, canvas.height / imageHeight);
    const scale = Math.max(faceScale, coverScale) * adjustments.zoom;
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const drawX = canvas.width / 2 - faceCenterX * scale + adjustments.offsetX;
    const drawY = desiredFaceCenterY - faceCenterY * scale + adjustments.offsetY;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(sourceImage, drawX, drawY, drawWidth, drawHeight);

    const portraitFade = context.createLinearGradient(0, canvas.height * 0.58, 0, canvas.height);
    portraitFade.addColorStop(0, "rgba(18, 28, 46, 0)");
    portraitFade.addColorStop(1, "rgba(18, 28, 46, 0.16)");
    context.fillStyle = portraitFade;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToJpegBlob(canvas);
    const file = toUploadFile(blob, sourceFile.name);
    const previewUrl = URL.createObjectURL(blob);

    return {
      blob,
      file,
      previewUrl,
    };
  } finally {
    revokeObjectUrl(sourceUrl);
  }
}
