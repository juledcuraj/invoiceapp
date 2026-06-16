import { NextRequest, NextResponse } from 'next/server';
import { parseBMDCSV } from '@/lib/bmd-parser';
import { MultiSourceReservationParser } from '@/lib/multi-source-reservation-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const bmdFile = formData.get('bmdFile') as File;

    if (!bmdFile) {
      return NextResponse.json({ error: 'BMD file is required' }, { status: 400 });
    }

    const bmdContent = await bmdFile.text();
    const bmdParseResult = parseBMDCSV(bmdContent);

    if (bmdParseResult.invoices.length === 0) {
      return NextResponse.json(
        {
          error: 'BMD parsing failed',
          details: bmdParseResult.errors,
        },
        { status: 400 }
      );
    }

    let selectedMonths: string[] = [];
    const selectedMonthsRaw = formData.get('selectedMonths') as string;
    if (selectedMonthsRaw) {
      try {
        selectedMonths = JSON.parse(selectedMonthsRaw);
      } catch {
        selectedMonths = [];
      }
    }

    const filteredBMDInvoices = selectedMonths.length > 0
      ? bmdParseResult.invoices.filter(inv => selectedMonths.includes(inv.documentDate.substring(0, 7)))
      : bmdParseResult.invoices;

    const totalFiles = parseInt((formData.get('totalReservationFiles') as string) || '0', 10);
    const reservationFiles: Array<{ file: File; source: string; filename: string }> = [];

    for (let i = 0; i < totalFiles; i++) {
      const file = formData.get(`reservationFile_${i}`) as File;
      const source = (formData.get(`source_${i}`) as string) || 'BOOKING_COM';

      if (file && file.size > 0) {
        reservationFiles.push({
          file,
          source,
          filename: file.name,
        });
      }
    }

    let reservationCards: Array<{
      reservationNumber: string;
      guestName: string;
      amount: number;
      checkIn: string;
      checkOut: string;
      source: string;
    }> = [];
    let reservationWarnings: string[] = [];

    if (reservationFiles.length > 0) {
      const parser = new MultiSourceReservationParser();
      const fileContents = await Promise.all(
        reservationFiles.map(async (item) => ({
          content: await item.file.text(),
          filename: item.filename,
          source: item.source,
        }))
      );

      const { reservations, errors } = await parser.parseAllSources(fileContents);
      reservationWarnings = errors;

      reservationCards = reservations.map((r) => ({
        reservationNumber: r.reservationNumber,
        guestName: r.bookerName,
        amount: r.totalPayment,
        checkIn: r.arrival,
        checkOut: r.departure,
        source: r.source,
      }));
    }

    const bmdCards = filteredBMDInvoices.map((inv) => ({
      belegnr: inv.belegnr,
      guestName: inv.guestName,
      grossAmount: inv.grossAmount,
      platform: inv.platform,
      propertyCode: inv.propertyCode,
      documentDate: inv.documentDate,
      rawText: inv.rawText,
      reservationNumber: inv.reservationNumber,
    }));

    return NextResponse.json({
      success: true,
      bmdCards,
      reservationCards,
      stats: {
        bmdFound: bmdParseResult.invoices.length,
        bmdAfterMonthFilter: bmdCards.length,
        reservationsFound: reservationCards.length,
      },
      errors: bmdParseResult.errors,
      warnings: [...bmdParseResult.warnings, ...reservationWarnings],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load card matching data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
