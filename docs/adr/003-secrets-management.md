# ADR 003: Secrets Management

## Context

The application requires various API keys and sensitive information for its operation, including:
- Third-party API keys (OpenAI, Anthropic, GitHub, etc.)
- Database connection strings
- JWT secrets for authentication
- Webhook secrets for validation

These secrets must be properly managed to avoid accidental exposure in version control, logs, or Docker images.

## Decision

We will implement a multi-layered secrets management approach:

1. **Local Development**:
   - Use `.env` files for local development (excluded from git)
   - Provide `.env.example` files with placeholder values
   - Use `docker-compose.override.yml` for Docker-specific secrets (excluded from git)

2. **CI/CD Pipeline**:
   - Store secrets in GitHub Actions secrets
   - Mask secrets in CI logs
   - Use placeholder values for tests

3. **Production Deployment**:
   - Use Docker secrets or environment variables for container deployments
   - Consider using a dedicated secrets management service for production

## Implementation Details

1. **Repository Configuration**:
   - `.gitignore` includes `.env`, `*.key`, `*.pem`, and `docker-compose.override.yml`
   - `.env.example` and `docker-compose.override.yml.example` have clear placeholders

2. **CI Workflow**:
   - GitHub Actions workflow uses secrets from repository settings
   - Secrets are masked in logs using placeholder values

3. **Code Practices**:
   - Ensure logs don't print sensitive information
   - No hardcoded secrets in code

## Consequences

### Positive
- Reduced risk of secret exposure
- Clear patterns for developers to follow
- Separation between development and production secrets
- CI/CD pipeline can run without exposing sensitive information

### Negative
- Slightly more complex setup for new team members
- Need for manual secret rotation procedures

## Status

Accepted

## References

- [GitHub Actions Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/) 