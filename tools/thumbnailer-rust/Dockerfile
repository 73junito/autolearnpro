FROM rust:1.72-bookworm as builder
WORKDIR /app
COPY . /app
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/thumbnailer /usr/local/bin/thumbnailer
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/usr/local/bin/thumbnailer"]
