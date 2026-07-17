'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, X, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MeetingChatProps {
  meetingId: string;
  meetingTitle: string;
  onClose: () => void;
}

export function MeetingChat({ meetingId, meetingTitle, onClose }: MeetingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hola, soy tu asistente para la reunión "${meetingTitle}". Puedes hacerme preguntas sobre lo que se discutió.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await invoke<{ answer: string }>('api_ask_transcript', {
        request: {
          meeting_id: meetingId,
          question,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: response.answer }]);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('No se pudo obtener una respuesta.', {
        description: error instanceof Error ? error.message : String(error),
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Lo siento, no pudo procesarse tu pregunta. Verifica que el modelo IA esté configurado en Ajustes.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col rounded-3xl h-full" style={{ background: '#0d1f33', border: '1px solid #1a2d42' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1a2d42' }}>
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4" style={{ color: '#447794' }} />
          <span className="text-sm font-bold text-white">Asistente de la reunión</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar chat" className="p-1.5 rounded-lg transition-colors hover:bg-white/10" style={{ color: '#7a9ab5' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3">
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div key={index} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(68,119,148,0.2)' }}>
                  <Bot className="w-3.5 h-3.5" style={{ color: '#447794' }} />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'text-white rounded-br-md'
                    : 'text-[#c1d0dc] rounded-bl-md'
                }`}
                style={
                  message.role === 'user'
                    ? { background: '#447794' }
                    : { background: '#061222', border: '1px solid #1a2d42' }
                }
              >
                {message.content}
              </div>
              {message.role === 'user' && (
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(125,154,181,0.2)' }}>
                  <User className="w-3.5 h-3.5" style={{ color: '#7a9ab5' }} />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(68,119,148,0.2)' }}>
                <Bot className="w-3.5 h-3.5" style={{ color: '#447794' }} />
              </div>
              <div className="rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm flex items-center gap-2" style={{ background: '#061222', border: '1px solid #1a2d42', color: '#c1d0dc' }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pensando…
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 border-t" style={{ borderColor: '#1a2d42' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder="Escribe una pregunta sobre la reunión…"
            className="flex-1 text-sm rounded-xl px-3 py-2 focus:outline-none"
            style={{ background: '#061222', border: '1px solid #1a2d42', color: '#e2e8f0' }}
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()} size="icon" className="rounded-xl" style={{ background: '#447794', color: '#061222' }}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
