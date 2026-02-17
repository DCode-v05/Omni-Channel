from groq import AsyncGroq
from dotenv import load_dotenv
import os
from typing import Dict, Optional, Any

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found in environment variables")

client = AsyncGroq(api_key=GROQ_API_KEY)

async def call_llm(prompt: str, context_envelope: Optional[Dict[str, Any]] = None, user_sentiment: Optional[Dict[str, Any]] = None) -> str:
    messages = []

    if context_envelope:
        system_context = _format_context(context_envelope, user_sentiment)
        messages.append({"role": "system", "content": system_context})

    messages.append({"role": "user", "content": prompt})

    response = await client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages,
        temperature=0.2,
        max_tokens=150,
    )

    return response.choices[0].message.content

def _format_context(context_envelope: Dict[str, Any], user_sentiment: Optional[Dict[str, Any]] = None) -> str:
    parts = []

    parts.append("=== RESPONSE GUIDELINES ===")
    parts.append("Keep responses SHORT and CONVERSATIONAL (2-4 sentences maximum).")
    parts.append("Speak naturally, as if having a casual conversation.")
    parts.append("Avoid long paragraphs or essay-style responses.")
    parts.append("Be concise and to the point.")
    parts.append("")

    if user_sentiment:
        sentiment = user_sentiment.get('sentiment', 'neutral')
        tone = user_sentiment.get('tone', 'neutral')
        emotional_intensity = user_sentiment.get('emotional_intensity', 0.5) 

        parts.append("=== USER SENTIMENT & EMOTIONAL CONTEXT ===")
        parts.append(f"Detected User Sentiment: {sentiment}")
        parts.append(f"Detected Tone: {tone}")
        parts.append(f"Emotional Intensity: {emotional_intensity:.1f}")
        parts.append("")
        parts.append("=== SENTIMENT-AWARE RESPONSE INSTRUCTIONS ===")

        if sentiment == 'frustrated':
            parts.append("The user is FRUSTRATED. Respond with:")
            parts.append("- Empathy and understanding")
            parts.append("- Apologetic tone (e.g., 'I'm really sorry you're experiencing this...')")
            parts.append("- Calm, reassuring language")
            parts.append("- Focus on helping solve their problem")
            parts.append("- Avoid being dismissive or overly technical")
            
        elif sentiment == 'excited':
            parts.append("The user is EXCITED. Respond with:")
            parts.append("- Enthusiasm and positive energy")
            parts.append("- Matching their excitement level")
            parts.append("- Encouraging and supportive language")
            parts.append("- Celebrate their enthusiasm")
            
        elif sentiment == 'happy':
            parts.append("The user is HAPPY. Respond with:")
            parts.append("- Positive and warm tone")
            parts.append("- Friendly and encouraging language")
            parts.append("- Match their positive energy")
            parts.append("- Be supportive and engaging")
            
        elif sentiment == 'surprised':
            parts.append("The user is SURPRISED. Respond with:")
            parts.append("- Acknowledge their surprise")
            parts.append("- Helpful and informative tone")
            parts.append("- Provide clarity and context")
            parts.append("- Be engaging and responsive")
            
        elif sentiment == 'sarcastic':
            parts.append("The user is being SARCASTIC. Respond with:")
            parts.append("- Acknowledge their tone (e.g., 'I sense some frustration...')")
            parts.append("- Empathetic understanding")
            parts.append("- Address underlying concerns")
            parts.append("- Be genuine and helpful, not dismissive")
            
        elif sentiment == 'calm':
            parts.append("The user is CALM. Respond with:")
            parts.append("- Professional, clear communication")
            parts.append("- Match their calm demeanor")
            parts.append("- Direct and helpful")
            
        else:
            parts.append("The user is NEUTRAL. Respond with:")
            parts.append("- Professional and helpful")
            parts.append("- Clear and concise")
        
        parts.append("")
        parts.append("IMPORTANT: Adapt your response CONTENT and TONE based on the user's sentiment.")
        parts.append("If frustrated → be empathetic and apologetic. If excited → match their energy.")
        parts.append("")

    if context_envelope.get('conversation_history'):
        history = context_envelope['conversation_history']
        parts.append("=== CONVERSATION HISTORY ===")
        if history.get('session_summary'):
            parts.append(f"Summary: {history['session_summary']}")
        if history.get('topics_discussed'):
            parts.append(f"Topics: {', '.join(history['topics_discussed'])}")
        if history.get('previous_inputs'):
            parts.append("\nRecent Inputs:")
            for inp in history['previous_inputs'][-5:]:
                parts.append(f"  - {inp.get('text', 'N/A')}")
        parts.append("")

    if context_envelope.get('cluster_envelopes'):
        parts.append("=== CURRENT CLUSTERS ===")
        for c in context_envelope['cluster_envelopes']:
            parts.append(f"Cluster {c.get('bucket_id')}: {c.get('item_count', 0)} items")
        parts.append("")

    if context_envelope.get('memory_context'):
        parts.append("=== RELEVANT KNOWLEDGE ===")
        parts.append(context_envelope['memory_context'])
        parts.append("")
        parts.append("Use the above knowledge to provide accurate and helpful responses.")

    parts.append("Use conversation history to provide context-aware responses.")
    
    return "\n".join(parts)