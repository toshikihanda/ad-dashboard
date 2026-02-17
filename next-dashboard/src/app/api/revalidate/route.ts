import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

export async function POST() {
    try {
        // Revalidate the entire app layout to clear all cached data including fetch cache
        revalidatePath('/', 'layout');

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
