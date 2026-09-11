import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import marketData from '@/lib/market-data.json';
import { maskExternalBusiness } from '@/lib/api-permission';

export async function GET(request: NextRequest) {
  try {
    const externalMask = maskExternalBusiness(request);
    if (externalMask) return externalMask;
    return NextResponse.json({
      success: true,
      data: marketData,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to load market data' },
      { status: 500 }
    );
  }
}
