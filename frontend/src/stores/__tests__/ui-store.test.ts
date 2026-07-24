import { beforeEach, describe, expect, it } from "vitest";

import { useUiStore } from "@/stores/ui-store";

function reset() {
  useUiStore.setState({
    openStoryId: null,
    storyHistory: [],
    adjacentPins: [],
    navAnchor: null,
    storyCoords: {},
    panRequest: null,
    trendingOpen: false,
  });
}

describe("ui-store story navigation", () => {
  beforeEach(reset);

  it("pushes the previous story onto browsing history when opening another", () => {
    const { openStory } = useUiStore.getState();
    openStory("a", { lat: 1, lon: 1 });
    openStory("b", { lat: 2, lon: 2 });
    const s = useUiStore.getState();
    expect(s.openStoryId).toBe("b");
    expect(s.storyHistory).toEqual(["a"]);
  });

  it("does not push history when reopening the same story", () => {
    const { openStory } = useUiStore.getState();
    openStory("a", { lat: 1, lon: 1 });
    openStory("a", { lat: 1, lon: 1 });
    expect(useUiStore.getState().storyHistory).toEqual([]);
  });

  it("goBackStory restores the previously viewed story and pops history", () => {
    const { openStory, goBackStory } = useUiStore.getState();
    openStory("a", { lat: 1, lon: 1 });
    openStory("b", { lat: 2, lon: 2 });
    openStory("c", { lat: 3, lon: 3 });
    goBackStory();
    expect(useUiStore.getState().openStoryId).toBe("b");
    expect(useUiStore.getState().storyHistory).toEqual(["a"]);
    goBackStory();
    expect(useUiStore.getState().openStoryId).toBe("a");
    expect(useUiStore.getState().storyHistory).toEqual([]);
  });

  it("goBackStory is a no-op with empty history", () => {
    const { openStory, goBackStory } = useUiStore.getState();
    openStory("a", { lat: 1, lon: 1 });
    goBackStory();
    // history was empty at open, so nothing to go back to
    expect(useUiStore.getState().openStoryId).toBe("a");
  });

  it("remembers coords per story so back can restore the map position", () => {
    const { openStory } = useUiStore.getState();
    openStory("a", { lat: 10, lon: 20 });
    openStory("b", { lat: 30, lon: 40 });
    const coords = useUiStore.getState().storyCoords;
    expect(coords.a).toEqual({ lat: 10, lon: 20 });
    expect(coords.b).toEqual({ lat: 30, lon: 40 });
  });

  it("keeps browsing history separate from geographic neighbours", () => {
    const { openStory } = useUiStore.getState();
    openStory("a", { lat: 1, lon: 1 });
    useUiStore.getState().setAdjacentPins([
      { id: "a", lat: 1, lon: 1 },
      { id: "b", lat: 2, lon: 2 },
    ]);
    // opening the proximity list has no bearing on the history stack
    expect(useUiStore.getState().storyHistory).toEqual([]);
    expect(useUiStore.getState().adjacentPins).toHaveLength(2);
  });

  it("a fresh open re-anchors the tour on the new story and clears the order", () => {
    const { openStory, setAdjacentPins } = useUiStore.getState();
    openStory("a", { lat: 1, lon: 1 });
    setAdjacentPins([
      { id: "a", lat: 1, lon: 1 },
      { id: "b", lat: 2, lon: 2 },
    ]);
    openStory("b", { lat: 2, lon: 2 });
    expect(useUiStore.getState().navAnchor).toEqual({ lat: 2, lon: 2 });
    expect(useUiStore.getState().adjacentPins).toEqual([]);
  });

  it("openAdjacentStory keeps the anchor and tour fixed while advancing", () => {
    const { openStory, setAdjacentPins, openAdjacentStory } = useUiStore.getState();
    openStory("a", { lat: 1, lon: 1 });
    const tour = [
      { id: "a", lat: 1, lon: 1 },
      { id: "b", lat: 2, lon: 2 },
      { id: "c", lat: 3, lon: 3 },
    ];
    setAdjacentPins(tour);
    openAdjacentStory("b", { lat: 2, lon: 2 });
    openAdjacentStory("c", { lat: 3, lon: 3 });
    // anchor and order never re-centre on the story you hopped to
    expect(useUiStore.getState().navAnchor).toEqual({ lat: 1, lon: 1 });
    expect(useUiStore.getState().adjacentPins).toEqual(tour);
    expect(useUiStore.getState().openStoryId).toBe("c");
    // hops still build browsing history for back
    expect(useUiStore.getState().storyHistory).toEqual(["a", "b"]);
  });

  it("closeStory clears the tour anchor and order", () => {
    const { openStory, closeStory } = useUiStore.getState();
    openStory("a", { lat: 1, lon: 1 });
    closeStory();
    expect(useUiStore.getState().navAnchor).toBeNull();
    expect(useUiStore.getState().adjacentPins).toEqual([]);
  });

  it("closeStory clears the story and its history", () => {
    const { openStory, closeStory } = useUiStore.getState();
    openStory("a", { lat: 1, lon: 1 });
    openStory("b", { lat: 2, lon: 2 });
    closeStory();
    expect(useUiStore.getState().openStoryId).toBeNull();
    expect(useUiStore.getState().storyHistory).toEqual([]);
  });

  it("requestPanTo carries bottom padding through for the mobile sheet", () => {
    useUiStore.getState().requestPanTo(1, 2, undefined, 400);
    expect(useUiStore.getState().panRequest).toMatchObject({
      lat: 1,
      lon: 2,
      paddingBottom: 400,
    });
  });

  it("requestPanTo leaves padding undefined on desktop", () => {
    useUiStore.getState().requestPanTo(1, 2);
    expect(useUiStore.getState().panRequest?.paddingBottom).toBeUndefined();
  });

  it("hydrates preferences without clearing a pending story deep link", () => {
    useUiStore.getState().openStory("deep-linked-story");

    useUiStore.getState().hydratePreferences();

    expect(useUiStore.getState().openStoryId).toBe("deep-linked-story");
  });
});
