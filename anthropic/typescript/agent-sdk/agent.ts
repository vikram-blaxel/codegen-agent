import { SandboxInstance } from "@blaxel/core";
import { AGENT_PROMPT } from './prompt';
import { query } from '@anthropic-ai/claude-agent-sdk';

async function main() {

  const taskArg = process.argv.slice(2).join(' ');
  const defaultTask = 'Create a Next.js app that displays "Hello, World!" on the homepage styled with Tailwind CSS.';


  try {
    // Setup sandbox
    console.log("Creating sandbox...");
    const sandbox = await SandboxInstance.createIfNotExists({
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

    const userTask = taskArg || defaultTask;
    console.log(`Task: ${userTask}\n`);

    // Agentic loop: streams messages as Claude works
    for await (const message of query({
      prompt: AGENT_PROMPT(userTask),
      options: {
        mcpServers: {
          "sandbox": {
            type: "http",
            url: `${sandbox.metadata?.url}/mcp`,
            headers: {
              Authorization: `Bearer ${process.env.BLAXEL_API_KEY}`,
            },
          },
        },
        tools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      }
    })) {
      // Print human-readable output
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block) {
            console.log(block.text);             // Claude's reasoning
          } else if ("name" in block) {
            console.log(`Tool: ${block.name}`);  // Tool being called
          }
        }
      } else if (message.type === "result") {
        console.log(`Done: ${message.subtype}`); // Final result
      }
    }


  } catch (error) {
    console.error("An error occurred:", error);
  }

}

main()
