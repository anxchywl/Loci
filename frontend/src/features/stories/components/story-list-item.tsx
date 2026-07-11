"use client";

import { Heart } from "lucide-react";

import type { Category, Story } from "@/features/stories/api";
import { categoryIcons } from "@/lib/icons/category-glyphs";
import { useDict } from "@/lib/i18n/use-dict";

interface StoryListItemProps {
  story: Story;
  categories: Category[];
  onOpen: (id: string) => void;
}

export function StoryListItem({ story, categories, onOpen }: StoryListItemProps) {
  const t = useDict();
  const category = categories.find((c) => c.id === story.category_id);
  const Icon = category ? categoryIcons[category.slug] : null;

  return (
    <button
      onClick={() => onOpen(story.id)}
      className="flex w-full items-start gap-3 border-b border-border py-3 text-left transition-colors duration-150 ease-lm active:bg-surface"
    >
      {category && Icon && (
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: category.color }}
        >
          <Icon size={16} color="#ffffff" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{story.title}</span>
        <span className="block truncate text-[13px] text-muted">{story.body}</span>
        <span className="mt-1 flex items-center gap-3 text-[13px] text-muted">
          <span className="flex items-center gap-1">
            <Heart size={13} /> {story.reaction_count}
          </span>
          <span>{story.author ? (story.author.username ?? story.author.first_name) : t.anonymous}</span>
        </span>
      </span>
    </button>
  );
}
