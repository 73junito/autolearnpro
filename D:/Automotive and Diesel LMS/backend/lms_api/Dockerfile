# Use Elixir 1.16 for compatibility with some deps (phoenix_swagger)
FROM elixir:1.16-slim AS build

# Install build-time tools (node/npm if you build assets here)
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential nodejs npm git postgresql-client ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install hex & rebar (non-interactive)
RUN mix local.hex --force && mix local.rebar --force

# Copy mix files and fetch dependencies first (leverage Docker layer cache)
# Do not copy `mix.lock` from the host to allow the container to generate a lock
# that includes any newly-added deps (useful in CI/builds).
COPY mix.exs ./
COPY config ./config

# Fetch and compile all dependencies (ensure compile-time deps are present)
ENV MIX_ENV=prod
RUN mix deps.get
RUN mix deps.compile

# Copy the rest of the app
COPY . .

# Compile and build a release
# Force a compile pass so macro modules (like LmsApiWeb) are available
RUN mix compile --force
RUN MIX_ENV=prod mix release --overwrite

#### Runtime image
FROM debian:12.12-slim AS runtime

# Pin the runtime base and install only the packages required at runtime.
# Keep only the minimal C libs the release needs; avoid adding `curl`
# to reduce transitive packages (libcurl/libldap) pulled into the image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    libncurses6 \
    zlib1g \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the built release from the build stage
COPY --from=build /app/_build/prod/rel/lms_api .

# Runtime environment tweaks
ENV HOME=/app
ENV MIX_ENV=prod
# Ensure the Erlang VM uses UTF-8 native name encoding to avoid encoding warnings
ENV ELIXIR_ERL_OPTIONS="+fnu"
ENV LANG=C.UTF-8

EXPOSE 4000

# Create a non-root user to run the app and give it ownership of /app
RUN mkdir -p /app \
  && echo 'lms:x:1000:' >> /etc/group \
  && echo 'lms:x:1000:1000::/app:/usr/sbin/nologin' >> /etc/passwd \
  && chown -R 1000:1000 /app

# Use a lightweight TCP healthcheck to avoid installing `curl` in the runtime image.
# This verifies the HTTP port is listening; follow-up smoke-tests will verify endpoints.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bash -c 'cat < /dev/tcp/localhost/4000 >/dev/null 2>&1 || exit 1'

# Run as non-root user
USER 1000

CMD ["./bin/lms_api", "start"]
