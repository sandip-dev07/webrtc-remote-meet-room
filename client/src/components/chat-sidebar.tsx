import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, MessageSquare, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { useMeetingStore } from '@/store/meeting-store';
import { PeerState } from '@/hooks/use-webrtc';

interface ChatMessage {
  id: string;
  username: string;
  content: string;
  timestamp: Date;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  ws: WebSocket | null;
  subroomId: string;
  peers: Record<string, PeerState>;
}

export function ChatSidebar({ isOpen, onClose, ws, subroomId, peers }: ChatSidebarProps) {
  const { username } = useMeetingStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen to WS for chat messages
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
          setMessages(prev => [...prev, {
            id: Math.random().toString(),
            username: data.payload.username,
            content: data.payload.content,
            timestamp: new Date()
          }]);
        }
      } catch (e) {
        // ignore non-json
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !ws) return;

    const payload = { subroomId, username, content: inputValue.trim() };
    
    // Send to WS
    ws.send(JSON.stringify({ type: 'chat', payload }));
    
    // Optimistic local update
    setMessages(prev => [...prev, {
      id: Math.random().toString(),
      username,
      content: inputValue.trim(),
      timestamp: new Date()
    }]);
    
    setInputValue('');
  };

  const participantList = [
    { id: 'local', username: `${username} (You)` },
    ...Object.entries(peers).map(([id, peer]) => ({ id, username: peer.username }))
  ];

  if (!isOpen) return null;

  return (
    <div className="w-80 flex flex-col glass-panel rounded-2xl h-full overflow-hidden animate-in slide-in-from-right-8 duration-300">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h3 className="font-display font-semibold text-lg">Meeting Details</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-white/10 rounded-full h-8 w-8">
          <X size={18} />
        </Button>
      </div>

      <Tabs defaultValue="chat" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b border-white/10 bg-transparent p-0 h-auto">
          <TabsTrigger 
            value="chat" 
            className="flex-1 rounded-none data-[state=active]:bg-white/5 data-[state=active]:border-b-2 data-[state=active]:border-primary py-3"
          >
            <MessageSquare size={16} className="mr-2" /> Chat
          </TabsTrigger>
          <TabsTrigger 
            value="participants" 
            className="flex-1 rounded-none data-[state=active]:bg-white/5 data-[state=active]:border-b-2 data-[state=active]:border-primary py-3"
          >
            <Users size={16} className="mr-2" /> People ({participantList.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col m-0 h-0 data-[state=active]:flex">
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="flex flex-col gap-4">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm mt-10">
                  <MessageSquare className="mx-auto mb-2 opacity-50" size={32} />
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.username === username;
                  const showHeader = i === 0 || messages[i-1].username !== msg.username;
                  
                  return (
                    <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                      {showHeader && (
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground/80">{isMe ? 'You' : msg.username}</span>
                          <span className="text-[10px] text-muted-foreground">{format(msg.timestamp, 'HH:mm')}</span>
                        </div>
                      )}
                      <div className={cn(
                        "px-3 py-2 rounded-2xl max-w-[85%] text-sm",
                        isMe 
                          ? "bg-primary text-primary-foreground rounded-tr-sm" 
                          : "bg-secondary text-secondary-foreground rounded-tl-sm"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-white/10 bg-black/20">
            <form onSubmit={sendMessage} className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Send a message..."
                className="bg-secondary/50 border-white/10 focus-visible:ring-primary rounded-xl"
              />
              <Button type="submit" size="icon" disabled={!inputValue.trim()} className="rounded-xl shadow-lg shadow-primary/20">
                <Send size={16} />
              </Button>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="participants" className="flex-1 m-0 h-0 data-[state=active]:flex flex-col">
          <ScrollArea className="flex-1 p-4">
            <div className="flex flex-col gap-1">
              {participantList.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                    {p.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium flex-1 truncate">{p.username}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
