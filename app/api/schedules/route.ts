import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRosterAccess } from '@/lib/subscription'
import { z } from 'zod'

// Validation schema for schedule creation
const createScheduleSchema = z.object({
  entity_platform_id: z.string().uuid(),
  staff_member_id: z.string().uuid(), // References staff from HR module
  day_of_week: z.number().int().min(0).max(6), // 0 = Sunday, 6 = Saturday
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  is_available: z.boolean().default(true),
  effective_from: z.string().datetime(),
  effective_until: z.string().datetime().optional(),
  slot_duration_minutes: z.number().int().min(5).max(480).default(15),
})

const updateScheduleSchema = createScheduleSchema.partial().omit({
  entity_platform_id: true,
  staff_member_id: true,
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entity_id')
    const staffMemberId = searchParams.get('staff_member_id')
    const dayOfWeek = searchParams.get('day_of_week')
    const effectiveDate = searchParams.get('effective_date') || new Date().toISOString().split('T')[0]

    if (!entityId) {
      return NextResponse.json(
        { error: 'entity_id parameter is required' },
        { status: 400 }
      )
    }

    // Check subscription access to roster module
    const accessCheck = await validateRosterAccess(entityId)
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

    // Build query for weekly schedules
    let query = supabaseAdmin
      .from('weekly_schedules')
      .select(`
        *,
        staff_member:staff_members!inner(
          id,
          entity_platform_id,
          employee_id,
          full_name,
          role_type,
          can_take_appointments
        )
      `)
      .eq('staff_member.entity_platform_id', entityId)
      .eq('is_active', true)
      .lte('effective_from', effectiveDate)
      .or(`effective_until.is.null,effective_until.gte.${effectiveDate}`)

    // Apply filters
    if (staffMemberId) {
      query = query.eq('staff_member_id', staffMemberId)
    }

    if (dayOfWeek !== null) {
      query = query.eq('day_of_week', parseInt(dayOfWeek))
    }

    const { data: schedules, error } = await query.order('day_of_week').order('start_time')

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch schedules' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: schedules,
      count: schedules.length,
      effective_date: effectiveDate
    })

  } catch (error) {
    console.error('Schedules GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    const validatedData = createScheduleSchema.parse(body)

    // Check subscription access
    const accessCheck = await validateRosterAccess(validatedData.entity_platform_id)
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { 
          error: 'Access denied to roster module',
          reason: accessCheck.error 
        },
        { status: 403 }
      )
    }

    // Verify staff member exists and belongs to this entity
    const { data: staffMember, error: staffError } = await supabaseAdmin
      .from('staff_members')
      .select('id, entity_platform_id')
      .eq('id', validatedData.staff_member_id)
      .eq('entity_platform_id', validatedData.entity_platform_id)
      .eq('is_active', true)
      .single()

    if (staffError || !staffMember) {
      return NextResponse.json(
        { error: 'Staff member not found or does not belong to this entity' },
        { status: 404 }
      )
    }

    // Validate time range
    if (validatedData.start_time >= validatedData.end_time) {
      return NextResponse.json(
        { error: 'Start time must be before end time' },
        { status: 400 }
      )
    }

    // Check for overlapping schedules
    const { data: existingSchedules, error: overlapError } = await supabaseAdmin
      .from('weekly_schedules')
      .select('id')
      .eq('staff_member_id', validatedData.staff_member_id)
      .eq('day_of_week', validatedData.day_of_week)
      .eq('is_active', true)
      .lte('effective_from', validatedData.effective_from)
      .or(`effective_until.is.null,effective_until.gte.${validatedData.effective_from}`)

    if (overlapError) {
      console.error('Overlap check error:', overlapError)
      return NextResponse.json(
        { error: 'Failed to check for schedule conflicts' },
        { status: 500 }
      )
    }

    if (existingSchedules && existingSchedules.length > 0) {
      return NextResponse.json(
        { error: 'Schedule conflict: A schedule already exists for this staff member on this day' },
        { status: 409 }
      )
    }

    // Create the schedule
    const { data: newSchedule, error: createError } = await supabaseAdmin
      .from('weekly_schedules')
      .insert([validatedData])
      .select(`
        *,
        staff_member:staff_members(
          id,
          employee_id,
          full_name,
          role_type
        )
      `)
      .single()

    if (createError) {
      console.error('Schedule creation error:', createError)
      return NextResponse.json(
        { error: 'Failed to create schedule' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Schedule created successfully',
      data: newSchedule
    }, { status: 201 })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        },
        { status: 400 }
      )
    }

    console.error('Schedules POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}