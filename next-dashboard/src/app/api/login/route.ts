import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, getSessionCookieOptions } from '@/lib/session';
import { resolveCampaignAccessFromSheet } from '@/lib/accessControl';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { password } = body;
        const access = typeof password === 'string' ? await resolveCampaignAccessFromSheet(password) : null;

        // Validate
        if (!access) {
            return NextResponse.json(
                { success: false, error: 'パスワードが間違っています' },
                { status: 401 }
            );
        }

        // Create signed token
        const token = await createSessionToken(access.allowedCampaigns);
        const cookieOptions = getSessionCookieOptions();

        // Log (no sensitive values)
        console.log('[/api/login] Set-Cookie will be attached with options:', {
            httpOnly: cookieOptions.httpOnly,
            secure: cookieOptions.secure,
            sameSite: cookieOptions.sameSite,
            maxAge: cookieOptions.maxAge,
            path: cookieOptions.path,
        });

        // Create response with explicit Set-Cookie
        const response = NextResponse.json(
            { success: true, message: 'ログイン成功' },
            { status: 200 }
        );

        // Set cookie on response
        response.cookies.set('auth_session', token, cookieOptions);

        return response;

    } catch (error) {
        console.error('[/api/login] Error occurred', error);
        return NextResponse.json(
            { success: false, error: 'ログインに失敗しました' },
            { status: 500 }
        );
    }
}
