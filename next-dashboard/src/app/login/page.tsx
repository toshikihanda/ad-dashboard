'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// WebView detection patterns (major apps)
const WEBVIEW_PATTERNS = [
    'FBAN',      // Facebook App
    'FBAV',      // Facebook App
    'Instagram', // Instagram
    'Line/',     // LINE
    'Twitter',   // X/Twitter
    'wv',        // Android WebView
];

function isWebView(userAgent: string): boolean {
    return WEBVIEW_PATTERNS.some(pattern => userAgent.includes(pattern));
}

export default function LoginPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [showWebViewWarning, setShowWebViewWarning] = useState(false);
    const [currentUrl, setCurrentUrl] = useState('');

    useEffect(() => {
        // Detect WebView on mount
        if (typeof navigator !== 'undefined' && isWebView(navigator.userAgent)) {
            setShowWebViewWarning(true);
        }
        // Get current URL for copy button
        if (typeof window !== 'undefined') {
            setCurrentUrl(window.location.href);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsPending(true);
        setError(null);

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
                credentials: 'include', // Important for cookies
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Success - redirect to dashboard
                router.push('/');
                router.refresh();
            } else {
                setError(data.error || 'ログインに失敗しました');
            }
        } catch (err) {
            setError('通信エラーが発生しました。再度お試しください。');
        } finally {
            setIsPending(false);
        }
    };

    const copyUrl = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(currentUrl);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 p-4">
            <div className="max-w-md w-full space-y-6 p-8 bg-white/95 backdrop-blur rounded-2xl shadow-2xl">
                {/* WebView Warning */}
                {showWebViewWarning && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                        <p className="text-amber-800 text-sm font-medium mb-2">
                            ⚠️ アプリ内ブラウザを検出しました
                        </p>
                        <p className="text-amber-700 text-xs mb-3">
                            ログイン情報が正しく保存されない場合があります。
                            外部ブラウザ（Safari/Chrome）で開いてください。
                        </p>
                        <button
                            onClick={copyUrl}
                            className="w-full py-2 px-3 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs rounded-lg transition-colors"
                        >
                            📋 URLをコピー
                        </button>
                    </div>
                )}

                <div>
                    <h2 className="text-center text-3xl font-extrabold text-gray-900">
                        ログイン
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        アクセスキーを入力してください
                    </p>
                </div>

                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="password" className="sr-only">
                            Password
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-base"
                            placeholder="Access Key"
                        />
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={isPending || !password}
                            className="w-full flex justify-center py-3 px-4 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isPending ? '確認中...' : 'ログイン'}
                        </button>
                    </div>
                </form>

                {/* Debug info for developers */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="text-xs text-gray-400 text-center mt-4">
                        <a href="/api/auth-debug" className="hover:underline" target="_blank">
                            [Debug: Cookie Status]
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
