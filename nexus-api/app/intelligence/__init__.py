"""Execution intelligence package — Phase 6 AI investigation layer.

Public surface
--------------
langgraph_rca   — LangGraph RCA workflow (run_rca, get_rca_graph)
embeddings      — EmbeddingService, get_embedding_service
vector_store    — QdrantVectorStore, get_vector_store, COLLECTION_* constants
memory          — FailureMemoryStore, get_memory_store, FailureMemoryRecord
nats_transport  — NATSAITransport, get_nats_transport
ai_job_runner   — run_ai_job_loop (standalone NATS consumer)
"""

