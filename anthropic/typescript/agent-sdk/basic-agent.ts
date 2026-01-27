import { SandboxInstance } from "@blaxel/core";
import { query } from '@anthropic-ai/claude-agent-sdk';

function handleMessage(message: any) {
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if ("text" in block) {
        console.log(block.text);
      } else if ("name" in block) {
        console.log(`Tool: ${block.name}`);
      }
    }
  } else if (message.type === "result") {
    console.log(`Done: ${message.subtype}`);
  }
}

async function main() {

  try {
    // Setup sandbox
    console.log("\n=== Creating sandbox ===\n");
    const sandbox = await SandboxInstance.createIfNotExists({
      name: "my-sandbox",
      image: "blaxel/base-image:latest",
      memory: 4096,
    });
    console.log("Sandbox ready!");

    const mcpConfig = {
      mcpServers: {
        "sandbox": {
          type: "http" as const,
          url: `${sandbox.metadata?.url}/mcp`,
          headers: {
            Authorization: `Bearer ${process.env.BLAXEL_API_KEY}`,
          },
        },
      },
      tools: [],
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
    };

    // First prompt: List available tools
    console.log("\n=== Prompting agent to list available tools in sandbox ===\n");
    for await (const message of query({
      prompt: "List all the tools that are available to you. Display the count and name of each tool.",
      options: mcpConfig
    })) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block) {
            console.log(block.text);
          } else if ("name" in block) {
            console.log(`Tool: ${block.name}`);
          }
        }
      } else if (message.type === "result") {
        console.log(`Done: ${message.subtype}`);
      }
    }

    // Second prompt: Set up Python dev environment
    console.log("\n=== Prompting agent to set up Python dev environment in sandbox ===\n");
    for await (const message of query({
      prompt: "Set up a python dev environment using the available tools and provide the output of python -v at the end",
      options: mcpConfig
    })) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block) {
            console.log(block.text);
          } else if ("name" in block) {
            console.log(`Tool: ${block.name}`);
          }
        }
      } else if (message.type === "result") {
        console.log(`Done: ${message.subtype}`);
      }
    }


  } catch (error) {
    console.error("An error occurred:", error);
  }

}

main()
