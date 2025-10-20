import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRosterAccess } from '@/lib/subscription'
import { z } from 'zod'

// Validation schema for slot queries
const getAvailableSlotsSchema = z.object({
  entity_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  staff_id: z.string().uuid().optional(),
  duration: z.coerce.number().int().min(5).max(480).default(15),
  role_type: z.string().optional()
})

interface TimeSlot {
  start_time: string
  end_time: string
  is_available: boolean
  staff_id: string
  staff_name: string
  staff_role: string
  unavailable_reason?: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryParams = {
      entity_id: searchParams.get('entity_id'),
      date: searchParams.get('date'),
      staff_id: searchParams.get('staff_id'),
      duration: searchParams.get('duration'),
      role_type: searchParams.get('role_type')
    }

    const validatedQuery = getAvailableSlotsSchema.parse(queryParams)

    // Check subscription access
    const accessCheck = await validateRosterAccess(validatedQuery.entity_id)
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

    // Get staff members based on filters
    let staffQuery = supabaseAdmin
      .from('staff_members')
      .select('*')
      .eq('entity_platform_id', validatedQuery.entity_id)
      .eq('is_active', true)
      .eq('can_take_appointments', true)

    if (validatedQuery.staff_id) {
      staffQuery = staffQuery.eq('id', validatedQuery.staff_id)
    }

    if (validatedQuery.role_type) {
      staffQuery = staffQuery.eq('role_type', validatedQuery.role_type)
    }

    const { data: staff, error: staffError } = await staffQuery

    if (staffError) {
      console.error('Staff fetch error:', staffError)
      return NextResponse.json(
        { error: 'Failed to fetch staff members' },
        { status: 500 }
      )
    }

    if (!staff || staff.length === 0) {
      return NextResponse.json({
        date: validatedQuery.date,
        duration: validatedQuery.duration,
        slots: [],
        subscription: accessCheck.subscription
      })
    }

    // Generate time slots for each staff member
    const allSlots: TimeSlot[] = []

    for (const staffMember of staff) {
      const slots = await generateSlotsForStaff(
        staffMember,
        validatedQuery.date,
        validatedQuery.duration
      )
      allSlots.push(...slots)
    }

    // Sort slots by time
    allSlots.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    return NextResponse.json({
      date: validatedQuery.date,
      duration: validatedQuery.duration,
      slots: allSlots,
      subscription: accessCheck.subscription
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.issues },
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

async function generateSlotsForStaff(
  staff: any,
  date: string,
  duration: number
): Promise<TimeSlot[]> {
  const dayOfWeek = new Date(date).getDay()
  
  // Get staff schedule for the day
  const { data: schedules } = await supabaseAdmin
    .from('weekly_schedules')
    .select('*')
    .eq('staff_member_id', staff.id)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .lte('effective_from', new Date(date).toISOString())
    .or(`effective_until.is.null,effective_until.gte.${new Date(date).toISOString()}`)

  if (!schedules || schedules.length === 0) {
    return [{
      start_time: `${date}T09:00:00Z`,
      end_time: `${date}T09:${duration.toString().padStart(2, '0')}:00Z`,
      is_available: false,
      staff_id: staff.id,
      staff_name: staff.full_name,
      staff_role: staff.role_type,
      unavailable_reason: 'No schedule defined'
    }]
  }

  const schedule = schedules[0] // Use the most recent schedule

  // Check for schedule exceptions
  const { data: exceptions } = await supabaseAdmin
    .from('schedule_exceptions')
    .select('*')
    .eq('staff_member_id', staff.id)
    .eq('exception_date', date)

  // If staff is unavailable on this date
  if (exceptions?.some(e => e.exception_type === 'unavailable' || e.exception_type === 'holiday' || e.exception_type === 'sick_leave')) {
    return [{
      start_time: `${date}T${schedule.start_time}:00Z`,
      end_time: `${date}T${schedule.end_time}:00Z`,
      is_available: false,
      staff_id: staff.id,
      staff_name: staff.full_name,
      staff_role: staff.role_type,
      unavailable_reason: 'Staff unavailable'
    }]
  }

  // Get existing bookings for this date
  const { data: bookings } = await supabaseAdmin
    .from('external_bookings')
    .select('*')
    .eq('staff_member_id', staff.id)
    .eq('booking_date', date)
    .eq('status', 'active')

  // Generate time slots
  const slots: TimeSlot[] = []
  const startTime = parseTime(schedule.start_time)
  const endTime = parseTime(schedule.end_time)
  
  let currentTime = startTime

  while (currentTime + duration <= endTime) {
    const slotStart = currentTime
    const slotEnd = currentTime + duration

    // Check if slot overlaps with any booking
    const isBooked = bookings?.some(booking => {
      const bookingStart = parseTime(booking.booking_time)
      const bookingEnd = parseTime(booking.booking_end_time)
      return slotStart < bookingEnd && slotEnd > bookingStart
    }) || false

    slots.push({
      start_time: `${date}T${formatTime(slotStart)}:00Z`,
      end_time: `${date}T${formatTime(slotEnd)}:00Z`,
      is_available: !isBooked,
      staff_id: staff.id,
      staff_name: staff.full_name,
      staff_role: staff.role_type,
      unavailable_reason: isBooked ? 'Already booked' : undefined
    })

    currentTime += duration
  }

  return slots
}

// Helper function to parse time string (HH:MM) to minutes since midnight
function parseTime(timeString: string): number {
  const [hours, minutes] = timeString.split(':').map(Number)
  return hours * 60 + minutes
}

// Helper function to format minutes since midnight to HH:MM
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}