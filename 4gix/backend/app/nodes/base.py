from abc import ABC, abstractmethod
from typing import Any, Dict


class Base4GIxNode(ABC):
    node_type: str
    category: str  # Reader, Transformer, Writer
    is_spatial: bool = False

    @abstractmethod
    def execute(self, inputs: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
        """
        inputs: Données issues des nœuds précédents (DataFrame / GeoDataFrame / Dict)
        params: Paramètres de configuration réglés dans l'UI (Fenêtre 2)
        returns: Output structuré pour le nœud suivant et l'inspection UI (Fenêtre 3)
        """
        pass
