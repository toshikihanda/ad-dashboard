import { NextRequest, NextResponse } from 'next/server';
import { getReportByToken, updateClientToken } from '@/lib/reportStore';

export async function POST(req: NextRequest) {
    try {
        const { adminToken } = await req.json();

        if (!adminToken) {
            return NextResponse.json({ error: '管理者トークンが必要です' }, { status: 400 });
        }

        // 1. 管理者トークンでレポートを検索
        const result = await getReportByToken(adminToken);

        if (!result) {
            return NextResponse.json({ error: 'レポートが見つかりません' }, { status: 404 });
        }

        if (!result.isAdmin) {
            return NextResponse.json({ error: '管理者トークンではありません' }, { status: 403 });
        }

        // 2. 既にクライアントトークンがある場合はそれを返す
        if (result.entry.clientToken) {
            return NextResponse.json({
                success: true,
                clientUrl: `/report/${result.entry.clientToken}`,
                isExisting: true
            });
        }

        // 3. 新しいクライアントトークンを生成
        const clientToken = 'c' + Math.random().toString(36).substring(2, 9) + Math.random().toString(36).substring(2, 9);

        // 4. Report_Listを更新
        const updated = await updateClientToken(adminToken, clientToken);

        if (!updated) {
            return NextResponse.json({ error: 'クライアントトークンの保存に失敗しました' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            clientUrl: `/report/${clientToken}`,
            isExisting: false
        });

    } catch (error: any) {
        console.error('Client URL generation error:', error);
        return NextResponse.json(
            { error: error.message || 'Unknown error' },
            { status: 500 }
        );
    }
}
