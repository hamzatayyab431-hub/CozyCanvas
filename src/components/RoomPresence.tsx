"use client";

import React from 'react';
import { PlayerPresence } from '../hooks/useRoomRealtime';
import { Crown, CheckCircle2, Paintbrush, User, Loader2 } from 'lucide-react';

interface RoomPresenceProps {
  players: PlayerPresence[];
  currentPlayerId: string;
}

export const RoomPresence: React.FC<RoomPresenceProps> = ({
  players,
  currentPlayerId,
}) => {
  // Sort players: current player first, then hosts, then the rest
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.playerId === currentPlayerId) return -1;
    if (b.playerId === currentPlayerId) return 1;
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });

  return (
    <div className="bg-cozy-card border border-cozy-border p-5 rounded-2xl shadow-[0_4px_12px_rgba(232,180,184,0.15)] flex flex-col gap-4 select-none">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-serif font-bold uppercase tracking-wider text-cozy-muted flex items-center gap-2">
          <User size={16} className="text-cozy-primary" />
          Players In Room ({players.length})
        </h3>
        <span className="h-2 w-2 bg-cozy-primary rounded-full animate-pulse" title="Connected" />
      </div>

      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
        {sortedPlayers.map((player) => {
          const isMe = player.playerId === currentPlayerId;
          
          return (
            <div
              key={player.playerId}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                isMe
                  ? 'bg-cozy-bg border-cozy-primary shadow-[2px_2px_0px_0px_rgba(232,180,184,0.7)]'
                  : 'bg-transparent border-cozy-border'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-2 rounded-lg ${
                  isMe ? 'bg-cozy-card text-cozy-primary border border-cozy-primary/30' : 'bg-cozy-bg text-cozy-muted border border-cozy-border'
                }`}>
                  <User size={14} />
                </div>
                
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-bold truncate ${
                      isMe ? 'text-cozy-fg font-serif' : 'text-cozy-muted'
                    }`}>
                      {player.nickname}
                    </span>
                    {player.isHost && (
                      <span className="bg-cozy-secondary/35 text-cozy-primary p-0.5 rounded-full hover:scale-110 transition-transform" title="Room Host">
                        <Crown size={12} className="fill-cozy-secondary/50 stroke-cozy-primary" />
                      </span>
                    )}
                    {isMe && (
                      <span className="text-[9px] font-serif font-bold text-white bg-cozy-primary px-1.5 py-0.5 rounded-sm">
                        You
                      </span>
                    )}
                  </div>
                  
                  {/* Status subtitle */}
                  <span className="text-[11px] font-medium text-cozy-muted/70 italic">
                    {player.isDone 
                      ? 'Completed drawing' 
                      : player.isDrawing 
                        ? 'Drawing...' 
                        : 'Thinking...'}
                  </span>
                </div>
              </div>

              {/* Status Icons */}
              <div className="flex items-center gap-2">
                {player.isDone ? (
                  <div className="flex items-center gap-1 bg-transparent text-cozy-primary px-2.5 py-1 rounded-full border border-cozy-primary text-xs font-bold font-serif animate-bounce">
                    <CheckCircle2 size={13} className="fill-cozy-secondary/20 stroke-cozy-primary" />
                    <span>Done</span>
                  </div>
                ) : player.isDrawing ? (
                  <div className="flex items-center gap-1 bg-transparent text-cozy-primary px-2.5 py-1 rounded-full border border-cozy-primary border-dashed text-xs font-bold font-serif animate-pulse">
                    <Paintbrush size={13} className="text-cozy-primary" />
                    <span>Drawing</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 bg-transparent text-cozy-muted px-2 py-1 rounded-full border border-cozy-border text-xs font-semibold font-serif">
                    <Loader2 size={11} className="animate-spin text-cozy-muted" />
                    <span>Idle</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
RoomPresence.displayName = 'RoomPresence';
