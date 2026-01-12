import { createMCPClient } from '@ai-sdk/mcp';
import { SandboxInstance } from '@blaxel/core';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, stepCountIs } from 'ai';
import { AGENT_PROMPT } from './prompt';

async function main() {
  const taskArg = process.argv.slice(2).join(' ');
  const defaultTask =
    'Create a Next.js app that displays "Hello, World!" on the homepage styled with Tailwind CSS.';
  const userTask = taskArg || defaultTask;

  let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | undefined;

  try {
    // Sandbox
    console.log('Creating sandbox...');
    const sandbox = await SandboxInstance.createIfNotExists({
      name: 'my-nextjs-sandbox3',
      image: 'blaxel/nextjs:latest',
      memory: 4096,
      ports: [{ name: 'preview', target: 3000, protocol: 'HTTP' }],
    });
    console.log('Sandbox ready!');

    console.log('Setting up preview URL...');
    const preview = await sandbox.previews.createIfNotExists({
      metadata: { name: 'nextjs-app-preview' },
      spec: {
        port: 3000,
        public: true,
        responseHeaders: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        },
      },
    });
    console.log(`Preview URL ready: ${preview.spec?.url}`);

    // MCP
    mcpClient = await createMCPClient({
      transport: {
        type: 'http',
        url: `${sandbox.metadata?.url}/mcp`,
        headers: { Authorization: `Bearer ${process.env.BLAXEL_API_KEY}` },
      },
    });

    const tools = await mcpClient.tools();

    console.log(`Task: ${userTask}\n`);

    // Built-in agent loop
    const agent = new ToolLoopAgent({
      model: anthropic('claude-sonnet-4-5-20250929'),
      //model: openai('gpt-4o'),
      tools,
    });

    // Stream the agent output to the CLI
    const result = await agent.stream({
      prompt: AGENT_PROMPT(userTask),
    });

    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
    process.stdout.write('\n\n');

    // If you want post-run introspection:
    // console.error('Steps:', result.steps);

  } catch (err) {
    console.error('An error occurred:', err);
    process.exitCode = 1;
  } finally {
    if (mcpClient) {
      try {
        await mcpClient.close();
      } catch (e) {
        console.error('Failed to close MCP client:', e);
      }
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
