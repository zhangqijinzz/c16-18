import type { ImageAsset } from '../model';

interface ImageUnavailableProps {
  image: ImageAsset;
  variantsCount: number;
  onImport: (file: File) => void;
}

export function ImageUnavailable({ image, variantsCount, onImport }: ImageUnavailableProps) {
  return (
    <section className="recover-state" role="alert">
      <div className="recover-icon" aria-hidden="true">!</div>
      <p className="eyebrow">RECOVERY / IMAGE MISSING</p>
      <h2>当前图片已不可用</h2>
      <p>「{image.name}」的本地图片数据已损坏或没有完整保存，因此工作台不会显示空画面，也不能继续拖动画框。</p>
      <label className="primary-button import-recover-button">
        重新导入同一张图片
        <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ''; }} />
      </label>
      <span className="empty-hint">重新导入后，辅助层、主体、裁切设置和 {variantsCount} 个已保存方案都会保留。</span>
    </section>
  );
}
