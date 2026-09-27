import { describe, expect, it } from 'vitest';
import { LocalFrameRepository } from '../repository';
import { DEFAULT_CROP, EMPTY_DOCUMENT } from '../model';
import { IMAGE_STORAGE_KEY, STORAGE_KEY, type StorageService } from '../service';

class MemoryStorage implements StorageService {
  values = new Map<string, string>();
  failImageWrite = false;

  read(key: string = STORAGE_KEY) { return this.values.has(key) ? this.values.get(key)! : null; }
  write(value: string, key: string = STORAGE_KEY) {
    if (this.failImageWrite && key === IMAGE_STORAGE_KEY) throw new Error('quota');
    this.values.set(key, value);
  }
  remove(key: string = STORAGE_KEY) { this.values.delete(key); }
}

describe('LocalFrameRepository', () => {
  it('saves and reloads the versioned document', () => {
    const storage = new MemoryStorage();
    const repository = new LocalFrameRepository(storage);
    const document = { ...structuredClone(EMPTY_DOCUMENT), subject: { x: 0.4, y: 0.6 } };
    repository.save(document);
    expect(repository.load().subject).toEqual({ x: 0.4, y: 0.6 });
  });

  it('falls back to a usable empty document for damaged data', () => {
    const storage = new MemoryStorage();
    storage.write('{ damaged');
    const document = new LocalFrameRepository(storage).load();
    expect(document.version).toBe(1);
    expect(document.image).toBeNull();
    expect(document.variants).toEqual([]);
  });

  it('stores image data separately so a damaged image payload keeps settings and variants', () => {
    const storage = new MemoryStorage();
    const repository = new LocalFrameRepository(storage);
    const variant = { ...DEFAULT_CROP, id: 'variant-1', x: 0.2 };
    repository.save({
      ...structuredClone(EMPTY_DOCUMENT),
      image: { src: 'data:image/png;base64,image', width: 120, height: 80, name: 'kept.png' },
      guides: { thirds: false, center: true, diagonal: false, golden: true },
      variants: [variant],
    });
    expect(JSON.parse(storage.read()!).image.src).toBe('');
    storage.write('{ broken image', IMAGE_STORAGE_KEY);

    const restored = repository.load();
    expect(restored.image?.unavailable).toBe(true);
    expect(restored.image?.name).toBe('kept.png');
    expect(restored.guides.center).toBe(true);
    expect(restored.variants).toEqual([variant]);
  });

  it('loads legacy documents whose image data is embedded in the main document', () => {
    const storage = new MemoryStorage();
    storage.write(JSON.stringify({
      ...structuredClone(EMPTY_DOCUMENT),
      image: { src: 'data:image/png;base64,legacy', width: 10, height: 8, name: 'legacy.png' },
    }));
    const restored = new LocalFrameRepository(storage).load();
    expect(restored.image?.src).toContain('legacy');
    expect(restored.image?.unavailable).toBeUndefined();
  });
});
