FROM elixir:1.15-alpine

RUN apk add --no-cache build-base nodejs npm git python3

WORKDIR /app

# Copy project files
COPY . /app

# Install Hex and Rebar
RUN mix local.hex --force && mix local.rebar --force

# Install Elixir deps (dev/test only to speed up builds; prod builds would differ)
RUN mix deps.get --only dev test || true

EXPOSE 4000

CMD ["sh", "-c", "mix ecto.setup || true; MIX_ENV=dev mix phx.server"]
