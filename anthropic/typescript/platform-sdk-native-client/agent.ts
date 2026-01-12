import Anthropic from '@anthropic-ai/sdk';
import { SandboxInstance } from "@blaxel/core";
import { AGENT_PROMPT } from './prompt';

const client = new Anthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'],
});

const main = async () => {
  const taskArg = process.argv.slice(2).join(' ');
  const defaultTask = 'Create a Next.js app that displays "Hello, World!" on the homepage styled with Tailwind CSS.';

  let sandbox: SandboxInstance | undefined;
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

    // Setup MCP server
    console.log("Retrieving tools...");
    const mcpServer = {
      type: 'url' as const,
      url: `${sandbox.metadata?.url}/mcp`,
      name: 'sandbox-mcp',
      authorization_token: process.env.BLAXEL_API_KEY,
    };

    // Fetch and display available tools
    try {
      const toolsResponse = await fetch(`${sandbox.metadata?.url}/mcp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mcpServer.authorization_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
      });

      if (toolsResponse.ok) {
        const data = await toolsResponse.json();
        const toolCount = data.result?.tools?.length || 0;
        const toolNames = data.result?.tools?.map((t: any) => t.name) || [];
        console.log(`✓ Connected to MCP server`);
        console.log(`✓ ${toolCount} tool(s) available: ${toolNames.join(', ')}\n`);
      } else {
        console.warn(`⚠ MCP server responded with status ${toolsResponse.status}`);
      }
    } catch (error) {
      console.warn('⚠ Could not fetch tools:', error instanceof Error ? error.message : error);
    }

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

      const stream = client.beta.messages.stream(
        {
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 30000,
          mcp_servers: [mcpServer],
          messages,
        },
        { headers: { 'anthropic-beta': 'mcp-client-2025-04-04' } }
      );

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
        content: finalMessage.content.map((block) => {
          if (block.type === 'text') {
            return { type: 'text', text: block.text };
          } else if (block.type === 'tool_use') {
            return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
          }
          return block as Anthropic.ContentBlockParam;
        }),
      });

      // Check if we need to continue
      const hasToolUses = finalMessage.content.some((block) => block.type === 'tool_use');

      if (hasToolUses && finalMessage.stop_reason === 'tool_use') {
        const toolCount = finalMessage.content.filter(b => b.type === 'tool_use').length;
        console.log(`\n\n[Executing ${toolCount} tool(s)...]`);
        messages.push({ role: 'user', content: 'Continue based on the tool results.' });
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
    if (sandbox) {
      console.log("\n✓ Sandbox remains active for development");
    }
  }
};

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
