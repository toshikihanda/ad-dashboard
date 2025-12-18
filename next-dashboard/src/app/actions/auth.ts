'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
    const password = formData.get('password');
    const envPassword = process.env.LOGIN_KEY;

    if (password === envPassword) {
        // Set cookie valid for 7 days
        const cookieStore = await cookies();
        cookieStore.set('auth_session', 'true', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7, // 1 week
            path: '/',
        });
        redirect('/');
    }

    return { error: 'パスワードが間違っています' };
}
