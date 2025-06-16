import {
    createPublicClient,
    createTestClient,
    http,
    type Address,
    parseEther
} from "viem"
import {
    entryPoint06Address,
    entryPoint07Address,
    type EntryPointVersion
} from "viem/account-abstraction"
import { generatePrivateKey } from "viem/accounts"
import { foundry } from "viem/chains"
import { beforeEach, describe, expect, inject, test } from "vitest"
import * as WebSocket from "ws"
import {
    beforeEachCleanUp,
    getSmartAccountClient,
    setBundlingMode,
    sendBundleNow
} from "../src/utils/index.js"

describe.each([
    {
        entryPoint: entryPoint06Address,
        entryPointVersion: "0.6" as EntryPointVersion
    },
    {
        entryPoint: entryPoint07Address,
        entryPointVersion: "0.7" as EntryPointVersion
    }
])(
    "$entryPointVersion API Key Authentication",
    ({ entryPoint, entryPointVersion }) => {
        const anvilRpc = inject("anvilRpc")
        const altoRpc = inject("altoRpc")
        const testApiKey = "test-api-key-123" // This should match the key in config
        const wrongApiKey = "wrong-api-key"

        const anvilClient = createTestClient({
            chain: foundry,
            mode: "anvil",
            transport: http(anvilRpc)
        })

        const publicClient = createPublicClient({
            transport: http(anvilRpc),
            chain: foundry
        })

        beforeEach(async () => {
            await beforeEachCleanUp({ anvilRpc, altoRpc })
        })

        describe("HTTP Authentication", () => {
            test("Should reject protected method without API key", async () => {
                const response = await fetch(altoRpc, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_sendUserOperation",
                        params: [],
                        id: 1
                    })
                })

                const result = await response.json()
                expect(response.status).toBe(401)
                expect(result.error).toBeDefined()
                expect(result.error.code).toBe(-32001)
                expect(result.error.message).toContain("Unauthorized")
            })

            test("Should reject protected method with wrong API key", async () => {
                const response = await fetch(altoRpc, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": wrongApiKey
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_sendUserOperation",
                        params: [],
                        id: 2
                    })
                })

                const result = await response.json()
                expect(response.status).toBe(401)
                expect(result.error).toBeDefined()
                expect(result.error.code).toBe(-32001)
                expect(result.error.message).toContain("Unauthorized")
            })

            test("Should accept protected method with valid API key", async () => {
                const client = await getSmartAccountClient({
                    entryPointVersion,
                    anvilRpc,
                    altoRpc
                })

                // Prepare a valid user operation
                const op = await client.prepareUserOperation({
                    calls: [{
                        to: "0x23B608675a2B2fB1890d3ABBd85c5775c51691d5",
                        value: parseEther("0.01"),
                        data: "0x"
                    }]
                })
                op.signature = await client.account.signUserOperation(op)

                const response = await fetch(altoRpc, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": testApiKey
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_sendUserOperation",
                        params: [op, entryPoint],
                        id: 3
                    })
                })

                const result = await response.json()
                expect(response.status).toBe(200)
                expect(result.result).toBeDefined()
                expect(result.result).toMatch(/^0x[a-fA-F0-9]{64}$/) // Should return a hash
            })

            test("Should allow unprotected method without API key", async () => {
                const response = await fetch(altoRpc, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_chainId",
                        params: [],
                        id: 4
                    })
                })

                const result = await response.json()
                expect(response.status).toBe(200)
                expect(result.result).toBeDefined()
            })

            test("Should handle batch requests with mixed protected/unprotected methods", async () => {
                // Without API key - should fail
                const responseNoKey = await fetch(altoRpc, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify([
                        {
                            jsonrpc: "2.0",
                            method: "eth_chainId",
                            params: [],
                            id: 5
                        },
                        {
                            jsonrpc: "2.0",
                            method: "eth_sendUserOperation",
                            params: [],
                            id: 6
                        }
                    ])
                })

                expect(responseNoKey.status).toBe(401)
                const resultNoKey = await responseNoKey.json()
                expect(resultNoKey.error).toBeDefined()
                expect(resultNoKey.error.code).toBe(-32001)

                // With API key - should succeed
                const responseWithKey = await fetch(altoRpc, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": testApiKey
                    },
                    body: JSON.stringify([
                        {
                            jsonrpc: "2.0",
                            method: "eth_chainId",
                            params: [],
                            id: 7
                        },
                        {
                            jsonrpc: "2.0",
                            method: "eth_supportedEntryPoints",
                            params: [],
                            id: 8
                        }
                    ])
                })

                expect(responseWithKey.status).toBe(200)
                const resultWithKey = await responseWithKey.json()
                expect(Array.isArray(resultWithKey)).toBe(true)
                expect(resultWithKey.length).toBe(2)
                expect(resultWithKey[0].result).toBeDefined()
                expect(resultWithKey[1].result).toBeDefined()
            })

            test("Should protect eth_estimateUserOperationGas", async () => {
                const response = await fetch(altoRpc, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_estimateUserOperationGas",
                        params: [],
                        id: 9
                    })
                })

                const result = await response.json()
                expect(response.status).toBe(401)
                expect(result.error).toBeDefined()
                expect(result.error.code).toBe(-32001)
                expect(result.error.message).toContain("Unauthorized")
            })
        })

        describe("WebSocket Authentication", () => {
            test("Should reject protected method without API key over WebSocket", (done) => {
                const ws = new WebSocket.WebSocket(`ws://localhost:3001/v1/rpc`)

                ws.on("open", () => {
                    ws.send(JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_sendUserOperation",
                        params: [],
                        id: 10
                    }))
                })

                ws.on("message", (data) => {
                    const result = JSON.parse(data.toString())
                    expect(result.error).toBeDefined()
                    expect(result.error.code).toBe(-32001)
                    expect(result.error.message).toContain("Unauthorized")
                    ws.close()
                    done()
                })

                ws.on("error", (err) => {
                    done(err)
                })
            })

            test("Should accept protected method with API key in query parameter", (done) => {
                const ws = new WebSocket.WebSocket(`ws://localhost:3001/v1/rpc?apiKey=${testApiKey}`)

                ws.on("open", async () => {
                    const client = await getSmartAccountClient({
                        entryPointVersion,
                        anvilRpc,
                        altoRpc
                    })

                    const op = await client.prepareUserOperation({
                        calls: [{
                            to: "0x23B608675a2B2fB1890d3ABBd85c5775c51691d5",
                            value: parseEther("0.01"),
                            data: "0x"
                        }]
                    })
                    op.signature = await client.account.signUserOperation(op)

                    ws.send(JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_sendUserOperation",
                        params: [op, entryPoint],
                        id: 11
                    }))
                })

                ws.on("message", (data) => {
                    const result = JSON.parse(data.toString())
                    expect(result.result).toBeDefined()
                    expect(result.result).toMatch(/^0x[a-fA-F0-9]{64}$/)
                    ws.close()
                    done()
                })

                ws.on("error", (err) => {
                    done(err)
                })
            })

            test("Should accept protected method with API key in header", (done) => {
                const ws = new WebSocket.WebSocket(`ws://localhost:3001/v1/rpc`, {
                    headers: {
                        "x-api-key": testApiKey
                    }
                })

                ws.on("open", async () => {
                    const client = await getSmartAccountClient({
                        entryPointVersion,
                        anvilRpc,
                        altoRpc
                    })

                    const op = await client.prepareUserOperation({
                        calls: [{
                            to: "0x23B608675a2B2fB1890d3ABBd85c5775c51691d5",
                            value: parseEther("0.01"),
                            data: "0x"
                        }]
                    })
                    op.signature = await client.account.signUserOperation(op)

                    ws.send(JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_sendUserOperation",
                        params: [op, entryPoint],
                        id: 12
                    }))
                })

                ws.on("message", (data) => {
                    const result = JSON.parse(data.toString())
                    expect(result.result).toBeDefined()
                    expect(result.result).toMatch(/^0x[a-fA-F0-9]{64}$/)
                    ws.close()
                    done()
                })

                ws.on("error", (err) => {
                    done(err)
                })
            })

            test("Should allow unprotected method without API key over WebSocket", (done) => {
                const ws = new WebSocket.WebSocket(`ws://localhost:3001/v1/rpc`)

                ws.on("open", () => {
                    ws.send(JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_chainId",
                        params: [],
                        id: 13
                    }))
                })

                ws.on("message", (data) => {
                    const result = JSON.parse(data.toString())
                    expect(result.result).toBeDefined()
                    ws.close()
                    done()
                })

                ws.on("error", (err) => {
                    done(err)
                })
            })
        })

        describe("Integration with UserOperation flow", () => {
            test("Should handle full UserOperation flow with API key authentication", async () => {
                await setBundlingMode({ mode: "manual", altoRpc })

                const privateKey = generatePrivateKey()
                const client = await getSmartAccountClient({
                    entryPointVersion,
                    anvilRpc,
                    altoRpc,
                    privateKey
                })

                // Create authenticated fetch function
                const authenticatedFetch = (body: any) => 
                    fetch(altoRpc, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-api-key": testApiKey
                        },
                        body: JSON.stringify(body)
                    })

                // 1. Estimate gas (protected method)
                const estimateOp = await client.prepareUserOperation({
                    calls: [{
                        to: "0x23B608675a2B2fB1890d3ABBd85c5775c51691d5",
                        value: parseEther("0.01"),
                        data: "0x"
                    }]
                })

                const estimateResponse = await authenticatedFetch({
                    jsonrpc: "2.0",
                    method: "eth_estimateUserOperationGas",
                    params: [estimateOp, entryPoint],
                    id: 14
                })

                expect(estimateResponse.status).toBe(200)
                const estimateResult = await estimateResponse.json()
                expect(estimateResult.result).toBeDefined()

                // 2. Send user operation (protected method)
                const hash = await client.sendUserOperation({
                    calls: [{
                        to: "0x23B608675a2B2fB1890d3ABBd85c5775c51691d5",
                        value: parseEther("0.01"),
                        data: "0x"
                    }]
                })

                expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/)

                // 3. Get operation by hash (unprotected method) - should work without API key
                const getOpResponse = await fetch(altoRpc, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_getUserOperationByHash",
                        params: [hash],
                        id: 15
                    })
                })

                expect(getOpResponse.status).toBe(200)
                const getOpResult = await getOpResponse.json()
                expect(getOpResult.result).toBeDefined()

                // 4. Bundle and check receipt
                await sendBundleNow({ altoRpc })
                
                const receipt = await client.waitForUserOperationReceipt({ hash })
                expect(receipt.success).toBe(true)
            })

            test("Should handle concurrent authenticated requests", async () => {
                const numRequests = 5
                const promises = []

                for (let i = 0; i < numRequests; i++) {
                    promises.push(
                        fetch(altoRpc, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "x-api-key": testApiKey
                            },
                            body: JSON.stringify({
                                jsonrpc: "2.0",
                                method: "eth_supportedEntryPoints",
                                params: [],
                                id: 20 + i
                            })
                        })
                    )
                }

                const responses = await Promise.all(promises)
                const results = await Promise.all(responses.map(r => r.json()))

                responses.forEach(response => {
                    expect(response.status).toBe(200)
                })

                results.forEach(result => {
                    expect(result.result).toBeDefined()
                    expect(Array.isArray(result.result)).toBe(true)
                })
            })
        })
    }
)