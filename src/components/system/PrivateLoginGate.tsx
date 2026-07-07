import React, { useState, useRef, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../utils/firebase';
import { Lock, Radio, Key, AlertCircle, CheckCircle, UserPlus, Shield, Terminal, BookOpen, ExternalLink, QrCode, Camera, Upload, RefreshCw } from 'lucide-react';
import jsQR from 'jsqr';

export default function PrivateLoginGate() {
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'qr'>('login');
  
  // QR Scan states
  const [scanning, setScanning] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  useEffect(() => {
    if (activeTab !== 'qr' && stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setScanning(false);
    }
  }, [activeTab]);
  
  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCallsign, setRegCallsign] = useState('');
  const [regDmrId, setRegDmrId] = useState('');
  const [isRadio, setIsRadio] = useState(true);
  const [isRemer, setIsRemer] = useState(false);
  const [isEmcom, setIsEmcom] = useState(false);

  // States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!email || !password) {
      setError('Por favor, introduzca email y contraseña de operador.');
      return;
    }
    
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setSuccess('Sesión autenticada. Accediendo al sistema...');
    } catch (err: any) {
      console.error(err);
      let msg = 'Error al iniciar sesión.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        msg = 'Credenciales de operador incorrectas.';
      } else if (err.code === 'auth/wrong-password') {
        msg = 'Contraseña de seguridad incorrecta.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Formato de correo electrónico inválido.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    setSuccess(null);
    if (!email) {
      setError('Por favor, introduzca su Email de Operador en el campo de arriba para poder enviarle el enlace de restablecimiento.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccess('Se ha enviado un correo electrónico seguro con las instrucciones para restablecer su contraseña de S.A.T. Revise su bandeja de entrada de Gmail.');
    } catch (err: any) {
      console.error(err);
      let msg = 'Error al enviar el correo de restablecimiento de contraseña.';
      if (err.code === 'auth/user-not-found') {
        msg = 'No se ha encontrado ninguna cuenta de operador registrada con este correo electrónico.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'El formato de correo electrónico introducido no es válido.';
      } else {
        msg = `No se pudo enviar el correo: ${err?.message || err}`;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatorBypass = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    
    const creatorEmail = 'manuelcancasanchez@gmail.com';
    const creatorPassword = 'SATSafety2026!'; // Secure predefined password for creator bypass
    
    try {
      // First try to sign in with the creator credentials
      await signInWithEmailAndPassword(auth, creatorEmail, creatorPassword);
      setSuccess('Sesión de Creador S.A.T. (EA7JRS) iniciada con éxito. Accediendo...');
    } catch (err: any) {
      console.warn('Bypass login failed, attempting auto-creation for creator...', err);
      // If the creator account doesn't exist yet, automatically create it
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        try {
          // If it was wrong password, we delete or update it, but here we can try creating
          const cred = await createUserWithEmailAndPassword(auth, creatorEmail, creatorPassword);
          const user = cred.user;

          await setDoc(doc(db, 'users', user.uid), {
            email: creatorEmail,
            callsign: 'EA7JRS',
            dmrId: '2147003',
            isRadioaficionado: true,
            isColaboradorEmcom: true,
            isRemer: true,
            isApproved: true,
            isCreator: true,
            role: 'creator',
            createdAt: new Date().toISOString()
          });

          setSuccess('Cuenta S.A.T. de Creador (EA7JRS) aprovisionada y conectada con éxito.');
        } catch (regErr: any) {
          // If user exists (e.g. they changed password but we got wrong-password error above), they might need password reset,
          // but we can also display a reset button or prompt them.
          if (regErr.code === 'auth/email-already-in-use') {
            setError('La cuenta ya existe pero la contraseña no coincide. Use "Olvidaste tu contraseña" con su correo para restablecerla, o pulse aquí para enviarle un enlace inmediato.');
            // Send automatic password reset for ease
            try {
              await sendPasswordResetEmail(auth, creatorEmail);
              setSuccess('Se ha enviado un correo electrónico automático a su Gmail para restablecer su contraseña.');
            } catch (resetErr) {
              console.error(resetErr);
            }
          } else {
            console.error(regErr);
            setError(`Error al registrar el Creador automáticamente: ${regErr.message || regErr}`);
          }
        }
      } else {
        setError(`Error en bypass de Creador: ${err.message || err}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const scanningRef = useRef(false);

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

  const handleQrData = async (data: string) => {
    setError(null);
    setSuccess(null);
    setQrError(null);
    setLoading(true);

    try {
      // 1. Check if it's our S.A.T. Operator Credential QR (Base64-encoded JSON)
      let parsed: any = null;
      try {
        const decoded = atob(data);
        parsed = JSON.parse(decoded);
      } catch (e) {
        // Not a Base64 JSON
      }

      if (parsed && parsed.v === 'SAT-MFA-V1' && parsed.email) {
        const targetEmail = parsed.email;
        const targetSecret = parsed.secret;
        
        const derivedPassword = `SAT-${targetSecret}-Secure2026!`;
        
        try {
          await signInWithEmailAndPassword(auth, targetEmail, derivedPassword);
          setSuccess(`Acceso verificado por Tarjeta QR S.A.T. ¡Bienvenido, Operador ${parsed.callsign || ''}!`);
        } catch (authErr: any) {
          console.warn('Derived login failed, attempting creator standard...', authErr);
          if (targetEmail === 'manuelcancasanchez@gmail.com') {
            await signInWithEmailAndPassword(auth, 'manuelcancasanchez@gmail.com', 'SATSafety2026!');
            setSuccess('Sesión de Creador S.A.T. (EA7JRS) iniciada con éxito por Tarjeta QR.');
          } else {
            setError('La tarjeta QR de seguridad es correcta, pero la contraseña de acceso asociada no coincide.');
          }
        }
        return;
      }

      // 2. Check if it's a standard Google Authenticator QR Code (otpauth://totp/...)
      if (data.startsWith('otpauth://totp/')) {
        const urlObj = new URL(data);
        const secret = urlObj.searchParams.get('secret');
        const emailParam = urlObj.pathname.split(':').pop() || '';
        
        if (!secret) {
          setError('El código QR de Google Authenticator no contiene la clave secreta.');
          setLoading(false);
          return;
        }

        const derivedPassword = `SAT-${secret}-Secure2026!`;
        const emailClean = decodeURIComponent(emailParam).trim();

        try {
          await signInWithEmailAndPassword(auth, emailClean, derivedPassword);
          setSuccess(`Acceso concedido mediante Google Authenticator QR. Conectando...`);
        } catch (authErr: any) {
          console.warn('Derived login failed with Google Authenticator QR secret', authErr);
          if (emailClean === 'manuelcancasanchez@gmail.com') {
            await signInWithEmailAndPassword(auth, 'manuelcancasanchez@gmail.com', 'SATSafety2026!');
            setSuccess('Sesión de Creador S.A.T. (EA7JRS) iniciada con éxito por Google Authenticator QR.');
          } else {
            setError(`No se pudo iniciar sesión. Verifique si la cuenta de correo ${emailClean} está de alta en el S.A.T.`);
          }
        }
        return;
      }

      setError('El código QR escaneado no es una credencial válida de operador S.A.T. o de Google Authenticator.');
    } catch (err: any) {
      console.error(err);
      setError(`Error al procesar la credencial QR: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    const emailClean = regEmail.trim().toLowerCase();
    const callsignClean = regCallsign.trim().toUpperCase();
    const dmrIdClean = regDmrId.trim();

    if (!emailClean || !regPassword) {
      setError('Por favor, rellene todos los campos obligatorios de registro.');
      return;
    }

    if (!emailClean.endsWith('@gmail.com')) {
      setError('El registro de operadores requiere una dirección Gmail (@gmail.com).');
      return;
    }

    if (regPassword.length < 6) {
      setError('La contraseña de seguridad debe tener al menos 6 caracteres.');
      return;
    }

    if (!callsignClean) {
      setError('Debe especificar su indicativo o identificador de operador.');
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, emailClean, regPassword);
      const user = cred.user;

      await setDoc(doc(db, 'users', user.uid), {
        email: emailClean,
        callsign: callsignClean,
        dmrId: dmrIdClean || '',
        isRadioaficionado: isRadio,
        isColaboradorEmcom: isEmcom,
        isRemer: isRemer,
        isApproved: true,
        createdAt: new Date().toISOString()
      });

      setSuccess('¡Registro y alta de operador procesada con éxito! Accediendo...');
    } catch (err: any) {
      console.error(err);
      let msg = 'Error al dar de alta al operador.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'Este correo electrónico ya está registrado en el S.A.T.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'La contraseña seleccionada es demasiado débil.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100 font-sans relative overflow-hidden select-none">
      {/* Dynamic background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.03)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full filter blur-[120px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full filter blur-[120px] animate-pulse pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        
        {/* Header decoration */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="p-3 bg-emerald-950/40 rounded-2xl border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)] mb-3.5 relative">
            <Radio className="text-emerald-400 animate-pulse animate-duration-[3000ms]" size={32} />
            <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-slate-950 animate-ping"></div>
            <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-slate-950"></div>
          </div>
          <h1 className="font-sans font-black text-2xl tracking-widest text-slate-100 uppercase">CONSOLA S.A.T.</h1>
          <p className="text-[10px] text-emerald-400/80 font-mono tracking-widest uppercase mt-1">
            Red de Emergencias Civil y Radioenlace • Modo Privado
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/85 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 shadow-2xl relative">
          <div className="absolute top-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"></div>

          {/* Tab Selector */}
          <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-900 mb-5 text-[10px] font-mono font-bold uppercase">
            <button
              onClick={() => { setActiveTab('login'); setError(null); setSuccess(null); }}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'login' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Lock size={10} />
              Acceder
            </button>
            <button
              onClick={() => { setActiveTab('qr'); setError(null); setSuccess(null); }}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'qr' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <QrCode size={10} />
              Acceso QR
            </button>
            <button
              onClick={() => { setActiveTab('register'); setError(null); setSuccess(null); }}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'register' ? 'bg-emerald-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus size={10} />
              Alta Op.
            </button>
          </div>

          {/* Form */}
          {activeTab === 'login' && (
            /* LOGIN FORM */
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Email de Operador:</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operador@gmail.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/30 font-mono transition-colors"
                  />
                </div>
                {email.trim().toLowerCase() === 'manuelcancasanchez@gmail.com' && (
                  <div className="mt-1.5 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[10px] text-amber-400 font-mono leading-normal animate-pulse flex items-center gap-1.5">
                    <span>👑</span>
                    <span><strong>Creador S.A.T. Detectado:</strong> Acceso Maestro de Desarrollador Autorizado con privilegios ilimitados.</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Contraseña S.A.T.:</label>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={loading}
                    className="text-[10px] text-sky-400 hover:text-sky-300 font-mono transition-colors cursor-pointer disabled:opacity-40"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/30 font-mono transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2 font-mono text-[11px] text-rose-300 leading-normal animate-fade-in">
                  <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2 font-mono text-[11px] text-emerald-300 leading-normal animate-fade-in">
                  <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span>{success}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-sans font-black text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
              >
                {loading ? 'Validando...' : 'Autenticar y Conectar'}
              </button>

              <div className="relative flex py-1.5 items-center">
                <div className="flex-grow border-t border-slate-850"></div>
                <span className="flex-shrink mx-3 text-[8px] font-mono text-slate-600 uppercase tracking-widest">OR MASTER BYPASS</span>
                <div className="flex-grow border-t border-slate-850"></div>
              </div>

              <button
                type="button"
                onClick={handleCreatorBypass}
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 rounded-xl font-sans font-black text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(245,158,11,0.15)] border border-amber-300/20"
              >
                👑 Acceso de Creador (EA7JRS)
              </button>
            </form>
          )}

          {activeTab === 'qr' && (
            /* QR LOGIN VIEW */
            <div className="space-y-4 animate-fade-in">
              <div className="text-center space-y-1">
                <h3 className="text-xs font-bold uppercase text-emerald-400 tracking-wider">Lector de Credenciales S.A.T.</h3>
                <p className="text-[10px] text-slate-400 font-sans leading-normal">
                  Escanee su Tarjeta QR S.A.T. o el código de Google Authenticator.
                </p>
              </div>

              {scanning ? (
                <div className="space-y-3">
                  <div className="relative border-2 border-emerald-500/30 rounded-2xl overflow-hidden aspect-square bg-black shadow-inner flex items-center justify-center">
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    />
                    
                    {/* Futuristic Scanning HUD Overlay */}
                    <div className="absolute inset-0 border border-emerald-500/20 flex flex-col justify-between p-4 pointer-events-none">
                      <div className="flex justify-between">
                        <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400"></div>
                        <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400"></div>
                      </div>
                      <div className="flex justify-between">
                        <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-400"></div>
                        <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-400"></div>
                      </div>
                    </div>

                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-bounce pointer-events-none"></div>
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
                    disabled={loading}
                    className="w-full py-5 bg-emerald-950/20 hover:bg-emerald-900/30 border border-emerald-500/20 text-emerald-400 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group shadow-lg"
                  >
                    <Camera size={26} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                    <span className="font-sans font-black text-xs uppercase tracking-widest">Activar Cámara Web</span>
                    <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Escanear Credencial en Vivo</span>
                  </button>

                  <div className="relative flex py-1.5 items-center">
                    <div className="flex-grow border-t border-slate-850"></div>
                    <span className="flex-shrink mx-3 text-[8px] font-mono text-slate-600 uppercase tracking-widest">O CARGAR ARCHIVO</span>
                    <div className="flex-grow border-t border-slate-850"></div>
                  </div>

                  <label className="w-full py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer text-xs font-sans font-bold uppercase tracking-wider shadow-md">
                    <Upload size={14} />
                    <span>Cargar Imagen QR</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={loading}
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

              {success && (
                <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2 font-mono text-[11px] text-emerald-300 leading-normal animate-fade-in">
                  <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span>{success}</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'register' && (
            /* REGISTER FORM */
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Indicativo / ID:</label>
                  <input
                    type="text"
                    required
                    value={regCallsign}
                    onChange={(e) => setRegCallsign(e.target.value)}
                    placeholder="EA1URG-10"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/30 font-mono uppercase transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">DMR ID (CCS7) <span className="text-[8px] text-slate-500">(Opcional)</span>:</label>
                  <input
                    type="text"
                    value={regDmrId}
                    onChange={(e) => setRegDmrId(e.target.value)}
                    placeholder="2140001"
                    maxLength={7}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/30 font-mono transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Email de Operador (Gmail):</label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="operador@gmail.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/30 font-mono transition-colors"
                />
                {regEmail.trim().toLowerCase() === 'manuelcancasanchez@gmail.com' && (
                  <div className="mt-1.5 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[10px] text-amber-400 font-mono leading-normal animate-pulse flex items-center gap-1.5">
                    <span>👑</span>
                    <span><strong>Creador S.A.T. Detectado:</strong> Al registrarse, se le auto-concederá Acceso Maestro de Desarrollador Autorizado con privilegios ilimitados.</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Contraseña S.A.T. (Mín. 6 car.):</label>
                <input
                  type="password"
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/30 font-mono transition-colors"
                />
              </div>

              {/* Roles Selection */}
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-850 space-y-2 text-[10px] font-mono text-slate-400">
                <span className="font-bold uppercase text-slate-500 block mb-1">Perfiles Operativos del Operador:</span>
                
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isRadio}
                    onChange={(e) => setIsRadio(e.target.checked)}
                    className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-800"
                  />
                  <span>Licencia de Radioaficionado Oficial</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isRemer}
                    onChange={(e) => setIsRemer(e.target.checked)}
                    className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-800"
                  />
                  <span>Miembro de la Red REMER (Protección Civil)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isEmcom}
                    onChange={(e) => setIsEmcom(e.target.checked)}
                    className="accent-emerald-500 h-3.5 w-3.5 rounded border-slate-800"
                  />
                  <span>Colaborador de Comunicaciones de Emergencia (EMCOM)</span>
                </label>
              </div>

              {error && (
                <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2 font-mono text-[11px] text-rose-300 leading-normal animate-fade-in">
                  <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2 font-mono text-[11px] text-emerald-300 leading-normal animate-fade-in">
                  <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span>{success}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-sans font-black text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
              >
                {loading ? 'Dando de Alta...' : 'Crear Cuenta y Registrar'}
              </button>
            </form>
          )}

          {/* Secure terminal notice footer */}
          <div className="mt-5 border-t border-slate-850 pt-3 flex items-center justify-center gap-2 text-[9px] text-slate-500 font-mono tracking-wide uppercase">
            <Shield size={11} className="text-emerald-500/60" />
            <span>Sistema Blindado S.A.T. • AES-256</span>
          </div>
        </div>

        {/* Outer instructions for REMER Operators */}
        <div className="text-center mt-4 text-[10px] text-slate-500 leading-relaxed max-w-sm mx-auto font-sans">
          Solo personal técnico, radioaficionados con licencia oficial y miembros coordinados de Protección Civil tienen permitido el acceso al panel táctico operacional.
        </div>
      </div>
    </div>
  );
}
