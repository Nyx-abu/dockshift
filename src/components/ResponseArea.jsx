import { useEffect, useRef } from 'react';
import '../styles/ResponseArea.css';

export default function ResponseArea({ messages, loading }) {
  const containerRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  return (
    <div className="response-area">
      <div className="messages-list" ref={containerRef}>
        {messages.length === 0 && !loading && (
          <div className="empty-state">
            <p>Start a conversation...</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.type}`}>
            <div className="message-bubble">
              <div className="message-text">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="message message-assistant">
            <div className="message-bubble">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
