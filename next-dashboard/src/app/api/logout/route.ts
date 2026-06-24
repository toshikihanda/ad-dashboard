import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookieOptions } from '@/lib/session';

function clearAuthSession(response: NextResponse) {
    response.cookies.set('auth_session', '', {
        ...getSessionCookieOptions(),
        maxAge: 0,
    });
}

export async function POST() {
    const response = NextResponse.json({ success: true }, { status: 200 });
    clearAuthSession(response);
    return response;
}

export async function GET(request: NextRequest) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    clearAuthSession(response);
    return response;
}
