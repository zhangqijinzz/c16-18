import { isFrameDocument, isImageAsset } from './domain';
import { DEFAULT_CROP, EMPTY_DOCUMENT, type FrameDocument, type GuideKey, type ImageAsset } from './model';
import { IMAGE_STORAGE_KEY, type StorageService } from './service';

export interface FrameRepository {
  load(): FrameDocument;
  save(document: FrameDocument): void;
}

interface StoredDocument extends FrameDocument {
  image: ImageAsset | null;
}

interface StoredImage {
  src: string;
}

export class LocalFrameRepository implements FrameRepository {
  constructor(private readonly storage: StorageService) {}

  load(): FrameDocument {
    const raw = this.storage.read();
    if (!raw) return structuredClone(EMPTY_DOCUMENT);
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isFrameDocument(parsed)) {
        return sanitizeDocument(parsed.image?.src ? parsed : this.readStoredDocument(parsed));
      }
      if (isStoredDocumentRecord(parsed)) {
        return sanitizeDocument(this.readStoredDocument(parsed));
      }
      return structuredClone(EMPTY_DOCUMENT);
    } catch {
      return structuredClone(EMPTY_DOCUMENT);
    }
  }

  save(document: FrameDocument): void {
    if (document.image && !document.image.unavailable) {
      const imageSrc = document.image.src;
      this.storage.write(JSON.stringify({ src: imageSrc } satisfies StoredImage), IMAGE_STORAGE_KEY);
      const storedDocument: StoredDocument = { ...document, image: { ...document.image, src: '' } };
      this.storage.write(JSON.stringify(storedDocument));
      return;
    }

    this.storage.remove?.(IMAGE_STORAGE_KEY);
    this.storage.write(JSON.stringify({ ...document, image: document.image ? { ...document.image, src: '' } : null }));
  }

  private readStoredDocument(record: StoredDocumentRecord): FrameDocument {
    const image: ImageAsset | null = record.image ? {
      src: record.image.src ?? '',
      width: record.image.width,
      height: record.image.height,
      name: record.image.name,
      unavailable: record.image.unavailable,
    } : null;
    if (image && !image.src) {
      const storedImage = this.readStoredImage();
      if (storedImage) image.src = storedImage;
      else image.unavailable = true;
    }
    return {
      version: 1,
      image,
      guides: record.guides,
      subject: record.subject ?? null,
      crop: record.crop,
      variants: record.variants,
    };
  }

  private readStoredImage(): string | null {
    try {
      const raw = this.storage.read(IMAGE_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isStoredImage(parsed) && parsed.src ? parsed.src : null;
    } catch {
      return null;
    }
  }
}

interface StoredDocumentRecord {
  version: 1;
  image: Omit<ImageAsset, 'src'> & { src?: string } | null;
  guides: Record<GuideKey, boolean>;
  subject: { x: number; y: number } | null;
  crop: FrameDocument['crop'];
  variants: FrameDocument['variants'];
}

function isStoredDocumentRecord(value: unknown): value is StoredDocumentRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredDocumentRecord>;
  return candidate.version === 1
    && typeof candidate.guides === 'object'
    && candidate.crop !== undefined
    && Array.isArray(candidate.variants)
    && (candidate.image === null || typeof candidate.image === 'object');
}

function isStoredImage(value: unknown): value is StoredImage {
  return Boolean(value && typeof value === 'object' && typeof (value as StoredImage).src === 'string');
}

function sanitizeDocument(document: FrameDocument): FrameDocument {
  const image = recoverImage(document.image);
  return {
    version: 1,
    image,
    guides: sanitizeGuides(document.guides),
    subject: sanitizePoint(document.subject),
    crop: document.crop ?? structuredClone(DEFAULT_CROP),
    variants: Array.isArray(document.variants) ? document.variants : [],
  };
}

function recoverImage(image: ImageAsset | null): ImageAsset | null {
  if (!image) return null;
  if (isImageAsset(image)) return image;
  const width = typeof image.width === 'number' && Number.isFinite(image.width) && image.width > 0 ? image.width : 1;
  const height = typeof image.height === 'number' && Number.isFinite(image.height) && image.height > 0 ? image.height : 1;
  return {
    src: typeof image.src === 'string' ? image.src : '',
    width,
    height,
    name: typeof image.name === 'string' && image.name ? image.name : '未命名图片',
    unavailable: true,
  };
}

function sanitizeGuides(guides: Record<GuideKey, boolean> | undefined): Record<GuideKey, boolean> {
  return {
    thirds: Boolean(guides?.thirds ?? EMPTY_DOCUMENT.guides.thirds),
    center: Boolean(guides?.center ?? EMPTY_DOCUMENT.guides.center),
    diagonal: Boolean(guides?.diagonal ?? EMPTY_DOCUMENT.guides.diagonal),
    golden: Boolean(guides?.golden ?? EMPTY_DOCUMENT.guides.golden),
  };
}

function sanitizePoint(point: { x: number; y: number } | null | undefined): { x: number; y: number } | null {
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return null;
  return { x: point.x, y: point.y };
}
