import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'ff-roster',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    description: 'Furfield Rostering & Scheduling Microservice'
  })
}