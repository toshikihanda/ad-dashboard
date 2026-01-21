import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/session';

export async function middleware(request: NextRequest) {
    // TEMPORARY: Skip auth for UI testing
    const skipAuth = process.env.SKIP_AUTH === 'true';
    if (skipAuth) {
        return NextResponse.next();
    }

    const authSession = request.cookies.get('auth_session')?.value;

    // Login page access control
    if (request.nextUrl.pathname === '/login') {
        if (authSession && await verifySessionToken(authSession)) {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return NextResponse.next();
    }

    // Auth check for all other routes
    const isValid = authSession ? await verifySessionToken(authSession) : false;

    if (!isValid) {
        // API requests should return 401 instead of redirect
        if (request.nextUrl.pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - api/login (login endpoint)
         * - api/auth-debug (auth debugging endpoint)
         * - api/auth-debug-headers (auth header debugging)
         */
        '/((?!_next/static|_next/image|favicon.ico|api/login|api/auth-debug|api/auth-debug-headers|api/debug-urara).*)',
    ],
};
