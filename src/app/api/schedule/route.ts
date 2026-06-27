import { NextRequest, NextResponse } from 'next/server';

const SPREADSHEET_TOKEN = 'HgdSwkq98iYiy5kgxVUcVe08n5f';
const SHEET_ID = '5690e8';

// Account block definitions: each account has 25 rows (2 header + 24 time slots)
const ACCOUNT_BLOCKS = [
  { startRow: 0, name: 'vivo（大号）' },
  { startRow: 27, name: 'vivo官方旗舰店（抖音）' },
  { startRow: 54, name: 'vivo官方旗舰店（快手）' },
];

async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID || 'cli_aab083b6c2b99be3';
  const appSecret = process.env.FEISHU_APP_SECRET || '';
  if (!appSecret) throw new Error('FEISHU_APP_SECRET not set');

  const res = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    }
  );
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Feishu auth failed: ${data.msg}`);
  return data.tenant_access_token;
}

async function getSheetValues(token: string, range: string): Promise<string[][]> {
  const encodedRange = encodeURIComponent(`${SHEET_ID}!${range}`);
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${SPREADSHEET_TOKEN}/values/${encodedRange}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Sheet read failed: ${data.msg}`);
  return data.data?.valueRange?.values || [];
}

function excelSerialToDate(serial: number | string): { iso: string; display: string; weekday: string } {
  const num = typeof serial === 'string' ? parseFloat(serial) : serial;
  if (isNaN(num)) return { iso: '', display: String(serial), weekday: '' };
  const date = new Date((num - 25569) * 86400 * 1000);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return {
    iso: date.toISOString().split('T')[0],
    display: `${month}月${day}日`,
    weekday: `周${weekdays[date.getDay()]}`,
  };
}

function cleanCellValue(val: string | null | undefined | any[]): string {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    return val.map(seg => typeof seg === 'object' && seg?.text ? seg.text : String(seg)).join('');
  }
  return String(val).trim();
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = await getTenantAccessToken();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Read the full sheet: rows 1-80, columns A-AF (enough for 3 accounts + dates up to AF)
    const rawData = await getSheetValues(accessToken, 'A1:AF80');

    // Parse date headers from row 0
    const dateHeaders: { iso: string; display: string; weekday: string; colIndex: number }[] = [];
    const headerRow = rawData[0] || [];
    for (let col = 2; col < headerRow.length; col++) {
      const val = headerRow[col];
      if (val !== null && val !== undefined && val !== '') {
        const dateInfo = excelSerialToDate(val);
        if (dateInfo.iso) {
          dateHeaders.push({ ...dateInfo, colIndex: col });
        }
      }
    }

    // Filter dates if startDate/endDate provided
    let filteredDates = dateHeaders;
    if (startDate) {
      filteredDates = filteredDates.filter(d => d.iso >= startDate);
    }
    if (endDate) {
      filteredDates = filteredDates.filter(d => d.iso <= endDate);
    }

    // Parse each account block
    const accounts = ACCOUNT_BLOCKS.map((block) => {
      const dataRows: { timeSlot: string; schedule: { date: string; display: string; weekday: string; person: string }[] }[] = [];

      for (let i = 0; i < 24; i++) {
        const rowIndex = block.startRow + 2 + i; // +2 for 2 header rows
        const row = rawData[rowIndex] || [];
        const timeSlot = cleanCellValue(row[1]) || `${i}-${i + 1}点`;
        const schedule: { date: string; display: string; weekday: string; person: string }[] = [];

        for (const dh of filteredDates) {
          const person = cleanCellValue(row[dh.colIndex]);
          schedule.push({
            date: dh.iso,
            display: dh.display,
            weekday: dh.weekday,
            person,
          });
        }

        dataRows.push({ timeSlot, schedule });
      }

      // Calculate person summary: total hours per person
      const personHours: Record<string, number> = {};
      const personLateNightHours: Record<string, number> = {}; // 0-6点 = 凌晨班
      for (const dr of dataRows) {
        const hourIndex = dataRows.indexOf(dr);
        for (const s of dr.schedule) {
          if (s.person) {
            personHours[s.person] = (personHours[s.person] || 0) + 1;
            if (hourIndex < 6) { // 0-1到5-6点 = 凌晨
              personLateNightHours[s.person] = (personLateNightHours[s.person] || 0) + 1;
            }
          }
        }
      }

      // Person time segments: group consecutive hours per person per date
      const personTimeSegments: Record<string, { date: string; display: string; startTime: number; endTime: number; hours: number }[]> = {};
      for (const dh of filteredDates) {
        // Track segments per person for this date
        const currentSegments: Record<string, { startHour: number; endHour: number }> = {};

        for (let h = 0; h < 24; h++) {
          const rowIndex = block.startRow + 2 + h;
          const row = rawData[rowIndex] || [];
          const person = cleanCellValue(row[dh.colIndex]);

          if (person) {
            if (!currentSegments[person]) {
              currentSegments[person] = { startHour: h, endHour: h + 1 };
            } else {
              currentSegments[person].endHour = h + 1;
            }
          } else {
            // Finalize any ongoing segments
            for (const [p, seg] of Object.entries(currentSegments)) {
              if (!personTimeSegments[p]) personTimeSegments[p] = [];
              // Check if this extends an existing segment for same date
              const existing = personTimeSegments[p].filter(s => s.date === dh.iso);
              const lastSeg = existing[existing.length - 1];
              if (lastSeg && lastSeg.endTime === seg.startHour) {
                lastSeg.endTime = seg.endHour;
                lastSeg.hours = lastSeg.endTime - lastSeg.startTime;
              } else {
                personTimeSegments[p].push({
                  date: dh.iso,
                  display: dh.display,
                  startTime: seg.startHour,
                  endTime: seg.endHour,
                  hours: seg.endHour - seg.startHour,
                });
              }
            }
            // Clear current segments since gap found
            for (const p of Object.keys(currentSegments)) {
              delete currentSegments[p];
            }
          }
        }

        // Finalize remaining segments at end of day
        for (const [p, seg] of Object.entries(currentSegments)) {
          if (!personTimeSegments[p]) personTimeSegments[p] = [];
          const existing = personTimeSegments[p].filter(s => s.date === dh.iso);
          const lastSeg = existing[existing.length - 1];
          if (lastSeg && lastSeg.endTime === seg.startHour) {
            lastSeg.endTime = seg.endHour;
            lastSeg.hours = lastSeg.endTime - lastSeg.startTime;
          } else {
            personTimeSegments[p].push({
              date: dh.iso,
              display: dh.display,
              startTime: seg.startHour,
              endTime: seg.endHour,
              hours: seg.endHour - seg.startHour,
            });
          }
        }
      }

      // Format person summary
      const personSummary = Object.entries(personHours)
        .map(([name, totalHours]) => ({
          name,
          totalHours,
          lateNightHours: personLateNightHours[name] || 0,
          segments: (personTimeSegments[name] || []).map(s => ({
            date: s.date,
            display: s.display,
            timeRange: `${s.startTime}-${s.endTime}点`,
            hours: s.hours,
          })),
        }))
        .sort((a, b) => b.totalHours - a.totalHours);

      return {
        accountName: block.name,
        dateRange: filteredDates.map(d => ({ iso: d.iso, display: d.display, weekday: d.weekday })),
        timeSlots: dataRows.map(dr => dr.timeSlot),
        scheduleData: dataRows.map(dr => dr.schedule.map(s => s.person)),
        personSummary,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        accounts,
        dateCount: filteredDates.length,
        dateRange: filteredDates.map(d => ({ iso: d.iso, display: d.display, weekday: d.weekday })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
