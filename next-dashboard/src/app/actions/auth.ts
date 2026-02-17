'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionToken, getSessionCookieOptions } from '@/lib/session';

interface AuthState {
    error?: string;
}

export async function login(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
    const password = formData.get('password');
    const envPassword = process.env.LOGIN_KEY;

    if (password === envPassword) {
        // Create signed token
        const token = await createSessionToken();

        // Set cookie with configurable options
        const cookieStore = await cookies();
        cookieStore.set('auth_session', token, getSessionCookieOptions());
        redirect('/');
    }

    return { error: 'パスワードが間違っています' };
}
