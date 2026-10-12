import React from 'react'

interface ErrorBoundaryProps {
  title?: string;
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  err: string | null;
}

// Uma coluna com erro nunca mais apaga o painel inteiro.
// Generalização do antigo ColGuard: o fallback em seção/coluna só é usado
// quando um `title` é informado; sem ele, renderiza apenas o bloco de erro.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(p: ErrorBoundaryProps) {
    super(p)
    this.state = { err: null }
  }
  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return { err: String((err as Error)?.message || err) }
  }
  render(): React.ReactNode {
    if (this.state.err) {
      if (this.props.title) {
        return (
          <section className="column">
            <div className="col-title">{this.props.title}</div>
            <div className="err">Falha nesta coluna: {this.state.err}</div>
          </section>
        )
      }
      return <div className="err">Falha nesta seção: {this.state.err}</div>
    }
    return this.props.children
  }
}
