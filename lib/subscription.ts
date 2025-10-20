import { supabaseAdmin } from './supabase'

export interface SubscriptionCheck {
  hasAccess: boolean
  reason?: string
  subscriptionDetails?: {
    hospital_id: string
    hospital_name: string
    subscription_status: string
    modules: string[]
  }
}

/**
 * Check if a hospital entity has an active subscription to the roster module
 * @param entityPlatformId - The entity/hospital platform ID
 * @returns Promise<SubscriptionCheck>
 */
export async function checkRosterSubscription(entityPlatformId: string): Promise<SubscriptionCheck> {
  try {
    // First, get the hospital details from hospital_master
    const { data: hospital, error: hospitalError } = await supabaseAdmin
      .from('hospital_master')
      .select(`
        id,
        hospital_name,
        subscription_status,
        subscription_start_date,
        subscription_end_date,
        entity_platform_id
      `)
      .eq('entity_platform_id', entityPlatformId)
      .eq('is_active', true)
      .single()

    if (hospitalError || !hospital) {
      return {
        hasAccess: false,
        reason: 'Hospital not found or inactive'
      }
    }

    // Check if the hospital has an active subscription
    if (hospital.subscription_status !== 'active') {
      return {
        hasAccess: false,
        reason: `Hospital subscription is ${hospital.subscription_status}`,
        subscriptionDetails: {
          hospital_id: hospital.id,
          hospital_name: hospital.hospital_name,
          subscription_status: hospital.subscription_status,
          modules: []
        }
      }
    }

    // Check if subscription is within valid date range
    const now = new Date()
    const subscriptionStart = new Date(hospital.subscription_start_date)
    const subscriptionEnd = hospital.subscription_end_date ? new Date(hospital.subscription_end_date) : null

    if (now < subscriptionStart) {
      return {
        hasAccess: false,
        reason: 'Subscription not yet active',
        subscriptionDetails: {
          hospital_id: hospital.id,
          hospital_name: hospital.hospital_name,
          subscription_status: hospital.subscription_status,
          modules: []
        }
      }
    }

    if (subscriptionEnd && now > subscriptionEnd) {
      return {
        hasAccess: false,
        reason: 'Subscription has expired',
        subscriptionDetails: {
          hospital_id: hospital.id,
          hospital_name: hospital.hospital_name,
          subscription_status: hospital.subscription_status,
          modules: []
        }
      }
    }

    // Get the subscribed modules for this hospital
    const { data: modules, error: modulesError } = await supabaseAdmin
      .from('hospital_module_subscriptions')
      .select(`
        module_id,
        modules_master!inner(
          module_name,
          solution_type,
          is_active
        )
      `)
      .eq('hospital_id', hospital.id)
      .eq('subscription_status', 'active')

    if (modulesError) {
      console.error('Error fetching modules:', modulesError)
      return {
        hasAccess: false,
        reason: 'Failed to check module subscriptions'
      }
    }

    // Check if the hospital has the roster module with HMS solution type
    const hasRosterModule = modules?.some((subscription: any) => 
      subscription.modules_master?.module_name?.toLowerCase().includes('roster') &&
      subscription.modules_master?.solution_type === 'HMS' &&
      subscription.modules_master?.is_active
    ) || false

    const subscribedModules = modules?.map((sub: any) => sub.modules_master?.module_name).filter(Boolean) || []

    if (!hasRosterModule) {
      return {
        hasAccess: false,
        reason: 'Hospital does not have an active roster module subscription',
        subscriptionDetails: {
          hospital_id: hospital.id,
          hospital_name: hospital.hospital_name,
          subscription_status: hospital.subscription_status,
          modules: subscribedModules
        }
      }
    }

    // All checks passed
    return {
      hasAccess: true,
      subscriptionDetails: {
        hospital_id: hospital.id,
        hospital_name: hospital.hospital_name,
        subscription_status: hospital.subscription_status,
        modules: subscribedModules
      }
    }

  } catch (error) {
    console.error('Subscription check error:', error)
    return {
      hasAccess: false,
      reason: 'Internal error during subscription validation'
    }
  }
}

/**
 * Middleware function for Next.js API routes to validate roster subscription
 * @param entityPlatformId - The entity platform ID to check
 * @returns Object with access status and subscription details
 */
export async function validateRosterAccess(entityPlatformId: string) {
  const subscriptionCheck = await checkRosterSubscription(entityPlatformId)
  
  return {
    allowed: subscriptionCheck.hasAccess,
    subscription: subscriptionCheck.subscriptionDetails,
    error: subscriptionCheck.reason
  }
}

/**
 * Extract entity_platform_id from request body or query parameters
 * @param request - Next.js request object
 * @param body - Parsed request body (optional)
 * @returns entity_platform_id string or null
 */
export function extractEntityPlatformId(request: Request, body?: any): string | null {
  // Try to get from URL query parameters
  const url = new URL(request.url)
  const entityFromQuery = url.searchParams.get('entity_id') || url.searchParams.get('entity_platform_id')
  
  if (entityFromQuery) {
    return entityFromQuery
  }

  // Try to get from request body
  if (body && (body.entity_platform_id || body.entity_id)) {
    return body.entity_platform_id || body.entity_id
  }

  return null
}