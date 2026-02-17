import { useState } from 'react';
import { OmniInput } from './components/OmniInput';
import { VoiceMode } from './components/VoiceMode';
import { ChatArea } from './components/ChatArea';
import { ChatMessage } from './components/ChatMessage';
import './styles/index.css';

function App() {
  const [sessionId] = useState<string>(() => {
    const stored = localStorage.getItem('omni_channel_session_id');
    if (stored) {
      return stored;
    }
    const newSessionId = crypto.randomUUID();
    localStorage.setItem('omni_channel_session_id', newSessionId);
    return newSessionId;
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleResponse = (response: any) => {
    setError(null);
    
    const currentInputId = response.input_id;
    
    // Extract user input from the response
    // Only process items that belong to THIS request (current input_id)
    if (response.clusters && response.clusters.length > 0) {
      response.clusters.forEach((cluster: any) => {
        cluster.items?.forEach((item: any) => {
          // Check if this item belongs to the current request
          const itemInputId = item.original_data?.gateway_output?.input_id;
          if (itemInputId !== currentInputId) {
            return; // Skip items from previous requests
          }
          
          // Try multiple sources for the input text
          const inputText = item.normalized_text || 
                          item.text_preview || 
                          item.original_data?.gateway_output?.raw_text || 
                          '';
          if (inputText.trim()) {
            const fileName = item.original_data?.gateway_output?.raw_payload_ref;
            const userMessage: ChatMessage = {
              id: `${currentInputId}-user-${cluster.bucket_id}-${item.input_type}`,
              type: 'user',
              content: inputText.trim(),
              bucketId: cluster.bucket_id,
              timestamp: new Date(),
              inputType: item.input_type,
              fileName: fileName ? fileName.split('/').pop() : undefined,
            };
            setMessages((prev) => {
              // Check if this message already exists to prevent duplicates
              const exists = prev.some(msg => msg.id === userMessage.id);
              return exists ? prev : [...prev, userMessage];
            });
          }
        });
      });
    }

    // Add assistant responses - only for responses that correspond to current request
    // We need to check which buckets were updated in this request
    if (response.responses && response.responses.length > 0) {
      // Get bucket IDs that have items from current request
      const currentBuckets = new Set<number>();
      if (response.clusters) {
        response.clusters.forEach((cluster: any) => {
          const hasCurrentItems = cluster.items?.some((item: any) => 
            item.original_data?.gateway_output?.input_id === currentInputId
          );
          if (hasCurrentItems) {
            currentBuckets.add(cluster.bucket_id);
          }
        });
      }
      
      response.responses.forEach((resp: any) => {
        // Only add responses for buckets that were updated in this request
        if (currentBuckets.has(resp.bucket_id) && resp.llm_response) {
          const assistantMessage: ChatMessage = {
            id: `${currentInputId}-assistant-${resp.bucket_id}`,
            type: 'assistant',
            content: resp.llm_response,
            bucketId: resp.bucket_id,
            timestamp: new Date(),
          };
          setMessages((prev) => {
            // Check if this response already exists
            const exists = prev.some(msg => msg.id === assistantMessage.id);
            return exists ? prev : [...prev, assistantMessage];
          });
        }
      });
    }

    // Handle clarification requests
    if (response.needs_clarification && response.questions) {
      const clarificationMessage: ChatMessage = {
        id: `${currentInputId}-clarification`,
        type: 'assistant',
        content: `⚠️ Clarification needed:\n${response.questions.map((q: string, idx: number) => `${idx + 1}. ${q}`).join('\n')}`,
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const exists = prev.some(msg => msg.id === clarificationMessage.id);
        return exists ? prev : [...prev, clarificationMessage];
      });
    }
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleChunkProcessed = (response: any) => {
    handleResponse(response);
  };

  return (
    <div className="app">
      <div className="app-container">
        <header className="app-header">
          <h1>OmniChannel</h1>
          <p style={{ fontSize: '12px', color: '#666' }}>
            Session: {sessionId}
          </p>
        </header>
        {
          <VoiceMode
            channel="web"
            session_id={sessionId}
            onChunkProcessed={handleChunkProcessed}
            onError={handleError}
          />
        }
        <main className="app-main">
          {error && (
            <div className="error-banner" style={{
              padding: '15px',
              backgroundColor: '#f8d7da',
              border: '1px solid #f5c6cb',
              borderRadius: '8px',
              marginBottom: '20px',
              color: '#721c24'
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}
          
          <ChatArea messages={messages} />
          
          <OmniInput
            channel="web"
            session_id={sessionId}
            onResponse={handleResponse}
            onError={handleError}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
