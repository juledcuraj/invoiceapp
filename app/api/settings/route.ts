import { NextRequest, NextResponse } from 'next/server';
import { loadSettings } from '@/lib/settings-service';

export async function GET() {
  try {
    const settings = await loadSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error loading settings:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}