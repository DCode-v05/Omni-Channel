from typing import List, Dict, Optional, Tuple

import numpy as np
from sklearn.cluster import AgglomerativeClustering

from semantic.embeddings import get_embeddings, cosine_similarity

SIMILARITY_THRESHOLD = 0.5

class InputItem:
    def __init__(self, input_type: int, normalized_text: str, original_data: dict):
        self.input_type = input_type
        self.normalized_text = normalized_text
        self.original_data = original_data

def _extract_cluster_item_text(cluster_item: Dict) -> str:
    if not isinstance(cluster_item, dict):
        return ""

    text = cluster_item.get("normalized_text") or cluster_item.get("text_preview")
    if text:
        return text

    original_data = cluster_item.get("original_data") or {}
    if isinstance(original_data, dict):
        gw_output = original_data.get("gateway_output") or {}
        if isinstance(gw_output, dict):
            raw_text = gw_output.get("raw_text")
            if raw_text:
                return raw_text

    return ""

def _centroid_embedding(embeddings: np.ndarray) -> Optional[np.ndarray]:
    if embeddings is None:
        return None
    if len(embeddings) == 0:
        return None
    return np.mean(embeddings, axis=0)

async def _cluster_inputs(inputs: List[InputItem]) -> List[List[InputItem]]:
    if len(inputs) == 0:
        return []

    if len(inputs) == 1:
        return [[inputs[0]]]

    texts = [input.normalized_text for input in inputs]
    embeddings = await get_embeddings(texts)

    n = len(inputs)
    similarity_matrix = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            similarity_matrix[i][j] = cosine_similarity(embeddings[i], embeddings[j])
            similarity_matrix[j][i] = similarity_matrix[i][j]

    distance_matrix = 1.0 - similarity_matrix
    np.fill_diagonal(distance_matrix, 0.0)
    distance_matrix = np.clip(distance_matrix, 0.0, 2.0)

    distance_threshold = 1.0 - SIMILARITY_THRESHOLD
    model = AgglomerativeClustering(
        n_clusters=None,
        metric="precomputed",
        linkage="average",
        distance_threshold=distance_threshold,
    )
    labels = model.fit_predict(distance_matrix)

    label_to_indices: Dict[int, List[int]] = {}
    for idx, label in enumerate(labels):
        label_to_indices.setdefault(int(label), []).append(idx)

    clusters_indices_sorted: List[Tuple[int, List[int]]] = sorted(
        ((min(idxs), idxs) for idxs in label_to_indices.values()),
        key=lambda t: t[0],
    )

    clusters: List[List[InputItem]] = []
    for _, idxs in clusters_indices_sorted:
        clusters.append([inputs[i] for i in idxs])

    return clusters

async def _cluster_inputs_bucket(inputs: List[InputItem]) -> List[Dict]:
    clusters = await _cluster_inputs(inputs)
    
    result = []
    for idx, cluster in enumerate(clusters):
        result.append({
            "bucket_id": idx,
            "items": [
                {
                    "input_type": input.input_type,
                    "text_preview": input.normalized_text,
                    "normalized_text": input.normalized_text,
                    "original_data": input.original_data
                }
                for input in cluster
            ],
            "item_count": len(cluster),
            "input_types": list(set(input.input_type for input in cluster))
        })

    return result

async def cluster_inputs_history(inputs: List[InputItem], previous_clusters: List[Dict] = None, threshold: float = 0.5) -> List[Dict]:
    if not inputs:
        return []
    
    if not previous_clusters:
        return await _cluster_inputs_bucket(inputs)

    new_texts = [input.normalized_text for input in inputs]
    new_embeddings = await get_embeddings(new_texts)
    
    cluster_representatives: List[Optional[np.ndarray]] = []
    for cluster in previous_clusters:
        item_texts = []
        for cluster_item in cluster.get("items", []) or []:
            item_text = _extract_cluster_item_text(cluster_item)
            if item_text:
                item_texts.append(item_text)

        if not item_texts:
            cluster_representatives.append(None)
            continue

        item_embeddings = await get_embeddings(item_texts)
        cluster_representatives.append(_centroid_embedding(item_embeddings))

    assigned = [False] * len(inputs)
    updated_clusters = [cluster.copy() for cluster in previous_clusters]

    for i, (item, new_embedding) in enumerate(zip(inputs, new_embeddings)):
        best_cluster_idx = None
        best_similarity = -1.0

        for cluster_idx, rep in enumerate(cluster_representatives):
            if rep is None:
                continue
            similarity = cosine_similarity(new_embedding, rep)
            if similarity > best_similarity:
                best_similarity = similarity
                best_cluster_idx = cluster_idx

        if best_cluster_idx is not None and best_similarity >= threshold:
            assigned[i] = True
            updated_clusters[best_cluster_idx].setdefault("items", []).append({
                "input_type": item.input_type,
                "text_preview": item.normalized_text,
                "normalized_text": item.normalized_text,
                "original_data": item.original_data,
            })
            updated_clusters[best_cluster_idx]["item_count"] = int(updated_clusters[best_cluster_idx].get("item_count", 0)) + 1
            existing_types = set(updated_clusters[best_cluster_idx].get("input_types", []) or [])
            existing_types.add(item.input_type)
            updated_clusters[best_cluster_idx]["input_types"] = list(existing_types)

    unassigned_items = [item for i, item in enumerate(inputs) if not assigned[i]]
    if unassigned_items:
        new_clusters = await _cluster_inputs_bucket(unassigned_items)
        max_bucket_id = max((cluster.get("bucket_id", 0) for cluster in updated_clusters), default=-1)
        for cluster in new_clusters:
            cluster["bucket_id"] = max_bucket_id + 1
            max_bucket_id += 1
        updated_clusters.extend(new_clusters)

    return updated_clusters