import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameSenseViewModel } from '../viewModel';
import { DEFAULT_CROP, EMPTY_DOCUMENT, type FrameDocument, type ImageAsset } from '../model';
import type { FrameRepository } from '../repository';
import type { ImageService } from '../service';

class MemoryRepository implements FrameRepository {
  document: FrameDocument = structuredClone(EMPTY_DOCUMENT);
  fail = false;
  load() { return structuredClone(this.document); }
  save(document: FrameDocument) { if (this.fail) throw new Error('no storage'); this.document = structuredClone(document); }
}

class FakeImageService implements ImageService {
  asset: ImageAsset = { src: 'data:image/svg+xml,test', width: 1200, height: 800, name: 'test.svg' };
  readFile() { return Promise.resolve(this.asset); }
  verifyImage(image: ImageAsset) { return image.src.includes('broken') ? Promise.reject(new Error('broken image')) : Promise.resolve(); }
  demo() { return this.asset; }
}

describe('FrameSenseViewModel', () => {
  let repository: MemoryRepository;
  let vm: FrameSenseViewModel;
  beforeEach(() => { repository = new MemoryRepository(); vm = new FrameSenseViewModel(repository, new FakeImageService()); });

  it('initializes empty and loads a demo image', async () => {
    await vm.initialize();
    expect(vm.getSnapshot().phase).toBe('ready');
    await vm.loadDemo();
    expect(vm.getSnapshot().document.image?.name).toBe('test.svg');
    expect(repository.document.image).not.toBeNull();
  });

  it('keeps loading until a restored image has been verified', async () => {
    let resolveVerification: () => void = () => {};
    const verification = new Promise<void>((resolve) => { resolveVerification = resolve; });
    const imageService = new FakeImageService();
    imageService.verifyImage = vi.fn(() => verification);
    vm = new FrameSenseViewModel(repository, imageService);
    repository.document = { ...structuredClone(EMPTY_DOCUMENT), image: { src: 'data:image/png;base64,valid', width: 10, height: 8, name: 'restored.png' } };

    const initialization = vm.initialize();
    expect(vm.getSnapshot().phase).toBe('loading');
    expect(vm.getSnapshot().notice).toContain('恢复');

    resolveVerification();
    await initialization;
    expect(vm.getSnapshot().phase).toBe('editing');
    expect(vm.getSnapshot().notice).toContain('已确认可以显示');
  });

  it('marks an unverifiable restored image unavailable and preserves its settings and variants', async () => {
    const variant = { ...DEFAULT_CROP, id: 'variant-1', x: 0.2, width: 0.5 };
    repository.document = {
      ...structuredClone(EMPTY_DOCUMENT),
      image: { src: 'data:image/png;base64,broken', width: 12, height: 9, name: 'damaged.png' },
      guides: { thirds: false, center: true, diagonal: true, golden: false },
      subject: { x: 0.3, y: 0.4 },
      crop: variant,
      variants: [variant],
    };

    await vm.initialize();
    const failed = vm.getSnapshot();
    expect(failed.phase).toBe('error');
    expect(failed.document.image?.unavailable).toBe(true);
    expect(failed.error).toContain('图片数据已损坏');
    expect(failed.document.variants).toEqual([variant]);
    expect(failed.document.guides.center).toBe(true);
    expect(repository.document.image?.unavailable).toBe(true);

    vm.moveCrop(0.1, 0.1);
    vm.saveVariant();
    expect(vm.getSnapshot().document.crop.x).toBe(0.2);
    expect(vm.getSnapshot().document.variants).toHaveLength(1);

    vm.toggleGuide('golden');
    expect(vm.getSnapshot().document.guides.golden).toBe(true);
    expect(repository.document.guides.golden).toBe(true);

    const imageService = new FakeImageService();
    imageService.asset = { src: 'data:image/png;base64,repaired', width: 12, height: 9, name: 'damaged.png' };
    vm = new FrameSenseViewModel(repository, imageService);
    await vm.initialize();
    await vm.importImage(new File(['repaired'], 'damaged.png'));

    const recovered = vm.getSnapshot();
    expect(recovered.phase).toBe('editing');
    expect(recovered.document.image?.src).toContain('repaired');
    expect(recovered.document.image?.unavailable).toBeUndefined();
    expect(recovered.document.variants).toEqual([variant]);
    expect(recovered.document.guides).toMatchObject({ center: true, golden: true });
    expect(recovered.notice).toContain('保留');
  });

  it('updates guides, subject, ratio, and variants', async () => {
    await vm.initialize();
    await vm.loadDemo();
    vm.toggleGuide('center');
    vm.markSubject(0.2, 0.8);
    vm.setRatio('1:1');
    vm.saveVariant();
    expect(vm.getSnapshot().document.guides.center).toBe(true);
    expect(vm.getSnapshot().document.subject).toEqual({ x: 0.2, y: 0.8 });
    expect(vm.getSnapshot().document.crop.ratio).toBe('1:1');
    expect(vm.getSnapshot().document.variants).toHaveLength(1);
  });

  it('keeps edits in memory and reports persistence failure', async () => {
    await vm.initialize();
    repository.fail = true;
    await vm.loadDemo();
    expect(vm.getSnapshot().phase).toBe('error');
    expect(vm.getSnapshot().document.image).not.toBeNull();
    expect(vm.getSnapshot().error).toContain('本地保存失败');
  });
});
