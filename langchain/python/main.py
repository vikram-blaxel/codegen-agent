from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient
import asyncio
import os
from blaxel.core import SandboxInstance

async def main():
    # Set OpenAI API key - replace with your actual key or use environment variable
    if not os.getenv("OPENAI_API_KEY"):
        print("Warning: OPENAI_API_KEY environment variable not set")
        # Uncomment and set your key here if needed:
        # os.environ["OPENAI_API_KEY"] = "your-key-here"
    sandbox = await SandboxInstance.create_if_not_exists({
        "name": "my-nextjs2-sandbox",
        "image": "blaxel/nextjs:latest",
        "memory": 4096,
        "ports": [
            { "name": "preview", "target": 3000, "protocol": "HTTP" },
        ],
    })

    client = MultiServerMCPClient(
        {
            "sandbox": {
                "transport": "http",
                "url": f"{sandbox.metadata.url}/mcp",
                "headers": {
                    "Authorization": "Bearer bl_aaab7x5mvvr2rydqqhh1w4w0yr47ljkb"
                }
            }
        }
    )
    tools = await client.get_tools()

    # Fix tool schemas for OpenAI compatibility
    # OpenAI requires 'properties' field even for tools with no parameters
    for tool in tools:
        if hasattr(tool, 'args_schema'):
            # The args_schema from MCP adapter is a dict
            schema = tool.args_schema if isinstance(tool.args_schema, dict) else None
            if schema and schema.get('type') == 'object' and 'properties' not in schema:
                # Add empty properties dict for tools with no parameters
                schema['properties'] = {}

    print(f"Prepared {len(tools)} tools for agent")

    agent = create_agent(
        model="openai:gpt-4.1",
        tools=tools
    )

    response = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "what tools do you have?"}]}
    )
    print(response)

if __name__ == "__main__":
    asyncio.run(main())
