import React, { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageData } from './ChatMessage';

interface ChatAreaProps {
  messages: ChatMessageData[];
}

export const ChatArea: React.FC<ChatAreaProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="chat-area empty">
        <div className="empty-state">
          <p>Start a conversation by typing a message, recording audio, or uploading a document.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      <div className="chat-messages">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
