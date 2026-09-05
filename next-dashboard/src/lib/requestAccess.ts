import type { NextRequest } from 'next/server';
import { readSessionPayload } from './session';

export interface RequestAccess {
    allowedCampaigns: string[];
    canViewFinancials: boolean;
}

export async function readRequestAccess(request: NextRequest): Promise<RequestAccess | null> {
    const token = request.cookies.get('auth_session')?.value;
    if (!token) return null;

    const payload = await readSessionPayload(token);
    if (!payload) return null;

    return {
        allowedCampaigns: payload.allowedCampaigns || ['*'],
        canViewFinancials: payload.canViewFinancials,
    };
}

export function isAdminAccess(access: RequestAccess | null): boolean {
    return Boolean(
        access?.canViewFinancials &&
        access.allowedCampaigns.includes('*')
    );
}
