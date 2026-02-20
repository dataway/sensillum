FROM rust:alpine AS builder

RUN apk add --no-cache musl-dev

ARG SENSILLUM_GIT_COMMIT
ARG SENSILLUM_GIT_TAG
ARG SENSILLUM_GIT_DIRTY
LABEL "org.opencontainers.image.vendor"="anthonyuk.dev"

WORKDIR /build
COPY . .

RUN set -ex; \
    ARCH=$(uname -m); \
    case "$ARCH" in \
      x86_64)  TARGET="x86_64-unknown-linux-musl" ;; \
      aarch64) TARGET="aarch64-unknown-linux-musl" ;; \
      *)       echo "Unsupported arch: $ARCH" >&2; exit 1 ;; \
    esac; \
    rustup target add "$TARGET"; \
    cargo build --release --target "$TARGET"; \
    cp "target/$TARGET/release/sensillum" /sensillum

FROM scratch

COPY --from=builder /sensillum /sensillum

EXPOSE 3030

ENTRYPOINT ["/sensillum"]
