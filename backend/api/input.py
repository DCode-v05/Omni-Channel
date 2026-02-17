from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime
import asyncio

from schemas.models import GatewayOutput
from metadata.enrich import add_metadata
from validators.payload import validate_text_payload, validate_audio_payload, validate_document_payload, validate_image_payload
from resolvers.input_type import detect_input_type
from storage.disk import save_file
from normalisation.dispatcher import normalize_input
from llm.groq_client import call_llm
from history.memory_store import history_store
from sentiment.analyzer import analyze_sentiment_and_tone
from tts.disfluency import inject_disfluencies
from semantic.clustering import cluster_inputs_history, InputItem
from context.constructor import ContextEnvelopeConstructor
from elicitation.resolver import ElicitationResolver
from memory.memory_router import memory_router
from memory.user_memory import user_memory

router = APIRouter(prefix="/input", tags=["Input"])

@router.post("/omnichannel")
async def omnichannel_input(text: Optional[str] = Form(None), audio: Optional[UploadFile] = File(None), document: Optional[UploadFile] = File(None), image: Optional[UploadFile] = File(None), channel: str = Form(...), user_id: Optional[UUID] = Form(None), session_id: Optional[UUID] = Form(None)):
    if not text and not audio and not document and not image:
        raise HTTPException(status_code=400, detail="At least one of text, audio, document, or image must be provided")

    input_id = str(uuid4())
    metadata = add_metadata(channel=channel, user_id=user_id, session_id=session_id)

    async def process_text():
        if not text:
            return None
        validate_text_payload(text)
        content_type = "plain/text"
        input_type = detect_input_type(content_type)
        gateway_output = GatewayOutput(input_id=input_id, input_type=input_type, raw_payload_ref="inline", content_type=content_type, metadata=metadata, raw_text=text)
        normalized_text = await normalize_input(gateway_output)
        return InputItem(input_type="text",normalized_text=normalized_text,original_data={"gateway_output": gateway_output})

    async def process_audio():
        if not audio:
            return None
        validate_audio_payload(audio)
        input_type = detect_input_type(audio.content_type)
        raw_payload_ref = await save_file(audio, input_id=input_id, category="audio")
        gateway_output = GatewayOutput(input_id=input_id,input_type=input_type,raw_payload_ref=raw_payload_ref,content_type=audio.content_type,metadata=metadata)
        normalized_text = await normalize_input(gateway_output)
        return InputItem(input_type="audio",normalized_text=normalized_text,original_data={"gateway_output": gateway_output})

    async def process_document():
        if not document:
            return None
        validate_document_payload(document)
        input_type = detect_input_type(document.content_type)
        raw_payload_ref = await save_file(document, input_id=input_id, category="document")
        gateway_output = GatewayOutput(input_id=input_id,input_type=input_type,raw_payload_ref=raw_payload_ref,content_type=document.content_type,metadata=metadata)
        normalized_text = await normalize_input(gateway_output)
        return InputItem(input_type="document",normalized_text=normalized_text,original_data={"gateway_output": gateway_output})

    async def process_image():
        if not image:
            return None
        validate_image_payload(image)
        input_type = detect_input_type(image.content_type)
        raw_payload_ref = await save_file(image, input_id=input_id, category="image")
        gateway_output = GatewayOutput(input_id=input_id,input_type=input_type,raw_payload_ref=raw_payload_ref,content_type=image.content_type,metadata=metadata)
        normalized_text = await normalize_input(gateway_output)
        return InputItem(input_type="image",normalized_text=normalized_text,original_data={"gateway_output": gateway_output})
    
    results = await asyncio.gather(process_text(), process_audio(), process_document(), process_image())
    input_items = [item for item in results if item is not None]
    
    previous_clusters = []
    if session_id:
        previous_clusters = history_store.get_clusters(str(session_id))
    clusters = await cluster_inputs_history(input_items, previous_clusters, 0.5)
    if session_id:
        history_store.save_clusters(str(session_id), clusters)
    
    elicitation = ElicitationResolver()
    history_data = None
    if session_id:
        history_data = history_store.get_history(str(session_id))
    resolved_clusters, _, _, needs_clarification, questions = await elicitation.analyze_and_resolve(input_items=input_items, clusters=clusters, conversation_history=history_data)
    if needs_clarification:
        return {
            "input_id": input_id,
            "needs_clarification": True,
            "questions": questions,
            "clusters": resolved_clusters
        }

    constructor = ContextEnvelopeConstructor()
    context_envelope = await constructor.construct_envelope(input_items=input_items,clusters=resolved_clusters,metadata=metadata,input_id=input_id)

    user_sentiment = None
    if text:
        user_sentiment = await analyze_sentiment_and_tone(text)
    else:
        for item in input_items:
            if item.normalized_text:
                user_sentiment = await analyze_sentiment_and_tone(item.normalized_text)
                break

    all_responses = []
    cluster_inputs = []
    
    for cluster in resolved_clusters:
        cluster_texts = []
        for cluster_item in cluster.get("items", []):
            if 'normalized_text' in cluster_item:
                cluster_texts.append(cluster_item['normalized_text'])
            elif 'original_data' in cluster_item and 'gateway_output' in cluster_item['original_data']:
                gw_output = cluster_item['original_data']['gateway_output']
                if 'raw_text' in gw_output and gw_output['raw_text']:
                    cluster_texts.append(gw_output['raw_text'])
                elif 'text_preview' in cluster_item:
                    cluster_texts.append(cluster_item['text_preview'])
            elif 'text_preview' in cluster_item:
                cluster_texts.append(cluster_item['text_preview'])

        combined_text = "\n".join(cluster_texts) if cluster_texts else ""
        cluster_inputs.append(combined_text)
        
        memory_results = None
        if combined_text:
            memory_results = await memory_router.query_memories(
                query=combined_text,
                user_id=str(user_id) if user_id else None
            )
        
        context_envelope_dict = context_envelope.model_dump()
        if memory_results and memory_results.get("combined_context"):
            context_envelope_dict["memory_context"] = memory_results["combined_context"]
        
        llm_response = await call_llm(combined_text, context_envelope_dict, user_sentiment)

        input_types = cluster.get('input_types', []) or []
        has_audio = 'audio' in input_types
        if has_audio:
            is_excited = user_sentiment and user_sentiment.get('sentiment') == 'excited'
            intensity = 0.7 if is_excited else 0.5
            llm_response = inject_disfluencies(llm_response, intensity=intensity, user_sentiment=user_sentiment)

        all_responses.append({
            "bucket_id": cluster['bucket_id'],
            "input_types": cluster['input_types'],
            "item_count": cluster['item_count'],
            "llm_response": llm_response,
            "sentiment": user_sentiment
        })
    
    if session_id:
        history_store.add_input(
            str(session_id),
            {
                "input_id": input_id,
                "text": text if text else None,
                "has_audio": audio is not None,
                "has_document": document is not None,
                "has_image": image is not None,
                "channel": channel,
                "timestamp": datetime.now().isoformat()
            }
        )

        if not needs_clarification:
            history_store.add_response(
                str(session_id),
                {
                    "input_id": input_id,
                    "clusters": len(resolved_clusters),
                    "responses_count": len(all_responses),
                    "timestamp": datetime.now().isoformat()
                }
            )
    
    if user_id and not needs_clarification:
        for i, response_data in enumerate(all_responses):
            if response_data.get('llm_response') and i < len(cluster_inputs):
                await user_memory.learn_from_interaction(
                    user_id=str(user_id),
                    user_input=cluster_inputs[i] if cluster_inputs[i] else (text or ""),
                    response=response_data['llm_response'],
                    sentiment=user_sentiment
                )

    return {
        "input_id": input_id,
        "clusters": resolved_clusters,
        "responses": all_responses,
        "total_clusters": len(resolved_clusters),
        "context_envelope": context_envelope.model_dump(),
        "sentiment": user_sentiment
    }