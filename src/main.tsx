import { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './utils/customFetch';
import App from './App.tsx';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error de renderizado capturado por ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 font-sans">
          <div className="max-w-2xl w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <span className="p-2 bg-red-950/40 rounded-lg border border-red-500/20">🚨</span>
              <h1 className="font-sans font-bold text-lg tracking-wide">ERROR EN LA CONSOLA S.A.T.</h1>
            </div>
            
            <p className="text-sm text-slate-300 mb-4">
              Se ha detectado una excepción crítica en el hilo de ejecución de la interfaz. Los detalles del error técnico se muestran a continuación:
            </p>

            <div className="bg-black/40 border border-slate-800 rounded-lg p-4 font-mono text-xs text-red-300 overflow-auto max-h-60 mb-4 leading-relaxed">
              <p className="font-bold mb-1">{this.state.error?.name}: {this.state.error?.message}</p>
              <p className="whitespace-pre-wrap text-[11px] text-slate-500 mt-2">{this.state.error?.stack}</p>
            </div>

            <div className="border-t border-slate-800 pt-4 flex justify-between items-center text-xs text-slate-400">
              <span>Si eres operador REMER o desarrollador, revisa los logs de depuración.</span>
              <button 
                onClick={() => window.location.reload()}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold border border-slate-700 transition"
              >
                Reintentar Conexión
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

