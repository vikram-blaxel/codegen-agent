import os
from fastapi import FastAPI, HTTPException, Request
from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, ResultMessage
from blaxel.core import SandboxInstance
import uvicorn

host = os.getenv("HOST", "0.0.0.0")
port = int(os.getenv("PORT", "8000"))

app = FastAPI()


@app.post("/query")
async def query_endpoint(request: Request):

    body = await request.json()
    prompt = body.get("prompt")

    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    api_key = os.getenv("BLAXEL_API_KEY")

    if not api_key:
        raise HTTPException(status_code=400, detail="BLAXEL_API_KEY env var is required")

    try:
        sandbox = await SandboxInstance.create_if_not_exists({
            "name": "my-sandbox",
            "image": "blaxel/my-sandbox:latest",
            "memory": 4096,
        })

        response = ""

        # Note: You may see "Task exception was never retrieved" errors in logs
        # related to anyio cancel scope cleanup. This is a known SDK issue when
        # used with FastAPI and is non-fatal - the actual functionality works correctly.
        async for message in query(
            prompt=prompt,
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
                response = message.result

        return {"response": response}
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error) if error else "Unknown error"
        )


if __name__ == "__main__":
    print(f"Server listening on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
