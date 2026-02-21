import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    {
      error: 'EXCHANGE_DISABLED',
      code: 'EXCHANGE_DISABLED',
      message: '냥 환전 기능은 종료되었습니다. 주식은 포인트로 바로 거래해 주세요.',
    },
    { status: 410 },
  );
}
