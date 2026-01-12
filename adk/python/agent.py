import asyncio
import sys
import logging
import os

from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.runners import InMemoryRunner
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from google.genai import types
from blaxel.core import SandboxInstance

from prompt import AGENT_PROMPT

# Suppress noisy loggers
logging.getLogger("LiteLLM").setLevel(logging.WARNING)
logging.getLogger("litellm").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("py.warnings").setLevel(logging.ERROR)
logging.getLogger("mcp.client.streamable_http").setLevel(logging.WARNING)
logging.getLogger("google_genai.types").setLevel(logging.WARNING)

# Capture warnings and route them through logging system
logging.captureWarnings(True)


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

        print("Retrieving tools...")
        toolset = McpToolset(
            connection_params=StreamableHTTPConnectionParams(
                url=sandbox.metadata.url + "/mcp",
                headers={"Authorization": f"Bearer {api_key}"},
            ),
        )
        tools = await toolset.get_tools()
        print(f"Tools ready: {len(tools)} tools available!")

        # Model string can be:
        # - "openai/gpt-4o" for OpenAI
        # - "anthropic/claude-sonnet-4-5-20250929" for Anthropic
        # - "gemini-2.5-flash" for Gemini (native format, no provider prefix)
        model = "anthropic/claude-3-7-sonnet-20250219"

        # Create agent with task-specific prompt
        root_agent = Agent(
            name="coding_agent",
            model=model,
            instruction=AGENT_PROMPT.format(task=task),
            tools=tools,
        )

        # Wrap agent in App container
        app = App(
            name="coding_agent_app",
            root_agent=root_agent,
        )

        # Create runner and execute
        runner = InMemoryRunner(app=app)

        # Create a new session
        user_id = "user"
        session = await runner.session_service.create_session(
            app_name="coding_agent_app",
            user_id=user_id
        )

        print("Starting agent...")

        async for event in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=types.Content(parts=[types.Part(text=task)])
        ):

            # Print the agent's text responses
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if hasattr(part, 'text') and part.text:
                        print(part.text, end="", flush=True)
                        print()

        print("Agent finished!")
        print(f"Preview URL: {preview_url}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await toolset.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python agent.py '<task>'")
        sys.exit(1)

    asyncio.run(main(" ".join(sys.argv[1:])))
