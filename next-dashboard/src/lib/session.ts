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

export interface SessionPayload {
    authenticated: true;
    expires: number;
    allowedCampaigns?: string[];
}

// --- Base64URL helpers (RFC 4648) ---
// Avoid +, /, = which can cause issues in cookies
function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) {
        b64 += '=';
    }

    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

function textToBase64Url(str: string): string {
    return bytesToBase64Url(new TextEncoder().encode(str));
}

function textFromBase64Url(b64url: string): string {
    return new TextDecoder().decode(base64UrlToBytes(b64url));
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
export async function createSessionToken(allowedCampaigns: string[] = ['*']): Promise<string> {
    const key = await getCryptoKey();
    const enc = new TextEncoder();
    const payload = JSON.stringify({
        authenticated: true,
        expires: Date.now() + TOKEN_EXPIRY_MS,
        allowedCampaigns,
    });

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        enc.encode(payload)
    );

    const b64urlPayload = textToBase64Url(payload);
    const b64urlSignature = bytesToBase64Url(new Uint8Array(signature));

    return `${b64urlPayload}.${b64urlSignature}`;
}

export async function readSessionPayload(token: string): Promise<SessionPayload | null> {
    const verifyResult = await verifySessionTokenWithReason(token);
    if (!verifyResult.valid) return null;

    try {
        const [b64urlPayload] = token.split('.');
        const payload = textFromBase64Url(b64urlPayload);
        const data = JSON.parse(payload);
        if (data?.authenticated !== true || typeof data.expires !== 'number') return null;

        return {
            authenticated: true,
            expires: data.expires,
            allowedCampaigns: Array.isArray(data.allowedCampaigns)
                ? data.allowedCampaigns.map((campaign: unknown) => String(campaign || '').trim()).filter(Boolean)
                : ['*'],
        };
    } catch {
        return null;
    }
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
            payload = textFromBase64Url(b64urlPayload);
            signatureArr = base64UrlToBytes(b64urlSignature);
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
