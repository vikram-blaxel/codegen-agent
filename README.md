# Codegen agent - evaluation

## Provider-agnostic SDKs

- Google ADK (with built-in MCP client): [Python](./adk/python/agent.py)
  - Tested with OpenAI and Anthropic
  - Google TypeScript ADK only supports Gemini models at the moment.
- Langchain (with Langchain MCP adapter): [Python](./langchain/python/agent.py)
  - Tested with OpenAI and Anthropic
- Vercel AI SDK (with built-in MCP client) [TypeScript](./vercel/typescript/agent.ts)
  - Tested with OpenAI and Anthropic

## Provider-specific SDKs

- Anthropic Platform SDK with external MCP client from `@modelcontextprotocol/sdk`: [TypeScript](./anthropic/typescript/platform-sdk-external-client/agent.ts)
- Anthropic Platform SDK with built-in MCP client (beta): [TypeScript](./anthropic/typescript/platform-sdk-external-client/agent.ts)
- Anthropic Agent SDK with built-in MCP client and fixed prompt: [TypeScript](./anthropic/typescript/agent-sdk/simple-agent.ts)
- Anthropic Agent SDK with built-in MCP client and dynamic prompt: [TypeScript](./anthropic/typescript/agent-sdk/agent.ts)

## How to use

- `bun agent.ts <task>` or `python agent.py <task>` depending on the language
- Make sure to set the `BLAXEL_API_KEY` environment variable with your Blaxel API key.
