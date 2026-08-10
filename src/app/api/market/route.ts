import { NextResponse } from 'next/server';
import marketData from '@/lib/market-data.json';

export async function GET() {
  try {
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
