// Session Token Utility Library

// --- Session Token Configuration ---
const SECRET_KEY = process.env.LOGIN_KEY || 'default-secret-key-change-me';
const TOKEN_EXPIRY_MS = 60 * 60 * 24 * 7 * 1000; // 7 days

// --- Failure Reasons (safe to expose) ---
export type VerifyFailReason =
    | 'no_cookie'
    | 'invalid_format'
    | 'bad_signature'
    | 'expired'
    | 'no_secret'
    | 'unknown';

export interface VerifyResult {
    valid: boolean;
    reason?: VerifyFailReason;
}

// --- Base64URL helpers (RFC 4648) ---
// Avoid +, /, = which can cause issues in cookies
function toBase64Url(str: string): string {
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) {
        b64 += '=';
    }
    return atob(b64);
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
    return toBase64Url(String.fromCharCode(...arr));
}

function base64UrlToUint8Array(b64url: string): Uint8Array {
    const str = fromBase64Url(b64url);
    return new Uint8Array(str.split('').map(c => c.charCodeAt(0)));
}

// --- Crypto Key Helper ---
async function getCryptoKey() {
    const enc = new TextEncoder();
    return crypto.subtle.importKey(
        'raw',
        enc.encode(SECRET_KEY),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

// --- Token Creation (base64url encoded) ---
export async function createSessionToken(): Promise<string> {
    const key = await getCryptoKey();
    const enc = new TextEncoder();
    const payload = JSON.stringify({
        authenticated: true,
        expires: Date.now() + TOKEN_EXPIRY_MS
    });

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        enc.encode(payload)
    );

    const b64urlPayload = toBase64Url(payload);
    const b64urlSignature = uint8ArrayToBase64Url(new Uint8Array(signature));

    return `${b64urlPayload}.${b64urlSignature}`;
}

// --- Token Verification with Detailed Reason ---
export async function verifySessionTokenWithReason(token: string): Promise<VerifyResult> {
    if (!process.env.LOGIN_KEY) {
        return { valid: false, reason: 'no_secret' };
    }

    try {
        const parts = token.split('.');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            return { valid: false, reason: 'invalid_format' };
        }

        const [b64urlPayload, b64urlSignature] = parts;

        let payload: string;
        let signatureArr: Uint8Array;
        try {
            payload = fromBase64Url(b64urlPayload);
            signatureArr = base64UrlToUint8Array(b64urlSignature);
        } catch (e) {
            return { valid: false, reason: 'invalid_format' };
        }

        const key = await getCryptoKey();
        const enc = new TextEncoder();
        const isValid = await crypto.subtle.verify(
            'HMAC',
            key,
            signatureArr.buffer as ArrayBuffer,
            enc.encode(payload)
        );

        if (!isValid) {
            return { valid: false, reason: 'bad_signature' };
        }

        let data: { authenticated?: boolean; expires?: number };
        try {
            data = JSON.parse(payload);
        } catch (e) {
            return { valid: false, reason: 'invalid_format' };
        }

        if (typeof data.expires !== 'number' || data.expires < Date.now()) {
            return { valid: false, reason: 'expired' };
        }

        if (data.authenticated !== true) {
            return { valid: false, reason: 'invalid_format' };
        }

        return { valid: true };

    } catch (e) {
        return { valid: false, reason: 'unknown' };
    }
}

// --- Simple boolean verify (backward compatible) ---
export async function verifySessionToken(token: string): Promise<boolean> {
    const result = await verifySessionTokenWithReason(token);
    return result.valid;
}

// --- Cookie Options Helper ---
// Rules:
// - dev (http): secure=false, sameSite='lax'
// - prod (https): secure=true, sameSite='lax'
// - If COOKIE_SAMESITE=none is set AND it's https: sameSite='none', secure=true (required by browsers)
export function getSessionCookieOptions(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'none' | 'strict';
    maxAge: number;
    path: string;
} {
    const isProduction = process.env.NODE_ENV === 'production';

    // Default sameSite is 'lax' (safest for most cases)
    let sameSite: 'lax' | 'none' | 'strict' = 'lax';

    // Only use 'none' if explicitly set AND we can enforce secure
    const envSameSite = process.env.COOKIE_SAMESITE;
    if (envSameSite === 'none') {
        sameSite = 'none';
    }

    // Secure: 
    // - In production: always true
    // - In dev: false by default (http://localhost), unless COOKIE_SECURE=true
    // - If sameSite='none': must be true (browser requirement)
    let secure = isProduction;
    if (process.env.COOKIE_SECURE === 'true') {
        secure = true;
    }
    if (process.env.COOKIE_SECURE === 'false') {
        secure = false;
    }

    // CRITICAL: sameSite='none' requires secure=true, otherwise browsers reject
    if (sameSite === 'none') {
        secure = true;
    }

    return {
        httpOnly: true,
        secure,
        sameSite,
        maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
        path: '/',
    };
}
