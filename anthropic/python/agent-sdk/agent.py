import asyncio
import sys
import logging
import os

from prompt import AGENT_PROMPT

from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, ResultMessage
from blaxel.core import SandboxInstance

host = os.getenv("HOST", "0.0.0.0")
port = int(os.getenv("PORT", "8000"))

async def main(task: str):
    # Get API key from environment
    api_key = os.getenv("BLAXEL_API_KEY")
    if not api_key:
        print("Error: BLAXEL_API_KEY environment variable not set")
        sys.exit(1)

    try:
        print("Creating sandbox...")
        sandbox = await SandboxInstance.create_if_not_exists({
            "name": "my-nextjs-sandbox",
            "image": "blaxel/nextjs:latest",
            "memory": 4096,
            "ports": [
                { "name": "preview", "target": 3000, "protocol": "HTTP" },
            ],
        })
        print("Sandbox ready!")

        print("Setting up preview URL...")
        preview = await sandbox.previews.create_if_not_exists({
            "metadata": { "name": "nextjs-app-preview" },
            "spec": {
              "port": 3000,
              "public": True,
              "responseHeaders": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Max-Age": "86400",
                "Vary": "Origin"
              }
            }
        })
        preview_url = preview.spec.url
        print(f"Preview URL ready: {preview_url}")

        # Note: You may see "Task exception was never retrieved" errors in logs
        # related to anyio cancel scope cleanup. This is a known SDK issue when
        # used with FastAPI and is non-fatal - the actual functionality works correctly.
        async for message in query(
            prompt=AGENT_PROMPT.format(task=task),
            options=ClaudeAgentOptions(
                system_prompt="You are connected to a sandbox environment with tools. Use the tools to accomplish the task.",
                mcp_servers={
                    "sandbox": {
                        "type": "http",
                        "url": f"{sandbox.metadata.url}/mcp",
                        "headers": {
                            "Authorization": f"Bearer {api_key}"
                        }
                    }
                },
                tools=[],
                permission_mode="bypassPermissions",
            )
        ):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if hasattr(block, "text"):
                        print(block.text)
                    elif hasattr(block, "name"):
                        print(f"Tool: {block.name}")
            elif isinstance(message, ResultMessage):
                print(f"Done: {message.subtype}")
                print(message.result)

    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python agent.py '<task>'")
        sys.exit(1)

    asyncio.run(main(" ".join(sys.argv[1:])))
cd .
