import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.core.recflow_engine import RecflowEngine

router = APIRouter(prefix="/execution", tags=["execution"])


class WorkflowPayload(BaseModel):
    workflow: dict[str, Any] = Field(..., description="Schéma n8n (nodes + connections)")


class ExecutionResponse(BaseModel):
    run_id: str
    status: str
    execution_order: list[str]
    node_states: dict[str, Any]


@router.post("/run", response_model=ExecutionResponse)
def run_workflow(payload: WorkflowPayload) -> ExecutionResponse:
    run_id = str(uuid.uuid4())
    engine = RecflowEngine()
    try:
        engine.load_workflow(payload.workflow)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = engine.execute(run_id=run_id)
    return ExecutionResponse(
        run_id=result.run_id,
        status=result.status,
        execution_order=result.execution_order,
        node_states={
            nid: {
                "node_id": s.node_id,
                "node_name": s.node_name,
                "node_type": s.node_type,
                "status": s.status,
                "output": s.output,
                "error": s.error,
            }
            for nid, s in result.node_states.items()
        },
    )


@router.websocket("/ws")
async def execution_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            workflow = data.get("workflow")
            if not workflow:
                await websocket.send_json({"type": "error", "message": "workflow requis"})
                continue

            run_id = str(uuid.uuid4())
            await websocket.send_json({"type": "run_started", "run_id": run_id})

            engine = RecflowEngine()
            engine.load_workflow(workflow)
            result = engine.execute(run_id=run_id)

            for node_id in result.execution_order:
                s = result.node_states[node_id]
                await websocket.send_json(
                    {
                        "type": "node_finished",
                        "run_id": run_id,
                        "node_id": s.node_id,
                        "status": s.status,
                        "output": s.output,
                        "error": s.error,
                    }
                )

            await websocket.send_json(
                {
                    "type": "run_finished",
                    "run_id": run_id,
                    "status": result.status,
                    "execution_order": result.execution_order,
                }
            )
    except WebSocketDisconnect:
        return
