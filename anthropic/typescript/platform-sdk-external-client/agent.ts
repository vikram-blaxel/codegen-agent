import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SandboxInstance } from "@blaxel/core";
import { AGENT_PROMPT } from './prompt';

const client = new Anthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'],
});

const main = async () => {
  const taskArg = process.argv.slice(2).join(' ');
  const defaultTask = 'Create a Next.js app that displays "Hello, World!" on the homepage styled with Tailwind CSS.';

  let sandbox: SandboxInstance | undefined;
  let mcpClient: Client | undefined;
  let turnCount = 0;

  try {
    // Setup sandbox
    console.log("Creating sandbox...");
    sandbox = await SandboxInstance.createIfNotExists({
      name: "my-nextjs-sandbox",
      image: "blaxel/nextjs:latest",
      memory: 4096,
      ports: [{ name: "preview", target: 3000, protocol: "HTTP" }],
    });
    console.log("Sandbox ready!");

    // Setup preview
    console.log("Setting up preview URL...");
    const preview = await sandbox.previews.createIfNotExists({
      metadata: { name: "nextjs-app-preview" },
      spec: {
        port: 3000,
        public: true,
        responseHeaders: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      },
    });
    console.log(`Preview URL ready: ${preview.spec?.url}`);

    // Setup MCP client using SDK
    console.log("Connecting to MCP server...");
    const mcpUrl = `${sandbox.metadata?.url}/mcp`;
    const authToken = process.env.BLAXEL_API_KEY;

    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${authToken}`,
          // If your user has multiple workspaces, you may need this too:
          // "X-Blaxel-Workspace": process.env.BLAXEL_WORKSPACE_ID ?? "",
        },
      },
    });

    mcpClient = new Client({
      name: 'anthropic-agent',
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await mcpClient.connect(transport);
    console.log('✓ Connected to MCP server');

    // Get available tools using MCP SDK
    const toolsResult = await mcpClient.listTools();
    const toolCount = toolsResult.tools.length;
    const toolNames = toolsResult.tools.map(t => t.name);
    console.log(`✓ ${toolCount} tool(s) available: ${toolNames.join(', ')}\n`);

    // Convert MCP tools to Anthropic format
    const anthropicTools: Anthropic.Tool[] = toolsResult.tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.inputSchema as Record<string, unknown>,
    }));

    const userTask = taskArg || defaultTask;
    console.log(`Task: ${userTask}\n`);

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: AGENT_PROMPT(userTask) },
    ];

    // Agentic loop: continues until Claude finishes or reaches max turns
    const maxTurns = 50;
    while (turnCount < maxTurns) {
      turnCount++;
      console.log(`\n--- Turn ${turnCount} ---\n`);

      // Use standard message streaming (not beta)
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 30000,
        tools: anthropicTools,
        messages,
      });

      let lastEventType: string | null = null;

      // Stream messages as Claude works
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          // Add spacing after tool execution
          if (lastEventType === 'tool_use_end') {
            process.stdout.write('\n\n');
          }
          process.stdout.write(event.delta.text);
          lastEventType = 'text';
        } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          console.log(`\n\n[Tool: ${event.content_block.name}]`);
          lastEventType = 'tool_use';
        } else if (event.type === 'content_block_end' && event.content_block.type === 'tool_use') {
          lastEventType = 'tool_use_end';
        }
      }

      const finalMessage = await stream.finalMessage();

      // Add assistant response to conversation history
      messages.push({
        role: 'assistant',
        content: finalMessage.content,
      });

      // Check if we need to execute tools
      const toolUseBlocks = finalMessage.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length > 0 && finalMessage.stop_reason === 'tool_use') {
        console.log(`\n\n[Executing ${toolUseBlocks.length} tool(s)...]`);

        // Execute tools using MCP client
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          try {
            console.log(`  - ${toolUse.name}`);
            const result = await mcpClient!.callTool({
              name: toolUse.name,
              arguments: toolUse.input as Record<string, unknown>,
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result.content),
            });
          } catch (error) {
            console.error(`  ✗ Error executing ${toolUse.name}:`, error);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
              is_error: true,
            });
          }
        }

        // Add tool results to conversation
        messages.push({
          role: 'user',
          content: toolResults,
        });
      } else {
        // Task completed
        console.log('\n\n--- Task completed ---');
        break;
      }
    }

    if (turnCount >= maxTurns) {
      console.log('\n\n--- Max turns reached ---');
    }

  } catch (error) {
    console.error("\n\n❌ Error:");
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
      if (turnCount > 0) console.error(`  (Failed at turn ${turnCount})`);
      if (error.stack) console.error(`\n${error.stack}`);
    } else {
      console.error(`  ${error}`);
    }
    process.exit(1);
  } finally {
    // Clean up MCP client connection
    if (mcpClient) {
      try {
        await mcpClient.close();
        console.log("\n✓ MCP client disconnected");
      } catch (error) {
        console.error("Error closing MCP client:", error);
      }
    }
    if (sandbox) {
      console.log("✓ Sandbox remains active for development");
    }
  }
};

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
