"use client";

import { Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { distanceMeters, formatDistance } from "@/features/stories/api";
import { StoryListItem } from "@/features/stories/components/story-list-item";
import { NEARBY_RADII, useCategories, useNearbyStories } from "@/features/stories/hooks";
import { useDict } from "@/lib/i18n/use-dict";
import { useUiStore } from "@/stores/ui-store";

interface NearbyPanelProps {
  location: { lat: number; lon: number } | null;
  onOpen: (id: string, lat: number, lon: number) => void;
  className?: string;
}

/**
 * Stories around the viewer, nearest first. The search starts tight and widens
 * one ring at a time as the reader reaches the bottom, so the list grows from
 * the immediate block out to the whole city instead of stopping at a fixed
 * radius. Distances are approximate — public coordinates are fuzzed.
 */
export function NearbyPanel({ location, onOpen, className = "px-2 py-2" }: NearbyPanelProps) {
  const t = useDict();
  const locale = useUiStore((s) => s.locale);
  const { data: categories = [] } = useCategories();
  const [ringIndex, setRingIndex] = useState(0);
  const radius = NEARBY_RADII[ringIndex];
  const isLastRing = ringIndex === NEARBY_RADII.length - 1;
  const { data: stories, isFetching } = useNearbyStories(location, radius);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // a new origin restarts from the tightest ring
  useEffect(() => {
    setRingIndex(0);
  }, [location?.lat, location?.lon]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || isLastRing || isFetching) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setRingIndex((index) => Math.min(index + 1, NEARBY_RADII.length - 1));
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isLastRing, isFetching, stories]);

  if (!location) {
    return <div className="py-8" aria-hidden="true" />;
  }

  const withDistance = (stories ?? [])
    .map((story) => ({ story, meters: distanceMeters(location, { lat: story.lat, lon: story.lon }) }))
    .sort((a, b) => a.meters - b.meters);

  return (
    <div className={`${className} animate-fade-in`}>
      {withDistance.length === 0 && !isFetching && (
        <div className="flex min-h-[30dvh] flex-col items-center justify-center gap-2 py-8 text-center">
          <MapPin size={22} className="text-muted" />
          <span className="text-[13px] text-muted">{t.noNearby}</span>
        </div>
      )}
      {withDistance.map(({ story, meters }) => (
        <StoryListItem
          key={story.id}
          story={story}
          categories={categories}
          distanceMeters={meters}
          onOpen={() => onOpen(story.id, story.lat, story.lon)}
        />
      ))}
      {/* scrolling this into view widens the search to the next ring */}
      <div ref={sentinelRef} className="py-3 text-center text-[12px] text-muted">
        {isFetching || !isLastRing ? `≤ ${formatDistance(radius, locale)}` : null}
      </div>
    </div>
  );
}
