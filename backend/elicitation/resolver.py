from typing import List, Dict, Optional, Tuple
import re
import json

from semantic.clustering import InputItem
from llm.groq_client import call_llm

class ElicitationResolver:
    async def analyze_and_resolve(self, input_items: List[InputItem], clusters: List[Dict], conversation_history: Optional[Dict] = None) -> Tuple[List[Dict], List[List[Dict]], List[Dict], bool, List[str]]:
        if not input_items:
            return clusters, [], [], False, []

        newest_text = input_items[-1].normalized_text
        needs_clarification, questions = await self._check_if_clarification_needed(newest_text, conversation_history, input_items, clusters)
        
        resolved_clusters = clusters.copy()
        if needs_clarification:
            for cluster in resolved_clusters:
                cluster["confidence_score"] = 0.6
                cluster["requires_clarification"] = True

        return (resolved_clusters, [], [], needs_clarification, questions)

    async def _check_if_clarification_needed(self, text: str, history: Optional[Dict] = None, input_items: Optional[List[InputItem]] = None, clusters: Optional[List[Dict]] = None) -> Tuple[bool, List[str]]:
        context = self._build_context(text, history, input_items, clusters)

        prompt = f"""You are an ambiguity detection system. Your task is to determine if a user input is genuinely ambiguous or can be answered with available context.

                    ## DECISION FRAMEWORK

                    Apply this logical reasoning process:

                    ### STEP 1: CONTEXT ANALYSIS
                    - Extract all entities, topics, and references from the current input
                    - Identify any pronouns (it, this, that, them, these, those)
                    - Identify any action verbs requiring parameters (schedule, send, book, update, etc.)
                    - Note any temporal/spatial references (when, where, which)

                    ### STEP 2: RESOLVABILITY CHECK
                    For each ambiguous element (pronoun, missing parameter, vague reference):

                    1. **Pronoun Resolution Logic:**
                    - Check if the pronoun refers to a specific entity mentioned in the current input itself
                    - If not, check conversation history for recent mentions (within last 5 turns)
                    - If not, check if other items in the current request provide context
                    - Resolution confidence: HIGH if entity found in same sentence, MEDIUM if in recent history, LOW if not found

                    2. **Parameter Completeness Logic:**
                    - Identify the action verb and its required parameters
                    - Check if all critical parameters are present (who, what, when, where, how)
                    - Consider if missing parameters can be inferred from context or have sensible defaults
                    - Only flag if parameter is CRITICAL and cannot be inferred

                    3. **Reference Resolution Logic:**
                    - For vague references ("that thing", "the one we discussed"):
                        - Check if conversation history contains the referenced topic
                        - Check if current request provides enough context
                    - Resolution confidence based on recency and specificity of reference

                    ### STEP 3: ANSWERABILITY ASSESSMENT
                    Ask: "Can this question/request be meaningfully answered with available information?"

                    - YES → Mark as CLEAR (no clarification needed)
                    - NO → Proceed to STEP 4

                    ### STEP 4: AMBIGUITY CLASSIFICATION
                    Only flag as NEEDS_CLARIFICATION if ALL of these are true:
                    1. There is a genuine ambiguity (pronoun, missing parameter, or vague reference)
                    2. The ambiguity cannot be resolved from:
                    - The input itself
                    - Recent conversation history (last 5 turns)
                    - Other items in the current request
                    - Common knowledge or context
                    3. The ambiguity prevents providing a meaningful response

                    ### STEP 5: CONSERVATIVE PRINCIPLE
                    When in doubt, default to CLEAR. Only flag if you are confident (≥80%) that clarification is necessary.

                    ## CONTEXT INFORMATION

                    Current Input: "{text}"

                    {context}

                    ## OUTPUT FORMAT

                    Provide your analysis in JSON format:
                    {{
                        "reasoning": {{
                            "step1_context_analysis": "Entities, pronouns, actions identified",
                            "step2_resolvability": "How each ambiguous element was resolved or not",
                            "step3_answerability": "Can this be answered? Why/why not?",
                            "step4_classification": "Final classification reasoning",
                            "confidence": 0.0-1.0
                        }},
                        "decision": "CLEAR" or "NEEDS_CLARIFICATION",
                        "questions": ["question1", "question2"]  // Only if decision is NEEDS_CLARIFICATION
                    }}

                    ## CRITICAL PRINCIPLES

                    1. **Context Supremacy**: If context can resolve ambiguity, it's CLEAR
                    2. **Inference Tolerance**: Allow reasonable inferences (e.g., "schedule meeting" → can infer default time if not critical)
                    3. **Question Validity**: Questions are inherently answerable unless they contain unresolvable ambiguity
                    4. **Conversation Continuity**: Assume pronouns refer to recent topics unless proven otherwise
                    5. **Completeness vs. Ambiguity**: Missing optional info ≠ ambiguity. Only flag if critical info is missing AND cannot be inferred

                    Now analyze the input using this framework.
                """

        try:
            response = await call_llm(prompt)
            result = self._parse_llm_response(response)
            if result:
                needs_clarification = result.get("decision", "CLEAR") == "NEEDS_CLARIFICATION"
                questions = result.get("questions", [])
                confidence = result.get("reasoning", {}).get("confidence", 0.0)

                if needs_clarification and confidence >= 0.8:
                    return (True, questions[:2])
                return (False, [])
            else:
                return self._parse_text_response(response)
        except Exception as e:
            return False, []

    def _build_context(self, text: str, history: Optional[Dict], input_items: List[InputItem], clusters: List[Dict]) -> str:
        context_parts = []

        if history and history.get("previous_inputs"):
            context_parts.append("## Conversation History (Recent):")
            for inp in history['previous_inputs'][-5:]:
                if inp.get('text'):
                    context_parts.append(f"- {inp['text']}")

        other_items = []
        for item in input_items:
            if item.normalized_text != text:
                other_items.append(item.normalized_text)
        
        if other_items:
            context_parts.append("\n## Other Items in Current Request:")
            for item_text in other_items:
                context_parts.append(f"- {item_text}")

        if clusters:
            context_parts.append("\n## Related Topics in Current Session:")
            for cluster in clusters[:3]:
                cluster_texts = []
                for item in cluster.get('items', [])[:2]:
                    if 'normalized_text' in item:
                        cluster_texts.append(item['normalized_text'])
                    elif 'text_preview' in item:
                        cluster_texts.append(item['text_preview'])
                if cluster_texts:
                    context_parts.append(f"- {' | '.join(cluster_texts)}")
        
        return "\n".join(context_parts) if context_parts else "No additional context available."

    def _parse_llm_response(self, response: str) -> Optional[Dict]:
        try:
            if '"decision"' in response or "'decision'" in response:
                cleaned = response.replace("'", '"')
                json_match = re.search(r'\{.*"decision".*\}', cleaned, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group())
        except (json.JSONDecodeError, ValueError):
            pass
        return None

    def _parse_text_response(self, response: str) -> Tuple[bool, List[str]]:
        needs_clarification = "NEEDS_CLARIFICATION" in response.upper()
        questions = []
        if needs_clarification:
            lines = response.split('\n')
            collecting = False
            for line in lines:
                if 'QUESTIONS:' in line.upper() or 'question' in line.lower():
                    collecting = True
                    continue
                if collecting and line.strip():
                    question = re.sub(r'^[-•*"\']+\s*', '', line.strip())
                    if question and len(question) > 10:
                        questions.append(question)
                        if len(questions) >= 2:
                            break

        return needs_clarification, questions