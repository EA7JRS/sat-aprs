import React, { useState } from 'react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { generateBase32Secret, getTotpUri, verifyTotpToken } from '../../utils/totp';
import { ShieldCheck, ShieldAlert, KeyRound, Copy, Check, QrCode, AlertCircle, Trash2, Smartphone } from 'lucide-react';

interface TwoFactorConfiguratorProps {
  currentUser: any;
  userProfile: any;
}

export default function TwoFactorConfigurator({ currentUser, userProfile }: TwoFactorConfiguratorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showBadge, setShowBadge] = useState(false);

  // Setup wizard states
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [tempSecret, setTempSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  // Disabling state
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const handleStartSetup = () => {
    setError(null);
    setSuccess(null);
    const secret = generateBase32Secret();
    setTempSecret(secret);
    setIsConfiguring(true);
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(tempSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifyAndEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!verificationCode || verificationCode.trim().length !== 6) {
      setError('Por favor, introduzca un código de 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const isValid = verifyTotpToken(tempSecret, verificationCode);
      if (!isValid) {
        setError('El código de verificación es incorrecto o ha caducado. Compruebe la hora de su dispositivo e inténtelo de nuevo.');
        setLoading(false);
        return;
      }

      // Save to Firestore
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          twoFactorEnabled: true,
          twoFactorSecret: tempSecret,
          twoFactorVerified: true,
        });

        setSuccess('¡Doble factor (2FA) configurado y activado correctamente!');
        setIsConfiguring(false);
        setTempSecret('');
        setVerificationCode('');
      }
    } catch (err: any) {
      console.error(err);
      setError('Error al actualizar el perfil en la base de datos.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!disableCode || disableCode.trim().length !== 6) {
      setError('Debe introducir el código de verificación actual para poder desactivar 2FA.');
      return;
    }

    setLoading(true);
    try {
      const currentSecret = userProfile?.twoFactorSecret;
      if (!currentSecret) {
        setError('No se ha encontrado ninguna clave secreta de 2FA configurada.');
        setLoading(false);
        return;
      }

      const isValid = verifyTotpToken(currentSecret, disableCode);
      if (!isValid) {
        setError('El código introducido no es válido.');
        setLoading(false);
        return;
      }

      // Update Firestore to remove 2FA
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          twoFactorEnabled: false,
          twoFactorSecret: '',
          twoFactorVerified: false,
        });

        setSuccess('Doble factor (2FA) desactivado correctamente de forma segura.');
        setIsDisabling(false);
        setDisableCode('');
      }
    } catch (err: any) {
      console.error(err);
      setError('Error de comunicación con el sistema seguro.');
    } finally {
      setLoading(false);
    }
  };

  const totpUri = tempSecret ? getTotpUri(tempSecret, currentUser?.email || 'operador@gmail.com') : '';
  const qrCodeUrl = totpUri ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=10b981&bgcolor=020617&data=${encodeURIComponent(totpUri)}` : '';

  return (
    <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 space-y-4 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-slate-900 pb-2">
        <span className="text-[10px] text-sky-400 uppercase font-black tracking-widest block font-mono">
          Autenticación de Doble Factor (MFA / 2FA)
        </span>
        {userProfile?.twoFactorEnabled ? (
          <span className="bg-emerald-950/40 border border-emerald-900 text-emerald-400 font-sans font-bold px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
            <ShieldCheck size={11} />
            ACTIVO
          </span>
        ) : (
          <span className="bg-rose-950/40 border border-rose-900 text-rose-400 font-sans font-bold px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
            <ShieldAlert size={11} />
            INACTIVO
          </span>
        )}
      </div>

      <p className="text-slate-400 font-sans leading-normal">
        Proteja su consola S.A.T. contra intrusiones. Una vez activado, se le solicitará un código de 6 dígitos autogenerado por su aplicación Google Authenticator cada vez que intente conectarse.
      </p>

      {error && (
        <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2 text-rose-300 leading-normal">
          <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2 text-emerald-300 leading-normal">
          <ShieldCheck size={14} className="text-emerald-400 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* VIEW 1: 2FA IS ACTIVE */}
      {userProfile?.twoFactorEnabled && !isDisabling && (
        <div className="bg-slate-900/20 border border-slate-850 p-4 rounded-lg space-y-4">
          <div className="flex items-center gap-2 text-emerald-400">
            <KeyRound size={14} />
            <span className="font-bold">Consola S.A.T. Vinculada Correctamente</span>
          </div>
          <p className="text-slate-500 font-sans leading-normal text-[11px]">
            La aplicación Google Authenticator en su smartphone ya está conectada para generar passcodes de un solo uso. No comparta su clave secreta.
          </p>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-900 pt-3">
            <button
              type="button"
              onClick={() => setShowBadge(!showBadge)}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-sans font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer text-xs uppercase tracking-wider"
            >
              <QrCode size={13} />
              {showBadge ? 'Ocultar Tarjeta QR' : 'Mostrar Tarjeta QR S.A.T.'}
            </button>
            <button
              type="button"
              onClick={() => { setIsDisabling(true); setError(null); setSuccess(null); }}
              className="bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900 text-rose-400 hover:text-rose-300 font-sans font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer text-xs"
            >
              <Trash2 size={13} />
              Desactivar Doble Factor
            </button>
          </div>

          {showBadge && (
            <div className="bg-slate-950 border-2 border-emerald-500/20 rounded-2xl p-4 space-y-3 max-w-sm mx-auto relative overflow-hidden shadow-2xl animate-fade-in mt-2">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full filter blur-xl pointer-events-none"></div>
              
              {/* Card Header */}
              <div className="border-b border-emerald-500/20 pb-2 flex justify-between items-start">
                <div>
                  <h3 className="font-sans font-black text-emerald-400 tracking-wider text-[11px] uppercase">R.E.M.E.R. • S.A.T.</h3>
                  <p className="text-[7.5px] text-slate-500 font-mono uppercase tracking-widest">Credencial Digital de Operador</p>
                </div>
                <span className="text-[7px] text-emerald-500/80 bg-emerald-950/40 border border-emerald-900/60 font-mono px-1.5 py-0.5 rounded uppercase font-black tracking-widest">
                  MFA SECURE
                </span>
              </div>

              {/* QR Code */}
              <div className="flex justify-center py-2">
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800/80 shadow-inner relative group">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=10b981&bgcolor=020617&data=${encodeURIComponent(
                      btoa(
                        JSON.stringify({
                          v: 'SAT-MFA-V1',
                          email: currentUser?.email || '',
                          callsign: userProfile?.callsign || 'EA7JRS',
                          dmrId: userProfile?.dmrId || '2147003',
                          secret: userProfile?.twoFactorSecret || '',
                        })
                      )
                    )}`}
                    alt="S.A.T. QR Code"
                    className="w-40 h-40 rounded bg-slate-950"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 border border-emerald-500/10 rounded-xl pointer-events-none group-hover:border-emerald-500/30 transition-all"></div>
                </div>
              </div>

              {/* Operator Details */}
              <div className="bg-slate-900/40 border border-slate-850 p-2.5 rounded-xl text-[9px] space-y-1.5 font-mono">
                <div className="flex justify-between border-b border-slate-850/60 pb-1">
                  <span className="text-slate-500 uppercase">OPERADOR:</span>
                  <span className="text-slate-200 font-bold uppercase truncate max-w-[160px]">{currentUser?.email}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850/60 pb-1">
                  <span className="text-slate-500 uppercase">INDICATIVO:</span>
                  <span className="text-emerald-400 font-black">{userProfile?.callsign || 'EA7JRS'}</span>
                </div>
                {userProfile?.dmrId && (
                  <div className="flex justify-between border-b border-slate-850/60 pb-1">
                    <span className="text-slate-500 uppercase">DMR ID (CCS7):</span>
                    <span className="text-emerald-400 font-bold">{userProfile?.dmrId}</span>
                  </div>
                )}
                <div className="flex justify-between pt-0.5">
                  <span className="text-slate-500 uppercase">SISTEMA:</span>
                  <span className="text-slate-300 font-bold">AUTENTICACIÓN INSTANTÁNEA</span>
                </div>
              </div>

              {/* Guide/Instruction */}
              <p className="text-[8px] text-slate-500 font-sans leading-normal text-center bg-slate-900/10 p-1.5 rounded border border-slate-900/50">
                Guarde este código QR. Permite iniciar sesión de manera <strong>instantánea y sin contraseña</strong> apuntando la tarjeta a la webcam en la pantalla de acceso.
              </p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 1B: DISABLING PROCESS */}
      {isDisabling && (
        <form onSubmit={handleDisable2FA} className="bg-slate-900/30 border border-slate-850 p-4 rounded-xl space-y-3.5">
          <div className="flex items-center gap-1.5 text-rose-400">
            <Trash2 size={14} />
            <span className="font-bold uppercase tracking-wider text-[10px]">Verificación de Desactivación</span>
          </div>
          <p className="text-slate-400 font-sans leading-relaxed">
            Introduzca el código actual de 6 dígitos de Google Authenticator para autorizar la desactivación segura de su 2FA.
          </p>
          <div className="space-y-1.5">
            <label className="text-[9px] text-slate-500 uppercase tracking-wider block">Código del Autenticador:</label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-rose-500/30 tracking-[0.4em] font-bold w-32 text-center"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-200 rounded-lg font-sans font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
              >
                {loading ? 'Validando...' : 'Confirmar Desactivación'}
              </button>
              <button
                type="button"
                onClick={() => { setIsDisabling(false); setError(null); }}
                className="px-3 py-2 bg-slate-900 border border-slate-800 text-slate-400 rounded-lg font-sans font-bold text-xs cursor-pointer hover:bg-slate-850"
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      )}

      {/* VIEW 2: 2FA NOT ACTIVE AND NOT CONFIGURING */}
      {!userProfile?.twoFactorEnabled && !isConfiguring && (
        <div className="pt-2">
          <button
            type="button"
            onClick={handleStartSetup}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-sans font-black px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.1)] uppercase text-xs tracking-wider"
          >
            <Smartphone size={13} />
            Activar Google Authenticator (2FA)
          </button>
        </div>
      )}

      {/* VIEW 3: WIZARD CONFIGURATION */}
      {isConfiguring && (
        <div className="bg-slate-900/30 border border-slate-850 rounded-xl p-4 space-y-4 font-mono text-xs">
          <div className="text-emerald-400 font-bold flex items-center gap-1.5 text-[10px] uppercase border-b border-slate-900 pb-2">
            <QrCode size={14} />
            Asistente de Vinculación Google Authenticator
          </div>

          <div className="space-y-4">
            {/* Step 1 */}
            <div className="space-y-2">
              <span className="text-emerald-500 font-bold block">1. Escanee el código QR:</span>
              <p className="text-slate-400 font-sans leading-normal">
                Abra su aplicación **Google Authenticator** en su smartphone, pulse el símbolo **"+"** en la esquina inferior derecha y seleccione **"Escanear código QR"**.
              </p>
              
              {qrCodeUrl && (
                <div className="flex justify-center py-4 bg-slate-950 rounded-xl border border-slate-900/80 max-w-xs mx-auto shadow-inner relative">
                  <img
                    src={qrCodeUrl}
                    alt="2FA QR Code"
                    className="w-44 h-44 border border-emerald-500/20 p-1.5 rounded-lg bg-slate-950"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 right-2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2 */}
            <div className="space-y-2 border-t border-slate-900 pt-3">
              <span className="text-emerald-500 font-bold block">2. Clave secreta manual (Opcional):</span>
              <p className="text-slate-400 font-sans leading-normal">
                Si no puede escanear el código QR, puede añadir la cuenta manualmente introduciendo esta clave secreta:
              </p>
              <div className="flex items-center gap-1 bg-slate-950 p-2.5 rounded-xl border border-slate-900 font-mono text-[11px] text-emerald-400">
                <span className="tracking-widest font-bold grow break-all select-all">{tempSecret}</span>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="p-1.5 hover:bg-slate-900 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
                  title="Copiar Clave"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Step 3 */}
            <form onSubmit={handleVerifyAndEnable} className="space-y-3 border-t border-slate-900 pt-3">
              <span className="text-emerald-500 font-bold block">3. Confirmación de Sincronización:</span>
              <p className="text-slate-400 font-sans leading-normal">
                Introduzca a continuación el código de 6 dígitos que se muestra en su aplicación Google Authenticator para validar el enlace de seguridad.
              </p>
              
              <div className="space-y-1.5">
                <label className="text-[9px] text-slate-500 uppercase tracking-wider block">Código del Autenticador:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-emerald-500/30 tracking-[0.4em] font-bold w-32 text-center"
                  />
                  
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg font-sans font-black text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
                  >
                    {loading ? 'Verificando...' : 'Verificar y Activar 2FA'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setIsConfiguring(false); setTempSecret(''); setError(null); }}
                    className="px-3 py-2 bg-slate-900 border border-slate-800 text-slate-400 rounded-lg font-sans font-bold text-xs cursor-pointer hover:bg-slate-850"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
