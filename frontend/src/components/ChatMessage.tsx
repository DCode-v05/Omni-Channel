import React from 'react';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  bucketId?: number;
  timestamp: Date;
  inputType?: 'text' | 'audio' | 'document';
  fileName?: string;
}

interface ChatMessageProps {
  message: ChatMessage;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.type === 'user';
  
  return (
    <div className={`chat-message ${isUser ? 'user-message' : 'assistant-message'}`}>
      <div className="message-content">
        <div className="message-header">
          <span className="message-type">{isUser ? 'You' : 'Assistant'}</span>
          {message.bucketId !== undefined && (
            <span className="bucket-tag">Bucket {message.bucketId}</span>
          )}
          {message.inputType && message.inputType !== 'text' && (
            <span className="input-type-tag">
              {message.inputType === 'audio' ? '🎤' : '📄'}
              {message.fileName || message.inputType}
            </span>
          )}
        </div>
        <div className="message-text">{message.content}</div>
        <div className="message-timestamp">
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};
