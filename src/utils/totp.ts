import * as OTPAuth from 'otpauth';

/**
 * Generates a random Base32 secret key (16 characters, standard for Google Authenticator).
 */
export function generateBase32Secret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  // Generate a random 16-character base32 secret
  const array = new Uint32Array(16);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 16; i++) {
      array[i] = Math.floor(Math.random() * 4294967296);
    }
  }
  
  for (let i = 0; i < 16; i++) {
    secret += chars.charAt(array[i] % chars.length);
  }
  return secret;
}

/**
 * Builds the otpauth standard URI for QR code generation.
 */
export function getTotpUri(secret: string, email: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: 'S.A.T. Console',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secret, // secret must be a base32 string
  });
  return totp.toString();
}

/**
 * Verifies a TOTP token against a base32 secret key.
 * Allows a window of 1 to tolerate minor client-server time differences.
 */
export function verifyTotpToken(secret: string, token: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'S.A.T. Console',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });
    
    const cleanToken = token.trim().replace(/\s/g, '');
    const delta = totp.validate({
      token: cleanToken,
      window: 2, // Allow up to 2 periods of time drift (60 seconds back and forth)
    });
    
    return delta !== null;
  } catch (error) {
    console.error('Error verifying TOTP token:', error);
    return false;
  }
}
