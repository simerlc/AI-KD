export interface AuthConfig {
  providers: string[]
}

let cachedConfig: AuthConfig = { providers: ['local'] }

export function setAuthConfig(config: AuthConfig) {
  cachedConfig = config
}

/**
 * Get the list of enabled authentication providers
 */
export function getEnabledAuthProviders(): {
  github: boolean
  local: boolean
} {
  return {
    github: false,
    local: cachedConfig.providers.includes('local') || true,
  }
}
