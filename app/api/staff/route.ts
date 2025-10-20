import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRosterAccess, extractEntityPlatformId } from '@/lib/subscription'
import { z } from 'zod'

// Validation schema for staff creation
const createStaffSchema = z.object({
  entity_platform_id: z.string().uuid(),
  user_platform_id: z.string(),
  employee_id: z.string().optional(),
  full_name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role_type: z.string().min(1).max(100),
  job_title: z.string().optional(),
  slot_duration_minutes: z.number().int().min(5).max(480).default(15),
  can_take_appointments: z.boolean().default(true),
  hire_date: z.string().datetime().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entity_id')
    const activeOnly = searchParams.get('active_only') !== 'false'
    const roleType = searchParams.get('role_type')

    if (!entityId) {
      return NextResponse.json(
        { error: 'entity_id parameter is required' },
        { status: 400 }
      )
    }

    // Check subscription access
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

    let query = supabaseAdmin
      .from('staff_members')
      .select('*')
      .eq('entity_platform_id', entityId)

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (roleType) {
      query = query.eq('role_type', roleType)
    }

    query = query.order('full_name', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Staff fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch staff members' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      staff: data,
      subscription: accessCheck.subscription 
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = createStaffSchema.parse(body)

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

    const { data, error } = await supabaseAdmin
      .from('staff_members')
      .insert([validatedData])
      .select()
      .single()

    if (error) {
      console.error('Staff creation error:', error)
      return NextResponse.json(
        { error: 'Failed to create staff member' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      staff: data,
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