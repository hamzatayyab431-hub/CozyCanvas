"use client";

import React from 'react';
import { Heart, Star, Crown, History, Image as ImageIcon, Sparkles } from 'lucide-react';

export interface GalleryDrawing {
  id: string;
  room_id: string;
  round_id: string;
  player_id: string;
  player_name: string;
  image_url: string | null;
  canvas_data: Record<string, unknown> | null; // Can contain elements and reactions
  created_at: string;
  round?: {
    round_number: number;
    prompt: string;
    status: string;
  };
}

interface GalleryProps {
  drawings: GalleryDrawing[];
  currentPlayerId: string;
}

export const Gallery: React.FC<GalleryProps> = ({ drawings, currentPlayerId }) => {
  // Only show drawings that belong to completed rounds (or rounds in reveal/completed status)
  // Group drawings by round
  const roundsMap: Record<string, {
    roundNumber: number;
    prompt: string;
    drawings: GalleryDrawing[];
  }> = {};

  drawings.forEach((drawing) => {
    // If round information is loaded, use it
    if (drawing.round) {
      const roundId = drawing.round_id;
      if (!roundsMap[roundId]) {
        roundsMap[roundId] = {
          roundNumber: drawing.round?.round_number || 0,
          prompt: drawing.round?.prompt || 'Unknown Prompt',
          drawings: [],
        };
      }
      roundsMap[roundId].drawings.push(drawing);
    }
  });

  // Sort rounds by round number descending (newest on top)
  const sortedRounds = Object.entries(roundsMap)
    .sort((a, b) => b[1].roundNumber - a[1].roundNumber)
    .map(([roundId, data]) => ({
      roundId,
      ...data,
    }));

  // Parse reactions from canvas_data (which can store reactions: Record<string, string>)
  const getReactionCounts = (drawing: GalleryDrawing) => {
    const reactions: Record<string, number> = { heart: 0, star: 0, crown: 0 };
    const canvasData = drawing.canvas_data || {};
    
    // Check if reactions are embedded in canvas_data
    if (canvasData.reactions && typeof canvasData.reactions === 'object') {
      const recs = canvasData.reactions as Record<string, unknown>;
      Object.values(recs).forEach((type) => {
        if (typeof type === 'string' && type in reactions) {
          reactions[type]++;
        }
      });
    }
    
    return reactions;
  };

  if (sortedRounds.length === 0) {
    return (
      <div className="bg-cozy-card border border-cozy-border p-6 rounded-2xl shadow-lg shadow-stone-200/5 flex flex-col items-center justify-center text-center gap-3 py-12">
        <div className="p-4 bg-cozy-bg rounded-full border border-cozy-border text-cozy-muted">
          <History size={24} className="stroke-cozy-border" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-cozy-fg">No Gallery Drawings Yet</span>
          <p className="text-xs text-cozy-muted max-w-[200px] leading-relaxed">
            Drawings will appear here after rounds are completed!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-cozy-card border border-cozy-border p-5 rounded-2xl shadow-[0_4px_12px_rgba(232,180,184,0.15)] flex flex-col gap-5 select-none">
      <h3 className="text-sm font-serif font-bold uppercase tracking-wider text-cozy-muted flex items-center gap-2 border-b border-cozy-border pb-3">
        <Sparkles size={16} className="text-cozy-primary" />
        Exhibition Gallery
      </h3>

      <div className="flex flex-col gap-6 max-h-[600px] overflow-y-auto pr-1">
        {sortedRounds.map((round) => (
          <div key={round.roundId} className="flex flex-col gap-3 border-b border-cozy-border pb-5 last:border-0 last:pb-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-serif font-bold text-white bg-cozy-primary px-2 py-0.5 rounded-sm w-fit">
                Round {round.roundNumber}
              </span>
              <h4 className="text-xs font-serif font-bold text-cozy-fg mt-1 italic">
                &quot;{round.prompt}&quot;
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {round.drawings.map((drawing) => {
                const reactions = getReactionCounts(drawing);
                const isMyDrawing = drawing.player_id === currentPlayerId;

                return (
                  <div
                    key={drawing.id}
                    className={`flex flex-col gap-2 p-2 bg-cozy-card border-8 border-cozy-card shadow-[3px_3px_0px_0px_rgba(92,26,43,0.12)] group hover:shadow-md transition-all duration-200 ${
                      isMyDrawing ? 'ring-2 ring-cozy-primary' : 'ring-1 ring-cozy-border'
                    }`}
                  >
                    <div className="relative aspect-4/3 w-full bg-cozy-bg border border-cozy-border flex items-center justify-center overflow-hidden">
                      {drawing.image_url ? (
                        <img
                          src={drawing.image_url}
                          alt={`${drawing.player_name}'s drawing`}
                          className="object-contain w-full h-full group-hover:scale-102 transition-transform duration-200"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 text-cozy-muted">
                          <ImageIcon size={20} />
                          <span className="text-[10px] font-medium">Drawing loading...</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center justify-between min-w-0">
                        <span className="text-[11px] font-serif font-bold text-cozy-fg truncate">
                          {drawing.player_name}
                        </span>
                        {isMyDrawing && (
                          <span className="text-[8px] font-serif font-bold text-white bg-cozy-primary px-1 rounded-sm">
                            Self
                          </span>
                        )}
                      </div>

                      {/* Display reaction badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {reactions.heart > 0 && (
                          <div className="flex items-center gap-0.5 bg-transparent border border-cozy-primary text-cozy-primary px-1.5 py-0.5 rounded-sm text-[9px] font-bold">
                            <Heart size={9} className="fill-cozy-primary stroke-cozy-primary" />
                            <span>{reactions.heart}</span>
                          </div>
                        )}
                        {reactions.star > 0 && (
                          <div className="flex items-center gap-0.5 bg-transparent border border-cozy-primary text-cozy-primary px-1.5 py-0.5 rounded-sm text-[9px] font-bold">
                            <Star size={9} className="fill-cozy-primary stroke-cozy-primary" />
                            <span>{reactions.star}</span>
                          </div>
                        )}
                        {reactions.crown > 0 && (
                          <div className="flex items-center gap-0.5 bg-transparent border border-cozy-primary text-cozy-primary px-1.5 py-0.5 rounded-sm text-[9px] font-bold">
                            <Crown size={9} className="fill-cozy-primary stroke-cozy-primary" />
                            <span>{reactions.crown}</span>
                          </div>
                        )}
                        {reactions.heart === 0 && reactions.star === 0 && reactions.crown === 0 && (
                          <span className="text-[9px] font-medium text-cozy-muted/60 italic">
                            Unrated
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
Gallery.displayName = 'Gallery';
