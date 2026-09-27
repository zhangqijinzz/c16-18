interface EmptyStateProps {
  onDemo: () => void;
  onImport: (file: File) => void;
  restoreFailed: boolean;
  keptVariants: number;
}

export function EmptyState({ onDemo, onImport, restoreFailed, keptVariants }: EmptyStateProps) {
  if (restoreFailed) {
    return (
      <section className="empty-state">
        <div className="empty-orbit" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow">RESTORE / IMAGE UNAVAILABLE</p>
        <h2>上次的图片已无法显示</h2>
        <p>本地保存的图片数据已损坏。{keptVariants > 0 ? `${keptVariants} 个裁切方案` : '裁切方案'}与设置仍保留在本地，重新导入同一张图片即可接着使用。</p>
        <label className="primary-button">
          重新导入图片
          <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ''; }} />
        </label>
        <span className="empty-hint">导入后，保留的方案与设置会自动接上</span>
      </section>
    );
  }
  return (
    <section className="empty-state">
      <div className="empty-orbit" aria-hidden="true"><span /><span /><span /></div>
      <p className="eyebrow">COMPOSITION LAB / 01</p>
      <h2>先把一张照片放进画框</h2>
      <p>叠加构图辅助线，找到主体的视觉重心，再保存不同裁切版本。</p>
      <button className="primary-button" onClick={onDemo}>载入示例图片</button>
      <span className="empty-hint">也可以从左上角导入本地图片</span>
    </section>
  );
}
