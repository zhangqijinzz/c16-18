import type { ImageAsset } from './model';

export const STORAGE_KEY = 'framesense.document.v1';
export const IMAGE_STORAGE_KEY = `${STORAGE_KEY}.image`;

export interface StorageService {
  read(key?: string): string | null;
  write(value: string, key?: string): void;
  remove?(key?: string): void;
}

export class BrowserStorageService implements StorageService {
  read(key: string = STORAGE_KEY): string | null {
    return window.localStorage.getItem(key);
  }

  write(value: string, key: string = STORAGE_KEY): void {
    window.localStorage.setItem(key, value);
  }

  remove(key: string = STORAGE_KEY): void {
    window.localStorage.removeItem(key);
  }
}

export interface ImageService {
  readFile(file: File): Promise<ImageAsset>;
  verifyImage(image: ImageAsset): Promise<void>;
  demo(): ImageAsset;
}

export class BrowserImageService implements ImageService {
  readFile(file: File): Promise<ImageAsset> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('图片读取失败，请换一张图片重试。'));
      reader.onload = () => {
        const src = typeof reader.result === 'string' ? reader.result : '';
        this.loadImage(src)
          .then((loaded) => this.decodeImage(loaded))
          .then((loaded) => resolve({ src, width: loaded.naturalWidth, height: loaded.naturalHeight, name: file.name }))
          .catch(() => reject(new Error('图片格式无法识别或数据不完整。')));
      };
      reader.readAsDataURL(file);
    });
  }

  async verifyImage(image: ImageAsset): Promise<void> {
    if (!image.src || image.width <= 0 || image.height <= 0) {
      throw new Error('图片数据不完整。');
    }
    try {
      const loaded = await this.loadImage(image.src);
      await this.decodeImage(loaded);
      if (loaded.naturalWidth !== image.width || loaded.naturalHeight !== image.height) {
        throw new Error('图片尺寸信息已损坏。');
      }
    } catch (error) {
      throw error instanceof Error ? error : new Error('图片无法显示。');
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片无法显示。'));
      image.src = src;
    });
  }

  private async decodeImage(image: HTMLImageElement): Promise<HTMLImageElement> {
    if (typeof image.decode === 'function') {
      await image.decode();
    }
    return image;
  }

  demo(): ImageAsset {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#f9c86b"/><stop offset=".56" stop-color="#e88965"/><stop offset="1" stop-color="#39485f"/></linearGradient></defs><rect width="1200" height="800" fill="url(#sky)"/><circle cx="820" cy="260" r="115" fill="#ffe4a1" opacity=".9"/><path d="M0 650 260 430l180 110 190-250 420 360 150-90v240H0Z" fill="#233344"/><path d="M0 715 230 560l145 72 238-178 280 230 140-95 167 126H0Z" fill="#15232e" opacity=".9"/><text x="70" y="120" fill="#fff4dd" font-family="sans-serif" font-size="34" letter-spacing="8">FRAME STUDY 01</text></svg>`;
    return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, width: 1200, height: 800, name: 'FrameSense 示例风景.svg' };
  }
}
