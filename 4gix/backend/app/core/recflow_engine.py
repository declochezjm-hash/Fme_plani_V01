"""
Moteur d'exécution 4GIx — graphe DAG (format n8n) + registre de nœuds Base4GIxNode.

Note: le paquet PyPI `recflow` (RecommendFlow) est listé pour alignement roadmap ;
l'exécution DAG du socle s'appuie sur NetworkX et le registre 4GIx jusqu'à intégration
d'un runtime Recflow dédié ETL.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import networkx as nx

from app.nodes.registry import get_node_class
from app.nodes.serialization import ui_snapshot


@dataclass
class NodeExecutionState:
    node_id: str
    node_name: str
    node_type: str
    status: str
    output: dict[str, Any] | None = None
    error: str | None = None


@dataclass
class WorkflowRunResult:
    run_id: str
    status: str
    node_states: dict[str, NodeExecutionState] = field(default_factory=dict)
    execution_order: list[str] = field(default_factory=list)


class RecflowEngine:
    """Wrapper d'exécution DAG compatible schéma n8n."""

    def __init__(self, on_node_finished: Callable[[NodeExecutionState], None] | None = None):
        self._on_node_finished = on_node_finished
        self._graph: nx.DiGraph | None = None
        self._nodes_by_id: dict[str, dict[str, Any]] = {}
        self._incoming: dict[str, list[tuple[str, int, int]]] = {}

    def load_workflow(self, workflow: dict[str, Any]) -> None:
        """Charge un workflow au format n8n (nodes + connections)."""
        nodes = workflow.get("nodes") or []
        connections = workflow.get("connections") or {}

        self._nodes_by_id = {n["id"]: n for n in nodes if "id" in n}
        self._graph = nx.DiGraph()
        self._incoming = {node_id: [] for node_id in self._nodes_by_id}

        for node_id in self._nodes_by_id:
            self._graph.add_node(node_id)

        id_by_name = {n.get("name", n["id"]): n["id"] for n in nodes if "id" in n}

        for source_name, outputs in connections.items():
            source_id = id_by_name.get(source_name, source_name)
            if source_id not in self._nodes_by_id:
                continue
            main_outputs = outputs.get("main") or []
            for output_index, targets in enumerate(main_outputs):
                for link in targets or []:
                    target_name = link.get("node")
                    target_id = id_by_name.get(target_name, target_name)
                    input_index = int(link.get("index", 0))
                    if target_id in self._nodes_by_id:
                        self._graph.add_edge(source_id, target_id)
                        self._incoming[target_id].append((source_id, output_index, input_index))

        if not nx.is_directed_acyclic_graph(self._graph):
            raise ValueError("Le workflow contient un cycle (DAG invalide)")

    def _build_inputs(self, node_id: str, cache: dict[str, dict[str, Any]]) -> dict[str, Any]:
        inputs: dict[str, Any] = {}
        for source_id, _out_idx, in_idx in self._incoming.get(node_id, []):
            source_out = cache.get(source_id)
            if source_out is None:
                continue
            key = "main" if in_idx == 0 else f"input_{in_idx}"
            inputs[key] = source_out
        if "main" not in inputs and self._incoming.get(node_id):
            first = self._incoming[node_id][0][0]
            inputs["main"] = cache.get(first)
        return inputs

    def execute(self, run_id: str = "local") -> WorkflowRunResult:
        if self._graph is None:
            raise RuntimeError("Workflow non chargé — appelez load_workflow()")

        order = list(nx.topological_sort(self._graph))
        cache: dict[str, dict[str, Any]] = {}
        states: dict[str, NodeExecutionState] = {}
        global_status = "success"

        for node_id in order:
            meta = self._nodes_by_id[node_id]
            node_name = meta.get("name", node_id)
            node_type = meta.get("type", "")
            params = meta.get("parameters") or {}

            state = NodeExecutionState(
                node_id=node_id,
                node_name=node_name,
                node_type=node_type,
                status="running",
            )
            states[node_id] = state

            try:
                node_cls = get_node_class(node_type)
                instance = node_cls()
                inputs = self._build_inputs(node_id, cache)
                raw_out = instance.execute(inputs=inputs, params=params)
                cache[node_id] = raw_out
                state.output = ui_snapshot(raw_out)
                state.status = "success"
            except Exception as exc:  # noqa: BLE001 — remontée contrôlée au run
                state.status = "error"
                state.error = str(exc)
                global_status = "error"
                if self._on_node_finished:
                    self._on_node_finished(state)
                break

            if self._on_node_finished:
                self._on_node_finished(state)

        return WorkflowRunResult(
            run_id=run_id,
            status=global_status,
            node_states=states,
            execution_order=order,
        )
