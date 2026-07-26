import { describe, expect, it } from "vitest";

import { canonicalizeBounds, quantizeBounds } from "@/features/stories/hooks";

const base = {
  minLat: -20,
  maxLat: -15,
  categoryId: null,
};

describe("map viewport bounds", () => {
  it("deduplicates equivalent wrapped longitudes", () => {
    const eastWrapped = quantizeBounds({ ...base, minLon: 179, maxLon: 181 });
    const westWrapped = quantizeBounds({ ...base, minLon: -181, maxLon: -179 });
    const crossing = quantizeBounds({ ...base, minLon: 179, maxLon: -179 });

    expect(westWrapped).toEqual(eastWrapped);
    expect(crossing).toEqual(eastWrapped);
  });

  it("canonicalizes full-world bounds to one interval", () => {
    expect(canonicalizeBounds({ ...base, minLon: 180, maxLon: 540 })).toEqual({
      ...base,
      minLon: -180,
      maxLon: 180,
    });
  });

  it("keeps a wide non-crossing viewport distinct", () => {
    expect(canonicalizeBounds({ ...base, minLon: -179, maxLon: 179 })).toMatchObject({
      minLon: -179,
      maxLon: 179,
    });
  });
});
