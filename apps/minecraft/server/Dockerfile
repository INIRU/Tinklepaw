# Stage 1: Build the Kotlin plugin
FROM gradle:8.12-jdk21-alpine AS plugin-builder

WORKDIR /plugin
COPY plugin/ .
RUN gradle shadowJar --no-daemon

# Stage 2: Paper server
FROM itzg/minecraft-server:latest

ENV EULA=TRUE \
    TYPE=PAPER \
    VERSION=1.21.4 \
    MEMORY=4G \
    ONLINE_MODE=TRUE \
    SERVER_PORT=1207

COPY --from=plugin-builder /plugin/build/libs/nyaru-plugin-*.jar /plugins/

EXPOSE 1207
