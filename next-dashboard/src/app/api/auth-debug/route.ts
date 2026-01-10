import { NextRequest, NextResponse } from 'next/server';
import { verifySessionTokenWithReason, VerifyFailReason } from '@/lib/session';

interface AuthDebugResponse {
    hasCookie: boolean;
    verifyOk: boolean;
    reason: VerifyFailReason | 'no_cookie' | 'ok';
}

export async function GET(request: NextRequest): Promise<NextResponse<AuthDebugResponse>> {
    const authSession = request.cookies.get('auth_session')?.value;

    // No cookie present
    if (!authSession) {
        return NextResponse.json({
            hasCookie: false,
            verifyOk: false,
            reason: 'no_cookie'
        });
    }

    // Verify the token
    const result = await verifySessionTokenWithReason(authSession);

    return NextResponse.json({
        hasCookie: true,
        verifyOk: result.valid,
        reason: result.valid ? 'ok' : (result.reason || 'unknown')
    });
}
