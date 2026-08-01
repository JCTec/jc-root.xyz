# ================================
# Build image
# ================================
FROM swift:6.1-noble AS build

RUN apt-get update -q \
    && apt-get install -y -q libjemalloc-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Resolve dependencies first so this layer caches across source-only changes.
COPY ./Package.* ./
RUN swift package resolve

COPY . .

RUN swift build -c release \
    --static-swift-stdlib \
    -Xlinker -ljemalloc

WORKDIR /staging

# --package-path is required: the working directory is /staging now, and
# --show-bin-path resolves relative to the cwd, not to where the build ran.
RUN cp "$(swift build --package-path /build -c release --show-bin-path)/App" ./ \
    && find -L "$(swift build --package-path /build -c release --show-bin-path)" -regex '.*\.resources$' -exec cp -Ra {} ./ \; \
    && cp -R /build/Public ./Public \
    && cp -R /build/Resources ./Resources \
    && chmod -R a-w ./Public ./Resources

# ================================
# Run image
# ================================
FROM ubuntu:noble

RUN export DEBIAN_FRONTEND=noninteractive DEBCONF_NONINTERACTIVE_SEEN=true \
    && apt-get -q update \
    && apt-get -q dist-upgrade -y \
    && apt-get -q install -y ca-certificates tzdata libjemalloc2 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --user-group --create-home --system --skel /dev/null --home-dir /app vapor

WORKDIR /app

COPY --from=build --chown=vapor:vapor /staging /app

USER vapor:vapor

EXPOSE 8080

# Deliberately no ENTRYPOINT. Heroku falls back to `/bin/sh -c` only when the
# image sets none, and that shell is what expands $PORT in the heroku.yml
# `run:` command — with an ENTRYPOINT, that command is passed to it as literal
# arguments and the dyno binds the string "$PORT" instead of the assigned one.
# CMD carries the whole command so a plain `docker run` still works locally.
CMD ["./App", "serve", "--env", "production", "--hostname", "0.0.0.0", "--port", "8080"]
