import { beforeEach, describe, expect, it } from 'vitest';
import { FrameSenseViewModel } from '../viewModel';
import { EMPTY_DOCUMENT, type FrameDocument, type ImageAsset } from '../model';
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
  verifyHandler: (image: ImageAsset) => Promise<ImageAsset> = (image) => Promise.resolve(image);
  readFile() { return Promise.resolve(this.asset); }
  demo() { return this.asset; }
  verify(image: ImageAsset) { return this.verifyHandler(image); }
}

describe('FrameSenseViewModel', () => {
  let repository: MemoryRepository;
  let imageService: FakeImageService;
  let vm: FrameSenseViewModel;
  beforeEach(() => { repository = new MemoryRepository(); imageService = new FakeImageService(); vm = new FrameSenseViewModel(repository, imageService); });

  it('initializes empty and loads a demo image', async () => {
    await vm.initialize();
    expect(vm.getSnapshot().phase).toBe('ready');
    vm.loadDemo();
    expect(vm.getSnapshot().document.image?.name).toBe('test.svg');
    expect(repository.document.image).not.toBeNull();
  });

  it('updates guides, subject, ratio, and variants', () => {
    vm.loadDemo();
    vm.toggleGuide('center');
    vm.markSubject(0.2, 0.8);
    vm.setRatio('1:1');
    vm.saveVariant();
    expect(vm.getSnapshot().document.guides.center).toBe(true);
    expect(vm.getSnapshot().document.subject).toEqual({ x: 0.2, y: 0.8 });
    expect(vm.getSnapshot().document.crop.ratio).toBe('1:1');
    expect(vm.getSnapshot().document.variants).toHaveLength(1);
  });

  it('keeps edits in memory and reports persistence failure', () => {
    repository.fail = true;
    vm.loadDemo();
    expect(vm.getSnapshot().phase).toBe('error');
    expect(vm.getSnapshot().document.image).not.toBeNull();
    expect(vm.getSnapshot().error).toContain('本地保存失败');
  });

  it('stays in loading until the restored image is confirmed displayable', async () => {
    repository.document = { ...structuredClone(EMPTY_DOCUMENT), image: imageService.asset };
    let resolveVerify!: (image: ImageAsset) => void;
    imageService.verifyHandler = () => new Promise((resolve) => { resolveVerify = resolve; });
    const pending = vm.initialize();
    expect(vm.getSnapshot().phase).toBe('loading');
    expect(vm.getSnapshot().notice).toBe('正在恢复上次工作状态…');
    resolveVerify(imageService.asset);
    await pending;
    expect(vm.getSnapshot().phase).toBe('editing');
    expect(vm.getSnapshot().notice).toBe('已恢复上次工作状态');
    expect(vm.getSnapshot().document.image?.name).toBe('test.svg');
  });

  it('keeps variants and settings but asks for a re-import when the saved image is broken', async () => {
    const variant = { id: 'v1', x: 0.1, y: 0.2, width: 0.5, height: 0.5, ratio: '1:1' };
    repository.document = {
      ...structuredClone(EMPTY_DOCUMENT),
      image: { src: 'data:image/png;base64,corrupt', width: 10, height: 10, name: 'broken.png' },
      variants: [variant],
      subject: { x: 0.3, y: 0.4 },
      guides: { thirds: false, center: true, diagonal: false, golden: true },
    };
    imageService.verifyHandler = () => Promise.reject(new Error('broken'));
    await vm.initialize();
    const state = vm.getSnapshot();
    expect(state.phase).toBe('error');
    expect(state.imageBroken).toBe(true);
    expect(state.document.image).toBeNull();
    expect(state.document.variants).toEqual([variant]);
    expect(state.document.subject).toEqual({ x: 0.3, y: 0.4 });
    expect(state.document.guides.center).toBe(true);
    expect(state.error).toContain('重新导入');
    expect(state.notice).not.toBe('已恢复上次工作状态');
  });

  it('reattaches preserved variants and settings when the same image is re-imported', async () => {
    const variant = { id: 'v1', x: 0.1, y: 0.2, width: 0.5, height: 0.5, ratio: '1:1' };
    repository.document = {
      ...structuredClone(EMPTY_DOCUMENT),
      image: { src: 'data:image/png;base64,corrupt', width: 10, height: 10, name: 'broken.png' },
      variants: [variant],
      guides: { thirds: false, center: true, diagonal: false, golden: false },
    };
    imageService.verifyHandler = () => Promise.reject(new Error('broken'));
    await vm.initialize();
    await vm.importImage({} as File);
    const state = vm.getSnapshot();
    expect(state.phase).toBe('editing');
    expect(state.imageBroken).toBe(false);
    expect(state.document.image?.name).toBe('test.svg');
    expect(state.document.variants).toEqual([variant]);
    expect(state.document.guides.center).toBe(true);
    expect(state.notice).toContain('接着使用');
    expect(repository.document.image).not.toBeNull();
    expect(repository.document.variants).toEqual([variant]);
  });

  it('resets the workspace when importing over a healthy image', async () => {
    vm.loadDemo();
    vm.saveVariant();
    await vm.importImage({} as File);
    expect(vm.getSnapshot().document.variants).toHaveLength(0);
    expect(vm.getSnapshot().document.image?.name).toBe('test.svg');
  });
});
