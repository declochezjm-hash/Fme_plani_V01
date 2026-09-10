from pathlib import Path
from typing import Any, Dict

import pandas as pd

from app.nodes.base import Base4GIxNode
from app.nodes.serialization import serialize_dataframe


class FileReaderNode(Base4GIxNode):
    node_type = "4gix.readers.file"
    category = "Reader"
    is_spatial = False
    label = "File Reader"
    description = "Lit CSV, Parquet ou JSON tabulaire."

    def execute(self, inputs: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
        path = params.get("path")
        if not path:
            raise ValueError("path requis")

        file_path = Path(path)
        fmt = (params.get("format") or file_path.suffix.lstrip(".")).lower()

        if fmt in ("csv", "txt"):
            df = pd.read_csv(file_path)
        elif fmt in ("parquet", "pq"):
            df = pd.read_parquet(file_path)
        elif fmt == "json":
            df = pd.read_json(file_path)
        else:
            raise ValueError(f"Format non supporté: {fmt}")

        return serialize_dataframe(df)
