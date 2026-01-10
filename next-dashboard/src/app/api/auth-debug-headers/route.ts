import { NextRequest, NextResponse } from 'next/server';

interface AuthDebugHeadersResponse {
    hasCookieHeader: boolean;
    cookieHeaderLength: number;
}

export async function GET(request: NextRequest): Promise<NextResponse<AuthDebugHeadersResponse>> {
    const cookieHeader = request.headers.get('cookie');

    return NextResponse.json({
        hasCookieHeader: !!cookieHeader,
        cookieHeaderLength: cookieHeader ? cookieHeader.length : 0,
    });
}
