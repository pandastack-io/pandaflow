# AI Agent Builder - Infrastructure Configuration

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
    DATABASE_URL     = postgres.main.url
    REDIS_URL        = redis.cache.url
    TEMPORAL_ADDRESS = temporal.workflows.address
    NODE_ENV         = "production"
  }

  health_check {
    path     = "/api/health"
    interval = "30s"
    timeout  = "5s"
  }
}

# Temporal worker service
service "temporal-worker" {
  build {
    command = ["npm", "run", "build:worker"]
  }

  run {
    command = ["node", "dist/worker.js"]
  }

  env {
    DATABASE_URL     = postgres.main.url
    REDIS_URL        = redis.cache.url
    TEMPORAL_ADDRESS = temporal.workflows.address
    NODE_ENV         = "production"
  }
}

# PostgreSQL database
postgres "main" {
  version = "16"
}

# Redis cache
redis "cache" {
  version = "7"
}

# Temporal workflow engine
temporal "workflows" {
  version = "1.22"
}

# S3-compatible storage
storage "artifacts" {
  # For execution artifacts, exports, etc.
}

# Secrets
secret "nextauth_secret" {
  description = "NextAuth.js secret for session encryption"
}

secret "pandastack_api_key" {
  description = "PandaStack API key"
}

secret "encryption_key" {
  description = "AES-256 encryption key for credentials"
}

secret "openai_api_key" {
  description = "OpenAI API key for LLM nodes"
}
