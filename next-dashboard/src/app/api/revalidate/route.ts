import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        // Revalidate the home page to fetch fresh data from Google Sheets
        revalidatePath('/');

        return NextResponse.json({
            success: true,
            message: 'データを更新しました',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Refresh task failed');
        return NextResponse.json(
            { success: false, message: 'データ更新に失敗しました' },
            { status: 500 }
        );
    }
}
