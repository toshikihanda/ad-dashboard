import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readSessionPayload, verifySessionToken } from '@/lib/session';

const ADMIN_ONLY_PATHS = [
    '/api/ai-analysis',
    '/api/chat',
    '/api/debug-',
    '/api/knowledge-candidates',
    '/api/revalidate',
];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // レポートページは認証不要
    if (pathname.startsWith('/report/')) {
        return NextResponse.next();
    }

    // TEMPORARY: Skip auth for UI testing
    const skipAuth = process.env.SKIP_AUTH === 'true';
    if (skipAuth) {
        return NextResponse.next();
    }

    const authSession = request.cookies.get('auth_session')?.value;

    // Login page access control
    if (pathname === '/login') {
        if (authSession && await verifySessionToken(authSession)) {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return NextResponse.next();
    }

    // Auth check for all other routes
    const isValid = authSession ? await verifySessionToken(authSession) : false;

    if (!isValid) {
        // API requests should return 401 instead of redirect
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (ADMIN_ONLY_PATHS.some(prefix => pathname.startsWith(prefix))) {
        const access = authSession ? await readSessionPayload(authSession) : null;
        const isAdmin = Boolean(
            access?.canViewFinancials &&
            access.allowedCampaigns?.includes('*')
        );
        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
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
         * - api/logout (logout endpoint)
         * - api/auth-debug (auth debugging endpoint)
         * - api/auth-debug-headers (auth header debugging)
         */
        '/((?!_next/static|_next/image|favicon.ico|api/login|api/logout|api/auth-debug|api/auth-debug-headers).*)',
    ],
};
