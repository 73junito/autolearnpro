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
RUN mix compile
RUN MIX_ENV=prod mix release --overwrite

#### Runtime image
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates libncurses6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the built release
COPY --from=build /app/_build/prod/rel/lms_api .

ENV HOME=/app
ENV MIX_ENV=prod

EXPOSE 4000

CMD ["./bin/lms_api", "start"]
