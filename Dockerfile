# Stage 1: Build Contracts using Foundry and Node/pnpm
FROM ghcr.io/foundry-rs/foundry:v1.1.0 AS builder

WORKDIR /build

# --- FIX: Switch to root user to install packages ---
USER root
# ----------------------------------------------------

RUN apt-get update && \
    apt-get install -y curl gnupg ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/* && \
    corepack enable

# Copy package files first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

# Copy contracts directory with all submodule contents already included
COPY contracts contracts

RUN pnpm install --frozen-lockfile

RUN pnpm run build:contracts

# ---

# Stage 2: Production Runtime Environment
FROM node:20.12.2-alpine3.19 AS production

WORKDIR /app

RUN npm install -g typescript

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

RUN corepack enable

COPY . .

COPY --from=builder /build/src/contracts ./src/contracts

RUN pnpm fetch

RUN pnpm install -r --offline --frozen-lockfile

# Clean any existing build artifacts before building
RUN rm -rf src/esm

RUN pnpm build

# start app
ENTRYPOINT pnpm start --entrypoints ${ENTRYPOINT} --min-executor-balance ${MIN_BALANCE} --rpc-url ${RPC_URL} --executor-private-keys ${PRIVATE_KEY} --utility-private-key ${PRIVATE_KEY} --max-block-range 500 --port ${PORT} --safe-mode false --deploy-simulations-contract true --paymaster-gas-limit-multiplier "200" --api-key ${BUNDLER_API_KEY} --protected-methods "eth_sendUserOperation,pimlico_sendUserOperationNow,boost_sendUserOperation,eth_estimateUserOperationGas" --code-override-support false
