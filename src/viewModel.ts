import { useState, useSyncExternalStore } from 'react';
import { cropForRatio, makeVariant, moveCrop, resizeCrop } from './domain';
import { EMPTY_DOCUMENT, type FrameDocument, type GuideKey, type ImageAsset, type Ratio, type ViewState } from './model';
import type { FrameRepository } from './repository';
import type { ImageService } from './service';

type Listener = () => void;

const IMAGE_UNAVAILABLE_MESSAGE = '上次使用的图片数据已损坏或未完整写入，当前无法显示。请重新导入同一张图片，已保留的方案和设置会继续可用。';
const IMAGE_UNAVAILABLE_NOTICE = '本地方案和设置已保留，重新导入图片后即可继续。';

export class FrameSenseViewModel {
  private state: ViewState = { phase: 'loading', document: structuredClone(EMPTY_DOCUMENT), compareOpen: false, notice: '', error: null };
  private readonly listeners = new Set<Listener>();
  private operationToken = 0;

  constructor(private readonly repository: FrameRepository, private readonly imageService: ImageService) {}

  getSnapshot = (): ViewState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private patch(next: Partial<ViewState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }

  private save(document: FrameDocument, next: Partial<ViewState>): void {
    this.patch({ document, ...next });
    try {
      this.repository.save(document);
    } catch {
      if (!document.image?.unavailable) {
        this.patch({ phase: 'error', error: '本地保存失败，但当前编辑仍保留在页面中。请检查浏览器存储权限。' });
      }
    }
  }

  private persist(document: FrameDocument, notice: string): void {
    this.save(document, { phase: 'editing', notice, error: null });
  }

  private persistSettings(document: FrameDocument, notice: string): void {
    this.save(document, { notice });
  }

  private usableImage(): ImageAsset | null {
    if (this.state.phase === 'loading') return null;
    const image = this.state.document.image;
    return image && !image.unavailable ? image : null;
  }

  async initialize(): Promise<void> {
    const token = ++this.operationToken;
    this.patch({ phase: 'loading', notice: '正在恢复上次工作状态…', error: null });
    try {
      const document = this.repository.load();
      this.patch({ document });
      if (!document.image) {
        if (token === this.operationToken) this.patch({ phase: 'ready', notice: '欢迎来到 FrameSense，先载入示例或导入图片。', error: null });
        return;
      }

      try {
        await this.imageService.verifyImage(document.image);
        if (token === this.operationToken) this.patch({ phase: 'editing', notice: '已恢复上次工作状态，图片已确认可以显示。', error: null });
      } catch {
        if (token !== this.operationToken) return;
        const recovered: FrameDocument = { ...document, image: { ...document.image, unavailable: true } };
        this.save(recovered, { phase: 'error', notice: IMAGE_UNAVAILABLE_NOTICE, error: IMAGE_UNAVAILABLE_MESSAGE, compareOpen: false });
      }
    } catch {
      this.patch({ phase: 'error', notice: '未能读取历史状态，可继续新建工作。', error: '本地数据读取失败。' });
    }
  }

  async importImage(file: File): Promise<void> {
    if (this.state.phase === 'loading') return;

    const token = ++this.operationToken;
    const recovering = Boolean(this.state.document.image?.unavailable);
    this.patch({ phase: 'loading', notice: recovering ? '正在重新导入图片…' : '正在载入图片…', error: null, compareOpen: false });
    try {
      const image = await this.imageService.readFile(file);
      if (token !== this.operationToken) return;
      const document: FrameDocument = recovering
        ? { ...this.state.document, image }
        : { ...structuredClone(EMPTY_DOCUMENT), image };
      this.persist(document, recovering ? '图片已重新导入，可以接着使用保留的方案和设置。' : '图片已载入，可以开始构图。');
    } catch (error) {
      if (token !== this.operationToken) return;
      const fallback: Partial<ViewState> = recovering
        ? { phase: 'error', notice: IMAGE_UNAVAILABLE_NOTICE, error: IMAGE_UNAVAILABLE_MESSAGE }
        : { phase: 'error', error: error instanceof Error ? error.message : '图片载入失败。' };
      this.patch(fallback);
    }
  }

  async loadDemo(): Promise<void> {
    if (this.state.phase === 'loading') return;
    const token = ++this.operationToken;
    this.patch({ phase: 'loading', notice: '正在载入示例图片…', error: null, compareOpen: false });
    const image = this.imageService.demo();
    try {
      await this.imageService.verifyImage(image);
      if (token !== this.operationToken) return;
      this.persist({ ...structuredClone(EMPTY_DOCUMENT), image }, '示例图片已载入。');
    } catch {
      if (token === this.operationToken) this.patch({ phase: 'error', error: '示例图片当前无法显示，请改用本地图片导入。' });
    }
  }

  toggleGuide(guide: GuideKey): void {
    if (this.state.phase === 'loading') return;
    const document = { ...this.state.document, guides: { ...this.state.document.guides, [guide]: !this.state.document.guides[guide] } };
    if (!this.usableImage()) {
      this.persistSettings(document, '辅助层设置已保留。重新导入图片后会自动生效。');
    } else {
      this.persist(document, '辅助层已更新。');
    }
  }

  setRatio(ratio: Ratio): void {
    const image = this.usableImage();
    if (!image) return;
    const crop = cropForRatio(ratio, image.width / image.height, this.state.document.crop);
    this.persist({ ...this.state.document, crop }, `${ratio === 'free' ? '自由' : ratio} 裁切已应用。`);
  }

  moveCrop(dx: number, dy: number): void {
    if (!this.usableImage()) return;
    this.persist({ ...this.state.document, crop: moveCrop(this.state.document.crop, dx, dy) }, '裁切位置已调整。');
  }

  resizeCrop(width: number, height: number): void {
    if (!this.usableImage()) return;
    this.persist({ ...this.state.document, crop: resizeCrop(this.state.document.crop, width, height) }, '裁切范围已调整。');
  }

  markSubject(x: number, y: number): void {
    if (!this.usableImage()) return;
    this.persist({ ...this.state.document, subject: { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } }, '主体标记已更新。');
  }

  saveVariant(): void {
    if (!this.usableImage()) return;
    const id = `variant-${Date.now()}`;
    const variant = makeVariant(this.state.document.crop, id);
    const document = { ...this.state.document, variants: [...this.state.document.variants, variant].slice(-8) };
    this.persist(document, `已保存裁切方案 ${document.variants.length}。`);
  }

  selectVariant(id: string): void {
    if (!this.usableImage()) return;
    const variant = this.state.document.variants.find((item) => item.id === id);
    if (!variant) return;
    this.persist({ ...this.state.document, crop: { ...variant, id: 'current' } }, '已切换到保存的裁切方案。');
  }

  toggleCompare(): void {
    if (this.state.phase === 'loading' || !this.usableImage()) return;
    this.patch({ compareOpen: !this.state.compareOpen });
  }
}

export function useFrameSenseViewModel(repository: FrameRepository, imageService: ImageService): [FrameSenseViewModel, ViewState] {
  const [viewModel] = useState(() => new FrameSenseViewModel(repository, imageService));
  const state = useSyncExternalStore(viewModel.subscribe, viewModel.getSnapshot, viewModel.getSnapshot);
  return [viewModel, state];
}
