interface LoadingStateProps {
  message: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <section className="loading-state" aria-busy="true" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <p className="eyebrow">PLEASE WAIT</p>
      <h2>正在确认画面可用</h2>
      <p>{message}</p>
    </section>
  );
}
