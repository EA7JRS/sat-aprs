import React, { useState, useRef, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../utils/firebase';
import { verifyTotpToken } from '../../utils/totp';
import { ShieldCheck, ShieldAlert, KeyRound, AlertCircle, LogOut, Radio, QrCode, Camera, Upload } from 'lucide-react';
import jsQR from 'jsqr';

interface TwoFactorVerificationGateProps {
  userProfile: any;
  onSuccess: () => void;
}

export default function TwoFactorVerificationGate({ userProfile, onSuccess }: TwoFactorVerificationGateProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isQrMode, setIsQrMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  useEffect(() => {
    if (!isQrMode && stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setScanning(false);
      scanningRef.current = false;
    }
  }, [isQrMode]);

  const startCamera = async () => {
    setQrError(null);
    setScanning(true);
    scanningRef.current = true;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        setTimeout(() => {
          if (scanningRef.current) {
            requestAnimationFrame(tick);
          }
        }, 300);
      }
    } catch (err: any) {
      console.error(err);
      setScanning(false);
      scanningRef.current = false;
      setQrError('No se pudo acceder a la cámara web. Conceda permisos de cámara o cargue un archivo de imagen QR.');
    }
  };

  const stopCamera = () => {
    scanningRef.current = false;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setScanning(false);
  };

  const tick = () => {
    if (!scanningRef.current) return;

    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      if (scanningRef.current) {
        requestAnimationFrame(tick);
      }
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (canvas && video) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = 300;
        canvas.height = 300;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code) {
          scanningRef.current = false;
          stopCamera();
          handleQrData(code.data);
          return;
        }
      }
    }

    if (scanningRef.current) {
      requestAnimationFrame(tick);
    }
  };

  const handleQrData = (data: string) => {
    setError(null);
    setQrError(null);

    try {
      // 1. Parse standard S.A.T. Operator Credential QR
      let parsed: any = null;
      try {
        const decoded = atob(data);
        parsed = JSON.parse(decoded);
      } catch (e) {
        // Not a Base64 JSON
      }

      if (parsed && parsed.v === 'SAT-MFA-V1') {
        const profileSecret = userProfile?.twoFactorSecret;
        if (parsed.secret === profileSecret && parsed.email === userProfile?.email) {
          onSuccess();
        } else {
          setError('La tarjeta QR escaneada no coincide con su perfil de operador actual.');
        }
        return;
      }

      // 2. Parse standard Google Authenticator QR Code (otpauth://totp/...)
      if (data.startsWith('otpauth://totp/')) {
        const urlObj = new URL(data);
        const secret = urlObj.searchParams.get('secret');
        if (secret === userProfile?.twoFactorSecret) {
          onSuccess();
        } else {
          setError('El código QR de Google Authenticator no coincide con la clave secreta de su perfil.');
        }
        return;
      }

      setError('El código QR escaneado no es una credencial válida de operador S.A.T. o de Google Authenticator.');
    } catch (err: any) {
      console.error(err);
      setError(`Error al procesar la credencial QR: ${err.message || err}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setQrError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, img.width, img.height);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            handleQrData(code.data);
          } else {
            setQrError('No se pudo encontrar ningún código QR válido en la imagen cargada.');
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim().replace(/\s/g, '');
    if (cleanCode.length !== 6) {
      setError('Por favor, introduzca el código de verificación de 6 dígitos.');
      return;
    }

    setLoading(true);
    
    // Check TOTP code against the secret key stored in the profile
    const currentSecret = userProfile?.twoFactorSecret;
    if (!currentSecret) {
      setError('Error crítico: No se encuentra la configuración de seguridad 2FA en su perfil.');
      setLoading(false);
      return;
    }

    const isValid = verifyTotpToken(currentSecret, cleanCode);
    if (isValid) {
      onSuccess();
    } else {
      setError('Código incorrecto o caducado. Inténtelo de nuevo.');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Error signing out from 2FA Gate:', e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100 font-sans relative overflow-hidden select-none">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.03)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-500/5 rounded-full filter blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full filter blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        
        {/* Header styling */}
        <div className="flex flex-col items-center mb-6 text-center animate-fade-in">
          <div className="p-3 bg-sky-950/40 rounded-2xl border border-sky-500/30 shadow-[0_0_20px_rgba(56,189,248,0.1)] mb-3.5 relative">
            <KeyRound className="text-sky-400 animate-pulse" size={32} />
            <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-sky-500 border-2 border-slate-950"></div>
          </div>
          <h1 className="font-sans font-black text-2xl tracking-widest text-slate-100 uppercase">S.A.T. SEGURIDAD</h1>
          <p className="text-[10px] text-sky-400/80 font-mono tracking-widest uppercase mt-1">
            Red de Emergencias • Verificación de Doble Factor
          </p>
        </div>

        {/* Card containing Verification form */}
        <div className="bg-slate-900/85 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl relative">
          <div className="absolute top-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-sky-500/30 to-transparent"></div>

          {/* Mode Selector */}
          <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-900 mb-5 text-[10px] font-mono font-bold uppercase">
            <button
              onClick={() => { setIsQrMode(false); setError(null); }}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                !isQrMode ? 'bg-sky-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound size={11} />
              Passcode Manual
            </button>
            <button
              onClick={() => { setIsQrMode(true); setError(null); }}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isQrMode ? 'bg-sky-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <QrCode size={11} />
              Tarjeta QR S.A.T.
            </button>
          </div>

          {!isQrMode ? (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="text-center space-y-1.5">
                <span className="text-xs text-sky-300 font-bold uppercase tracking-wider block font-sans">Verificación Requerida</span>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans px-2">
                  Su cuenta de operador tiene activada la seguridad reforzada. Por favor, abra la aplicación **Google Authenticator** en su smartphone e introduzca el código actual.
                </p>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block text-center">
                  Código S.A.T. de 6 Dígitos:
                </label>
                <div className="flex justify-center">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-2xl tracking-[0.4em] font-bold text-sky-400 placeholder-slate-800 focus:outline-none focus:border-sky-500/30 w-52 text-center font-mono shadow-inner"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2 font-mono text-[11px] text-rose-300 leading-normal animate-fade-in">
                  <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl font-sans font-black text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(14,165,233,0.15)]"
              >
                {loading ? 'Validando Clave...' : 'Verificar y Conectar'}
              </button>

              <div className="border-t border-slate-850 pt-3 flex justify-center">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-[10px] font-mono text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <LogOut size={11} />
                  Cambiar de Operador / Salir
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <span className="text-xs text-sky-300 font-bold uppercase tracking-wider block font-sans">Lector de Tarjeta QR</span>
                <p className="text-[11px] text-slate-400 font-sans leading-normal">
                  Sostenga su Tarjeta QR S.A.T. o de Google Authenticator frente a la cámara web para autenticar su doble factor de manera instantánea.
                </p>
              </div>

              {scanning ? (
                <div className="space-y-3">
                  <div className="relative border-2 border-sky-500/30 rounded-2xl overflow-hidden aspect-square bg-black shadow-inner flex items-center justify-center">
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    />
                    
                    {/* HUD Outline */}
                    <div className="absolute inset-0 border border-sky-500/20 flex flex-col justify-between p-4 pointer-events-none">
                      <div className="flex justify-between">
                        <div className="w-4 h-4 border-t-2 border-l-2 border-sky-400"></div>
                        <div className="w-4 h-4 border-t-2 border-r-2 border-sky-400"></div>
                      </div>
                      <div className="flex justify-between">
                        <div className="w-4 h-4 border-b-2 border-l-2 border-sky-400"></div>
                        <div className="w-4 h-4 border-b-2 border-r-2 border-sky-400"></div>
                      </div>
                    </div>

                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-sky-500/60 shadow-[0_0_10px_rgba(56,189,248,0.8)] animate-bounce pointer-events-none"></div>
                  </div>

                  <button
                    type="button"
                    onClick={stopCamera}
                    className="w-full py-2 bg-rose-950/40 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-xl font-sans font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Detener Cámara
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="w-full py-5 bg-sky-950/20 hover:bg-sky-900/30 border border-sky-500/20 text-sky-400 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group shadow-lg"
                  >
                    <Camera size={26} className="text-sky-400 group-hover:scale-110 transition-transform" />
                    <span className="font-sans font-black text-xs uppercase tracking-widest">Activar Cámara Web</span>
                    <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest font-bold">Escaneo en Directo</span>
                  </button>

                  <div className="relative flex py-1.5 items-center">
                    <div className="flex-grow border-t border-slate-850"></div>
                    <span className="flex-shrink mx-3 text-[8px] font-mono text-slate-600 uppercase tracking-widest">O CARGAR ARCHIVO</span>
                    <div className="flex-grow border-t border-slate-850"></div>
                  </div>

                  <label className="w-full py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer text-xs font-sans font-bold uppercase tracking-wider shadow-md text-center">
                    <Upload size={14} className="inline mr-1" />
                    <span>Cargar Imagen QR</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {qrError && (
                <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2 font-mono text-[11px] text-rose-300 leading-normal">
                  <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <span>{qrError}</span>
                </div>
              )}

              {error && (
                <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2 font-mono text-[11px] text-rose-300 leading-normal animate-fade-in">
                  <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="border-t border-slate-850 pt-3 flex justify-center">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-[10px] font-mono text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <LogOut size={11} />
                  Cambiar de Operador / Salir
                </button>
              </div>
            </div>
          )}

          {/* Footer notice */}
          <div className="mt-5 border-t border-slate-850 pt-3 flex items-center justify-center gap-1.5 text-[9px] text-slate-500 font-mono tracking-wide uppercase">
            <span>Canal de Identificación Cifrado • S.A.T. MFA</span>
          </div>
        </div>

        <div className="text-center mt-4 text-[10px] text-slate-500 leading-relaxed max-w-sm mx-auto font-sans">
          Si ha perdido el acceso a su dispositivo de doble factor, contacte con el Administrador de Enlaces de la red REMER de su zona para restablecer las credenciales.
        </div>
      </div>
    </div>
  );
}
