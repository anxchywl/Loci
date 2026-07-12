import {
  Baby,
  Briefcase,
  Camera,
  Ghost,
  GraduationCap,
  Heart,
  Mountain,
  Plane,
  Smile,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { icons as lucideIconData } from "lucide";

import type { CategorySlug } from "@/lib/i18n/dict";

// react components for ui chrome and the raw node data for map marker rasterization
// come from the same lucide set — DESIGN.md pins the slug → glyph mapping
export const categoryIcons: Record<CategorySlug, LucideIcon> = {
  love: Heart,
  happy_moments: Smile,
  dreams: Sparkles,
  education: GraduationCap,
  career: Briefcase,
  travel: Plane,
  friendship: Users,
  childhood: Baby,
  achievements: Trophy,
  beautiful_places: Mountain,
  memories: Camera,
  urban_legends: Ghost,
};

const glyphNames: Record<CategorySlug, keyof typeof lucideIconData> = {
  love: "Heart",
  happy_moments: "Smile",
  dreams: "Sparkles",
  education: "GraduationCap",
  career: "Briefcase",
  travel: "Plane",
  friendship: "Users",
  childhood: "Baby",
  achievements: "Trophy",
  beautiful_places: "Mountain",
  memories: "Camera",
  urban_legends: "Ghost",
};

type IconAttrs = Record<string, string | number>;
type IconChild = readonly [string, IconAttrs];
// lucide exports each icon as the full element tuple, children at index 2 —
// not as a bare list of children
type IconNode = readonly [string, IconAttrs, readonly IconChild[]];

function nodeToSvgBody(children: readonly IconChild[]): string {
  return children
    .map(([tag, attrs]) => {
      const rendered = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ");
      return `<${tag} ${rendered}/>`;
    })
    .join("");
}

function iconBody(slug: CategorySlug): string {
  const node = lucideIconData[glyphNames[slug]] as unknown as IconNode;
  return nodeToSvgBody(node[2] ?? []);
}

export function categoryGlyphSvg(slug: CategorySlug, color = "#ffffff"): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    iconBody(slug) +
    `</svg>`
  );
}

// A classic teardrop map pin: a round head in the category colour with a narrow
// pointed stem whose tip sits exactly at the bottom-centre of the viewBox, plus
// the category's white line icon in the head. Anchor the raster at "bottom" so
// the tip lands on the coordinate.
export function categoryPinSvg(slug: CategorySlug, color: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="44" viewBox="0 0 30 44" fill="none">` +
    `<path d="M15 43 L3.5 21 A13 13 0 1 1 26.5 21 Z" fill="${color}" ` +
    `stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>` +
    `<g transform="translate(15 15) scale(0.62) translate(-12 -12)" fill="none" ` +
    `stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    iconBody(slug) +
    `</g>` +
    `</svg>`
  );
}
