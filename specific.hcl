# PandaFlow — Infrastructure Configuration

# Frontend Next.js service
service "frontend" {
  build {
    command = ["npm", "run", "build"]
  }

  run {
    command = ["npm", "start"]
    port    = 3000
  }

  env {
    DATABASE_URL       = postgres.main.url
    REDIS_URL          = redis.cache.url
    PANDASTACK_API_KEY = secret.pandastack_api_key
    NEXTAUTH_SECRET    = secret.nextauth_secret
    ENCRYPTION_KEY     = secret.encryption_key
    NODE_ENV           = "production"
  }

  health_check {
    path     = "/api/health"
    interval = "30s"
    timeout  = "5s"
  }
}

# PostgreSQL database
postgres "main" {
  version = "16"
}

# Redis cache (agent bus, HITL approvals, agent memory)
redis "cache" {
  version = "7"
}

# Secrets
secret "nextauth_secret" {
  description = "NextAuth.js secret for session encryption"
}

secret "pandastack_api_key" {
  description = "PandaStack API key (pds_... from pandastack.ai)"
}

secret "encryption_key" {
  description = "AES-256 encryption key for credentials"
}

secret "openai_api_key" {
  description = "OpenAI API key for LLM nodes"
}
