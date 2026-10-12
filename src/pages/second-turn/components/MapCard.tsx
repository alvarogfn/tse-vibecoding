interface MapCardProps {
  title: string;
  summaryTitle: string;
  summary: React.ReactNode;
  hint: React.ReactNode;
  children: React.ReactNode;
}

// Molde dos cards (Brasil / MG): mesma casca .st-card, miolo varia por children.
export function MapCard({ title, summaryTitle, summary, hint, children }: MapCardProps): React.JSX.Element {
  return (
    <section className="st-card">
      <div className="col-title">{title}</div>
      <div className="summary" title={summaryTitle}>
        {summary}
      </div>
      {children}
      <div className="hint">{hint}</div>
    </section>
  );
}
