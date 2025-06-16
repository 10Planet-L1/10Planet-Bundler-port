import type { FastifyRequest, FastifyReply } from "fastify"
import type { JSONRPCRequest } from "@alto/types"

export interface ApiKeyAuthConfig {
    apiKey: string
    protectedMethods: string[]
}

export interface AuthValidationResult {
    isValid: boolean
    error?: {
        code: number
        message: string
    }
}

/**
 * Validates API key for the given RPC methods
 */
export const validateApiKey = (
    config: ApiKeyAuthConfig,
    body: JSONRPCRequest | JSONRPCRequest[] | null,
    providedKey: string | undefined
): AuthValidationResult => {
    if (!body) {
        return { isValid: true }
    }

    // Extract the RPC method(s)
    const methods = Array.isArray(body) 
        ? body.map(req => req.method)
        : [body.method]

    // Check if any of the methods require authentication
    const requiresAuth = methods.some(method => 
        config.protectedMethods.includes(method)
    )

    if (!requiresAuth) {
        return { isValid: true }
    }

    // Check API key
    if (!providedKey || providedKey !== config.apiKey) {
        return {
            isValid: false,
            error: {
                code: -32001,
                message: "Unauthorized: Invalid or missing API key"
            }
        }
    }

    return { isValid: true }
}

export const createApiKeyAuthMiddleware = (config: ApiKeyAuthConfig) => {
    return async (
        request: FastifyRequest,
        reply: FastifyReply
    ) => {
        // Extract pathname without query parameters
        const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
        const pathname = url.pathname
        
        // Skip auth for non-RPC endpoints
        if (!["/rpc", "/", "/v1/rpc", "/v2/rpc"].includes(pathname) && !pathname.match(/^\/v\d+\/rpc$/)) {
            return
        }

        // Parse the request body to get the RPC method
        const body = request.body as JSONRPCRequest | JSONRPCRequest[]
        const providedKey = request.headers["x-api-key"] as string

        const validation = validateApiKey(config, body, providedKey)
        
        if (!validation.isValid && validation.error) {
            reply.code(401).send({
                jsonrpc: "2.0",
                id: null,
                error: validation.error
            })
            return
        }
    }
}