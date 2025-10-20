import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRosterAccess } from '@/lib/subscription'
import { z } from 'zod'

// Validation schema for booking creation
const createBookingSchema = z.object({
  entity_platform_id: z.string().uuid(),
  staff_member_id: z.string().uuid(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  booking_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  booking_end_time: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be in HH:MM format'),
  duration_minutes: z.number().int().min(5).max(480),
  external_booking_id: z.string().min(1),
  source_service: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = createBookingSchema.parse(body)

    // Check subscription access
    const accessCheck = await validateRosterAccess(validatedData.entity_platform_id)
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { 
          error: 'Access denied to roster module',
          reason: accessCheck.error,
          subscription: accessCheck.subscription 
        },
        { status: 403 }
      )
    }

    // Validate staff exists and belongs to entity
    const { data: staff, error: staffError } = await supabaseAdmin
      .from('staff_members')
      .select('*')
      .eq('id', validatedData.staff_member_id)
      .eq('entity_platform_id', validatedData.entity_platform_id)
      .eq('is_active', true)
      .single()

    if (staffError || !staff) {
      return NextResponse.json(
        { error: 'Staff member not found or inactive' },
        { status: 404 }
      )
    }

    // Check for existing booking with same external_booking_id
    const { data: existingBooking } = await supabaseAdmin
      .from('external_bookings')
      .select('id')
      .eq('external_booking_id', validatedData.external_booking_id)
      .single()

    if (existingBooking) {
      return NextResponse.json(
        { error: 'Booking with this external ID already exists' },
        { status: 409 }
      )
    }

    // Check for time conflicts
    const { data: conflicts } = await supabaseAdmin
      .from('external_bookings')
      .select('*')
      .eq('staff_member_id', validatedData.staff_member_id)
      .eq('booking_date', validatedData.booking_date)
      .eq('status', 'active')

    if (conflicts && conflicts.length > 0) {
      const hasConflict = conflicts.some(booking => {
        const existingStart = parseTime(booking.booking_time)
        const existingEnd = parseTime(booking.booking_end_time)
        const newStart = parseTime(validatedData.booking_time)
        const newEnd = parseTime(validatedData.booking_end_time)

        return newStart < existingEnd && newEnd > existingStart
      })

      if (hasConflict) {
        return NextResponse.json(
          { error: 'Time slot conflicts with existing booking' },
          { status: 409 }
        )
      }
    }

    // Create the booking
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('external_bookings')
      .insert([{
        ...validatedData,
        status: 'active'
      }])
      .select()
      .single()

    if (bookingError) {
      console.error('Booking creation error:', bookingError)
      return NextResponse.json(
        { error: 'Failed to create booking' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      booking,
      subscription: accessCheck.subscription 
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to parse time string (HH:MM) to minutes since midnight
function parseTime(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number)
  return hours * 60 + minutes
}