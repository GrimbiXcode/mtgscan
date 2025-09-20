# MTGScan - Production Build and Deployment

This guide explains how to:
- Build a production Docker image.
- Copy the image to a remote server via SSH (scp).
- Load and run the image on the server.

## Prerequisites
- Docker installed locally and on the server.
- SSH access to the server (key-based recommended).
- Dockerfile present in the project root.

## Build the Production Image

From the project root:

```shell
# Build image using the provided Dockerfile
docker buildx build --platform linux/amd64 -t mtgscan:prod --load .
```

Optionally verify:

```shell
docker images | grep mtgscan
```

## Copy Image to Server via scp and Load

1) Save the image to a tarball and compress:

```shell
docker save mtgscan:prod | gzip > mtgscan-prod.tar.gz
```

2) Copy to the server:

```shell
scp mtgscan-prod.tar.gz user@your-server:/tmp/
```

3) Load the image on the server:

```shell
ssh user@your-server "gunzip -c /tmp/mtgscan-prod.tar.gz | docker load"
```

4) Run the container on the server:

```shell
ssh user@your-server "docker run -d --name mtgscan -p 80:80 --restart unless-stopped mtgscan:prod"
```

5) Check it’s running:

```shell
ssh user@your-server "docker ps --filter name=mtgscan"
```

## Alternative: Build/Run Directly on Server via Docker Context (no tarball)

```shell
# Create a remote context (one-time)
docker context create mtg-prod --docker "host=ssh://user@your-server"
# Build on the server
docker --context mtg-prod build -t mtgscan:prod .
# Run on the server
docker --context mtg-prod run -d --name mtgscan -p 80:80 --restart unless-stopped mtgscan:prod
# Verify
docker --context mtg-prod ps --filter name=mtgscan
```

## Notes
- Replace `user@your-server` with your actual SSH user and host.
- Ensure port 80 is open on the server or adjust the `-p` mapping as needed.
- For SPA routing, you may use a custom NGINX config if required.
