 # Root-level Dockerfile (staged for CI)
 # This file mirrors `backend/lms_api/Dockerfile` so builders that
 # expect `--file Dockerfile` at the workspace root can read it.

FROM elixir:1.16-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential nodejs npm git postgresql-client ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mix local.hex --force && mix local.rebar --force

COPY mix.exs ./
COPY config ./config

ENV MIX_ENV=prod
RUN mix deps.get
RUN mix deps.compile

COPY . .

RUN mix compile --force
RUN MIX_ENV=prod mix release --overwrite

FROM debian:12.12-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    libncurses6 \
    zlib1g \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/_build/prod/rel/lms_api .

ENV HOME=/app
ENV MIX_ENV=prod
ENV ELIXIR_ERL_OPTIONS="+fnu"
ENV LANG=C.UTF-8

EXPOSE 4000

RUN mkdir -p /app \
  && echo 'lms:x:1000:' >> /etc/group \
  && echo 'lms:x:1000:1000::/app:/usr/sbin/nologin' >> /etc/passwd \
  && chown -R 1000:1000 /app

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bash -c 'cat < /dev/tcp/localhost/4000 >/dev/null 2>&1 || exit 1'

USER 1000

CMD ["./bin/lms_api", "start"]
